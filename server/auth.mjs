/* Forcepoint HC — user authentication module.
   ───────────────────────────────────────────────────────────────────
   Multi-user login layer for the wizard. Single-process companion
   guarantees serialized writes, so a JSON file store is sufficient
   (and avoids the native-build pain of better-sqlite3 / bcrypt).

   Storage layout (HC_AUTH_DB_DIR, default /var/lib/forcepoint-hc/):
     users.json    — { users: [...] }, atomically rewritten on each
                     change via write-temp-then-rename. Backed by an
                     in-memory cache for read paths.
     sessions.json — { sessions: [...] }, same pattern. Sessions are
                     opaque 32-byte hex tokens with a 24h sliding
                     expiry; a row delete is the only revocation.

   Domain policy: registration is restricted to @forcepoint.com
   email addresses, enforced server-side so the browser can't
   bypass it.

   First-user rule: the first @forcepoint.com user to register is
   automatically approved + given the admin role. Every subsequent
   registration starts as pending until an admin approves them.

   Password hashing: Node's built-in crypto.scrypt (N=16384, r=8,
   p=1, 64-byte output). Stored as `scrypt$<saltHex>$<hashHex>`.
   No external dependencies, no native compile. */

import fs from 'node:fs';
import path from 'node:path';
import {
  scryptSync, randomBytes, timingSafeEqual,
} from 'node:crypto';
import {
  randomSecret, verifyCode, buildOtpauthUri,
  generateBackupCodePlain, normaliseBackupCode,
} from './totp.mjs';

const ALLOWED_DOMAIN = '@forcepoint.com';

/* Storage directory — env override first, then /var/lib/forcepoint-hc/
   if writable (production Linux), then ./data/ as a dev fallback. */
function resolveStoreDir() {
  const candidates = [
    process.env.HC_AUTH_DB_DIR,
    '/var/lib/forcepoint-hc',
    path.resolve(process.cwd(), 'data'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch { /* try next */ }
  }
  /* Last resort — companion working dir. */
  return process.cwd();
}

const STORE_DIR = resolveStoreDir();
const USERS_PATH    = path.join(STORE_DIR, 'users.json');
const SESSIONS_PATH = path.join(STORE_DIR, 'sessions.json');

/* ─── Atomic JSON helpers ────────────────────────────────────────── */
function loadJson(filePath, defaultValue) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function saveJson(filePath, value) {
  /* Write to .tmp then rename so a crash mid-write never produces
     a half-flushed JSON file. */
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o640 });
  fs.renameSync(tmp, filePath);
}

/* ─── Password hashing (scrypt) ──────────────────────────────────── */
function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual;
  try {
    actual = scryptSync(plain, salt, expected.length, { N: 16384, r: 8, p: 1 });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/* ─── Stores (in-memory cache, mirror to disk) ───────────────────── */
const usersStore    = loadJson(USERS_PATH,    { users: [] });
const sessionsStore = loadJson(SESSIONS_PATH, { sessions: [] });

/* Drop expired sessions at boot so the in-memory list doesn't grow
   unbounded across restarts. */
{
  const now = Date.now();
  const before = sessionsStore.sessions.length;
  sessionsStore.sessions = sessionsStore.sessions.filter(s => s.expiresAt > now);
  if (sessionsStore.sessions.length !== before) saveJson(SESSIONS_PATH, sessionsStore);
}

function persistUsers()    { saveJson(USERS_PATH,    usersStore); }
function persistSessions() { saveJson(SESSIONS_PATH, sessionsStore); }

/* ─── Validation ─────────────────────────────────────────────────── */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  /* Cheap RFC-ish check — anything more elaborate just rejects valid
     addresses. The hard constraint is the domain whitelist below. */
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAllowedDomain(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

function isValidPassword(pwd) {
  return typeof pwd === 'string' && pwd.length >= 8 && pwd.length <= 200;
}

/* ─── User CRUD ──────────────────────────────────────────────────── */
function newId() {
  return `u-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function findUserByEmail(email) {
  if (!email) return null;
  const lc = email.toLowerCase();
  return usersStore.users.find(u => u.email.toLowerCase() === lc) || null;
}

function findUserById(id) {
  return usersStore.users.find(u => u.id === id) || null;
}

/* Strip the password hash + MFA secret before sending to clients.
   Only `mfaEnabled` is exposed — never the secret or backup-code
   hashes, which would defeat the whole point. */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    status: u.status,
    role: u.role,
    createdAt: u.createdAt,
    approvedAt: u.approvedAt,
    lastLoginAt: u.lastLoginAt,
    mfaEnabled: !!u.mfaEnabled,
    mfaEnrolledAt: u.mfaEnrolledAt ?? null,
    /* Number of unused backup codes, so the UI can show
       "2 of 10 backup codes remaining" and nudge regeneration. */
    backupCodesRemaining: Array.isArray(u.mfaBackupCodeHashes) ? u.mfaBackupCodeHashes.length : 0,
  };
}

export function registerUser({ email, password }) {
  if (!isValidEmail(email))      return { ok: false, code: 400, error: 'A valid email address is required.' };
  if (!isAllowedDomain(email))   return { ok: false, code: 403, error: `Only ${ALLOWED_DOMAIN} email addresses can register.` };
  if (!isValidPassword(password)) return { ok: false, code: 400, error: 'Password must be 8–200 characters.' };
  if (findUserByEmail(email))    return { ok: false, code: 409, error: 'An account with this email already exists.' };

  /* First-user rule — the very first registration is auto-approved
     and gets the admin role. After that everyone is pending. */
  const isFirstUser = usersStore.users.length === 0;

  const now = new Date().toISOString();
  const user = {
    id: newId(),
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    status: isFirstUser ? 'approved' : 'pending',
    role: isFirstUser ? 'admin' : 'user',
    createdAt: now,
    approvedAt: isFirstUser ? now : null,
    lastLoginAt: null,
  };
  usersStore.users.push(user);
  persistUsers();
  return { ok: true, user: publicUser(user), bootstrapAdmin: isFirstUser };
}

/* ─── MFA challenge store (in-memory, 5-minute TTL) ──────────────── */
/* When a user with MFA enabled posts correct credentials, we don't
   issue a session yet — instead we hand back a short-lived challenge
   token. The frontend posts that token + a 6-digit code to
   /api/auth/mfa/verify to finish the login. Challenges are
   single-use; consumed on success, discarded on any verify failure
   so an attacker can't grind codes against the same challenge. */
const mfaChallenges = new Map(); // token → { userId, expiresAt }
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function newMfaChallenge(userId) {
  /* Evict expired challenges opportunistically on each new mint. */
  const now = Date.now();
  for (const [t, c] of mfaChallenges) {
    if (c.expiresAt < now) mfaChallenges.delete(t);
  }
  const token = randomBytes(32).toString('hex');
  mfaChallenges.set(token, { userId, expiresAt: now + MFA_CHALLENGE_TTL_MS });
  return token;
}

function resolveMfaChallenge(token) {
  const c = mfaChallenges.get(token);
  if (!c) return null;
  if (c.expiresAt < Date.now()) { mfaChallenges.delete(token); return null; }
  return c;
}

function consumeMfaChallenge(token) {
  mfaChallenges.delete(token);
}

/* Helper used by both the password-only and MFA-completing paths
   so session issuance lives in one place. */
function issueSession(user) {
  const token = randomBytes(32).toString('hex');
  sessionsStore.sessions.push({
    token,
    userId: user.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  persistSessions();
  user.lastLoginAt = new Date().toISOString();
  persistUsers();
  return token;
}

export function loginUser({ email, password }) {
  if (!isValidEmail(email))      return { ok: false, code: 400, error: 'Email and password are required.' };
  const user = findUserByEmail(email);
  if (!user)                     return { ok: false, code: 401, error: 'Invalid email or password.' };
  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, code: 401, error: 'Invalid email or password.' };
  }
  if (user.status === 'pending')  return { ok: false, code: 403, code2: 'pending',  error: 'Your account is awaiting admin approval. You\'ll be able to sign in once an administrator approves it.' };
  if (user.status === 'rejected') return { ok: false, code: 403, code2: 'rejected', error: 'Your registration was not approved. Contact an administrator if you believe this is an error.' };
  if (user.status === 'suspended') return { ok: false, code: 403, code2: 'suspended', error: 'Your account has been suspended. Contact an administrator.' };

  /* MFA gate — when enabled the password proof alone isn't enough.
     Hand back a challenge token and require the frontend to follow
     up with a 6-digit TOTP code (or a backup code). */
  if (user.mfaEnabled && user.mfaSecret) {
    const challengeToken = newMfaChallenge(user.id);
    return {
      ok: true,
      mfaRequired: true,
      challengeToken,
      challengeExpiresInSec: Math.floor(MFA_CHALLENGE_TTL_MS / 1000),
    };
  }

  return { ok: true, token: issueSession(user), user: publicUser(user) };
}

/* Complete the MFA challenge — accepts either a current TOTP code
   OR a single-use backup code. On match: consume the challenge,
   issue a real session. On failure: ALSO consume the challenge so
   an attacker can't keep retrying against the same token. */
export function verifyMfaChallenge({ challengeToken, code }) {
  const challenge = resolveMfaChallenge(challengeToken);
  if (!challenge) {
    return { ok: false, code: 400, error: 'Verification window expired. Please sign in again.' };
  }
  const user = findUserById(challenge.userId);
  if (!user || !user.mfaSecret) {
    consumeMfaChallenge(challengeToken);
    return { ok: false, code: 400, error: 'User no longer enrolled in MFA.' };
  }
  const candidate = (code || '').toString().trim();
  /* Single-use backup codes are recognisable by the embedded dash or
     8-char alphanumeric shape — never digits-only. We try TOTP
     first because that's the common case. */
  const looksLikeBackupCode = /[^0-9]/.test(candidate);
  let success = false;
  if (!looksLikeBackupCode) {
    success = verifyCode(user.mfaSecret, candidate);
  } else {
    success = consumeBackupCodeMatch(user, candidate);
  }
  if (!success) {
    /* Burn the challenge on any failure to keep the grinding
       window short. User can sign in again with email+password
       to get a fresh challenge. */
    consumeMfaChallenge(challengeToken);
    return { ok: false, code: 401, error: 'Invalid authentication code. The challenge has been reset — please sign in again.' };
  }
  consumeMfaChallenge(challengeToken);
  return { ok: true, token: issueSession(user), user: publicUser(user) };
}

/* Test a backup code against the user's stored hashes. On match,
   splice the hash out so the code can never be reused. Persists
   the change immediately. */
function consumeBackupCodeMatch(user, candidate) {
  if (!Array.isArray(user.mfaBackupCodeHashes) || user.mfaBackupCodeHashes.length === 0) return false;
  const normalised = normaliseBackupCode(candidate);
  if (normalised.length === 0) return false;
  for (let i = 0; i < user.mfaBackupCodeHashes.length; i++) {
    if (verifyPassword(normalised, user.mfaBackupCodeHashes[i])) {
      user.mfaBackupCodeHashes.splice(i, 1);
      persistUsers();
      return true;
    }
  }
  return false;
}

export function logoutUser(token) {
  if (!token) return;
  const before = sessionsStore.sessions.length;
  sessionsStore.sessions = sessionsStore.sessions.filter(s => s.token !== token);
  if (sessionsStore.sessions.length !== before) persistSessions();
}

/* Resolve a Bearer token → user object (or null when expired /
   unknown). Also slides the expiry forward by 24h on each hit so an
   active user doesn't get logged out mid-session. */
export function resolveSession(token) {
  if (!token) return null;
  const session = sessionsStore.sessions.find(s => s.token === token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessionsStore.sessions = sessionsStore.sessions.filter(s => s.token !== token);
    persistSessions();
    return null;
  }
  const user = findUserById(session.userId);
  if (!user) {
    /* User was deleted but session lingered — purge. */
    sessionsStore.sessions = sessionsStore.sessions.filter(s => s.token !== token);
    persistSessions();
    return null;
  }
  /* Sliding expiry — bump if more than an hour has passed since
     last touch to avoid hammering disk on every request. */
  const oneHourMs = 60 * 60 * 1000;
  if (session.expiresAt - Date.now() < 23 * oneHourMs) {
    session.expiresAt = Date.now() + 24 * oneHourMs;
    persistSessions();
  }
  return { user, session };
}

/* ─── Admin actions ──────────────────────────────────────────────── */
export function listUsers() {
  return usersStore.users.map(publicUser);
}

export function setUserStatus(id, newStatus) {
  if (!['approved', 'rejected', 'pending', 'suspended'].includes(newStatus)) {
    return { ok: false, code: 400, error: 'Unknown status.' };
  }
  const user = findUserById(id);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  user.status = newStatus;
  if (newStatus === 'approved' && !user.approvedAt) {
    user.approvedAt = new Date().toISOString();
  }
  /* Revoke any open sessions for users moving away from approved. */
  if (newStatus !== 'approved') {
    const before = sessionsStore.sessions.length;
    sessionsStore.sessions = sessionsStore.sessions.filter(s => s.userId !== id);
    if (sessionsStore.sessions.length !== before) persistSessions();
  }
  persistUsers();
  return { ok: true, user: publicUser(user) };
}

export function setUserRole(id, newRole) {
  if (!['admin', 'user'].includes(newRole)) {
    return { ok: false, code: 400, error: 'Unknown role.' };
  }
  const user = findUserById(id);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  user.role = newRole;
  persistUsers();
  return { ok: true, user: publicUser(user) };
}

export function deleteUser(id) {
  const idx = usersStore.users.findIndex(u => u.id === id);
  if (idx < 0) return { ok: false, code: 404, error: 'User not found.' };
  usersStore.users.splice(idx, 1);
  sessionsStore.sessions = sessionsStore.sessions.filter(s => s.userId !== id);
  persistUsers();
  persistSessions();
  return { ok: true };
}

/* ─── Express middleware ─────────────────────────────────────────── */
export function extractToken(req) {
  const hdr = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof hdr === 'string' && hdr.startsWith('Bearer ')) {
    return hdr.slice('Bearer '.length).trim();
  }
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  const resolved = resolveSession(token);
  if (!resolved) {
    return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  }
  req.user = resolved.user;
  req.session = resolved.session;
  next();
}

export function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const resolved = resolveSession(token);
  if (!resolved) {
    return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  }
  if (resolved.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required.' });
  }
  req.user = resolved.user;
  req.session = resolved.session;
  next();
}

/* ─── Diagnostic info exposed via /api/auth/me + GET /api/auth/info */
export function getAuthInfo() {
  return {
    allowedDomain: ALLOWED_DOMAIN,
    userCount: usersStore.users.length,
    pendingCount: usersStore.users.filter(u => u.status === 'pending').length,
    adminCount: usersStore.users.filter(u => u.role === 'admin').length,
    storeDir: STORE_DIR,
    /* Boot status banner the frontend can show before any user has
       registered, so the SE doesn't wonder why the login form rejects
       everything. */
    bootstrapMode: usersStore.users.length === 0,
  };
}

/* ─── MFA enrollment + management ────────────────────────────────── */
const ISSUER = 'Forcepoint HC Studio';
const BACKUP_CODE_COUNT = 10;

/* In-flight enrollments — secret + suggested backup codes generated
   on `begin`, validated by a TOTP code on `confirm`. Lives in memory
   only; if the System API restarts mid-enrollment the user simply
   begins again. Keyed on user id so each user has at most one open
   enrollment at a time. */
const enrollmentDrafts = new Map(); // userId → { secret, codesPlain, expiresAt }
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

function evictExpiredDrafts() {
  const now = Date.now();
  for (const [uid, draft] of enrollmentDrafts) {
    if (draft.expiresAt < now) enrollmentDrafts.delete(uid);
  }
}

export function beginMfaEnrollment(userId) {
  evictExpiredDrafts();
  const user = findUserById(userId);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  /* Already-enrolled users must disable before re-enrolling so a
     compromised current device can't quietly swap the secret. */
  if (user.mfaEnabled) return { ok: false, code: 409, error: 'MFA is already enabled. Disable it first to enroll a new device.' };
  const secret = randomSecret();
  /* Backup codes are computed during begin so we can show them on
     the same enrollment flow once the TOTP code is confirmed. */
  const codesPlain = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCodePlain());
  enrollmentDrafts.set(userId, {
    secret,
    codesPlain,
    expiresAt: Date.now() + ENROLLMENT_TTL_MS,
  });
  const otpauthUri = buildOtpauthUri({ secret, issuer: ISSUER, account: user.email });
  return {
    ok: true,
    secret,
    otpauthUri,
    issuer: ISSUER,
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    expiresInSec: Math.floor(ENROLLMENT_TTL_MS / 1000),
  };
}

export function confirmMfaEnrollment(userId, code) {
  evictExpiredDrafts();
  const user = findUserById(userId);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  const draft = enrollmentDrafts.get(userId);
  if (!draft) return { ok: false, code: 400, error: 'No enrollment in progress. Start the enrollment flow again.' };
  if (!verifyCode(draft.secret, String(code || '').trim())) {
    return { ok: false, code: 401, error: 'Invalid code. Check your authenticator app and try again.' };
  }
  /* Commit: secret stored, backup codes hashed + stored, plaintext
     codes returned ONCE so the user can download them. */
  user.mfaSecret = draft.secret;
  user.mfaEnabled = true;
  user.mfaEnrolledAt = new Date().toISOString();
  user.mfaBackupCodeHashes = draft.codesPlain.map(c => hashPassword(normaliseBackupCode(c)));
  enrollmentDrafts.delete(userId);
  persistUsers();
  return {
    ok: true,
    user: publicUser(user),
    backupCodes: draft.codesPlain,
  };
}

export function cancelMfaEnrollment(userId) {
  enrollmentDrafts.delete(userId);
  return { ok: true };
}

/* Disable MFA — requires the current password (re-auth gate) to
   prevent a stolen session from quietly turning the second factor
   off. Wipes secret + backup codes; the user can re-enroll fresh. */
export function disableMfa(userId, currentPassword) {
  const user = findUserById(userId);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  if (!user.mfaEnabled) return { ok: false, code: 409, error: 'MFA is not currently enabled.' };
  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    return { ok: false, code: 401, error: 'Password verification failed.' };
  }
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaEnrolledAt = null;
  user.mfaBackupCodeHashes = [];
  persistUsers();
  return { ok: true, user: publicUser(user) };
}

/* Regenerate the 10 backup codes — invalidates any existing codes.
   Also gated on the current password so a stolen session can't
   silently reset the recovery codes (which would be a stealthy way
   to lock the real owner out). */
export function regenerateBackupCodes(userId, currentPassword) {
  const user = findUserById(userId);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  if (!user.mfaEnabled) return { ok: false, code: 409, error: 'MFA is not currently enabled.' };
  if (!verifyPassword(currentPassword || '', user.passwordHash)) {
    return { ok: false, code: 401, error: 'Password verification failed.' };
  }
  const codesPlain = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCodePlain());
  user.mfaBackupCodeHashes = codesPlain.map(c => hashPassword(normaliseBackupCode(c)));
  persistUsers();
  return { ok: true, backupCodes: codesPlain, user: publicUser(user) };
}

/* Admin-side reset — clears another user's MFA without a password
   prompt. Used when an SE loses their phone and the admin needs to
   unblock them. The user must re-enroll on next login. */
export function adminResetMfa(userId) {
  const user = findUserById(userId);
  if (!user) return { ok: false, code: 404, error: 'User not found.' };
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaEnrolledAt = null;
  user.mfaBackupCodeHashes = [];
  persistUsers();
  return { ok: true, user: publicUser(user) };
}

export const AUTH_CONSTANTS = {
  ALLOWED_DOMAIN,
  STORE_DIR,
  USERS_PATH,
  SESSIONS_PATH,
};

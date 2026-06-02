# Forcepoint HC 2026 — Authentication & Access Control Subsystem

> Companion record to [`skills/hc-summary.md`](skills/hc-summary.md). That doc describes the
> offline wizard; **this doc describes the multi-user login / MFA / account layer that was
> bolted on top of it.** Note: `hc-summary.md` and `skills/CLAUDE.md` still say "fully offline,
> no backend" — that is now only true of the *wizard data*. Auth state lives server-side in the
> companion. Verify paths against the live code before relying on this; it is a map, not the truth.

**Status when written:** built and `vite build`-verified, **not yet committed** (branch `main`).
Files are untracked / modified in the working tree.

---

## What it is

A login + role + MFA layer in front of the wizard. The same Node companion that runs DLP SQL
(port **3001**) also serves the auth API. The browser SPA gates on it: [`App.tsx`](src/app/App.tsx)
renders `LoginScreen` until a valid session exists, then `Dashboard`.

**Why a backend now:** the wizard itself is still offline localStorage, but real accounts need a
shared, server-side store. The companion is single-process, so a JSON file store with serialized
writes is enough (no SQLite/bcrypt native-build pain).

---

## Server side

| File | Role |
|---|---|
| [server/auth.mjs](server/auth.mjs) | Users, sessions, password hashing, MFA management, admin actions, Express middleware |
| [server/totp.mjs](server/totp.mjs) | TOTP secret/code (`randomSecret`, `verifyCode`, `buildOtpauthUri`) + backup-code helpers |
| [server/index.mjs](server/index.mjs) | Express routes (auth endpoints live alongside the SQL companion routes) |

### Storage
- Dir resolved in order: `HC_AUTH_DB_DIR` → `/var/lib/forcepoint-hc` → `./data` → cwd.
- `users.json` / `sessions.json`, atomically rewritten (write-temp-then-rename), mirrored by an
  in-memory cache. Expired sessions pruned at boot.
- **Passwords:** Node `scrypt` (N=16384,r=8,p=1, 64-byte), stored `scrypt$<saltHex>$<hashHex>`.
  No external deps. Backup codes are hashed the same way.

### Policy
- Registration restricted to **`@forcepoint.com`** (enforced server-side).
- **First user** to register → auto-approved + `admin`. Everyone after → `pending` until an admin approves.
- Account statuses: `pending | approved | rejected | suspended`. Only `approved` can log in.
- **Sessions:** 32-byte hex bearer token, 24h **sliding** expiry (bumped when <23h remain). Logout /
  status change away from approved / delete all revoke server-side.

### MFA (TOTP)
- Enroll: `begin` mints secret + 10 draft backup codes (10-min TTL) → QR (otpauth URI) →
  `confirm` with a live code commits; backup codes shown **once**.
- Login with MFA on: password returns a short-lived **challenge token** (5-min, single-use); the
  client follows up with a 6-digit code **or** a single-use backup code at `/mfa/verify`. Any
  verify failure burns the challenge (anti-grind).
- Disable / regenerate backup codes are **re-auth gated** on the current password. Admin can force-
  reset another user's MFA (no password) for the lost-phone case.

### Endpoints (all under `/api/auth`)
```
POST   /register                 public · @forcepoint.com only
POST   /login                    public · returns {token,user} OR {mfaRequired,challengeToken}
POST   /logout                   revoke caller's session
GET    /me                       current user for bearer token
GET    /info                     public bootstrap signals (allowedDomain, counts, bootstrapMode)
GET    /users                    admin · list
POST   /users/:id/approve        admin
POST   /users/:id/reject         admin
POST   /users/:id/suspend        admin
POST   /users/:id/role           admin · toggle admin/user (last-admin guarded)
POST   /users/:id/password       admin · set a user's password (revokes their sessions)
DELETE /users/:id                admin · (last-admin guarded)
POST   /users/:id/mfa/reset      admin · clear a user's MFA
POST   /mfa/verify               complete a login MFA challenge
POST   /mfa/enroll/begin|confirm|cancel
POST   /mfa/disable              re-auth gated
POST   /mfa/backup-codes/regenerate   re-auth gated
POST   /password                 self-service change (current+new); keeps own session, boots others
```
Middleware: `requireAuth` (valid bearer) / `requireAdmin` (bearer + admin role).

---

## Client side

| File | Role |
|---|---|
| [src/app/auth/AuthContext.tsx](src/app/auth/AuthContext.tsx) | `AuthProvider` + `useAuth()`; token storage, fetch interceptor, login/MFA/register/logout, **idle auto-logout** |
| [src/app/App.tsx](src/app/App.tsx) | Gate: `loading → spinner`, `!user → LoginScreen`, else `Dashboard` |
| [src/app/components/LoginScreen.tsx](src/app/components/LoginScreen.tsx) | Login / register / MFA-challenge views + inactivity notice |
| [src/app/components/MfaSecurity.tsx](src/app/components/MfaSecurity.tsx) | Profile security card: enable/disable MFA, regen codes, **Change password** |
| [src/app/components/UserManagementPage.tsx](src/app/components/UserManagementPage.tsx) | Admin: approve/reject/suspend/role/delete + MFA reset + **Reset password** |

- **Token:** `localStorage['hc_auth_token']`. A one-time `window.fetch` interceptor attaches
  `Authorization: Bearer` to every `/api/*` call except register/login/info and `/api/connector/*`.
- **Idle auto-logout (15 min):** `IDLE_TIMEOUT_MS` in AuthContext. Activity events write a shared
  `localStorage['hc_last_activity']` timestamp (5s throttle) so **all tabs share one idle clock**; a
  15s poll calls `logout()` (which revokes the server session) once idle past the limit, setting
  `localStorage['hc_logout_reason']='idle'`. `LoginScreen` reads that key once and shows a
  "Signed out for inactivity" notice.

---

## Conventions specific to this subsystem

1. **`@forcepoint.com` only** + first-user-is-admin + admin-approval gate — don't loosen without intent.
2. **Never expose** `passwordHash` / `mfaSecret` / backup-code hashes to the client — `publicUser()`
   strips them; only `mfaEnabled` / `backupCodesRemaining` go out.
3. **Re-auth gate** (current password) for self-service security changes (disable MFA, regen codes,
   change password). Admin actions rely on `requireAdmin` instead.
4. **No email infrastructure** on the companion. Password reset is admin-typed and relayed out of
   band; there is intentionally no "forgot password" email flow (discussed, not built — would need
   an SMTP relay or O365 Graph, and the SPA is not route-based so a 6-digit code would fit better
   than a clickable link).
5. **Idle logout is client-side** — server session still lives 24h if the browser is killed without
   the timer firing. A server-side idle expiry was noted as a possible future add.

---

## Recent changes (this work stream, most recent first)

- **Removed the build-version chip** from the bottom of [NavigationRail.tsx](src/app/components/NavigationRail.tsx) (`BuildVersionChip` deleted). `__BUILD_INFO__` still used on the LoginScreen left panel.
- **15-minute inactivity auto-logout** — AuthContext idle timer (multi-tab via shared localStorage clock) + LoginScreen notice.
- **Self-service "Change password"** — `ChangePasswordModal` in MfaSecurity (`POST /api/auth/password`), keeps own session, boots others.
- **Admin password reset** — 🔑 action per row in User Management opens `ResetPasswordModal`; admin types a new password (`POST /api/auth/users/:id/password`), target's sessions revoked. Admin chose the typed-password variant, no forced-change-on-next-login.
- (Earlier in the stream: the whole login / register / MFA-TOTP / user-management layer itself.)

---

## Run

Two processes (see [gitcommand.md](gitcommand.md) for deploy):
```
# API (auth + SQL companion) — port 3001
cd server && npm install && npm start      # or: npm run dev  (node --watch)

# Frontend — Vite, port 5173
npm install && npm run dev
```
First account registered becomes admin. If `users.json` is empty the LoginScreen shows bootstrap-mode hints from `/api/auth/info`.

---

## Release-version convention

After **every** code change, bump [versioncheck.json](versioncheck.json) (repo root) so the in-app
update check advertises a new version. Scheme `YYYY.MM.DD.N` (today's date + that day's counter),
`releasedAt` = now, `notes` = real summary. Served to clients via `/api/admin/versioncheck`
(GitHub proxy). See memory `feedback-versioncheck-bump`.

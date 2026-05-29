/* Forcepoint HC — TOTP (RFC 6238) implementation.
   ───────────────────────────────────────────────────────────────────
   Pure Node — no npm dependencies. Covers exactly the surface we
   need for the authenticator-app MFA flow:
     • randomSecret()    → fresh 20-byte secret encoded as base32
     • generateCode()    → 6-digit code for the current time step
     • verifyCode()      → constant-time compare against the
                           current + 1 prior + 1 next step (±30s
                           drift tolerance, mirrors Google
                           Authenticator's default)
     • buildOtpauthUri() → `otpauth://totp/...` string for the QR
                           code; matches the de-facto standard
                           consumed by Google / Microsoft / 1Password
                           / Authy authenticator apps.
   Backup codes use scrypt-hashed storage (see auth.mjs). */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/* ─── Base32 codec (RFC 4648, no padding) ────────────────────────── */
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function base32Decode(str) {
  /* Strip whitespace + lowercase variants; reject anything outside
     the alphabet. Padding is optional in our encoder, but we tolerate
     it on input because users typing the secret manually often paste
     padded strings. */
  const cleaned = String(str).replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ─── Secret + code generation ───────────────────────────────────── */
export function randomSecret() {
  /* 20 bytes = 160 bits, the recommended length for HOTP/TOTP keys
     per RFC 4226. Base32-encoded the secret is 32 chars long, which
     matches Google Authenticator's expected length. */
  return base32Encode(randomBytes(20));
}

/* TOTP code for an arbitrary time step. Default counter = current
   30-second window since the Unix epoch. */
export function generateCode(secret, { step = 30, t0 = 0, digits = 6, atSeconds } = {}) {
  const now = typeof atSeconds === 'number' ? atSeconds : Math.floor(Date.now() / 1000);
  const counter = Math.floor((now - t0) / step);
  /* Counter is encoded as an 8-byte big-endian integer per RFC 4226.
     JavaScript's bit ops are 32-bit, so split into hi/lo halves. */
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xffffffff, 4);

  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  /* Dynamic truncation per RFC 4226 §5.3. */
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8)  |
     (hmac[offset + 3] & 0xff);

  return truncated.toString().padStart(digits, '0').slice(-digits);
}

/* Verify a user-supplied code with ±1 step drift tolerance. Returns
   true on match. Constant-time comparison via timingSafeEqual to
   avoid timing side-channels — though for 6-digit TOTP codes the
   risk is largely theoretical. */
export function verifyCode(secret, code, { step = 30, digits = 6, window = 1 } = {}) {
  if (typeof code !== 'string') return false;
  const cleaned = code.replace(/\s+/g, '');
  if (cleaned.length !== digits || !/^\d+$/.test(cleaned)) return false;

  const now = Math.floor(Date.now() / 1000);
  for (let drift = -window; drift <= window; drift++) {
    const expected = generateCode(secret, { step, digits, atSeconds: now + drift * step });
    if (expected.length !== cleaned.length) continue;
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned))) return true;
  }
  return false;
}

/* ─── otpauth URI for the QR code ────────────────────────────────── */
export function buildOtpauthUri({
  secret, issuer = 'Forcepoint HC Studio', account, algorithm = 'SHA1', digits = 6, period = 30,
}) {
  /* Per the de-facto Google Authenticator spec:
       otpauth://totp/<urlencoded-label>?secret=...&issuer=...&algorithm=...&digits=...&period=...
     Label is "Issuer:account" (both URL-encoded). The duplicate
     issuer= query param is required for Authy / Microsoft
     Authenticator to display the issuer name correctly. */
  const label = encodeURIComponent(`${issuer}:${account ?? 'user'}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ─── Backup codes ───────────────────────────────────────────────── */
/* Generate `n` user-facing backup codes in "XXXX-XXXX" format.
   Each code is 8 base32 chars (≈ 40 bits of entropy) split with a
   dash for readability. Returned plaintext is what the user
   downloads ONCE; only scrypt hashes get persisted. */
export function generateBackupCodePlain() {
  const buf = randomBytes(5); // 5 bytes → 8 base32 chars
  const raw = base32Encode(buf).slice(0, 8);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/* Normalise a user-typed backup code before hashing / comparing.
   Accepts case + dash variations so a user copy-pasting
   "abcd-1234" or "ABCD1234" or "abcd 1234" all resolve identically. */
export function normaliseBackupCode(code) {
  if (typeof code !== 'string') return '';
  return code.replace(/[\s-]/g, '').toUpperCase();
}

#!/usr/bin/env node
/* build-seed.mjs — turn a raw HC system-backup into the committed seed.
   ───────────────────────────────────────────────────────────────────
   Workflow:
     1. Export a System Backup from the HC Sessions page.
     2. Drop / rename it to `template.json` at the repo root (this file
        is gitignored — it may still carry the auth token + creds).
     3. Run `npm run seed`. This reads template.json, STRIPS every
        secret, and writes the sanitised `seed.json` that ships in the
        build and seeds every fresh install.
     4. Commit seed.json (never template.json).

   The vite seedDataPlugin emits seed.json to dist/ and serves it at
   /seed.json; src/app/utils/seedData.ts fetches it on boot. See those
   files for the runtime side. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'template.json');
const OUT = path.join(ROOT, 'seed.json');

const BACKUP_FORMAT = 'forcepoint-hc-system-backup';

/* Keys dropped from the seed entirely — pure secrets, host-bound. */
const DROP_KEYS = ['hc_auth_token', 'hc_seed_signature', 'hc_seed_applied_at'];

/* Credential fields blanked inside config objects (defensive — these
   are usually already empty in a clean base backup, but a real
   engagement export could carry live creds). */
const CRED_FIELDS = ['password', 'apiKey', 'username', 'token', 'encryptionKey', 'allowedSourceIp'];

function blankCreds(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(blankCreds);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (CRED_FIELDS.includes(k) && typeof v === 'string') out[k] = '';
    else out[k] = blankCreds(v);
  }
  return out;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`✖ ${path.relative(ROOT, SRC)} not found.`);
    console.error('  Export a System Backup from HC Sessions, save it as template.json at the repo root, then re-run `npm run seed`.');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(SRC, 'utf8'));
  } catch (err) {
    console.error(`✖ template.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  if (parsed?._format !== BACKUP_FORMAT) {
    console.error(`✖ template.json is not an HC system backup (expected _format="${BACKUP_FORMAT}").`);
    process.exit(1);
  }
  if (!parsed.keys || typeof parsed.keys !== 'object') {
    console.error('✖ template.json is missing the "keys" object.');
    process.exit(1);
  }

  const cleanKeys = {};
  const dropped = [];
  for (const [k, v] of Object.entries(parsed.keys)) {
    if (DROP_KEYS.includes(k)) { dropped.push(k); continue; }
    cleanKeys[k] = blankCreds(v);
  }

  const seed = {
    _format: BACKUP_FORMAT,
    _version: parsed._version ?? 1,
    _exportedAt: parsed._exportedAt ?? new Date().toISOString(),
    _seedSanitisedFrom: 'template.json',
    keys: cleanKeys,
  };

  writeFileSync(OUT, JSON.stringify(seed, null, 2) + '\n', 'utf8');

  console.log(`✓ seed.json written (${Object.keys(cleanKeys).length} keys).`);
  if (dropped.length) console.log(`  Stripped secret keys: ${dropped.join(', ')}`);
  console.log(`  Credential fields blanked in: hc_sql_config, hc_api_connectors, hc_customer_connector (if present).`);
  console.log('  Commit seed.json — NOT template.json.');
}

main();

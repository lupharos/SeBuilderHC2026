/* seedData.ts — default-data bootstrap.
   ───────────────────────────────────────────────────────────────────
   Every fresh install should start with the curated knowledge base
   (rule-engine templates, version EoL/EoM data, endpoint matrix, etc.)
   without the operator hand-restoring a backup. This module fetches a
   sanitised seed (`/seed.json`, emitted into the build by the vite
   seedDataPlugin — see vite.config.ts) and writes it into the same
   `hc_*` localStorage keys the app hydrates from via useLocalStorage.

   Two modes, decided automatically and applied silently:

     • FRESH install (no hc_* keys yet) → import the WHOLE seed.
     • Seed CHANGED since last applied   → refresh ONLY the catalogue/
       reference keys. Sessions, answers, certificates, customer data
       and anything engagement-specific are never touched, so an
       in-progress HC is safe across catalogue updates.

   seedOnBoot() runs in main.tsx BEFORE React mounts, so the very first
   render of every useLocalStorage hook already sees the seeded values —
   no reload needed. It never throws: any fetch/parse failure (offline,
   missing file) leaves the app on its built-in defaults. */

const SEED_URL = '/seed.json';
const BACKUP_FORMAT = 'forcepoint-hc-system-backup';
const HC_PREFIX = 'hc_';

const SIGNATURE_KEY = 'hc_seed_signature';
const APPLIED_AT_KEY = 'hc_seed_applied_at';

/* Never seeded — pure secrets / host-bound. Defensive: the committed
   seed.json is already sanitised by scripts/build-seed.mjs, but we
   refuse these here too so a hand-edited seed can't reintroduce them. */
const SECRET_KEYS = new Set(['hc_auth_token']);

/* Keys safe to refresh on a catalogue update. These are the curated
   reference data; everything else is engagement-specific and only
   written on a truly fresh install. */
const CATALOG_KEYS = [
  'hc_templates',
  'hc_version_data',
  'hc_version_upgrade_catalog',
  'hc_endpoint_support_matrix',
  'hc_destination_patterns',
  'hc_report_windows',
  'hc_dlp_posture_sections',
] as const;

/* Markers we manage — excluded from the "is this a fresh install?"
   count so our own bookkeeping never makes an empty browser look used. */
const MARKER_KEYS = new Set([SIGNATURE_KEY, APPLIED_AT_KEY]);

interface SeedFile {
  _format: string;
  _version?: number;
  _exportedAt?: string;
  keys: Record<string, unknown>;
}

export type SeedOutcome = 'full' | 'catalog' | 'none';

/* Stable, dependency-free hash (FNV-1a, 32-bit) over the catalogue
   subset. Detects any change to the reference data regardless of the
   _exportedAt stamp, so a hand-edited seed is picked up too. */
function signatureOf(keys: Record<string, unknown>): string {
  const subset: Record<string, unknown> = {};
  for (const k of CATALOG_KEYS) {
    if (k in keys) subset[k] = keys[k];
  }
  const json = JSON.stringify(subset);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function countHcKeys(): number {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(HC_PREFIX) && !MARKER_KEYS.has(k)) n++;
  }
  return n;
}

function writeKeys(keys: Record<string, unknown>, accept: (key: string) => boolean): number {
  let written = 0;
  for (const [k, v] of Object.entries(keys)) {
    if (!k.startsWith(HC_PREFIX)) continue;
    if (SECRET_KEYS.has(k) || MARKER_KEYS.has(k)) continue;
    if (!accept(k)) continue;
    try {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      written++;
    } catch (err) {
      console.error(`[seed] failed to write "${k}":`, err);
    }
  }
  return written;
}

function parseSeed(text: string): SeedFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed as Partial<SeedFile>;
  if (s._format !== BACKUP_FORMAT || !s.keys || typeof s.keys !== 'object') return null;
  return s as SeedFile;
}

/* Fetch the seed and apply it if needed. Resolves to what was done so
   the caller can surface a small notice. Never rejects. */
export async function seedOnBoot(): Promise<SeedOutcome> {
  try {
    const res = await fetch(SEED_URL, { cache: 'no-store' });
    if (!res.ok) return 'none';
    const seed = parseSeed(await res.text());
    if (!seed) return 'none';

    const newSig = signatureOf(seed.keys);
    const prevSig = localStorage.getItem(SIGNATURE_KEY);
    const isFresh = countHcKeys() === 0;

    let outcome: SeedOutcome = 'none';
    if (isFresh) {
      writeKeys(seed.keys, () => true); // full import (secrets/markers still skipped)
      outcome = 'full';
    } else if (prevSig !== newSig) {
      const catalog = new Set<string>(CATALOG_KEYS);
      writeKeys(seed.keys, (k) => catalog.has(k));
      outcome = 'catalog';
    }

    if (outcome !== 'none') {
      try {
        localStorage.setItem(SIGNATURE_KEY, newSig);
        localStorage.setItem(APPLIED_AT_KEY, seed._exportedAt ?? '');
        /* Hand the result to the UI for a quiet one-off toast. */
        sessionStorage.setItem('hc_seed_notice', outcome);
      } catch { /* storage full / unavailable — non-fatal */ }
    }
    return outcome;
  } catch {
    /* Offline, blocked, or no seed shipped — run on built-in defaults. */
    return 'none';
  }
}

/* Read + clear the one-off notice set by seedOnBoot (UI calls this on
   mount). Returns null when there's nothing to show. */
export function consumeSeedNotice(): SeedOutcome | null {
  try {
    const v = sessionStorage.getItem('hc_seed_notice');
    if (v === 'full' || v === 'catalog') {
      sessionStorage.removeItem('hc_seed_notice');
      return v;
    }
  } catch { /* ignore */ }
  return null;
}

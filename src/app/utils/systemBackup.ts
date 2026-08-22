/* System-wide backup helpers — exports / restores every `hc_*` localStorage
   key (sessions, templates, matrix, version catalogue, certificates, all the
   user-curated state) into a single JSON envelope. Used by the Backup buttons
   on the HC Sessions page.

   Restore is destructive: every existing hc_* key is removed before the new
   ones are written, and the caller must reload the page so the React state
   tree (which mirrors localStorage via useLocalStorage hooks) re-hydrates
   from the new payload. */

const HC_KEY_PREFIX = 'hc_';
const BACKUP_FORMAT = 'forcepoint-hc-system-backup';
const BACKUP_VERSION = 1 as const;

export interface SystemBackup {
  _format: typeof BACKUP_FORMAT;
  _version: typeof BACKUP_VERSION;
  _exportedAt: string;
  keys: Record<string, unknown>;
}

export interface BackupSummary {
  keyCount: number;
  sessionCount: number;
  templateCount: number;
  exportedAt: string;
  hasMatrix: boolean;
  hasVersionData: boolean;
  versionUpgradesCount: number;
  certificatesCount: number;
  dlpBundlesCount: number;
  complianceFrameworksCount: number;
}

/* ─────────────────────────────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────────────────────────────── */

export function buildBackup(): SystemBackup {
  const keys: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(HC_KEY_PREFIX)) continue;
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    try {
      keys[k] = JSON.parse(raw);
    } catch {
      /* Fallback: if the value isn't JSON, store as-is. useLocalStorage always
         writes JSON, so this branch is defensive only — covers stale or
         hand-edited keys. */
      keys[k] = raw;
    }
  }
  return {
    _format: BACKUP_FORMAT,
    _version: BACKUP_VERSION,
    _exportedAt: new Date().toISOString(),
    keys,
  };
}

export function downloadBackup(): void {
  const backup = buildBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `forcepoint-hc-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────────────
   IMPORT — validate then summarise; apply is a separate step so the UI
   can confirm with the user before the destructive restore.
───────────────────────────────────────────────────────────────────── */

export function parseBackup(text: string): SystemBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file is not an object.');
  }
  const b = parsed as Partial<SystemBackup>;
  if (b._format !== BACKUP_FORMAT) {
    throw new Error(`File is not a Forcepoint HC backup (expected _format="${BACKUP_FORMAT}", got "${String(b._format)}").`);
  }
  if (!b.keys || typeof b.keys !== 'object') {
    throw new Error('Backup is missing the "keys" object.');
  }
  /* Future-proof: we accept any version ≤ current, with a warning surfaced
     to the operator if it's older. Reject newer ones outright. */
  if (typeof b._version === 'number' && b._version > BACKUP_VERSION) {
    throw new Error(`Backup version ${b._version} is newer than this build supports (${BACKUP_VERSION}).`);
  }
  return parsed as SystemBackup;
}

export function summarize(backup: SystemBackup): BackupSummary {
  const k = backup.keys ?? {};
  const get = (key: string): unknown => (k as Record<string, unknown>)[key];
  const arr = (key: string): unknown[] => {
    const v = get(key);
    return Array.isArray(v) ? v : [];
  };
  return {
    keyCount: Object.keys(k).length,
    sessionCount:              arr('hc_sessions').length,
    templateCount:             arr('hc_templates').length,
    exportedAt:                backup._exportedAt,
    hasMatrix:                 !!get('hc_endpoint_support_matrix'),
    hasVersionData:            !!get('hc_version_data'),
    versionUpgradesCount:      arr('hc_version_upgrades').length,
    certificatesCount:         arr('hc_certificates').length,
    dlpBundlesCount:           arr('hc_dlp_bundles').length,
    complianceFrameworksCount: arr('hc_compliance_frameworks').length,
  };
}

export function applyBackup(backup: SystemBackup): void {
  if (!backup || !backup.keys) {
    throw new Error('Cannot apply empty backup.');
  }
  /* Wipe every existing hc_* key first so a partial restore can't leave
     stale fields from the previous state alongside the new payload. We
     skip non-hc_* keys (e.g. theme preferences) to keep the blast radius
     contained to HC data. */
  const existing: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(HC_KEY_PREFIX)) existing.push(k);
  }
  for (const k of existing) localStorage.removeItem(k);

  /* Write the new payload. Anything outside the hc_* prefix in the backup
     is rejected — a corrupted or malicious file should not be able to
     scribble into unrelated keys. */
  for (const [k, v] of Object.entries(backup.keys)) {
    if (!k.startsWith(HC_KEY_PREFIX)) continue;
    try {
      const serialized = typeof v === 'string' ? v : JSON.stringify(v);
      localStorage.setItem(k, serialized);
    } catch (err) {
      console.error(`Failed to restore key "${k}":`, err);
    }
  }
}

export function applyBackupPreservingSessions(backup: SystemBackup): void {
  /* Apply backup update but PRESERVE existing HC sessions.
     Used by "Get Updates" button — syncs templates/catalogs without
     destroying active assessments.

     Sessions are kept intact; everything else (templates, version data,
     compliance frameworks, certificates, etc.) is updated from the backup. */
  if (!backup || !backup.keys) {
    throw new Error('Cannot apply empty backup.');
  }

  /* Preserve existing sessions before wiping */
  const sessionsRaw = localStorage.getItem('hc_sessions');
  let existingSessions: unknown = null;
  if (sessionsRaw) {
    try {
      existingSessions = JSON.parse(sessionsRaw);
    } catch {
      existingSessions = sessionsRaw;
    }
  }

  /* Wipe all hc_* keys except sessions */
  const existing: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(HC_KEY_PREFIX) && k !== 'hc_sessions') {
      existing.push(k);
    }
  }
  for (const k of existing) localStorage.removeItem(k);

  /* Restore backup (everything except sessions) */
  for (const [k, v] of Object.entries(backup.keys)) {
    if (!k.startsWith(HC_KEY_PREFIX) || k === 'hc_sessions') continue;
    try {
      const serialized = typeof v === 'string' ? v : JSON.stringify(v);
      localStorage.setItem(k, serialized);
    } catch (err) {
      console.error(`Failed to restore key "${k}":`, err);
    }
  }

  /* Restore preserved sessions */
  if (existingSessions !== null) {
    try {
      const serialized = typeof existingSessions === 'string'
        ? existingSessions
        : JSON.stringify(existingSessions);
      localStorage.setItem('hc_sessions', serialized);
    } catch (err) {
      console.error('Failed to restore preserved sessions:', err);
    }
  }
}

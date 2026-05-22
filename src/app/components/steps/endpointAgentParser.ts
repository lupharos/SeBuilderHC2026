/* Forcepoint DLP Endpoint Status Log parser.
   Input: semicolon-delimited CSV (UTF-8, may include BOM).
   Output: a bounded-size 13-section technical summary suitable for
   persisting in localStorage even for deployments with tens of thousands
   of endpoints. */

export interface EndpointVersionRow {
  version: string;
  count: number;
  pct: number;
  isOutdated: boolean;
  bucket: VersionBucket;
}

export interface EndpointStatusRow {
  status: string;
  count: number;
  pct: number;
}

export interface EndpointServerRow {
  server: string;
  count: number;
  pct: number;
}

export interface StaleEndpoint {
  hostname: string;
  lastUpdate: string;
  daysOld: number;
}

/* ─── New types for the extended analysis ─── */

export type VersionBucket = 'CURRENT' | 'ONE_BEHIND' | 'OUTDATED' | 'LEGACY' | 'OLD_25' | 'ORPHAN';

export interface NullCountRow {
  column: string;
  nullCount: number;
  nullPct: number;
}

export interface ProfileBreakdownRow {
  profile: string;                  // "No Profile" for NaN
  count: number;
  pct: number;
  syncedCount: number;
  unsyncedCount: number;
  syncRatePct: number;
  stale30Count: number;
  stale30Pct: number;
  stale90Count: number;
  stale90Pct: number;
  versionTop3: { version: string; count: number }[];
  discoveryDistribution: { status: string; count: number }[];
  clientStatusDistribution: { status: string; count: number }[];
  flagZeroSync: boolean;
  flagUnmanaged: boolean;           // "No Profile"
  avgDaysSinceUpdate: number | null;
}

export interface VersionBucketRow {
  bucket: VersionBucket;
  count: number;
  pct: number;
  label: string;
  isCritical: boolean;
}

export interface SyncByGroupRow {
  group: string;
  syncedCount: number;
  unsyncedCount: number;
  syncRatePct: number;
  riskTier: 'OK' | 'HIGH' | 'CRITICAL';
}

export type StalenessBucketKey =
  | 'Fresh' | 'Recent' | 'Stale' | 'HighRisk' | 'Critical' | 'NeverUpdated';

export interface StalenessBucketRow {
  bucket: StalenessBucketKey;
  label: string;
  count: number;
  pct: number;
}

export interface ServerStaleRow {
  server: string;
  avgDays: number | null;
  countOver90: number;
}

export interface DiscoveryRow {
  status: string;                   // Disabled / Idle / Running / Unknown
  count: number;
  pct: number;
}

export interface MacOSCrossTabRow {
  safari: string;
  appleMail: string;
  count: number;
}

export interface RiskScoredEndpoint {
  hostname: string;
  ipAddress: string;
  score: number;
  tier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  version: string;
  synced: boolean;
  lastUpdate: string;
  profile: string;
  endpointServer: string;
}

export interface ServerRiskRow {
  server: string;
  avgScore: number;
  criticalCount: number;
  totalCount: number;
}

export interface ProfileRiskRow {
  profile: string;
  avgScore: number;
  totalCount: number;
}

export interface DuplicateMacRow {
  mac: string;
  hostnames: string[];
  count: number;
}

export interface ExecutiveBullet {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  finding: string;
  impact: string;
  action: string;
}

export interface EndpointAgentSummary {
  fileName: string;
  importedAt: string;            // ISO timestamp
  totalRecords: number;

  /* ─── Section 1: Dataset overview ─── */
  nullCounts: NullCountRow[];
  unknownColumns: string[];

  /* ─── Section 2: Profile breakdown ─── */
  profileBreakdown: ProfileBreakdownRow[];
  unmanagedCount: number;        // endpoints with no profile

  /* ─── Section 3: Version analysis ─── */
  versionDistribution: EndpointVersionRow[];
  latestVersion: string | null;
  /* Operator-selected "active" agent version — the one the customer
     treats as their current production agent. When set, downstream
     pages (Step 6 Endpoint Compatibility) evaluate against this
     instead of the auto-detected `latestVersion`. null on fresh
     imports — the latest version is the default fallback. */
  activeVersion?: string | null;
  outdatedCount: number;
  outdatedPct: number;
  versionBuckets: VersionBucketRow[];
  policyEngineMismatchCount: number;
  policyEngineMismatchSample: { hostname: string; client: string; engine: string }[];

  /* ─── Section 4: Sync status ─── */
  syncedCount: number;
  unsyncedCount: number;
  unsyncedPct: number;
  syncRatePct: number;
  syncByServer: SyncByGroupRow[];
  syncByProfile: SyncByGroupRow[];
  syncByVersionBucket: SyncByGroupRow[];
  highRiskSyncServers: string[];   // sync rate < 50%
  criticalSyncServers: string[];   // sync rate < 30%
  topUnsyncedServers: { server: string; unsynced: number }[];

  /* ─── Section 5: Staleness ─── */
  stalenessBuckets: StalenessBucketRow[];
  staleCount: number;             // > 30 days (legacy field — equals Stale+HighRisk+Critical)
  stalePct: number;
  staleSample: StaleEndpoint[];   // most stale endpoints, capped to 50
  serverStaleness: ServerStaleRow[];
  profileStaleness: { profile: string; avgDays: number | null }[];
  likelyDecommissionedCount: number;   // > 365 days

  /* ─── Section 6: Server load ─── */
  serverDistribution: EndpointServerRow[];
  serverImbalance: { topServer: string; topPct: number; bottomServer: string; bottomPct: number } | null;
  loadImbalanceScore: number;       // (max - min) / total * 100
  concentrationRiskServers: string[]; // servers carrying > 25% of total
  downServers: string[];             // servers with 0 synced agents
  secondaryServers: string[];        // servers with < 20 agents

  /* ─── Section 7: Discovery status ─── */
  discoveryDistribution: DiscoveryRow[];
  discoveryDisabledCount: number;
  discoveryDisabledPct: number;
  discoveryRunningPct: number;

  /* ─── Section 8: Client status ─── */
  clientStatusBreakdown: EndpointStatusRow[];
  disabledCount: number;
  disabledPct: number;
  disabledAndSyncedAnomalyCount: number;   // Disabled AND Synced=True

  /* ─── Section 9: Microsoft RMS ─── */
  rmsActiveCount: number;
  rmsInactiveCount: number;
  rmsInactivePct: number;
  rmsTier: 'OK' | 'HIGH' | 'CRITICAL';

  /* ─── Section 10: macOS coverage ─── */
  safariDistribution: EndpointStatusRow[];
  appleMailDistribution: EndpointStatusRow[];
  macOSCrossTab: MacOSCrossTabRow[];
  macOSBlindSpot: boolean;          // Unknown > 20% of total

  /* ─── Section 11: Multi-factor risk scoring ─── */
  riskTierDistribution: { tier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; count: number; pct: number }[];
  topRiskEndpoints: RiskScoredEndpoint[];
  serverRiskDistribution: ServerRiskRow[];
  profileRiskDistribution: ProfileRiskRow[];

  /* ─── Section 12: Anomalies ─── */
  duplicateMacs: DuplicateMacRow[];          // capped to 50
  duplicateMacCount: number;
  scanSchedulerBrokenCount: number;          // next scan in past > 30 days
  scanSchedulerBrokenSample: { hostname: string; nextScan: string }[];
  scanTimeCorruptionCount: number;           // end < start
  filesScannedZeroIdleCount: number;         // Files Scanned = 0 AND Discovery = Idle
  activeUserUnsyncedCount: number;           // Logged-in Users != null AND Synced = False

  /* ─── Section 13: Executive summary ─── */
  executiveSummary: ExecutiveBullet[];

  /* Legacy fields kept for back-compat with existing UI / HTML report */
  topFindings: string[];
}

/* ─── CSV parsing ───────────────────────────────────────────── */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitCsvLine(line: string, delim = ';'): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) {
        cells.push(cur);
        cur = '';
      } else cur += c;
    }
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

type RawRow = Record<string, string>;

const EXPECTED_COLUMNS = [
  'Hostname', 'IP Address', 'Logged-in Users', 'Last Update', 'Last Scan End Time',
  'Profile Name', 'Synced', 'Discovery Status', 'Last Scan Start Time', 'Files Scanned',
  'Next Scan Time', 'Client Status', 'Endpoint Server', 'Client Installation Version',
  'Policy Engine Version', 'MAC Address', 'Microsoft RMS', 'Apple Mail Plug-in Status',
  'Safari Extension Status',
];

/* Auto-detect delimiter by scanning the header line. The DLP Manager
   in some locales exports semicolon-delimited CSV (EU-style), in others
   comma-delimited (US-style). We count unquoted occurrences of each and
   pick the winner. Quoted fields can themselves contain `,` (multi-IP,
   multi-MAC) or `;`, so we only count delimiters that occur OUTSIDE
   double quotes. */
function detectDelimiter(headerLine: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ',') commas++;
    else if (c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

function parseRows(text: string): { rows: RawRow[]; headers: string[]; delimiter: string } {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return { rows: [], headers: [], delimiter: ',' };

  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim);
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.length === 1 && cells[0] === '') continue;
    const obj: RawRow = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] ?? '';
    }
    rows.push(obj);
  }
  return { rows, headers, delimiter: delim };
}

/* ─── Date parsing ───────────────────────────────────────────── */

const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateLoose(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^(n\/?a|—|-|never|null)$/i.test(s)) return null;

  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) return native;

  // DLP Manager export format — "14 Oct. 2025, 03:40:13 PM GMT+0400"
  // Period after month abbreviation, comma before time, AM/PM, explicit tz.
  // The native Date parser handles this inconsistently across browsers, so
  // we match explicitly. Timezone offset honored as ±HHMM.
  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:GMT\s*([+-]\d{2})(\d{2})?)?$/i);
  if (m) {
    const [, da, monStr, yr, hhStr, mi, se = '0', ampm, tzH, tzM = '00'] = m;
    const mon = MONTH_ABBR[monStr.toLowerCase()];
    if (mon !== undefined) {
      let hh = Number(hhStr);
      if (ampm) {
        const upper = ampm.toUpperCase();
        if (upper === 'PM' && hh < 12) hh += 12;
        else if (upper === 'AM' && hh === 12) hh = 0;
      }
      if (tzH) {
        const tzOffsetMin = (Number(tzH) * 60) + (Number(tzH) < 0 ? -Number(tzM) : Number(tzM));
        const utcMs = Date.UTC(Number(yr), mon, Number(da), hh, Number(mi), Number(se));
        const d = new Date(utcMs - tzOffsetMin * 60_000);
        if (!Number.isNaN(d.getTime())) return d;
      } else {
        const d = new Date(Number(yr), mon, Number(da), hh, Number(mi), Number(se));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
  }

  // DD/MM/YYYY HH:mm[:ss] — dayfirst (matches the user's pandas spec)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, da, mo, yr, hh = '0', mi = '0', se = '0'] = m;
    const d = new Date(Number(yr), Number(mo) - 1, Number(da), Number(hh), Number(mi), Number(se));
    if (!Number.isNaN(d.getTime())) return d;
  }

  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, da, mo, yr, hh = '0', mi = '0', se = '0'] = m;
    const d = new Date(Number(yr), Number(mo) - 1, Number(da), Number(hh), Number(mi), Number(se));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/* ─── Version utilities ─────────────────────────────────────── */

function versionParts(v: string): number[] {
  return v.split(/[.\-+]/).map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersionsDesc(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  }
  return 0;
}

function isOlderThan25(version: string): boolean {
  const major = versionParts(version)[0] ?? 0;
  return major > 0 && major < 25;
}

function classifyVersion(version: string): VersionBucket {
  if (!version || /^unknown$/i.test(version) || version === '—') return 'ORPHAN';
  const parts = versionParts(version);
  const major = parts[0] ?? 0;
  if (!major) return 'ORPHAN';
  if (major < 24) return 'LEGACY';
  if (major === 24) return 'OUTDATED';
  if (major === 25) {
    // Check minor.build
    if (version === '25.09.5741' || /^25\.09\.5741/.test(version)) return 'CURRENT';
    if (/^25\.08\./.test(version)) return 'ONE_BEHIND';
    return 'OLD_25';
  }
  return 'CURRENT'; // 26.x and beyond — treat as current
}

const VERSION_BUCKET_LABELS: Record<VersionBucket, string> = {
  CURRENT: 'Current (25.09.5741)',
  ONE_BEHIND: 'One Release Behind (25.08.x)',
  OLD_25: 'Other 25.x',
  OUTDATED: 'Outdated (24.x)',
  LEGACY: 'Legacy (≤ 23.x)',
  ORPHAN: 'Orphan / No Version',
};

/* ─── Helpers ────────────────────────────────────────────────── */

const STALE_DAY_THRESHOLD = 30;
const STALE_90 = 90;
const STALE_180 = 180;
const STALE_365 = 365;

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function nonEmpty(v: string | undefined): boolean {
  if (v == null) return false;
  const s = v.trim();
  return s.length > 0 && !/^(null|n\/?a|—|-)$/i.test(s);
}

function normalize(v: string | undefined): string {
  if (!nonEmpty(v)) return '';
  return (v ?? '').trim();
}

function syncRiskTier(rate: number): 'OK' | 'HIGH' | 'CRITICAL' {
  if (rate < 30) return 'CRITICAL';
  if (rate < 50) return 'HIGH';
  return 'OK';
}

/* ─── Main parse function ───────────────────────────────────── */

export function parseEndpointAgentCsv(text: string, fileName: string): EndpointAgentSummary {
  const { rows, headers } = parseRows(text);
  const total = rows.length;
  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;

  /* ─── Section 1: Null counts + unknown columns ─── */
  const nullCounts: NullCountRow[] = headers.map((col) => {
    let nulls = 0;
    for (const r of rows) if (!nonEmpty(r[col])) nulls++;
    return { column: col, nullCount: nulls, nullPct: pct(nulls, total) };
  });
  const unknownColumns = headers.filter((h) => !EXPECTED_COLUMNS.includes(h));

  /* ─── Pre-compute per-row derived fields once ─── */
  type DerivedRow = {
    hostname: string;
    ip: string;
    user: string;
    profile: string;          // "No Profile" if empty
    version: string;          // "Unknown" if empty
    policyEngine: string;     // "Unknown" if empty
    server: string;           // "Unassigned" if empty
    clientStatus: string;     // "Unknown" if empty
    discovery: string;        // "Unknown" if empty
    rms: string;              // ACTIVE/INACTIVE/Unknown
    safari: string;
    appleMail: string;
    mac: string;
    synced: boolean;
    lastUpdate: Date | null;
    lastUpdateRaw: string;
    nextScan: Date | null;
    nextScanRaw: string;
    lastScanStart: Date | null;
    lastScanEnd: Date | null;
    filesScanned: number;
    daysSinceUpdate: number | null;
    bucket: VersionBucket;
    riskScore: number;
    riskTier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  };

  const derived: DerivedRow[] = rows.map((r) => {
    const version = normalize(r['Client Installation Version']) || 'Unknown';
    const policy = normalize(r['Policy Engine Version']) || 'Unknown';
    const lastUpdate = parseDateLoose(r['Last Update'] ?? '');
    const daysSince = lastUpdate ? Math.floor((now - lastUpdate.getTime()) / dayMs) : null;
    const synced = /^true$/i.test((r.Synced ?? '').trim());
    const bucket = classifyVersion(version);

    return {
      hostname: normalize(r.Hostname) || '(unknown)',
      ip: normalize(r['IP Address']),
      user: normalize(r['Logged-in Users']),
      profile: normalize(r['Profile Name']) || 'No Profile',
      version,
      policyEngine: policy,
      server: normalize(r['Endpoint Server']) || 'Unassigned',
      clientStatus: normalize(r['Client Status']) || 'Unknown',
      discovery: normalize(r['Discovery Status']) || 'Unknown',
      rms: (normalize(r['Microsoft RMS']) || 'Unknown').toUpperCase(),
      safari: normalize(r['Safari Extension Status']) || 'Unknown',
      appleMail: normalize(r['Apple Mail Plug-in Status']) || 'Unknown',
      mac: normalize(r['MAC Address']),
      synced,
      lastUpdate,
      lastUpdateRaw: r['Last Update'] ?? '',
      nextScan: parseDateLoose(r['Next Scan Time'] ?? ''),
      nextScanRaw: r['Next Scan Time'] ?? '',
      lastScanStart: parseDateLoose(r['Last Scan Start Time'] ?? ''),
      lastScanEnd: parseDateLoose(r['Last Scan End Time'] ?? ''),
      filesScanned: parseInt(r['Files Scanned'] ?? '', 10) || 0,
      daysSinceUpdate: daysSince,
      bucket,
      riskScore: 0,         // computed below
      riskTier: 'LOW',
    };
  });

  /* Compute risk score per row */
  for (const d of derived) {
    let s = 0;
    if (d.bucket === 'LEGACY') s += 3;
    else if (d.bucket === 'OUTDATED') s += 2;
    if (!d.synced) s += 2;
    if (d.daysSinceUpdate !== null && d.daysSinceUpdate > 90) s += 2;
    else if (d.daysSinceUpdate !== null && d.daysSinceUpdate > 30) s += 1;
    if (d.profile === 'No Profile') s += 2;
    if (/disabled/i.test(d.discovery)) s += 1;
    if (d.rms === 'INACTIVE') s += 1;
    if (!/^enabled$/i.test(d.clientStatus)) s += 1;
    d.riskScore = s;
    d.riskTier = s >= 6 ? 'CRITICAL' : s >= 4 ? 'HIGH' : s >= 2 ? 'MEDIUM' : 'LOW';
  }

  /* ─── Section 3: Version distribution + bucket classification ─── */
  const versionCounts = new Map<string, number>();
  for (const d of derived) versionCounts.set(d.version, (versionCounts.get(d.version) ?? 0) + 1);
  const versionsSorted = Array.from(versionCounts.keys()).sort(compareVersionsDesc);
  const latestVersion = versionsSorted.find((v) => v !== 'Unknown') ?? null;
  const versionDistribution: EndpointVersionRow[] = versionsSorted.map((v) => ({
    version: v,
    count: versionCounts.get(v) ?? 0,
    pct: pct(versionCounts.get(v) ?? 0, total),
    isOutdated: isOlderThan25(v),
    bucket: classifyVersion(v),
  }));
  const outdatedCount = versionDistribution.filter((v) => v.isOutdated).reduce((s, v) => s + v.count, 0);

  const bucketCounts: Record<VersionBucket, number> = {
    CURRENT: 0, ONE_BEHIND: 0, OLD_25: 0, OUTDATED: 0, LEGACY: 0, ORPHAN: 0,
  };
  for (const d of derived) bucketCounts[d.bucket]++;
  const versionBuckets: VersionBucketRow[] = (Object.keys(VERSION_BUCKET_LABELS) as VersionBucket[])
    .map((k) => ({
      bucket: k,
      label: VERSION_BUCKET_LABELS[k],
      count: bucketCounts[k],
      pct: pct(bucketCounts[k], total),
      isCritical: k === 'LEGACY' || (k === 'OUTDATED' && bucketCounts[k] > 0),
    }));

  let policyEngineMismatchCount = 0;
  const policyEngineMismatchSample: { hostname: string; client: string; engine: string }[] = [];
  for (const d of derived) {
    if (d.version !== 'Unknown' && d.policyEngine !== 'Unknown' && d.version !== d.policyEngine) {
      policyEngineMismatchCount++;
      if (policyEngineMismatchSample.length < 20) {
        policyEngineMismatchSample.push({ hostname: d.hostname, client: d.version, engine: d.policyEngine });
      }
    }
  }

  /* ─── Section 8: Client status ─── */
  const statusCounts = new Map<string, number>();
  for (const d of derived) statusCounts.set(d.clientStatus, (statusCounts.get(d.clientStatus) ?? 0) + 1);
  const clientStatusBreakdown: EndpointStatusRow[] = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
  const disabledCount = clientStatusBreakdown
    .filter((r) => /^(disabled|stopped|not[-_ ]?running|offline)$/i.test(r.status))
    .reduce((s, r) => s + r.count, 0);
  const disabledAndSyncedAnomalyCount = derived.filter(
    (d) => /^(disabled|stopped|not[-_ ]?running|offline)$/i.test(d.clientStatus) && d.synced,
  ).length;

  /* ─── Section 4: Sync ─── */
  let syncedCount = 0;
  let unsyncedCount = 0;
  for (const d of derived) (d.synced ? syncedCount++ : unsyncedCount++);
  const syncRatePct = pct(syncedCount, total);
  const unsyncedPct = pct(unsyncedCount, total);

  const groupBy = <T,>(arr: DerivedRow[], keyFn: (d: DerivedRow) => string, mapFn: (g: DerivedRow[]) => T): Map<string, T> => {
    const m = new Map<string, DerivedRow[]>();
    for (const d of arr) {
      const k = keyFn(d);
      const list = m.get(k) ?? [];
      list.push(d);
      m.set(k, list);
    }
    const out = new Map<string, T>();
    for (const [k, v] of m) out.set(k, mapFn(v));
    return out;
  };

  const buildSyncGroup = (group: string, list: DerivedRow[]): SyncByGroupRow => {
    let s = 0, u = 0;
    for (const d of list) (d.synced ? s++ : u++);
    const rate = pct(s, s + u);
    return { group, syncedCount: s, unsyncedCount: u, syncRatePct: rate, riskTier: syncRiskTier(rate) };
  };

  const syncByServerMap = groupBy(derived, (d) => d.server, (g) => g);
  const syncByServer: SyncByGroupRow[] = Array.from(syncByServerMap.entries())
    .map(([k, list]) => buildSyncGroup(k, list))
    .sort((a, b) => a.syncRatePct - b.syncRatePct);

  const syncByProfileMap = groupBy(derived, (d) => d.profile, (g) => g);
  const syncByProfile: SyncByGroupRow[] = Array.from(syncByProfileMap.entries())
    .map(([k, list]) => buildSyncGroup(k, list))
    .sort((a, b) => a.syncRatePct - b.syncRatePct);

  const syncByVersionBucketMap = groupBy(derived, (d) => d.bucket, (g) => g);
  const syncByVersionBucket: SyncByGroupRow[] = Array.from(syncByVersionBucketMap.entries())
    .map(([k, list]) => buildSyncGroup(VERSION_BUCKET_LABELS[k as VersionBucket] ?? k, list));

  const highRiskSyncServers = syncByServer.filter((r) => r.riskTier === 'HIGH').map((r) => r.group);
  const criticalSyncServers = syncByServer.filter((r) => r.riskTier === 'CRITICAL').map((r) => r.group);
  const topUnsyncedServers = [...syncByServer]
    .sort((a, b) => b.unsyncedCount - a.unsyncedCount)
    .slice(0, 5)
    .map((r) => ({ server: r.group, unsynced: r.unsyncedCount }));

  /* ─── Section 5: Staleness ─── */
  const stalenessBucketsMap: Record<StalenessBucketKey, number> = {
    Fresh: 0, Recent: 0, Stale: 0, HighRisk: 0, Critical: 0, NeverUpdated: 0,
  };
  for (const d of derived) {
    if (d.daysSinceUpdate === null) stalenessBucketsMap.NeverUpdated++;
    else if (d.daysSinceUpdate <= 7) stalenessBucketsMap.Fresh++;
    else if (d.daysSinceUpdate <= 30) stalenessBucketsMap.Recent++;
    else if (d.daysSinceUpdate <= 90) stalenessBucketsMap.Stale++;
    else if (d.daysSinceUpdate <= 180) stalenessBucketsMap.HighRisk++;
    else stalenessBucketsMap.Critical++;
  }
  const stalenessLabels: Record<StalenessBucketKey, string> = {
    Fresh: '≤ 7 days', Recent: '8–30 days', Stale: '31–90 days',
    HighRisk: '91–180 days', Critical: '> 180 days', NeverUpdated: 'No date',
  };
  const stalenessBuckets: StalenessBucketRow[] = (Object.keys(stalenessBucketsMap) as StalenessBucketKey[])
    .map((k) => ({ bucket: k, label: stalenessLabels[k], count: stalenessBucketsMap[k], pct: pct(stalenessBucketsMap[k], total) }));

  const staleCount = stalenessBucketsMap.Stale + stalenessBucketsMap.HighRisk + stalenessBucketsMap.Critical;
  const stalePct = pct(staleCount, total);
  const likelyDecommissionedCount = derived.filter((d) => d.daysSinceUpdate !== null && d.daysSinceUpdate > STALE_365).length;

  const staleSample: StaleEndpoint[] = derived
    .filter((d) => d.daysSinceUpdate !== null && d.daysSinceUpdate > STALE_DAY_THRESHOLD)
    .sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0))
    .slice(0, 50)
    .map((d) => ({ hostname: d.hostname, lastUpdate: d.lastUpdateRaw, daysOld: d.daysSinceUpdate ?? 0 }));

  const serverStaleness: ServerStaleRow[] = Array.from(syncByServerMap.entries())
    .map(([server, list]) => {
      const withDates = list.filter((d) => d.daysSinceUpdate !== null);
      const avg = withDates.length > 0
        ? Math.round(withDates.reduce((s, d) => s + (d.daysSinceUpdate ?? 0), 0) / withDates.length)
        : null;
      const over90 = list.filter((d) => (d.daysSinceUpdate ?? 0) > STALE_90).length;
      return { server, avgDays: avg, countOver90: over90 };
    })
    .sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0));

  const profileStaleness = Array.from(syncByProfileMap.entries())
    .map(([profile, list]) => {
      const withDates = list.filter((d) => d.daysSinceUpdate !== null);
      const avg = withDates.length > 0
        ? Math.round(withDates.reduce((s, d) => s + (d.daysSinceUpdate ?? 0), 0) / withDates.length)
        : null;
      return { profile, avgDays: avg };
    })
    .sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0));

  /* ─── Section 6: Server load ─── */
  const serverCounts = new Map<string, number>();
  for (const d of derived) serverCounts.set(d.server, (serverCounts.get(d.server) ?? 0) + 1);
  const serverDistribution: EndpointServerRow[] = Array.from(serverCounts.entries())
    .map(([server, count]) => ({ server, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);

  let serverImbalance: EndpointAgentSummary['serverImbalance'] = null;
  if (serverDistribution.length >= 2) {
    const top = serverDistribution[0];
    const bottom = serverDistribution[serverDistribution.length - 1];
    if (top.pct - bottom.pct >= 25) {
      serverImbalance = { topServer: top.server, topPct: top.pct, bottomServer: bottom.server, bottomPct: bottom.pct };
    }
  }
  const counts = serverDistribution.map((s) => s.count);
  const loadImbalanceScore = total > 0 && counts.length > 0
    ? Math.round(((Math.max(...counts) - Math.min(...counts)) / total) * 1000) / 10
    : 0;
  const concentrationRiskServers = serverDistribution.filter((s) => s.pct > 25).map((s) => s.server);
  const downServers = Array.from(syncByServerMap.entries())
    .filter(([_, list]) => list.length > 0 && list.every((d) => !d.synced))
    .map(([k]) => k);
  const secondaryServers = serverDistribution.filter((s) => s.count < 20).map((s) => s.server);

  /* ─── Section 2: Profile breakdown ─── */
  const profileBreakdown: ProfileBreakdownRow[] = Array.from(syncByProfileMap.entries())
    .map(([profile, list]) => {
      let s = 0, u = 0;
      let stale30 = 0, stale90 = 0;
      const vMap = new Map<string, number>();
      const dMap = new Map<string, number>();
      const csMap = new Map<string, number>();
      let totalDays = 0;
      let withDates = 0;
      for (const d of list) {
        (d.synced ? s++ : u++);
        if (d.daysSinceUpdate !== null) {
          totalDays += d.daysSinceUpdate;
          withDates++;
          if (d.daysSinceUpdate > 30) stale30++;
          if (d.daysSinceUpdate > 90) stale90++;
        }
        vMap.set(d.version, (vMap.get(d.version) ?? 0) + 1);
        dMap.set(d.discovery, (dMap.get(d.discovery) ?? 0) + 1);
        csMap.set(d.clientStatus, (csMap.get(d.clientStatus) ?? 0) + 1);
      }
      const rate = pct(s, s + u);
      const versionTop3 = Array.from(vMap.entries())
        .map(([version, count]) => ({ version, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      const discoveryDist = Array.from(dMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
      const csDist = Array.from(csMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
      return {
        profile,
        count: list.length,
        pct: pct(list.length, total),
        syncedCount: s,
        unsyncedCount: u,
        syncRatePct: rate,
        stale30Count: stale30,
        stale30Pct: pct(stale30, list.length),
        stale90Count: stale90,
        stale90Pct: pct(stale90, list.length),
        versionTop3,
        discoveryDistribution: discoveryDist,
        clientStatusDistribution: csDist,
        flagZeroSync: rate === 0,
        flagUnmanaged: profile === 'No Profile',
        avgDaysSinceUpdate: withDates > 0 ? Math.round(totalDays / withDates) : null,
      };
    })
    .sort((a, b) => b.count - a.count);
  const unmanagedCount = profileBreakdown.find((p) => p.flagUnmanaged)?.count ?? 0;

  /* ─── Section 7: Discovery ─── */
  const discoveryMap = new Map<string, number>();
  for (const d of derived) discoveryMap.set(d.discovery, (discoveryMap.get(d.discovery) ?? 0) + 1);
  const discoveryDistribution: DiscoveryRow[] = Array.from(discoveryMap.entries())
    .map(([status, count]) => ({ status, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
  const discoveryDisabledCount = discoveryDistribution.filter((d) => /disabled/i.test(d.status)).reduce((s, d) => s + d.count, 0);
  const discoveryRunningCount = discoveryDistribution.filter((d) => /running/i.test(d.status)).reduce((s, d) => s + d.count, 0);

  /* ─── Section 9: RMS ─── */
  let rmsActive = 0, rmsInactive = 0;
  for (const d of derived) {
    if (d.rms === 'ACTIVE') rmsActive++;
    else if (d.rms === 'INACTIVE') rmsInactive++;
  }
  const rmsTotal = rmsActive + rmsInactive;
  const rmsInactivePct = rmsTotal > 0 ? pct(rmsInactive, rmsTotal) : 0;
  const rmsTier: 'OK' | 'HIGH' | 'CRITICAL' = rmsInactivePct > 90 ? 'CRITICAL' : rmsInactivePct > 50 ? 'HIGH' : 'OK';

  /* ─── Section 10: macOS ─── */
  const safariMap = new Map<string, number>();
  const appleMailMap = new Map<string, number>();
  const crossMap = new Map<string, number>();
  for (const d of derived) {
    safariMap.set(d.safari, (safariMap.get(d.safari) ?? 0) + 1);
    appleMailMap.set(d.appleMail, (appleMailMap.get(d.appleMail) ?? 0) + 1);
    const key = `${d.safari}||${d.appleMail}`;
    crossMap.set(key, (crossMap.get(key) ?? 0) + 1);
  }
  const safariDistribution: EndpointStatusRow[] = Array.from(safariMap.entries())
    .map(([status, count]) => ({ status, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
  const appleMailDistribution: EndpointStatusRow[] = Array.from(appleMailMap.entries())
    .map(([status, count]) => ({ status, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
  const macOSCrossTab: MacOSCrossTabRow[] = Array.from(crossMap.entries())
    .map(([key, count]) => {
      const [safari, appleMail] = key.split('||');
      return { safari, appleMail, count };
    })
    .sort((a, b) => b.count - a.count);
  const safariUnknown = safariDistribution.filter((s) => /unknown/i.test(s.status)).reduce((s, r) => s + r.count, 0);
  const appleMailUnknown = appleMailDistribution.filter((s) => /unknown/i.test(s.status)).reduce((s, r) => s + r.count, 0);
  const macOSBlindSpot = pct(Math.max(safariUnknown, appleMailUnknown), total) > 20;

  /* ─── Section 11: Risk scoring summary ─── */
  const tierMap = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const d of derived) tierMap[d.riskTier]++;
  const riskTierDistribution = (Object.keys(tierMap) as Array<keyof typeof tierMap>).map((tier) => ({
    tier, count: tierMap[tier], pct: pct(tierMap[tier], total),
  }));
  const topRiskEndpoints: RiskScoredEndpoint[] = [...derived]
    .sort((a, b) => b.riskScore - a.riskScore || a.hostname.localeCompare(b.hostname))
    .slice(0, 20)
    .map((d) => ({
      hostname: d.hostname, ipAddress: d.ip, score: d.riskScore, tier: d.riskTier,
      version: d.version, synced: d.synced, lastUpdate: d.lastUpdateRaw,
      profile: d.profile, endpointServer: d.server,
    }));

  const serverRiskDistribution: ServerRiskRow[] = Array.from(syncByServerMap.entries())
    .map(([server, list]) => {
      const sum = list.reduce((s, d) => s + d.riskScore, 0);
      const crit = list.filter((d) => d.riskTier === 'CRITICAL').length;
      return { server, avgScore: Math.round((sum / list.length) * 10) / 10, criticalCount: crit, totalCount: list.length };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
  const profileRiskDistribution: ProfileRiskRow[] = Array.from(syncByProfileMap.entries())
    .map(([profile, list]) => {
      const sum = list.reduce((s, d) => s + d.riskScore, 0);
      return { profile, avgScore: Math.round((sum / list.length) * 10) / 10, totalCount: list.length };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  /* ─── Section 12: Anomalies ─── */
  const macGroups = new Map<string, string[]>();
  for (const d of derived) {
    if (!d.mac || /^00:00:00:00:00:00$/.test(d.mac)) continue;
    const list = macGroups.get(d.mac) ?? [];
    list.push(d.hostname);
    macGroups.set(d.mac, list);
  }
  const duplicateMacs: DuplicateMacRow[] = Array.from(macGroups.entries())
    .filter(([_, hosts]) => hosts.length > 1)
    .slice(0, 50)
    .map(([mac, hosts]) => ({ mac, hostnames: hosts.slice(0, 10), count: hosts.length }))
    .sort((a, b) => b.count - a.count);
  const duplicateMacCount = Array.from(macGroups.values()).filter((h) => h.length > 1).length;

  const scanSchedulerBroken = derived.filter((d) => d.nextScan && (now - d.nextScan.getTime()) / dayMs > 30);
  const scanSchedulerBrokenSample = scanSchedulerBroken.slice(0, 20).map((d) => ({ hostname: d.hostname, nextScan: d.nextScanRaw }));

  const scanTimeCorruptionCount = derived.filter(
    (d) => d.lastScanStart && d.lastScanEnd && d.lastScanEnd.getTime() < d.lastScanStart.getTime(),
  ).length;

  const filesScannedZeroIdleCount = derived.filter(
    (d) => d.filesScanned === 0 && /idle/i.test(d.discovery),
  ).length;

  const activeUserUnsyncedCount = derived.filter((d) => d.user && !d.synced).length;

  /* ─── Section 13: Executive summary ─── */
  const exec: ExecutiveBullet[] = [];
  exec.push({
    severity: 'INFO',
    finding: `${total.toLocaleString()} endpoints registered against management server${serverDistribution.length > 0 ? ` across ${serverDistribution.length} endpoint server${serverDistribution.length > 1 ? 's' : ''}` : ''}`,
    impact: `Effective coverage gap = ${(disabledCount + bucketCounts.ORPHAN + (total - syncedCount)).toLocaleString()} agents not fully under policy enforcement`,
    action: 'Quantify coverage in Excel against AD asset inventory to find unprotected endpoints',
  });

  const overallSyncTier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = syncRatePct < 30 ? 'CRITICAL' : syncRatePct < 50 ? 'HIGH' : syncRatePct < 80 ? 'MEDIUM' : 'LOW';
  exec.push({
    severity: overallSyncTier,
    finding: `Fleet sync rate is ${syncRatePct}% (${unsyncedCount.toLocaleString()} unsynced)`,
    impact: 'Unsynced agents run stale policy versions and may not report incidents to the management server',
    action: criticalSyncServers.length > 0
      ? `Investigate ${criticalSyncServers.length} endpoint server(s) with sync rate < 30%`
      : 'Schedule fleet-wide policy refresh and capture failure logs from agents that do not reconnect',
  });

  if (bucketCounts.LEGACY > 0 || bucketCounts.OUTDATED > 0) {
    exec.push({
      severity: bucketCounts.LEGACY > 0 ? 'CRITICAL' : 'HIGH',
      finding: `${(bucketCounts.LEGACY + bucketCounts.OUTDATED).toLocaleString()} endpoints on outdated or legacy agent (${pct(bucketCounts.LEGACY + bucketCounts.OUTDATED, total)}% of fleet)`,
      impact: 'Legacy/outdated agents miss DLP fingerprint engine updates and modern browser/OS support',
      action: `Run staged upgrade campaign — prioritize ${bucketCounts.LEGACY.toLocaleString()} legacy agents first`,
    });
  }

  exec.push({
    severity: 'INFO',
    finding: `${pct(bucketCounts.CURRENT, total)}% on current (${latestVersion ?? '—'}) · ${pct(bucketCounts.ONE_BEHIND, total)}% one release behind`,
    impact: 'Version skew across the fleet is normal but should not exceed ~20% behind',
    action: 'Enforce auto-upgrade or monthly upgrade cycles for any endpoint > 2 releases behind',
  });

  if (bucketCounts.ORPHAN > 0) {
    exec.push({
      severity: 'HIGH',
      finding: `${bucketCounts.ORPHAN.toLocaleString()} orphan / ghost registrations with no agent version`,
      impact: 'Inflates total client count and skews compliance reports — these are not real endpoints',
      action: 'Purge ghost registrations from EPServer console; cross-reference MAC duplicates',
    });
  }

  if (stalenessBucketsMap.Critical + likelyDecommissionedCount > 0) {
    exec.push({
      severity: 'HIGH',
      finding: `${stalenessBucketsMap.Critical.toLocaleString()} endpoints not reported in 180+ days · ${likelyDecommissionedCount.toLocaleString()} likely decommissioned (>365 days)`,
      impact: 'These devices are likely retired but still consume license seats and bloat dashboards',
      action: 'Deregister endpoints with no activity > 180 days; reclaim license entitlements',
    });
  }

  if (unmanagedCount > 0) {
    exec.push({
      severity: 'CRITICAL',
      finding: `${unmanagedCount.toLocaleString()} endpoints have no Profile Name (unmanaged)`,
      impact: 'No DLP policy is applied to these endpoints — they have agent installed but enforcement is undefined',
      action: 'Assign these endpoints to a profile in EPServer; review default profile inheritance',
    });
  }

  const zeroSyncProfiles = profileBreakdown.filter((p) => p.flagZeroSync && p.count > 5);
  if (zeroSyncProfiles.length > 0) {
    exec.push({
      severity: 'HIGH',
      finding: `${zeroSyncProfiles.length} profile(s) have 0% sync rate (${zeroSyncProfiles.map((p) => p.profile).slice(0, 3).join(', ')})`,
      impact: 'No endpoints under those profiles can apply policy — profile may be misconfigured',
      action: 'Inspect profile assignments and verify the EPServer has policy bundled for these profiles',
    });
  }

  if (discoveryDisabledCount > 0) {
    const pctDisabled = pct(discoveryDisabledCount, total);
    exec.push({
      severity: pctDisabled > 50 ? 'HIGH' : 'MEDIUM',
      finding: `Discovery is disabled on ${discoveryDisabledCount.toLocaleString()} endpoints (${pctDisabled}%)`,
      impact: 'No data-at-rest scanning is performed on these endpoints',
      action: 'Enable Discovery in the relevant profiles unless an explicit business rule excludes them',
    });
  }
  if (pct(discoveryRunningCount, total) < 1 && total > 100) {
    exec.push({
      severity: 'MEDIUM',
      finding: `Active discovery is negligible — only ${discoveryRunningCount} endpoints currently running (<1%)`,
      impact: 'Data-at-rest discovery is effectively dormant fleet-wide',
      action: 'Audit scan schedules and verify Discovery is enabled at profile level',
    });
  }

  if (rmsTier === 'CRITICAL') {
    exec.push({
      severity: 'CRITICAL',
      finding: `${rmsInactivePct}% of RMS-eligible endpoints have Microsoft RMS INACTIVE`,
      impact: 'RMS-based classification labels are not enforced — encrypted content cannot be DLP-inspected',
      action: 'Investigate AAD/AD permissions and RMS template provisioning at endpoint level',
    });
  } else if (rmsTier === 'HIGH') {
    exec.push({
      severity: 'HIGH',
      finding: `${rmsInactivePct}% of RMS-eligible endpoints have Microsoft RMS INACTIVE`,
      impact: 'Significant portion of fleet cannot enforce RMS labels',
      action: 'Diagnose RMS connectivity on affected endpoints; verify AAD app registration',
    });
  }

  if (macOSBlindSpot) {
    const unknownPct = pct(Math.max(safariUnknown, appleMailUnknown), total);
    exec.push({
      severity: 'MEDIUM',
      finding: `Safari/Apple Mail status is Unknown on ${unknownPct}% of endpoints — macOS coverage cannot be confirmed`,
      impact: 'macOS-specific channels (Safari browser, Apple Mail) may not be inspected on these endpoints',
      action: 'Verify Safari extension and Apple Mail plug-in installation on macOS endpoints',
    });
  }

  if (tierMap.CRITICAL > 0) {
    exec.push({
      severity: 'CRITICAL',
      finding: `${tierMap.CRITICAL.toLocaleString()} endpoints at CRITICAL risk tier (multi-factor score ≥ 6)`,
      impact: 'These endpoints combine multiple weaknesses (outdated agent, unsynced, stale, no profile, RMS inactive)',
      action: 'Treat these as the immediate-action queue — see Top-20 risk table',
    });
  }
  if (duplicateMacCount > 0) {
    exec.push({
      severity: 'MEDIUM',
      finding: `${duplicateMacCount} MAC addresses are registered on multiple hostnames`,
      impact: 'Indicates ghost clones or re-imaged endpoints retaining old DLP registrations',
      action: 'Purge duplicate MAC entries — keep the most recent registration per MAC',
    });
  }
  if (scanSchedulerBroken.length > 0) {
    exec.push({
      severity: 'MEDIUM',
      finding: `${scanSchedulerBroken.length} endpoints have Next Scan Time in the past by > 30 days`,
      impact: 'Scan scheduler is broken on these endpoints — Discovery effectively halted',
      action: 'Restart endpoint agent service and verify scan schedule is published',
    });
  }

  /* Top-3 immediate actions */
  const immediateActions: string[] = [];
  if (bucketCounts.LEGACY > 0) immediateActions.push(`Upgrade ${bucketCounts.LEGACY.toLocaleString()} legacy agents (<24.x)`);
  if (unmanagedCount > 0) immediateActions.push(`Assign profile to ${unmanagedCount.toLocaleString()} unmanaged endpoints`);
  if (tierMap.CRITICAL > 0) immediateActions.push(`Remediate ${tierMap.CRITICAL.toLocaleString()} CRITICAL-tier endpoints`);
  if (likelyDecommissionedCount > 0) immediateActions.push(`Purge ${likelyDecommissionedCount.toLocaleString()} likely-decommissioned endpoints (>365d)`);
  if (immediateActions.length > 0) {
    exec.push({
      severity: 'INFO',
      finding: `Top recommended actions: ${immediateActions.slice(0, 3).join(' · ')}`,
      impact: 'Addressing these unlocks the largest measurable risk reduction',
      action: 'Schedule into next maintenance window or Forcepoint Professional Services engagement',
    });
  }

  /* ─── Legacy top-line findings (for existing UI / report) ─── */
  const legacyFindings: string[] = [];
  if (bucketCounts.LEGACY + bucketCounts.OUTDATED > 0) {
    legacyFindings.push(`${(bucketCounts.LEGACY + bucketCounts.OUTDATED).toLocaleString()} endpoints running outdated/legacy agents (${pct(bucketCounts.LEGACY + bucketCounts.OUTDATED, total)}%) — schedule upgrade.`);
  }
  if (disabledCount > 0) legacyFindings.push(`${disabledCount.toLocaleString()} endpoints have a disabled/non-running client (${pct(disabledCount, total)}%) — DLP coverage gap.`);
  if (unsyncedCount > 0) legacyFindings.push(`${unsyncedCount.toLocaleString()} endpoints have Synced=FALSE (${unsyncedPct}%) — running stale policies.`);
  if (staleCount > 0) legacyFindings.push(`${staleCount.toLocaleString()} endpoints have not reported in > 30 days (${stalePct}%) — likely offline or decommissioned.`);
  if (serverImbalance) legacyFindings.push(`Endpoint server load imbalance: ${serverImbalance.topServer} carries ${serverImbalance.topPct}% vs ${serverImbalance.bottomPct}% on ${serverImbalance.bottomServer}.`);
  if (rmsTier !== 'OK') legacyFindings.push(`${rmsInactive.toLocaleString()} endpoints have Microsoft RMS inactive (${rmsInactivePct}% of RMS-eligible) — encrypted email/file DLP at risk.`);
  if (unmanagedCount > 0) legacyFindings.push(`${unmanagedCount.toLocaleString()} endpoints have no Profile Name (unmanaged) — no DLP policy applied.`);
  if (bucketCounts.ORPHAN > 0) legacyFindings.push(`${bucketCounts.ORPHAN.toLocaleString()} orphan/ghost registrations with no agent version reported.`);
  if (legacyFindings.length === 0) legacyFindings.push('No material endpoint-agent risks detected in this snapshot.');

  return {
    fileName,
    importedAt: new Date().toISOString(),
    totalRecords: total,
    nullCounts,
    unknownColumns,
    profileBreakdown,
    unmanagedCount,
    versionDistribution,
    latestVersion,
    activeVersion: null,
    outdatedCount,
    outdatedPct: pct(outdatedCount, total),
    versionBuckets,
    policyEngineMismatchCount,
    policyEngineMismatchSample,
    syncedCount,
    unsyncedCount,
    unsyncedPct,
    syncRatePct,
    syncByServer,
    syncByProfile,
    syncByVersionBucket,
    highRiskSyncServers,
    criticalSyncServers,
    topUnsyncedServers,
    stalenessBuckets,
    staleCount,
    stalePct,
    staleSample,
    serverStaleness,
    profileStaleness,
    likelyDecommissionedCount,
    serverDistribution,
    serverImbalance,
    loadImbalanceScore,
    concentrationRiskServers,
    downServers,
    secondaryServers,
    discoveryDistribution,
    discoveryDisabledCount,
    discoveryDisabledPct: pct(discoveryDisabledCount, total),
    discoveryRunningPct: pct(discoveryRunningCount, total),
    clientStatusBreakdown,
    disabledCount,
    disabledPct: pct(disabledCount, total),
    disabledAndSyncedAnomalyCount,
    rmsActiveCount: rmsActive,
    rmsInactiveCount: rmsInactive,
    rmsInactivePct,
    rmsTier,
    safariDistribution,
    appleMailDistribution,
    macOSCrossTab,
    macOSBlindSpot,
    riskTierDistribution,
    topRiskEndpoints,
    serverRiskDistribution,
    profileRiskDistribution,
    duplicateMacs,
    duplicateMacCount,
    scanSchedulerBrokenCount: scanSchedulerBroken.length,
    scanSchedulerBrokenSample,
    scanTimeCorruptionCount,
    filesScannedZeroIdleCount,
    activeUserUnsyncedCount,
    executiveSummary: exec,
    topFindings: legacyFindings,
  };
}

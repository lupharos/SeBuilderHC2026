/* Parser for the Forcepoint Data Classification (DSPM + FDC) agent export —
   the "Agent Management" CSV (Host name, User, Department, Operating system,
   Domain, IP address, Agent version, Online status, Last seen).

   The export is comma-delimited, UTF-8 (often with BOM), and double-quotes
   every field with doubled inner quotes — e.g. `"""FDCONLY-PC"""`. After a
   standard CSV unquote the value still carries one surrounding quote pair,
   which we strip. Parsed entirely in the browser. */

export interface FdcAgentRecord {
  hostname: string;
  user: string;
  department: string;
  os: string;
  domain: string;
  ip: string;
  version: string;
  online: boolean;
  status: string;       // raw "ONLINE" / "OFFLINE"
  lastSeen: string;     // raw "YYYY-MM-DD HH:MM:SS"
  daysSinceLastSeen: number | null;
}

export interface FdcCountRow { label: string; count: number; pct: number; }
export interface FdcVersionRow { version: string; count: number; pct: number; isLatest: boolean; isOutdated: boolean; }

export interface FdcAgentSummary {
  fileName: string;
  importedAt: number;
  totalRecords: number;   // rows (host + user combinations)
  uniqueHosts: number;
  onlineCount: number;
  offlineCount: number;
  onlinePct: number;
  offlinePct: number;
  latestVersion: string;
  versionDistribution: FdcVersionRow[];
  osDistribution: FdcCountRow[];
  domainDistribution: FdcCountRow[];
  staleCount: number;     // last seen > 30 days ago
  stalePct: number;
  staleSample: { hostname: string; daysOld: number; lastSeen: string }[];
  newestSeen: string | null;
  oldestSeen: string | null;
  hostsSample: FdcAgentRecord[]; // one row per unique host (most-recent record)
  topFindings: string[];
}

/* ── CSV helpers ─────────────────────────────────────────────────── */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/* Data fields arrive double-wrapped, so a parsed value can still be
   `"FDCONLY-PC"` — strip a single surrounding quote pair. */
function clean(v: string): string {
  let s = (v ?? '').trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.trim();
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function distribution(values: string[]): FdcCountRow[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const k = v || '(blank)';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const total = values.length;
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

export function parseFdcAgentCsv(text: string, fileName: string): FdcAgentSummary {
  const clean0 = text.replace(/^﻿/, '').replace(/^ï»¿/, '');
  const lines = clean0.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return emptySummary(fileName);
  }

  const header = parseCsvLine(lines[0]).map((h) => clean(h).toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iHost = idx('host name', 'host', 'hostname', 'computer');
  const iUser = idx('user');
  const iDept = idx('department');
  const iOS = idx('operating system', 'os');
  const iDomain = idx('domain');
  const iIP = idx('ip address', 'ip');
  const iVer = idx('agent version', 'version');
  const iStatus = idx('online status', 'status');
  const iSeen = idx('last seen', 'last contact', 'lastseen');

  const now = Date.now();
  const records: FdcAgentRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const f = parseCsvLine(lines[r]);
    const get = (i: number) => (i >= 0 ? clean(f[i] ?? '') : '');
    const hostname = get(iHost);
    if (!hostname) continue;
    const status = get(iStatus);
    const lastSeen = get(iSeen);
    const d = parseDate(lastSeen);
    const daysSinceLastSeen = d ? Math.floor((now - d.getTime()) / 86400000) : null;
    records.push({
      hostname,
      user: get(iUser),
      department: get(iDept),
      os: get(iOS),
      domain: get(iDomain),
      ip: get(iIP),
      version: get(iVer),
      online: /online/i.test(status),
      status: status.toUpperCase(),
      lastSeen,
      daysSinceLastSeen,
    });
  }

  if (records.length === 0) return emptySummary(fileName);

  const total = records.length;
  const onlineCount = records.filter((r) => r.online).length;
  const offlineCount = total - onlineCount;

  /* Version distribution + latest */
  const versions = records.map((r) => r.version).filter(Boolean);
  const latestVersion = versions.length
    ? versions.slice().sort(cmpVersion)[versions.length - 1]
    : '';
  const versionMap = new Map<string, number>();
  for (const v of versions) versionMap.set(v, (versionMap.get(v) ?? 0) + 1);
  const versionDistribution: FdcVersionRow[] = Array.from(versionMap.entries())
    .map(([version, count]) => ({
      version,
      count,
      pct: pct(count, total),
      isLatest: !!latestVersion && version === latestVersion,
      isOutdated: !!latestVersion && cmpVersion(version, latestVersion) < 0,
    }))
    .sort((a, b) => cmpVersion(b.version, a.version));

  const osDistribution = distribution(records.map((r) => r.os));
  const domainDistribution = distribution(records.map((r) => r.domain));

  /* Unique hosts — keep the most-recently-seen record per host. */
  const byHost = new Map<string, FdcAgentRecord>();
  for (const rec of records) {
    const prev = byHost.get(rec.hostname);
    if (!prev) { byHost.set(rec.hostname, rec); continue; }
    const a = parseDate(rec.lastSeen)?.getTime() ?? 0;
    const b = parseDate(prev.lastSeen)?.getTime() ?? 0;
    if (a > b) byHost.set(rec.hostname, rec);
  }
  const uniqueHosts = byHost.size;
  const hostsSample = Array.from(byHost.values())
    .sort((a, b) => (parseDate(b.lastSeen)?.getTime() ?? 0) - (parseDate(a.lastSeen)?.getTime() ?? 0));

  /* Stale — last seen > 30 days ago (computed over unique hosts). */
  const staleHosts = hostsSample.filter((r) => r.daysSinceLastSeen != null && r.daysSinceLastSeen > 30);
  const staleSample = staleHosts
    .slice()
    .sort((a, b) => (b.daysSinceLastSeen ?? 0) - (a.daysSinceLastSeen ?? 0))
    .slice(0, 40)
    .map((r) => ({ hostname: r.hostname, daysOld: r.daysSinceLastSeen ?? 0, lastSeen: r.lastSeen }));

  const seenTimes = records.map((r) => parseDate(r.lastSeen)).filter((d): d is Date => !!d);
  const newestSeen = seenTimes.length ? new Date(Math.max(...seenTimes.map((d) => d.getTime()))).toISOString().slice(0, 19).replace('T', ' ') : null;
  const oldestSeen = seenTimes.length ? new Date(Math.min(...seenTimes.map((d) => d.getTime()))).toISOString().slice(0, 19).replace('T', ' ') : null;

  /* Findings */
  const findings: string[] = [];
  if (offlineCount > 0) findings.push(`${offlineCount} of ${total} agent record${total === 1 ? '' : 's'} (${pct(offlineCount, total)}%) are OFFLINE.`);
  if (staleHosts.length > 0) findings.push(`${staleHosts.length} host${staleHosts.length === 1 ? '' : 's'} have not reported in over 30 days — verify they are still in use.`);
  const outdated = versionDistribution.filter((v) => v.isOutdated);
  if (outdated.length > 0 && latestVersion) {
    const outCount = outdated.reduce((s, v) => s + v.count, 0);
    findings.push(`${outCount} record${outCount === 1 ? '' : 's'} run an older agent than v${latestVersion} (${outdated.map((v) => v.version).join(', ')}) — plan an upgrade.`);
  }
  if (versionDistribution.length > 1) findings.push(`Mixed agent versions in the fleet (${versionDistribution.map((v) => v.version).join(', ')}).`);
  if (findings.length === 0) findings.push('No material issues — all FDC agents are online, current, and recently seen.');

  return {
    fileName,
    importedAt: now,
    totalRecords: total,
    uniqueHosts,
    onlineCount,
    offlineCount,
    onlinePct: pct(onlineCount, total),
    offlinePct: pct(offlineCount, total),
    latestVersion,
    versionDistribution,
    osDistribution,
    domainDistribution,
    staleCount: staleHosts.length,
    stalePct: pct(staleHosts.length, uniqueHosts),
    staleSample,
    newestSeen,
    oldestSeen,
    hostsSample,
    topFindings: findings,
  };
}

function emptySummary(fileName: string): FdcAgentSummary {
  return {
    fileName, importedAt: Date.now(), totalRecords: 0, uniqueHosts: 0,
    onlineCount: 0, offlineCount: 0, onlinePct: 0, offlinePct: 0,
    latestVersion: '', versionDistribution: [], osDistribution: [], domainDistribution: [],
    staleCount: 0, stalePct: 0, staleSample: [], newestSeen: null, oldestSeen: null,
    hostsSample: [], topFindings: [],
  };
}

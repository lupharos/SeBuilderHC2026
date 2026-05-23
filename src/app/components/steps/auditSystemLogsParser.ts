/* Forcepoint DLP AUDIT_SYSTEM_LOGS analyzer.
   Input:  CSV text exported from the AUDIT_SYSTEM_LOGS SQL query bundled
           in a DLPServerInfo dump.
   Output: a structured issue report grouped by message template so the
           HC analyst sees per-component flap incidents rather than the
           full ~26 k raw audit rows.

   Expected schema (header row):
     ID,SEVERITY,STATUS,GENERATION_TIME_TS,SOURCE_NAME,SOURCE_SUB_TYPE,MESSAGE

   Notable real-world properties we tolerate:
     • Quote-enclosed MESSAGE fields that contain commas (Resource
       Repository directory imports).
     • Duplicate SOURCE_SUB_TYPE labels with cosmetic spacing differences
       — `OCR Server` vs `OCRServer`, `Policy Engine` vs `PolicyEngine`.
       Both normalize to the same canonical sub-type for grouping.
     • Unicode-heavy task names (Azerbaijani diacritics) inside
       WorkScheduler messages. Regex uses \p{L} (Unicode letter class)
       so they don't break the template match.
     • Stop/start cycles for the same component arrive as TWO rows
       ("Stopping X" + "HealthCheck started Process X"). We pair them
       into a single "X flap" finding and report the cycle count. */

export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditLogIssue {
  /** Stable identifier — for flap incidents this is `flap|<sub>|<host>`,
      for non-flap templates it's the template id (e.g. `task-scan-errors`).
      Used by the star / dismiss tracking layer to remember the user's
      per-issue choices across re-imports. */
  id: string;
  title: string;
  severity: AuditSeverity;
  is_critical: boolean;
  /** Either the SOURCE_SUB_TYPE (e.g. "OCRServer") or, when the issue
      is host-specific, "$SOURCE_NAME / $SOURCE_SUB_TYPE". */
  source: string;
  description: string;
  occurrences: number;
  first_seen: string;          // YYYY-MM-DD HH:MM
  last_seen: string;
  recommendation: string;
}

export interface AuditSystemLogsReport {
  fileName: string;
  importedAt: string;
  totalRows: number;
  errorRows: number;
  warningRows: number;
  infoRows: number;
  spanFirst: string | null;
  spanLast: string | null;
  issues: AuditLogIssue[];
  /* Findings whose last_seen is older than RECENT_CUTOFF_DAYS — likely
     already remediated, so they are kept out of the report but counted
     here so the analyst knows the parser didn't lose them. */
  staleDropped: number;
  /* Findings that fired fewer than MIN_OCCURRENCES times — under the
     noise floor for this HC. */
  lowVolumeDropped: number;
}

/* Issues whose most recent occurrence is older than this are filtered
   out of the report: a stale error from before the customer's last
   maintenance window isn't actionable today. */
const RECENT_CUTOFF_DAYS = 30;
/* Minimum hits before a pattern earns a slot. Below this the
   signal-to-noise ratio is too low to justify analyst commentary
   per the HC operator's preference. */
const MIN_OCCURRENCES = 10;

function recencyCutoff(): string {
  const ms = Date.now() - RECENT_CUTOFF_DAYS * 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/* ─── CSV parsing ───────────────────────────────────────────────── */

/** Quote-aware single-line splitter. Handles `"..."` enclosed cells
    that contain commas (Resource Repository imports) without pulling
    in a full CSV library. Doubled `""` inside a quoted cell decodes
    to a single `"`. */
function splitCsvLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (c === ',') commas++;
    else if (c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

interface AuditRow {
  id: string;
  severity: string;            // raw — ERROR / WARNING / INFO usually
  status: string;
  ts: string;                  // raw GENERATION_TIME_TS
  sourceName: string;
  sourceSubType: string;       // raw
  message: string;
}

function parseRows(text: string): AuditRow[] {
  // BOM strip + universal newlines.
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const delim = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delim).map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);
  const iId = idx('ID');
  const iSev = idx('SEVERITY');
  const iStatus = idx('STATUS');
  const iTs = idx('GENERATION_TIME_TS');
  const iSrc = idx('SOURCE_NAME');
  const iSub = idx('SOURCE_SUB_TYPE');
  const iMsg = idx('MESSAGE');

  const rows: AuditRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    // Skip rows whose cell count is wildly off — the file's quoted
    // import-of-user-directory cells parse cleanly with our splitter,
    // so anything malformed here is genuinely bad.
    if (cells.length < header.length) continue;
    rows.push({
      id:           (cells[iId]     ?? '').trim(),
      severity:    ((cells[iSev]    ?? '').trim()).toUpperCase(),
      status:       (cells[iStatus] ?? '').trim(),
      ts:           (cells[iTs]     ?? '').trim(),
      sourceName:   (cells[iSrc]    ?? '').trim(),
      sourceSubType:(cells[iSub]    ?? '').trim(),
      message:      (cells[iMsg]    ?? '').trim(),
    });
  }
  return rows;
}

/* ─── Normalization ─────────────────────────────────────────────── */

function canonicalSubType(raw: string): string {
  const t = raw.replace(/\s+/g, '').toLowerCase();
  if (t === 'ocrserver') return 'OCRServer';
  if (t === 'policyengine') return 'PolicyEngine';
  return raw;
}

/* Templates checked in priority order. Captures are unused but kept
   for future "facts in description" enhancements. The MESSAGE column
   is matched against these AFTER the SEVERITY filter trims the row
   set to ERROR + WARNING (INFO rows are counted but never bucketed). */
interface Template {
  id: string;
  test: RegExp;
}

const TEMPLATES: Template[] = [
  { id: 'hc-stop',          test: /^System health check detected a problem\. Stopping (\S+?)\.?$/ },
  { id: 'hc-start',         test: /^System HealthCheck started Process (\S+)$/ },
  { id: 'unresponsive',     test: /^(\S+) unresponsive\. Process stopped by the system\.?$/ },
  { id: 'task-scan-errors', test: /^Task .+? finished a Diff scan \((Scheduled|Manual) mode\) with errors$/u },
  { id: 'license-overdeployed', test: /^License notification: the number of endpoints currently deployed (\d+) exceeds the number licensed (\d+)/ },
  { id: 'fingerprint-task-fail', test: /Fingerprinting task .* (failed|aborted|did not complete)/i },
  { id: 'discovery-task-fail',   test: /Discovery task .* (failed|aborted|did not complete)/i },
  { id: 'directory-import-fail', test: /Resource Repository: Import of user directory.*failed/i },
];

function matchTemplate(message: string): string | null {
  for (const t of TEMPLATES) {
    if (t.test.test(message)) return t.id;
  }
  return null;
}

/* ─── Aggregation ───────────────────────────────────────────────── */

interface Accumulator {
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** For license-overdeployed: track the highest deployed-count seen
      so the description can quote a live range, not just a count. */
  extras: Record<string, unknown>;
}

function fmtForOutput(ts: string): string {
  return ts.slice(0, 16);
}

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

/* ─── Public entry point ────────────────────────────────────────── */

export function parseAuditSystemLogs(text: string, fileName: string): AuditSystemLogsReport {
  const rows = parseRows(text);

  let errorRows = 0;
  let warningRows = 0;
  let infoRows = 0;
  let spanFirst: string | null = null;
  let spanLast: string | null = null;

  for (const r of rows) {
    if (r.severity === 'ERROR') errorRows++;
    else if (r.severity === 'WARNING' || r.severity === 'WARN') warningRows++;
    else if (r.severity === 'INFO') infoRows++;
    if (r.ts) {
      if (!spanFirst || r.ts < spanFirst) spanFirst = r.ts;
      if (!spanLast  || r.ts > spanLast)  spanLast  = r.ts;
    }
  }

  /* Pass 1 — collect every template hit keyed by
       templateId | canonicalSubType | sourceName (host)
     so a single OCRServer flap on one host stays distinct from an
     unrelated flap on a different host. */
  const acc = new Map<string, Accumulator>();
  for (const r of rows) {
    if (r.severity === 'INFO') continue;        // never reported as an issue
    const tpl = matchTemplate(r.message);
    if (!tpl) continue;
    const sub = canonicalSubType(r.sourceSubType);
    const key = `${tpl}|${sub}|${r.sourceName}`;
    const a = acc.get(key) ?? {
      count: 0,
      firstSeen: r.ts,
      lastSeen: r.ts,
      extras: {},
    };
    a.count++;
    if (r.ts < a.firstSeen) a.firstSeen = r.ts;
    if (r.ts > a.lastSeen) a.lastSeen = r.ts;
    if (tpl === 'license-overdeployed') {
      const m = /deployed (\d+) exceeds the number licensed (\d+)/.exec(r.message);
      if (m) {
        const deployed = Number(m[1]);
        const licensed = Number(m[2]);
        const prevMax = (a.extras.maxDeployed as number) ?? 0;
        if (deployed > prevMax) a.extras.maxDeployed = deployed;
        if (!a.extras.licensed) a.extras.licensed = licensed;
      }
    }
    acc.set(key, a);
  }

  /* Pass 2 — collapse stop/start template pairs for the same
     component into a single "flap" finding. We index by the
     compound key (sub, host) and consume both rows. */
  type FlapKey = string;
  const flapByCompHost = new Map<FlapKey, { stops: Accumulator | null; starts: Accumulator | null; unresponsive: Accumulator | null; sub: string; host: string }>();

  for (const [key, a] of acc.entries()) {
    const [tpl, sub, host] = key.split('|');
    if (tpl !== 'hc-stop' && tpl !== 'hc-start' && tpl !== 'unresponsive') continue;
    const fk = `${sub}|${host}`;
    const slot = flapByCompHost.get(fk) ?? { stops: null, starts: null, unresponsive: null, sub, host };
    if (tpl === 'hc-stop')         slot.stops = a;
    else if (tpl === 'hc-start')   slot.starts = a;
    else                            slot.unresponsive = a;
    flapByCompHost.set(fk, slot);
  }

  const issues: AuditLogIssue[] = [];

  // Flap incidents (combined stop + start + unresponsive for one component-host pair).
  for (const slot of flapByCompHost.values()) {
    const cycles = Math.max(
      slot.stops?.count ?? 0,
      slot.starts?.count ?? 0,
    );
    const unresponsiveHits = slot.unresponsive?.count ?? 0;
    const total = (slot.stops?.count ?? 0) + (slot.starts?.count ?? 0) + unresponsiveHits;
    if (total === 0) continue;
    const all = [slot.stops, slot.starts, slot.unresponsive].filter(Boolean) as Accumulator[];
    const firstSeen = all.reduce((m, a) => (a.firstSeen < m ? a.firstSeen : m), all[0].firstSeen);
    const lastSeen  = all.reduce((m, a) => (a.lastSeen  > m ? a.lastSeen  : m), all[0].lastSeen);

    const isFlapHigh = cycles > 50;              // >50 stop/start cycles = chronic
    const severity: AuditSeverity = unresponsiveHits > 0 ? 'CRITICAL' : isFlapHigh ? 'HIGH' : 'MEDIUM';

    issues.push({
      id: `flap|${slot.sub}|${slot.host}`,
      title: `${slot.sub} health-check flap on ${slot.host}`,
      severity,
      is_critical: severity === 'CRITICAL',
      source: `${slot.host} / ${slot.sub}`,
      description:
        `The DLP system health-checker repeatedly stopped and restarted ${slot.sub} on ${slot.host}: ${cycles} stop/start cycles${
          unresponsiveHits > 0 ? ` and ${unresponsiveHits} "process stopped by the system" event${unresponsiveHits === 1 ? '' : 's'}` : ''
        } recorded in the audit window. A flap of this scale indicates the component is crashing on a timer rather than handling load smoothly — DLP processing through that subsystem is intermittent.`,
      occurrences: total,
      first_seen: fmtForOutput(firstSeen),
      last_seen: fmtForOutput(lastSeen),
      recommendation:
        `Open the Tomcat / Windows service log for ${slot.sub} on ${slot.host} around the first occurrence, identify the unhealthy resource (memory, license, dependent service), and resolve before the next health-check tick.`,
    });
  }

  // Non-flap templates handled per-key.
  for (const [key, a] of acc.entries()) {
    const [tpl, sub, host] = key.split('|');
    if (tpl === 'hc-stop' || tpl === 'hc-start' || tpl === 'unresponsive') continue;

    if (tpl === 'task-scan-errors') {
      issues.push({
        id: `task-scan-errors|${sub}|${host}`,
        title: 'Scheduled discovery / fingerprint task finished with errors',
        severity: 'HIGH',
        is_critical: false,
        source: `${host} / ${sub}`,
        description:
          `The WorkScheduler completed at least one Diff scan task with errors. Failed tasks leave the affected data sources without an up-to-date fingerprint / discovery view, weakening downstream DLP policy decisions on those repositories.`,
        occurrences: a.count,
        first_seen: fmtForOutput(a.firstSeen),
        last_seen: fmtForOutput(a.lastSeen),
        recommendation:
          'Open the WorkScheduler task history, identify the per-task error reason (target unreachable, credentials expired, file lock), and re-queue once the upstream issue is fixed.',
      });
      continue;
    }

    if (tpl === 'license-overdeployed') {
      const maxDeployed = (a.extras.maxDeployed as number) ?? 0;
      const licensed = (a.extras.licensed as number) ?? 0;
      issues.push({
        id: `license-overdeployed|${sub}|${host}`,
        title: 'Endpoint license overdeployment',
        severity: 'HIGH',
        is_critical: false,
        source: `${host} / ${sub}`,
        description:
          `The DLP audit log shows endpoint count exceeding the licensed pool — peak observed ${maxDeployed.toLocaleString()} deployed against ${licensed.toLocaleString()} licensed. Beyond a grace period this typically blocks new endpoint registrations and may surface in audits as a compliance gap.`,
        occurrences: a.count,
        first_seen: fmtForOutput(a.firstSeen),
        last_seen: fmtForOutput(a.lastSeen),
        recommendation:
          'Reconcile the deployed-vs-licensed count: decommission stale endpoints or extend the entitlement (link to the HC wizard "License Gap" step).',
      });
      continue;
    }

    if (tpl === 'fingerprint-task-fail' || tpl === 'discovery-task-fail' || tpl === 'directory-import-fail') {
      issues.push({
        id: `${tpl}|${sub}|${host}`,
        title:
          tpl === 'fingerprint-task-fail' ? 'Fingerprint task failure'
          : tpl === 'discovery-task-fail' ? 'Discovery task failure'
          : 'User directory import failure',
        severity: 'HIGH',
        is_critical: false,
        source: `${host} / ${sub}`,
        description:
          'A DLP background task surfaced a non-recoverable error in the audit log. Repeated occurrences indicate the underlying source (AD, fileshare, database) is unreachable or rejected DLP\'s credentials.',
        occurrences: a.count,
        first_seen: fmtForOutput(a.firstSeen),
        last_seen: fmtForOutput(a.lastSeen),
        recommendation:
          'Validate connectivity + credentials for the source and re-run the task; check for recently changed firewall, DNS, or AD bind policies.',
      });
      continue;
    }
  }

  /* Apply the recency + volume gate. Stale issues take precedence in
     the dropped counters since "customer already fixed this" is the
     dominant reason a finding shouldn't reach the report. */
  const cutoff = recencyCutoff();
  let staleDropped = 0;
  let lowVolumeDropped = 0;
  const filteredIssues = issues.filter((iss) => {
    if (iss.last_seen < cutoff) { staleDropped++; return false; }
    if (iss.occurrences < MIN_OCCURRENCES) { lowVolumeDropped++; return false; }
    return true;
  });

  // Sort: CRITICAL → HIGH → MEDIUM → LOW, then by occurrences desc.
  filteredIssues.sort((a, b) =>
    SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]
      ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      : b.occurrences - a.occurrences,
  );

  return {
    fileName,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    errorRows,
    warningRows,
    infoRows,
    spanFirst: spanFirst ? fmtForOutput(spanFirst) : null,
    spanLast:  spanLast  ? fmtForOutput(spanLast)  : null,
    issues: filteredIssues,
    staleDropped,
    lowVolumeDropped,
  };
}

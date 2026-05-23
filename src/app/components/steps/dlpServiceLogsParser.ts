/* Forcepoint DLP service-logs analyzer.
   Input:  an array of `{ name, text }` files lifted from `\Data Security\Logs\`
           inside a DLPServerInfo bundle.
   Output: a single cross-correlated issue report so the analyst sees ONE
           finding even when the same root cause echoes across multiple
           service log files.

   Two header families:
     Family A — C++ services with hex thread + source-file column:
       `YYYY-MM-DD HH:MM:SS,ms [0xTID] drive:\src\file.cpp:line LEVEL Logger - message`
       Files: FPR.log, EndPointServer.log, PolicyEngine.log,
              PolicyEngineClient.log, mgmtd.log.
     Family B — Python services with space-padded logger column:
       `YYYY-MM-DD HH:MM:SS,ms Logger<2+spaces>Level<2+spaces>message`
       Files: HealthCheck.log, WorkScheduler.log, CleanupAndArchive.log.

   Cross-file dedupe:
     • Within-file paired emissions (e.g. FPR socketlistener.cpp + utils.cpp
       firing at the same ms / thread) → count once per (file, ts-second,
       thread) per bucket.
     • Same root cause across files (e.g. SSL handshake error in both
       PolicyEngine.log and mgmtd.log) → single bucket spanning multiple
       log_sources.

   Inclusion rule (consistent with the other two log parsers):
     • last_seen must be within RECENT_CUTOFF_DAYS of wall clock.
     • occurrences must be ≥ MIN_OCCURRENCES.
   Failing entries are filtered out but counted in staleDropped /
   lowVolumeDropped so the operator knows the parser saw them. */

export type ServiceLogSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ServiceLogIssue {
  /** Stable, deterministic identifier — used by the star / dismiss
      tracking layer to remember the user's per-issue choices across
      sessions. Format: bucket id from BUCKETS[]. */
  id: string;
  title: string;
  severity: ServiceLogSeverity;
  is_critical: boolean;
  /** Service / subsystem name shown next to the title in the UI. */
  component: string;
  /** 2-3 sentence problem + impact narrative. */
  description: string;
  occurrences: number;
  first_seen: string;          // YYYY-MM-DD HH:MM
  last_seen: string;
  recommendation: string;
  /** Basenames of the log files where this issue appears (sorted
      alphabetically, deduped). */
  log_sources: string[];
}

export interface ServiceLogFileSummary {
  name: string;
  family: 'A' | 'B' | 'unknown';
  lineCount: number;
  errorCount: number;
}

export interface ServiceLogsReport {
  importedAt: string;
  files: ServiceLogFileSummary[];
  totalLines: number;
  totalErrors: number;
  spanFirst: string | null;
  spanLast: string | null;
  issues: ServiceLogIssue[];
  /* Findings whose last_seen is older than RECENT_CUTOFF_DAYS — likely
     remediated; kept out of the report. */
  staleDropped: number;
  /* Findings under MIN_OCCURRENCES — below the noise floor. */
  lowVolumeDropped: number;
}

export interface ServiceLogFile {
  /** Basename, e.g. "FPR.log". The detector is case-insensitive. */
  name: string;
  text: string;
}

const RECENT_CUTOFF_DAYS = 30;
const MIN_OCCURRENCES = 10;

function recencyCutoff(): string {
  const ms = Date.now() - RECENT_CUTOFF_DAYS * 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

const FAMILY_A_FILES = new Set([
  'fpr.log',
  'endpointserver.log',
  'policyengine.log',
  'policyengineclient.log',
  'mgmtd.log',
]);
const FAMILY_B_FILES = new Set([
  'healthcheck.log',
  'workscheduler.log',
  'cleanupandarchive.log',
]);

export function classifyFile(name: string): 'A' | 'B' | 'unknown' {
  const lower = name.toLowerCase();
  if (FAMILY_A_FILES.has(lower)) return 'A';
  if (FAMILY_B_FILES.has(lower)) return 'B';
  return 'unknown';
}

export function isServiceLogFilename(name: string): boolean {
  return classifyFile(name) !== 'unknown';
}

/* ─── Header anchors ────────────────────────────────────────────── */

const HEADER_A_RE =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}),\d+\s+\[0x([0-9a-fA-F]+)\]\s+(\S+)\s+(ERROR|WARN|WARNING|INFO|DEBUG|FATAL)\s+(\S+)\s+-\s+(.*)$/;

const HEADER_B_LEAD_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}),\d+\s+(.*)$/;
const FAMILY_B_LEVELS = new Set(['ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'FATAL', 'CRITICAL', 'ERROR ', 'ERROR  ']);
const FAMILY_B_LEVEL_NORM: Record<string, LogLevel> = {
  ERROR: 'ERROR', Error: 'ERROR',
  WARN: 'WARN', WARNING: 'WARN', Warning: 'WARN',
  INFO: 'INFO', DEBUG: 'DEBUG', FATAL: 'FATAL',
  CRITICAL: 'FATAL', Critical: 'FATAL',
};

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FATAL';

interface LogRecord {
  file: string;
  family: 'A' | 'B';
  ts: string;                  // YYYY-MM-DD HH:MM:SS
  thread: string;              // hex (A) or empty (B; thread is embedded in body)
  level: LogLevel;
  logger: string;
  body: string;
}

/* ─── Family A parser ───────────────────────────────────────────── */

function parseFamilyA(file: string, text: string): { records: LogRecord[]; rawLines: number } {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  const records: LogRecord[] = [];
  let cur: LogRecord | null = null;
  for (const line of lines) {
    const m = HEADER_A_RE.exec(line);
    if (m) {
      if (cur) records.push(cur);
      cur = {
        file,
        family: 'A',
        ts: `${m[1]} ${m[2]}`,
        thread: m[3],
        level: m[5] as LogLevel,
        logger: m[6],
        body: m[7].trimEnd(),
      };
    } else if (cur) {
      // Continuation — fold into previous record's body so SSL detail /
      // multi-line PolicyEngine descriptors stay together for bucket regex.
      if (line.length > 0) cur.body += '\n' + line;
    }
  }
  if (cur) records.push(cur);
  return { records, rawLines: lines.length };
}

/* ─── Family B parser ───────────────────────────────────────────── */

/* Padded-column splitter: after the leading timestamp, Family B uses
   2+ spaces to delimit logger / level / message. Some lines (mostly
   inside CleanupAndArchive) actually use a single space between
   level and message — we tolerate that by splitting on \s{2,} first
   and falling back to a single-space split when the result is
   under-formed. */
function parseFamilyBLine(rest: string): { logger: string; level: string; message: string } | null {
  const parts = rest.split(/\s{2,}/);
  if (parts.length >= 3) {
    return {
      logger: parts[0].trim(),
      level: parts[1].trim(),
      message: parts.slice(2).join('  ').trim(),
    };
  }
  /* Fallback: single space between level and message. */
  const m = /^(\S+)\s+(Error|Warning|INFO|DEBUG|Critical|FATAL)\s+(.*)$/.exec(rest);
  if (m) return { logger: m[1], level: m[2], message: m[3] };
  return null;
}

function parseFamilyB(file: string, text: string): { records: LogRecord[]; rawLines: number } {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  const records: LogRecord[] = [];
  let cur: LogRecord | null = null;
  for (const line of lines) {
    const lead = HEADER_B_LEAD_RE.exec(line);
    if (lead) {
      const parsed = parseFamilyBLine(lead[3]);
      if (parsed) {
        if (cur) records.push(cur);
        const normLevel = FAMILY_B_LEVEL_NORM[parsed.level] ?? 'INFO';
        cur = {
          file,
          family: 'B',
          ts: `${lead[1]} ${lead[2]}`,
          thread: '',
          level: normLevel,
          logger: parsed.logger,
          body: parsed.message,
        };
        continue;
      }
    }
    if (cur && line.length > 0) cur.body += '\n' + line;
  }
  if (cur) records.push(cur);
  return { records, rawLines: lines.length };
}

/* ─── Bucket definitions ────────────────────────────────────────── */

interface Bucket {
  id: string;
  title: string;
  severity: ServiceLogSeverity;
  component: string;
  description: string;
  recommendation: string;
  /** Optional filename gate — buckets that only apply to one file
      can avoid scanning unrelated bodies. */
  fileNames?: string[];
  matches: (r: LogRecord) => boolean;
}

const fileIs = (r: LogRecord, name: string) => r.file.toLowerCase() === name.toLowerCase();
const fileIn = (r: LogRecord, names: string[]) => names.some((n) => r.file.toLowerCase() === n.toLowerCase());

const BUCKETS: Bucket[] = [
  /* ── CRITICAL ── */
  {
    id: 'fpr-apr-pollset',
    title: 'FPR socket subsystem exhausted (apr_pollset_create)',
    severity: 'CRITICAL',
    component: 'FPR / Communication',
    description:
      'The Forcepoint Policy Runner (FPR) communication layer fails on every poll-set creation with APR error 22 (Invalid argument). Without a working pollset the FPR cannot accept inbound dummy-detection / endpoint traffic, so DLP detection through the FPR pipeline is effectively offline.',
    recommendation:
      'Investigate the FPR host for socket-handle exhaustion (open-handle leak, OS ephemeral-port range, AV/EDR socket hooks); restart FPR after the root cause is identified.',
    fileNames: ['FPR.log'],
    matches: (r) => r.level !== 'INFO' && /apr_pollset_create/i.test(r.body) && /error code 22/i.test(r.body),
  },
  {
    id: 'fpr-precise-id-corrupt',
    title: 'PreciseID DB corruption detected',
    severity: 'CRITICAL',
    component: 'FPR / PreciseID',
    description:
      'The PreciseID hashtable backing the BinaryFiles.Lists DB reports corrupted lists, and the FPR worker promotes the condition to FATAL. Fingerprint matching against this dataset cannot return reliable verdicts until the DB is repaired.',
    recommendation:
      'Rebuild the affected PreciseID hashtable from a known-good copy or rerun the fingerprint indexer; verify storage health on the volume hosting Data Security\\PreciseID.',
    fileNames: ['FPR.log'],
    matches: (r) =>
      /HashTable corrupted lists|FPRWorker: Possible system corruption|Possible system corruption/i.test(r.body),
  },
  {
    id: 'ep-thread-exhaustion',
    title: 'EndPoint Server thread pool failing all requests',
    severity: 'CRITICAL',
    component: 'EndPointServer',
    description:
      'EndPointServerThreadCounter.PostHandleRequest is throwing on every dispatch with `<Unknown Exception>`, meaning the server is rejecting incoming endpoint-agent traffic. Endpoint policy delivery, telemetry, and incident upload through this server are halted.',
    recommendation:
      'Restart the Forcepoint EndPoint Server service; if the failures resume, capture a process dump and engage Forcepoint support — a deeper crash investigation is required.',
    fileNames: ['EndPointServer.log'],
    matches: (r) => /EndPointServerThreadCounter\s*-\s*PostHandleRequest\(\)\s*failed/i.test(r.body) || /PostHandleRequest\(\) failed - <Unknown Exception>/i.test(r.body),
  },
  {
    id: 'dss-process-flap',
    title: 'DSS process flap (PAFPREP / DSSManager / DSSMessageBroker)',
    severity: 'CRITICAL',
    component: 'HealthCheck / DSS services',
    description:
      'The DSS HealthCheck repeatedly stopped and restarted core data-security processes (PAFPREP, DSSManager, DSSMessageBroker). A flap at this layer indicates the underlying service is crashing on its watchdog timer, which produces intermittent gaps in DLP scanning and policy enforcement.',
    recommendation:
      'Open the corresponding service log around each "Stopping" event, identify the unhealthy resource (memory pressure, missing dependency, license issue), and resolve before the next HealthCheck tick.',
    fileNames: ['HealthCheck.log'],
    matches: (r) =>
      /Stopping process:\s*(PAFPREP|DSSManager|DSSMessageBroker)/i.test(r.body) ||
      /Cannot start process:\s*(PAFPREP|DSSManager|DSSMessageBroker)/i.test(r.body),
  },

  /* ── HIGH ── */
  {
    id: 'fpr-dummy-detection-fail',
    title: 'FPR DummyDetection health probe failing',
    severity: 'HIGH',
    component: 'HealthCheck / FPR',
    description:
      'The HealthCheck watchdog cannot complete the FPR DummyDetection probe — every attempt fails the SOAP/CGI round-trip. While the FPR may still process some traffic, the watchdog has lost its ground truth that the data pipeline is healthy, and the underlying socket failures (see FPR pollset bucket) confirm the system is degraded.',
    recommendation:
      'Address the upstream FPR socket failures first; rerun the DummyDetection probe manually after FPR restart and confirm a 200/OK response.',
    fileNames: ['HealthCheck.log'],
    matches: (r) =>
      /FPRRunDummyDetection failed|FPR Test FPRRunDummyDetection Failed|Failed sending DummyDetection Request/i.test(r.body),
  },
  {
    id: 'ws-dfs-path-not-found',
    title: 'WorkScheduler fingerprint targets unreachable (DFS paths)',
    severity: 'HIGH',
    component: 'WorkScheduler / Win32FileBrowser',
    description:
      'The fingerprinting workers repeatedly hit [Error 3] "The system cannot find the path specified" when traversing target DFS shares. The audit / discovery tasks against these repositories cannot produce a complete fingerprint, so any DLP policy that depends on them is operating on stale data.',
    recommendation:
      'Confirm the DFS namespace + shares listed in WorkScheduler are reachable from the FSM service account; re-target or remove offline shares from the task configuration.',
    fileNames: ['WorkScheduler.log'],
    matches: (r) => /Windows error was generated when accessing/i.test(r.body) && /Error 3\]/.test(r.body),
  },
  {
    id: 'mgmtd-soap-host-notfound',
    title: 'mgmtd SOAP routing — destination host not found',
    severity: 'HIGH',
    component: 'mgmtd / SoapRouter',
    description:
      'The DLP management daemon is unable to resolve / reach the configured downstream SOAP endpoints — Router reports "Host not found" / tcp_connect failures. Inter-service communication (policy distribution, log roll-up) is impaired until DNS/connectivity is restored.',
    recommendation:
      'Verify DNS resolution and firewall reachability for the destination IP(s) recorded in the Router messages; check certificate / port pairs against the DLP architecture diagram.',
    fileNames: ['mgmtd.log'],
    matches: (r) =>
      /Router\s*-\s*Error \d+; Fault:\s*detected Host not found/i.test(r.body) ||
      /Router\s*-\s*Error 28;.*Timeout.*tcp_connect/i.test(r.body) ||
      /Error was generated in remote method call:\s*Error -\d+; Fault:\s*End of file or no input/i.test(r.body),
  },
  {
    id: 'ssl-handshake-fail',
    title: 'TLS handshake failures across DLP services',
    severity: 'HIGH',
    component: 'mgmtd + PolicyEngine SSL stack',
    description:
      'TLS handshakes are failing on the inter-service channels — `SSL_accept` failures on mgmtd and `SSL Error: Premature close` on PolicyEngine. Together these point to a certificate / TLS-version / cipher mismatch between DLP components that prevents secure messaging from completing.',
    recommendation:
      'Audit the FSM SSL certificate chain (expiry, hostname, intermediate trust), confirm all components share a compatible TLS version, and re-issue the internal CA cert if the chain is broken.',
    fileNames: ['mgmtd.log', 'PolicyEngine.log'],
    matches: (r) =>
      /soap_ssl_accept failed|SSL_ERROR_(SYSCALL|WANT_READ|SSL)|SSL Error:\s*Premature close|Error observed by underlying SSL\/TLS BIO/i.test(r.body),
  },
  {
    id: 'pe-libcurl-timeout',
    title: 'PolicyEngine outbound HTTPS timeouts (LibCURL)',
    severity: 'HIGH',
    component: 'PolicyEngine / TransactionProcessor',
    description:
      'The PolicyEngine\'s `SendIncidentsToMNGRunner` and `MaintainerServer` cycles fail on every send with `curl_easy_perform failed: Timeout was reached`. Incident roll-up to the management server stalls; if it persists, the FSM queue accumulates undelivered events.',
    recommendation:
      'Validate the FSM endpoint URL + port reachability from the PolicyEngine host; raise `LibCURL` timeout temporarily, then chase the network/SSL root cause.',
    fileNames: ['PolicyEngine.log'],
    matches: (r) =>
      /SendIncidentsToMNGRunner.*Communication failure/i.test(r.body) ||
      /LibCURLTransfer:Send curl_easy_perform failed:\s*Timeout was reached/i.test(r.body) ||
      /LibCURLTransfer:.*HTTP response code said error/i.test(r.body),
  },
  {
    id: 'pec-conn-refused',
    title: 'PolicyEngineClient — connection actively refused',
    severity: 'HIGH',
    component: 'PolicyEngineClient',
    description:
      'PolicyEngineClient retries are met with APR 730061 (target machine actively refused). The PE listener is either down or bound to an interface the client cannot reach.',
    recommendation:
      'Confirm the PolicyEngine service is running and listening on the expected interface/port; check the client\'s configured endpoint and host firewall rules.',
    fileNames: ['PolicyEngineClient.log'],
    matches: (r) => /apr_socket_connect.*error code 730061/i.test(r.body),
  },

  /* ── MEDIUM ── */
  {
    id: 'ws-sid-lookup-denied',
    title: 'WorkScheduler — SID resolution Access Denied',
    severity: 'MEDIUM',
    component: 'WorkScheduler / Win32FileBrowser',
    description:
      'LookupAccountSid calls return Access Denied for a recurring set of SIDs. Fingerprint records keep the raw SID instead of a human-readable owner, which weakens incident attribution in DLP reports.',
    recommendation:
      'Grant the FSM service account read access to the AD domain trust paths required for SID resolution; alternatively, configure a dedicated lookup principal in the WorkScheduler config.',
    fileNames: ['WorkScheduler.log'],
    matches: (r) =>
      /Error while lookup for account name of S-1-5-/i.test(r.body) &&
      /Access is denied/i.test(r.body),
  },
  {
    id: 'ws-syslog-timeout',
    title: 'WorkScheduler — system log post timeouts',
    severity: 'MEDIUM',
    component: 'WorkScheduler / Utils.SystemLogging',
    description:
      'WorkScheduler cannot post SystemLog entries upstream — every attempt times out. The work pool keeps running, but a portion of audit events are dropped from the central log store.',
    recommendation:
      'Validate the SystemLog endpoint reachability from the WorkScheduler host and raise the post timeout while diagnosing the upstream slowdown.',
    fileNames: ['WorkScheduler.log'],
    matches: (r) => /Failed to post a SystemLog\. Code:\s*-?\d+,\s*Error:\s*timed out/i.test(r.body),
  },
  {
    id: 'mgmtd-getmnglogs',
    title: 'mgmtd Getmnglogs.bat execution failures',
    severity: 'MEDIUM',
    component: 'mgmtd / SystemHealth',
    description:
      'mgmtd cannot execute Getmnglogs.bat to collect custom files for the management server log bundle — every invocation returns a non-zero error code. The downstream consequence is missing custom logs in the support bundle the management server expects.',
    recommendation:
      'Run Getmnglogs.bat manually under the mgmtd service account, capture the error code, and resolve the missing prerequisite (permissions, path, dependent binary).',
    fileNames: ['mgmtd.log'],
    matches: (r) =>
      /fail to run command\s*:\s*Getmnglogs\.bat/i.test(r.body) ||
      /SystemHealth\s*-\s*Failed to GetGetCustomFiles\(\)/i.test(r.body),
  },
  {
    id: 'hc-port-process-kill',
    title: 'HealthCheck killed processes holding required ports',
    severity: 'MEDIUM',
    component: 'HealthCheck',
    description:
      'The DLP HealthCheck repeatedly found foreign processes holding ports it needs and force-killed them. This is a self-recovery action but indicates contention on the DLP host — another tenant or scheduled task is racing the DLP services for the same ports.',
    recommendation:
      'Audit scheduled tasks / installed agents on the DLP host that may bind to the listed ports; ensure DLP services have port-binding priority via startup ordering or reserved-port registration.',
    fileNames: ['HealthCheck.log'],
    matches: (r) =>
      /processes holding port\s+\d+\s+that will be killed/i.test(r.body) ||
      /killing process with ID\s+\d+/i.test(r.body),
  },

  /* ── LOW ── */
  {
    id: 'hc-file-in-use',
    title: 'HealthCheck cleanup blocked — files in use',
    severity: 'LOW',
    component: 'HealthCheck',
    description:
      'HealthCheck attempted to clean / rotate files but found them held by another process and skipped deletion. No data loss; only a steady accumulation of stale files on the DLP host disk.',
    recommendation:
      'Add a low-priority Action: schedule a manual cleanup pass during the next maintenance window, or relax the cleanup retry policy to ignore long-held files.',
    fileNames: ['HealthCheck.log'],
    matches: (r) => /File in use\s+.+\s+and will not be deleted/i.test(r.body),
  },
];

/* ─── Aggregation ───────────────────────────────────────────────── */

interface BucketAcc {
  bucket: Bucket;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Files (basenames, deduped) that contributed to this bucket. */
  sources: Set<string>;
  /** Within-file pair-emission dedupe: same (file, ts-second, thread). */
  seen: Set<string>;
}

function classify(rec: LogRecord): Bucket | null {
  if (rec.level !== 'ERROR' && rec.level !== 'WARN' && rec.level !== 'FATAL') return null;
  for (const b of BUCKETS) {
    if (b.fileNames && !fileIn(rec, b.fileNames)) continue;
    if (b.matches(rec)) return b;
  }
  return null;
}

function fmtForOutput(ts: string): string {
  return ts.slice(0, 16);
}

const SEVERITY_RANK: Record<ServiceLogSeverity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

/* ─── Public entry point ────────────────────────────────────────── */

export function parseDlpServiceLogs(files: ServiceLogFile[]): ServiceLogsReport {
  const fileSummaries: ServiceLogFileSummary[] = [];
  const allRecords: LogRecord[] = [];
  let totalLines = 0;
  let totalErrors = 0;
  let spanFirst: string | null = null;
  let spanLast: string | null = null;

  for (const f of files) {
    const family = classifyFile(f.name);
    if (family === 'unknown') {
      fileSummaries.push({ name: f.name, family: 'unknown', lineCount: 0, errorCount: 0 });
      continue;
    }
    const { records, rawLines } =
      family === 'A' ? parseFamilyA(f.name, f.text) : parseFamilyB(f.name, f.text);
    let errCount = 0;
    for (const r of records) {
      if (r.level === 'ERROR' || r.level === 'FATAL') errCount++;
      if (!spanFirst || r.ts < spanFirst) spanFirst = r.ts;
      if (!spanLast  || r.ts > spanLast)  spanLast  = r.ts;
    }
    totalLines += rawLines;
    totalErrors += errCount;
    fileSummaries.push({ name: f.name, family, lineCount: rawLines, errorCount: errCount });
    allRecords.push(...records);
  }

  const buckets = new Map<string, BucketAcc>();
  for (const r of allRecords) {
    const b = classify(r);
    if (!b) continue;
    const acc = buckets.get(b.id) ?? {
      bucket: b,
      count: 0,
      firstSeen: r.ts,
      lastSeen: r.ts,
      sources: new Set<string>(),
      seen: new Set<string>(),
    };
    /* Dedupe paired emissions: same file + same second + same thread (or
       same file + same second + same body-hash for Family B which has no
       thread column on the header). */
    const key = `${r.file}|${r.ts}|${r.thread || r.body.slice(0, 60)}`;
    if (acc.seen.has(key)) {
      buckets.set(b.id, acc);
      continue;
    }
    acc.seen.add(key);
    acc.count++;
    if (r.ts < acc.firstSeen) acc.firstSeen = r.ts;
    if (r.ts > acc.lastSeen) acc.lastSeen = r.ts;
    acc.sources.add(r.file);
    buckets.set(b.id, acc);
  }

  const allIssues: ServiceLogIssue[] = [...buckets.values()].map((acc) => ({
    id: acc.bucket.id,
    title: acc.bucket.title,
    severity: acc.bucket.severity,
    is_critical: acc.bucket.severity === 'CRITICAL',
    component: acc.bucket.component,
    description: acc.bucket.description,
    occurrences: acc.count,
    first_seen: fmtForOutput(acc.firstSeen),
    last_seen: fmtForOutput(acc.lastSeen),
    recommendation: acc.bucket.recommendation,
    log_sources: [...acc.sources].sort(),
  }));

  const cutoff = recencyCutoff();
  let staleDropped = 0;
  let lowVolumeDropped = 0;
  const issues = allIssues
    .filter((iss) => {
      if (iss.last_seen < cutoff) { staleDropped++; return false; }
      if (iss.occurrences < MIN_OCCURRENCES) { lowVolumeDropped++; return false; }
      return true;
    })
    .sort((a, b) =>
      SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        : b.occurrences - a.occurrences,
    );

  return {
    importedAt: new Date().toISOString(),
    files: fileSummaries,
    totalLines,
    totalErrors,
    spanFirst: spanFirst ? fmtForOutput(spanFirst) : null,
    spanLast:  spanLast  ? fmtForOutput(spanLast)  : null,
    issues,
    staleDropped,
    lowVolumeDropped,
  };
}

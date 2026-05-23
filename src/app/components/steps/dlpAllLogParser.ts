/* Forcepoint DLP Tomcat application log analyzer.
   Input:  raw text of `Data Security/tomcat/logs/dlp/dlp-all.log`.
   Output: structured issue report grouped by root-cause bucket so a
           Health Check SE can see at a glance what's failing without
           scrolling through 12k+ raw log lines.

   Bucket priority (highest first):
     1. Exchange Online / M365 token auth failure        CRITICAL
     2. Spring application context init failure          CRITICAL
     3. Hibernate PRIMARY KEY / FK constraint violation  HIGH
     4. EmailReceiver / IncidentActionChain (Thread-10)  HIGH
     5. Site / content-manager init failures             HIGH
     6. EIP page bean missing                            MEDIUM
     7. Forensics readers (MsOutlook / NetworkIncident)  MEDIUM
     8. Other ERROR (logger-grouped)                     MEDIUM
   Noise filter discards Ehcache mutable-entity warnings and pure
   INFO startup messages — they exist in every healthy deployment. */

export type LogSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface DlpLogIssue {
  /** Stable identifier — matches BUCKETS[i].id for curated buckets, or
      `other:<logger>` for the catch-all. Used by the star / dismiss
      tracking layer to remember the user's per-issue choices. */
  id: string;
  /** Short descriptive title — never more than ~10 words. */
  title: string;
  severity: LogSeverity;
  is_critical: boolean;
  /** The most representative logger class or subsystem this issue came
      from. When several loggers map to the same bucket we keep the one
      with the highest occurrence count. */
  component: string;
  /** Two-to-three sentence explanation of the problem + operational
      impact for the SE / customer. Mostly bucket-driven; sample log
      text is appended where it adds context. */
  description: string;
  occurrences: number;
  /** YYYY-MM-DD HH:MM (no seconds — matches the analyst spec). */
  first_seen: string;
  last_seen: string;
  recommendation: string;
}

export interface DlpAllLogReport {
  fileName: string;
  importedAt: string;          // ISO timestamp
  totalLines: number;          // raw line count
  recordCount: number;         // logical records (header + folded stack trace)
  errorCount: number;          // ERROR records
  warnCount: number;           // WARN records
  spanFirst: string | null;    // earliest header timestamp seen (raw)
  spanLast: string | null;
  issues: DlpLogIssue[];       // already sorted: CRITICAL → HIGH → MEDIUM → LOW
  /* Patterns matched but dropped because their last occurrence was
     older than RECENT_CUTOFF_DAYS — i.e. the customer has since fixed
     the root cause or rotated the log. Surfaced as a count only so the
     analyst knows the parser didn't silently miss them. */
  staleDropped: number;
  /* Patterns matched but dropped because they fired fewer than
     MIN_OCCURRENCES times across the window — under the noise floor
     for analyst commentary. */
  lowVolumeDropped: number;
}

/* Issues whose most recent occurrence is older than this are
   filtered out of the report — a stale error from before the
   customer's last maintenance window isn't actionable today. */
const RECENT_CUTOFF_DAYS = 30;
/* Minimum hits before a pattern earns a slot. Below this the
   signal-to-noise ratio is too low to justify analyst commentary
   per the HC operator's preference. */
const MIN_OCCURRENCES = 10;

/* Wall-clock cutoff in our `YYYY-MM-DD HH:MM` output format —
   string-comparable against any `last_seen` value emitted below. */
function recencyCutoff(): string {
  const ms = Date.now() - RECENT_CUTOFF_DAYS * 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/* ─── Line parsing ──────────────────────────────────────────────── */

interface LogRecord {
  ts: string;                  // YYYY-MM-DD HH:MM:SS (no ms)
  thread: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'FATAL';
  logger: string;
  /** Header message PLUS any folded stack-trace continuation lines —
      kept together so we can pattern-match across "Caused by:" frames
      that often reveal the real root cause. */
  body: string;
}

/* Header anchor: timestamp + ms + [thread] + LEVEL + logger + ' - ' + msg.
   LEVEL width varies in Forcepoint output ("ERROR " vs "WARN  ") so the
   separator must be \s+, not a single space. */
const HEADER_RE =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}),\d+\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\s+(\S+)\s+-\s+(.*)$/;

function parseRecords(text: string): {
  records: LogRecord[];
  rawLineCount: number;
  spanFirst: string | null;
  spanLast: string | null;
} {
  // BOM strip + universal newlines.
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  const records: LogRecord[] = [];
  let cur: LogRecord | null = null;
  let spanFirst: string | null = null;
  let spanLast: string | null = null;

  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    if (m) {
      if (cur) records.push(cur);
      const ts = `${m[1]} ${m[2]}`;
      cur = {
        ts,
        thread: m[3],
        level: m[4] as LogRecord['level'],
        logger: m[5],
        body: m[6],
      };
      if (!spanFirst) spanFirst = ts;
      spanLast = ts;
    } else if (cur) {
      // Stack-trace continuation (\tat ..., Caused by:, ... N more, bare
      // exception class line). Fold into the previous record's body so
      // bucket regexes can match against the whole record.
      if (line.length > 0) cur.body += '\n' + line;
    }
    // else: orphan continuation before any header — discard silently.
  }
  if (cur) records.push(cur);
  return { records, rawLineCount: lines.length, spanFirst, spanLast };
}

/* ─── Bucket definitions ────────────────────────────────────────── */

interface Bucket {
  id: string;
  title: string;
  severity: LogSeverity;
  component: string;           // best-effort representative
  description: string;
  recommendation: string;
  /** True for any predicate match. Each bucket gets its own evaluator
      so the order in BUCKETS controls priority — earlier wins. */
  matches: (r: LogRecord) => boolean;
}

/* Convenience predicates. Logger checks use `endsWith` against the
   class name suffix so package-renames in newer DLP releases still
   match without hard-coding the full `com.pa.fw.…` path. */
const loggerEndsWith = (r: LogRecord, suffix: string) =>
  r.logger.endsWith(suffix) || r.logger.endsWith('.' + suffix);
const loggerIn = (r: LogRecord, suffixes: string[]) =>
  suffixes.some((s) => loggerEndsWith(r, s));

const BUCKETS: Bucket[] = [
  {
    id: 'm365-auth',
    title: 'Exchange Online / Microsoft Graph authentication failure',
    severity: 'CRITICAL',
    component: 'MicrosoftGraphMailServiceImpl',
    description:
      'DLP cannot retrieve an OAuth token for the Microsoft Graph / Exchange Online mailbox connector. Every MSAL4J ConfidentialClientApplication acquire-token call fails, so the ExchangeOnlineMailProxy cannot fetch any mail — cloud-channel DLP scanning is effectively offline.',
    recommendation:
      'Verify the tenantId + clientId + client-secret in the Cloud Email Proxy configuration are current; rotate the Entra ID app secret if it has expired and re-deploy the connector.',
    matches: (r) =>
      loggerIn(r, [
        'MicrosoftGraphMailServiceImpl',
        'ExchangeOnlineMailProxy',
        'ConfidentialClientApplication',
      ]) ||
      /\bMSAL4J\b|AADSTS\d+|\binvalid_client\b|Can ?not retrieve token|Failed to fetch emails/.test(
        r.body,
      ),
  },
  {
    id: 'spring-init',
    title: 'Spring application context initialization failure',
    severity: 'CRITICAL',
    component: 'ContextLoader',
    description:
      'The Tomcat-hosted Spring context failed to start at least one application bean. When this occurs at boot, the affected DLP module (UI, reporting, or policy services) is unavailable until the bean error is resolved.',
    recommendation:
      'Inspect the BeanCreationException "Caused by:" chain in the log; restore the offending configuration / schema, then restart Tomcat and confirm context initialization completes cleanly.',
    matches: (r) =>
      loggerIn(r, ['ContextLoader', 'XmlWebApplicationContext', 'AbstractApplicationContext']) ||
      /BeanCreationException|Context initialization failed|Failed to start component/.test(r.body),
  },
  {
    id: 'hibernate-pk',
    title: 'Hibernate PRIMARY KEY constraint violation',
    severity: 'HIGH',
    component: 'SqlExceptionHelper',
    description:
      'INSERT/MERGE attempts collide with an existing primary-key value in a DLP audit/incident table. The transaction rolls back, which on audit tables (e.g. PA_AUDIT_INFO) leaves measurable audit-trail gaps and surfaces as repeated batch failures.',
    recommendation:
      'Identify the duplicate-key range (usually printed in the message), reseed the table identity, and confirm the upstream ID generator (sequence or @GeneratedValue) is not racing across nodes.',
    matches: (r) =>
      loggerIn(r, [
        'SqlExceptionHelper',
        'BatchingBatch',
        'JpaConstraintViolationExceptionTranslationAdvice',
        'SQLServerConstraintViolationExceptionHandler',
      ]) &&
      /PRIMARY KEY|duplicate key|ConstraintViolation|cannot insert duplicate/i.test(r.body),
  },
  {
    id: 'email-receiver-chain',
    title: 'EmailReceiver / IncidentActionChain unhandled exception',
    severity: 'HIGH',
    component: 'EmailReceiverServiceImpl',
    description:
      'The Thread-10 incident-action chain that processes inbound mail repeatedly throws unhandled exceptions while initializing IncidentActionChainLink. Affected incidents do not run their full notification / remediation workflow and may be silently dropped.',
    recommendation:
      'Open the most recent ERROR-<id> correlation chain in the log and confirm that DLP notification templates, email transport, and action workflows are reachable from the FSM host.',
    matches: (r) =>
      (r.thread === 'Thread-10' &&
        loggerIn(r, [
          'EmailReceiverServiceImpl',
          'IncidentActionChain',
          'InitializeIncidentActionChainLink',
          'EventApplicationServiceImpl',
          'LogUnhandledExceptionsAdvice',
        ])) ||
      /Failed to process Incident Action Workflow|Failed to process the email with a subject/.test(
        r.body,
      ),
  },
  {
    id: 'site-init',
    title: 'Default site / content-manager initialization failures',
    severity: 'HIGH',
    component: 'SiteInitialize',
    description:
      'Bootstrap of the default content-manager site repeatedly fails. The DLP UI surfaces in a degraded mode (missing default capabilities / properties) and some configuration screens may throw 500 errors until the site row is repaired.',
    recommendation:
      'Run the site-repair / default-capabilities reset script (Forcepoint KB on SiteInitialize), then restart the affected Tomcat node.',
    matches: (r) => loggerIn(r, ['SiteInitialize']),
  },
  {
    id: 'eip-bean-missing',
    title: 'EIP product-container page bean missing',
    severity: 'MEDIUM',
    component: 'EipAgentAdministratorsStrategyImpl',
    description:
      'The Endpoint Information Protection page lookup cannot resolve the `eipProductContainerPage` Spring bean. The endpoint administrators UI affordance fails to render for impacted role views.',
    recommendation:
      'Verify the EIP module is installed and licensed on this FSM, and that the corresponding Spring XML wiring is present after the last upgrade.',
    matches: (r) =>
      loggerIn(r, ['EipAgentAdministratorsStrategyImpl']) ||
      /No bean named 'eipProductContainerPage'/.test(r.body),
  },
  {
    id: 'forensics-readers',
    title: 'Forensics readers — unreadable email evidence',
    severity: 'MEDIUM',
    component: 'MsOutlookReader',
    description:
      'The MsOutlookReader and NetworkIncidentPL forensics components cannot parse a subset of EML/MSG payloads captured for incidents. Affected incidents render in the UI without full message-body forensics, weakening investigation evidence.',
    recommendation:
      'Confirm the forensics share has the latest Microsoft Outlook conversion libraries; verify the inbound EML samples have valid headers (the "cannot parse eml" warnings often track malformed Local addresses).',
    matches: (r) =>
      loggerIn(r, [
        'MsOutlookReader',
        'NetworkIncidentPL',
        'IncidentForensicsReader',
        'SmtpReader',
      ]),
  },
];

const NOISE_LOGGERS = new Set<string>([
  // Cosmetic Hibernate ehcache notices that every healthy deployment
  // emits — they would inflate the WARN bucket if not filtered.
  'EhcacheAccessStrategyFactoryImpl',
  'AbstractEhcacheRegionFactory',
]);

function isNoise(r: LogRecord): boolean {
  for (const s of NOISE_LOGGERS) {
    if (r.logger.endsWith(s) || r.logger.endsWith('.' + s)) return true;
  }
  // HHH020003 / HHH020007 are the actual ehcache codes — match defensively
  // in case the logger name is shortened.
  if (/HHH020007|HHH020003/.test(r.body)) return true;
  return false;
}

/* ─── Aggregation ───────────────────────────────────────────────── */

interface BucketAccumulator {
  bucket: Bucket;
  count: number;
  firstSeen: string;
  lastSeen: string;
  loggerCounts: Map<string, number>;
}

function classify(rec: LogRecord): Bucket | null {
  if (rec.level !== 'ERROR' && rec.level !== 'WARN') return null;
  if (isNoise(rec)) return null;
  for (const b of BUCKETS) {
    if (b.matches(rec)) return b;
  }
  // No predefined bucket matched — only ERROR-level records fall into
  // the catch-all so we don't pollute the report with one-off WARN
  // chatter that nobody asked for.
  if (rec.level !== 'ERROR') return null;
  return null;
}

function fmtForOutput(ts: string): string {
  // Strip seconds: "2026-05-22 09:33:47" → "2026-05-22 09:33"
  return ts.slice(0, 16);
}

const SEVERITY_RANK: Record<LogSeverity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

/* ─── Public entry point ────────────────────────────────────────── */

export function parseDlpAllLog(text: string, fileName: string): DlpAllLogReport {
  const { records, rawLineCount, spanFirst, spanLast } = parseRecords(text);

  let errorCount = 0;
  let warnCount = 0;
  for (const r of records) {
    if (r.level === 'ERROR') errorCount++;
    else if (r.level === 'WARN') warnCount++;
  }

  /* Catch-all bucket for ERROR records that didn't match any of the
     curated buckets above. We sub-group these by logger so the SE can
     still see "X errors from $LoggerY" without buckets eating each
     other. Capped to 5 catch-all entries so a noisy unrelated logger
     can't drown out the curated picture. */
  const buckets = new Map<string, BucketAccumulator>();
  const otherByLogger = new Map<string, BucketAccumulator>();

  for (const r of records) {
    const b = classify(r);
    if (b) {
      const acc = buckets.get(b.id) ?? {
        bucket: b,
        count: 0,
        firstSeen: r.ts,
        lastSeen: r.ts,
        loggerCounts: new Map<string, number>(),
      };
      acc.count++;
      if (r.ts < acc.firstSeen) acc.firstSeen = r.ts;
      if (r.ts > acc.lastSeen) acc.lastSeen = r.ts;
      acc.loggerCounts.set(r.logger, (acc.loggerCounts.get(r.logger) ?? 0) + 1);
      buckets.set(b.id, acc);
      continue;
    }
    if (r.level === 'ERROR' && !isNoise(r)) {
      const key = r.logger;
      const acc = otherByLogger.get(key) ?? {
        bucket: {
          id: 'other:' + key,
          title: `Uncategorised ERROR — ${shortLogger(key)}`,
          severity: 'MEDIUM',
          component: shortLogger(key),
          description:
            'ERROR-level entries from this component were not matched by any of the curated DLP root-cause buckets. The HC analyst should inspect the underlying message and "Caused by:" chain to determine whether this represents a real DLP impact or a transient runtime hiccup.',
          recommendation:
            'Open the log around the first occurrence and trace the stack to its root cause; once understood, file a follow-up bucket pattern so future imports auto-classify.',
          matches: () => false,
        },
        count: 0,
        firstSeen: r.ts,
        lastSeen: r.ts,
        loggerCounts: new Map<string, number>(),
      };
      acc.count++;
      if (r.ts < acc.firstSeen) acc.firstSeen = r.ts;
      if (r.ts > acc.lastSeen) acc.lastSeen = r.ts;
      acc.loggerCounts.set(key, (acc.loggerCounts.get(key) ?? 0) + 1);
      otherByLogger.set(key, acc);
    }
  }

  // Promote the top-N "other" loggers — keep at most 5 so the report
  // stays focused.
  const others = Array.from(otherByLogger.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  const allIssues: DlpLogIssue[] = [...buckets.values(), ...others]
    .map((acc) => {
      // Pick the most-frequent logger as the "component" for the
      // curated buckets — preserves the bucket's hand-written default
      // when a single logger dominates.
      const topLogger = [...acc.loggerCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const component = topLogger ? shortLogger(topLogger[0]) : acc.bucket.component;
      return {
        id: acc.bucket.id,
        title: acc.bucket.title,
        severity: acc.bucket.severity,
        is_critical: acc.bucket.severity === 'CRITICAL',
        component,
        description: acc.bucket.description,
        occurrences: acc.count,
        first_seen: fmtForOutput(acc.firstSeen),
        last_seen: fmtForOutput(acc.lastSeen),
        recommendation: acc.bucket.recommendation,
      };
    });

  /* Apply the recency + volume gate. Order matters for the dropped
     counters: an issue that is both stale AND under the threshold is
     counted once, against staleness, since staleness is the dominant
     reason to skip ("customer probably already fixed this"). */
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
    fileName,
    importedAt: new Date().toISOString(),
    totalLines: rawLineCount,
    recordCount: records.length,
    errorCount,
    warnCount,
    spanFirst: spanFirst ? fmtForOutput(spanFirst) : null,
    spanLast: spanLast ? fmtForOutput(spanLast) : null,
    issues,
    staleDropped,
    lowVolumeDropped,
  };
}

/** Trim a fully-qualified logger ("com.pa.fw.…ServiceImpl") to the
    leaf class name. Spec asks for a short, human-readable
    `component` field. */
function shortLogger(full: string): string {
  const dot = full.lastIndexOf('.');
  return dot >= 0 ? full.slice(dot + 1) : full;
}

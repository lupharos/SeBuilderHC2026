/* Information Security Posture summary — pulled from the Forcepoint DLP
   REST API via the local companion server (POST /api/dlp/posture).

   This is a CXO-grade healthcheck rollup. The companion fetches /incidents
   + /policy/enabled-names + /deploy/status, classifies destinations using
   the operator-managed pattern catalogue, and returns aggregated counts.

   Redaction stance: organizational and tooling categoricals (department,
   business unit, GenAI app, SaaS app, channel, action, severity, status)
   are always emitted. Individual user identifiers (login_name) ARE
   surfaced in the "Top Users" block — DLP CXO reports universally name
   top offenders, so this block intentionally overrides the parser-side
   redaction rule documented in CLAUDE.md. AD domain / logon-server /
   run-as identifiers remain redacted. */

export interface DlpPostureLabelCount {
  label: string;
  count: number;
}

/* ─── Destination Pattern Catalogue ───────────────────────────────
   Substring-match patterns the server uses to classify each incident's
   `destination` field into a high-level bucket. Operator-editable from
   the new "GenAI Apps" navigation rail entry; saved patterns flow back
   into every posture fetch so the customer's house style of naming
   destinations gets respected.

   Match semantics: case-insensitive substring on the raw destination
   text. The first matching bucket wins; an incident can therefore land
   in exactly one of: genai | saas | webmail | other. */

export type DestinationBucket = 'genai' | 'saas' | 'webmail';

export interface DestinationPatterns {
  genai: string[];
  saas: string[];
  webmail: string[];
}

/* Curated defaults — covers the bulk of the 2025-26 GenAI / SaaS
   landscape Akbank-class enterprises see in DLP telemetry. Operators
   can edit/extend via the "GenAI Apps" catalogue page. */
export const DEFAULT_DESTINATION_PATTERNS: DestinationPatterns = {
  genai: [
    'chatgpt', 'openai', 'oai.', 'chat.openai',
    'claude.ai', 'anthropic',
    'gemini.google', 'bard.google', 'aistudio.google',
    'copilot.microsoft', 'copilot.com', 'm365.cloud.microsoft/chat',
    'github.com/copilot', 'github.copilot',
    'perplexity',
    'character.ai', 'character.io',
    'midjourney',
    'runwayml', 'runway.ml',
    'dall-e', 'labs.openai',
    'stability.ai', 'stablediffusionweb',
    'huggingface.co',
    'mistral.ai', 'chat.mistral',
    'deepseek',
    'you.com',
    'jasper.ai', 'writesonic', 'quillbot',
    'notion.ai', 'notion.so/ai',
    'replit.com',
    'cursor.sh', 'cursor.com',
    'cohere.ai', 'cohere.com',
    'pi.ai', 'inflection',
    'poe.com',
    'character',
  ],
  saas: [
    'drive.google', 'docs.google',
    'dropbox',
    'box.com', 'app.box',
    'sharepoint', '.sharepoint.com',
    'onedrive', '1drv.ms',
    'icloud',
    'mega.nz', 'mega.io',
    'wetransfer',
    'sendgb', 'send.tresorit', 'tresorit',
    'mediafire',
    'mailbigfile',
    'pcloud',
    'sync.com',
    'filesanywhere',
    'amazon s3', 'amazonaws.com/s3', 's3.amazonaws',
    'azure blob', 'blob.core.windows',
    'gcs.', 'storage.googleapis',
  ],
  webmail: [
    'gmail.com', 'mail.google',
    'outlook.live', 'outlook.com', 'hotmail',
    'yahoo.mail', 'mail.yahoo',
    'protonmail', 'proton.me',
    'tutanota', 'tuta.com',
    'zoho.mail', 'mail.zoho',
    'gmx.com', 'gmx.net',
    'yandex.mail', 'mail.yandex',
    'aol.com',
    'fastmail',
    'mail.ru',
  ],
};

/* ─── Posture report blocks ───────────────────────────────────────
   Each block is one card in the report's "Information Security Posture
   Dashboard" section. The wizard lets the operator tick which blocks
   they want to include in the final export — mirrors how the SQL
   "Report Selection" card lets the operator pick per-query rollups. */
export type DlpPostureBlockId =
  | 'overview'           // KPI strip (DLP version, deploy status, policy counts, totals)
  | 'severity'           // Severity donut
  | 'action'             // Action distribution bars
  | 'channel'            // Channel distribution bars
  | 'status'             // Workflow status chips
  | 'policies'           // Top 10 triggered policies
  | 'destinations'       // Top 10 raw destinations (uncategorised)
  | 'users'              // Top 10 users by incident count — CXO offender list
  | 'genai_apps'         // Top GenAI applications hit + total exposure
  | 'saas_apps'          // Top SaaS / cloud-storage destinations
  | 'webmail'            // Top webmail destinations (data exfil vector)
  | 'endpoint_type'      // Laptop / Desktop / Network breakdown
  | 'detection_sources'  // Detection source rollup
  | 'workflow_rates'     // False positive / released / ignored rates
  | 'risk_sla'           // Risk-adaptive coverage + SLA breach indicator
  | 'data_exposure';     // Forensic data exposure (sum of transaction_size)

export interface DlpPostureBlockDef {
  id: DlpPostureBlockId;
  title: string;
  description: string;
  /* Loose grouping label so the picker can group related blocks
     visually — mirrors how Report Selection groups by product. */
  group: 'Overview' | 'Incidents' | 'Org & Risk' | 'Exfil Vectors';
}

export const DLP_POSTURE_BLOCKS: DlpPostureBlockDef[] = [
  { id: 'overview',          group: 'Overview',       title: 'Deployment & Policy Overview', description: 'DLP version, deployment status, enabled DLP + Discovery policy counts, total incidents in window.' },
  { id: 'severity',          group: 'Incidents',      title: 'Incident Severity Breakdown',  description: 'HIGH / MEDIUM / LOW distribution with donut visual.' },
  { id: 'action',            group: 'Incidents',      title: 'Incident Action Distribution', description: 'BLOCKED / AUDITED / QUARANTINED / RELEASED / ENCRYPTED / ESG_ACTION / UNSHARE_* counts.' },
  { id: 'channel',           group: 'Incidents',      title: 'Channel Distribution',         description: 'EMAIL / ENDPOINT_* / HTTP / HTTPS / CASB channel counts.' },
  { id: 'status',            group: 'Incidents',      title: 'Workflow Status',              description: 'NEW / IN_PROCESS / CLOSE / FALSE_POSITIVE / ESCALATED + any custom statuses.' },
  { id: 'policies',          group: 'Incidents',      title: 'Top Triggered Policies',       description: 'Top 10 policies by violation count over the window.' },
  { id: 'destinations',      group: 'Incidents',      title: 'Top Destinations (raw)',       description: 'Top 10 destination labels — full set including uncategorised endpoints, devices, and printers.' },
  { id: 'endpoint_type',     group: 'Incidents',      title: 'Endpoint Type',                description: 'Laptop / Desktop / Network breakdown of incident sources.' },
  { id: 'detection_sources', group: 'Incidents',      title: 'Detection Sources',            description: 'Where incidents are detected (Endpoint Agent, Protector, Email Gateway, etc.).' },
  { id: 'users',             group: 'Org & Risk',     title: 'Top Users (Offenders)',        description: 'Top 10 users by incident count — derived from source.login_name. Override of the parser redaction policy; CXO reports name top offenders by convention.' },
  { id: 'workflow_rates',    group: 'Org & Risk',     title: 'Workflow Rates',               description: 'False-positive %, released-incident %, ignored %.' },
  { id: 'risk_sla',          group: 'Org & Risk',     title: 'Risk-Adaptive Coverage & SLA', description: 'Count of incidents carrying a positive risk_level + breaches of the 24h SLA (NEW / IN_PROCESS older than 24h).' },
  { id: 'data_exposure',     group: 'Org & Risk',     title: 'Forensic Data Exposure',       description: 'Sum of transaction_size across the window — bytes of data that crossed a policy boundary. Headline number for the CXO summary.' },
  { id: 'genai_apps',        group: 'Exfil Vectors',  title: 'Top GenAI Applications',       description: 'Destinations matching the GenAI catalogue (ChatGPT, Claude, Gemini, Copilot, Perplexity, etc.). Quantifies data risk to AI tools.' },
  { id: 'saas_apps',         group: 'Exfil Vectors',  title: 'Top SaaS / Cloud Storage',     description: 'Destinations matching the cloud-storage catalogue (Drive, Dropbox, Box, SharePoint, OneDrive, etc.).' },
  { id: 'webmail',           group: 'Exfil Vectors',  title: 'Top Webmail Destinations',     description: 'Destinations matching the personal webmail catalogue (Gmail, Outlook.com, Yahoo, etc.) — a classic exfil channel.' },
];

export const ALL_POSTURE_BLOCK_IDS: DlpPostureBlockId[] =
  DLP_POSTURE_BLOCKS.map((b) => b.id);

/* Default selection: everything on. Operators can tick blocks off in
   the wizard's "REST API Data Selection" card to trim the report. */
export const DEFAULT_POSTURE_SECTIONS: Record<DlpPostureBlockId, boolean> =
  Object.fromEntries(ALL_POSTURE_BLOCK_IDS.map((id) => [id, true])) as Record<DlpPostureBlockId, boolean>;

export interface DlpPostureSummary {
  /** ISO timestamp of when the companion executed the fetch. */
  fetchedAt: string;
  /** Normalised FSM base URL — `<host>/dlp/rest/v1`. */
  serverBaseUrl: string;
  /** Wall-clock latency of the round trip, including auth handshake. */
  latencyMs: number;
  /** Time window the incident aggregation covers. */
  windowDays: number;

  /** From GET /deploy/status. */
  dlpVersion: string;
  /** `IN_PROGRESS` | `PENDING_DEPLOYMENT` | `COMPLETED` | `FAILED` | `UNKNOWN`. */
  deploymentStatus: 'IN_PROGRESS' | 'PENDING_DEPLOYMENT' | 'COMPLETED' | 'FAILED' | 'UNKNOWN' | string;

  /** From GET /policy/enabled-names?type=DLP|DISCOVERY. */
  enabledDlpPolicies: number;
  enabledDiscoveryPolicies: number;
  /** First 50 enabled DLP policy names (may be empty when API returns count-only). */
  enabledDlpPolicyNames: string[];

  /** Total incident count over the window — sum of bySeverity / byStatus etc. */
  totalIncidents: number;
  bySeverity: { HIGH: number; MEDIUM: number; LOW: number };
  byAction: Record<string, number>;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  byEndpointType: { LAPTOP: number; DESKTOP: number; NA: number };
  byDetectedBy: Record<string, number>;

  topPolicies: DlpPostureLabelCount[];
  topDestinations: DlpPostureLabelCount[];

  /** Top 10 users by incident count — login_name from source. CXO reports
      name top offenders; redaction policy is overridden for this block. */
  topUsers: DlpPostureLabelCount[];

  /** Pattern-matched destinations classified by bucket. */
  topGenAiApps: DlpPostureLabelCount[];
  topSaasApps: DlpPostureLabelCount[];
  topWebmail: DlpPostureLabelCount[];

  /** Headline incident counts per exfil-vector bucket. */
  genAiIncidentCount: number;
  saasIncidentCount: number;
  webmailIncidentCount: number;

  releasedIncidentCount: number;
  falsePositiveCount: number;
  ignoredCount: number;

  /** Number of incidents whose source carries a positive risk_level
      (Risk-Adaptive Protection coverage indicator). */
  riskLevelPositiveCount: number;
  /** Incidents still NEW / IN_PROCESS older than 24h — analyst-SLA breach. */
  slaBreachCount: number;

  /** Sum of transaction_size (bytes) across the window. The CXO headline
      for "data exposure" — how many bytes crossed a policy boundary. */
  totalForensicBytes: number;
  /** Forensic byte sum broken down by severity. */
  forensicBytesBySeverity: { HIGH: number; MEDIUM: number; LOW: number };
}

/* Payload shape posted to the companion (mirrors ApiConnectorConfig). */
export interface DlpPostureFetchPayload {
  url: string;
  authType: 'apikey' | 'basic';
  username: string;
  password: string;
  apiKey: string;
  windowDays?: number;
  /* Optional pattern catalogue override. Companion uses defaults when
     omitted. */
  patterns?: DestinationPatterns;
}

/* Wraps the companion call so callers can `await fetchDlpPosture(cfg)` and
   get a typed Result back. Errors bubble as Error with a sanitised message
   from the server. */
export async function fetchDlpPosture(
  payload: DlpPostureFetchPayload,
  signal?: AbortSignal,
): Promise<DlpPostureSummary> {
  const res = await fetch('http://localhost:3001/api/dlp/posture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: signal ?? AbortSignal.timeout(75000),
  });
  type ApiOk = DlpPostureSummary & { ok: true };
  type ApiErr = { ok: false; message?: string };
  const json = await res.json() as ApiOk | ApiErr;
  if (!res.ok || (json as ApiErr).ok === false) {
    const msg = (json as ApiErr).message || `Server returned ${res.status}`;
    throw new Error(msg);
  }
  /* Strip the `ok` flag so we hand callers a plain summary. */
  const { ok: _ok, ...summary } = json as ApiOk;
  return summary as DlpPostureSummary;
}

/* Format a byte count into a CXO-friendly string (1.2 GB, 856 MB, etc.). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

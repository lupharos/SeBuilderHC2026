/* Forcepoint HC — local SQL companion server.

   Why this exists: the wizard runs in the browser, which can't speak TCP
   directly to SQL Server. This tiny Node service accepts a `SqlConfig`
   from the wizard, opens a real mssql connection, runs the requested
   operation, and returns the result. Runs on port 3001 by default; the
   frontend hits `http://localhost:3001/api/sql/*`.

   Lifecycle: process-bound. Nothing is persisted server-side — every
   request reuses the connection only for the duration of the call,
   then closes. The wizard treats results as runtime-only.

   To run:
     cd server
     npm install
     npm start
*/

import express from 'express';
import cors from 'cors';
import { Agent } from 'undici';
import sql from 'mssql';
import { DLP_QUERIES } from './queries.mjs';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());                // Vite dev server is on a different origin
app.use(express.json({ limit: '256kb' }));

/* DLP Manager certificates are typically self-signed; the companion talks
   to the FSM over HTTPS but skips chain validation. Node native fetch
   does not honour the `agent` option — it routes through undici, so we
   pass a `dispatcher` instead. */
const DLP_DISPATCHER = new Agent({ connect: { rejectUnauthorized: false } });

/* ─────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────── */

/**
 * Build an `mssql` config object from the wizard's `SqlConfig` shape.
 * - `authType: 'windows'` → integrated auth via msnodesqlv8-style options
 *   (mssql falls back to `trustedConnection` on Windows when no creds).
 * - `authType: 'sql'` → standard SQL Server login.
 */
function buildSqlConfig(body) {
  const {
    server = '',
    port = 1433,
    database = '',
    authType = 'sql',
    username = '',
    password = '',
  } = body ?? {};

  if (!server) {
    throw new Error('Missing "server" — provide the SQL Server host or IP.');
  }

  /**
   * @type {import('mssql').config}
   */
  const cfg = {
    server,
    port: Number(port) || 1433,
    database: database || undefined,
    options: {
      encrypt: true,
      trustServerCertificate: true,   // common for on-prem self-signed certs
      enableArithAbort: true,
    },
    connectionTimeout: 8000,
    requestTimeout: 15000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 500 },
  };

  if (authType === 'windows') {
    /* Tedious driver doesn't speak SSPI natively; on Windows boxes we let
       mssql attempt trusted connection by omitting user/password and
       relying on the trusted-connection option. */
    cfg.options.trustedConnection = true;
  } else {
    if (!username) throw new Error('Missing "username" for SQL authentication.');
    cfg.user = username;
    cfg.password = password ?? '';
  }
  return cfg;
}

function sanitizeError(err) {
  /* mssql / tedious errors often expose stack traces with file paths — keep
     the message but drop noisy internals before sending it to the wizard. */
  const msg = (err && (err.message || String(err))) || 'Unknown error';
  return msg.replace(/\s+at\s+[^\n]+/g, '').slice(0, 480);
}

/* ─────────────────────────────────────────────────────────────────
   /api/sql/test — Connection + server identification
   ───────────────────────────────────────────────────────────────────
   Opens a connection, runs `SELECT @@VERSION, @@SERVERNAME`, returns a
   single OK payload the wizard can render. No data persisted.
───────────────────────────────────────────────────────────────── */
app.post('/api/sql/test', async (req, res) => {
  const started = Date.now();
  let pool = null;
  try {
    const cfg = buildSqlConfig(req.body);
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT
        @@VERSION       AS version_string,
        @@SERVERNAME    AS server_name,
        DB_NAME()       AS current_database,
        SUSER_SNAME()   AS current_login,
        CAST(SERVERPROPERTY('ProductVersion')      AS NVARCHAR(64))  AS product_version,
        CAST(SERVERPROPERTY('Edition')             AS NVARCHAR(128)) AS edition,
        CAST(SERVERPROPERTY('ProductLevel')        AS NVARCHAR(32))  AS product_level,
        CAST(SERVERPROPERTY('Collation')           AS NVARCHAR(128)) AS collation
    `);
    const r = result.recordset[0] ?? {};
    const ms = Date.now() - started;
    res.json({
      ok: true,
      message: `Connected in ${ms} ms`,
      server: {
        productVersion:  r.product_version || '',
        edition:         r.edition || '',
        productLevel:    r.product_level || '',
        collation:       r.collation || '',
        serverName:      r.server_name || '',
        currentDatabase: r.current_database || '',
        currentLogin:    r.current_login || '',
        versionString:   r.version_string || '',
      },
      latencyMs: ms,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      message: sanitizeError(err),
      latencyMs: Date.now() - started,
    });
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore pool close races */ }
    }
  }
});

/* ─────────────────────────────────────────────────────────────────
   /api/sql/queries — list the available report templates so the
   wizard can discover what it's allowed to ask for.
───────────────────────────────────────────────────────────────── */
app.get('/api/sql/queries', (_req, res) => {
  const entries = Object.entries(DLP_QUERIES).map(([sqlKey, q]) => ({
    sqlKey,
    title: q.title,
    description: q.description,
    defaultWindowDays: q.defaultWindowDays,
    fixedWindow: !!q.fixedWindow,
  }));
  res.json({ ok: true, queries: entries });
});

/* ─────────────────────────────────────────────────────────────────
   /api/sql/query — run one of the registered report queries.
   ───────────────────────────────────────────────────────────────────
   Body: { ...SqlConfig, sqlKey: 'dlp_top_violators', windowDays?: 30 }

   `windowDays` (optional integer) overrides the template's default
   window. Ignored for templates marked `fixedWindow:true` (their
   analysis is intrinsically bound to specific windows). The day value
   is sanitised in the template before being injected — no SQL
   smuggling possible.

   Looks up the SQL template by sqlKey, executes it against the
   customer DB, and returns rows. No data persisted server-side.
───────────────────────────────────────────────────────────────── */
/* All Data Security templates run against this DSM-fixed database. The
   wizard does NOT need to enter a DB name — the server pins it so that
   PA_EVENT_PARTITION_CATALOG / PA_EVENTS_<partition> resolve correctly. */
const DLP_DATABASE = 'wbsn-data-security';

app.post('/api/sql/query', async (req, res) => {
  const started = Date.now();
  const { sqlKey, windowDays, topN, ...connBody } = req.body ?? {};
  if (!sqlKey || typeof sqlKey !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing "sqlKey" in request body.' });
  }
  const template = DLP_QUERIES[sqlKey];
  if (!template) {
    return res.status(404).json({ ok: false, message: `Unknown sqlKey "${sqlKey}" — not in the registered template list.` });
  }

  /* For fixed-window templates we ignore the requested window. Otherwise
     a missing / invalid windowDays falls back to the template default. */
  const effectiveDays = template.fixedWindow
    ? template.defaultWindowDays
    : (Number.isFinite(Number(windowDays)) && Number(windowDays) > 0
        ? Math.min(Math.floor(Number(windowDays)), 3650)
        : template.defaultWindowDays);

  /* TOP N is optional. Sanitise to a positive integer (cap 10_000) and
     pass to the template — templates that don't support TOP just ignore. */
  const effectiveTopN = (() => {
    const n = Math.floor(Number(topN));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.min(n, 10000);
  })();

  let pool = null;
  try {
    /* DLP queries are pinned to wbsn-data-security regardless of what the
       caller passed in — keeps the connection scoped to the only DB these
       templates know about. */
    const cfg = buildSqlConfig({ ...connBody, database: sqlKey.startsWith('dlp_') ? DLP_DATABASE : connBody.database });
    pool = await sql.connect(cfg);
    const sqlText = template.sql({ days: effectiveDays, topN: effectiveTopN });
    const result = await pool.request().query(sqlText);
    const ms = Date.now() - started;
    /* Dynamic SQL (EXEC) returns its result via `recordsets[0]` when a
       single SELECT runs inside the dynamic block; mssql's `recordset`
       sometimes collapses it. Use whichever holds rows. */
    const rows = (Array.isArray(result.recordsets) && result.recordsets[0]) || result.recordset || [];
    res.json({
      ok: true,
      sqlKey,
      title: template.title,
      description: template.description,
      windowDays: effectiveDays,
      topN: effectiveTopN,
      rowCount: rows.length,
      latencyMs: ms,
      rows,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      sqlKey,
      windowDays: effectiveDays,
      topN: effectiveTopN,
      message: sanitizeError(err),
      latencyMs: Date.now() - started,
    });
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore */ }
    }
  }
});

/* ─────────────────────────────────────────────────────────────────
   DLP REST API companion — auth flow + posture dashboard fetch
   ───────────────────────────────────────────────────────────────────
   Browser can't talk directly to the FSM REST API (self-signed cert
   + CORS), so the companion brokers the JWT two-step:
     1. POST /auth/refresh-token  (username/password headers)  → refresh + access
     2. POST /auth/access-token   (refresh-token header)        → fresh access
   Access tokens live 15 minutes by default; we don't cache between
   requests — the wizard calls posture infrequently and each call gets
   its own fresh token to keep the companion stateless.

   Endpoints exposed to the wizard:
     POST /api/dlp/test     — full auth + GET /deploy/status sanity check
     POST /api/dlp/posture  — auth + parallel fetch of deploy / policy /
                              incidents, aggregated into a posture summary

   See .claude/skills/dlp-restapi.md for the full reference.
───────────────────────────────────────────────────────────────── */

function normaliseDlpBaseUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Missing DLP "url" — provide the FSM base URL (e.g. https://FSMServer:9443).');
  }
  const trimmed = url.trim().replace(/\/+$/, '');
  /* Tolerate operators pasting either the bare host or the full /dlp/rest/v1
     prefix. Internally we always operate against /dlp/rest/v1 paths. */
  if (/\/dlp\/rest\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/dlp/rest/v1`;
}

/* Map fetch errors to short, operator-friendly strings. Self-signed cert
   errors are common on day-one — surface them clearly rather than as a
   raw stack trace. */
function describeDlpFetchError(err) {
  const code = err?.cause?.code || err?.code;
  if (code === 'ECONNREFUSED') return 'Connection refused — verify the FSM host/port is reachable.';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'Connection timed out — FSM unreachable on the network.';
  if (code === 'ENOTFOUND') return 'Hostname could not be resolved — check DNS or use an IP.';
  if (code === 'CERT_HAS_EXPIRED') return 'FSM certificate has expired.';
  if (err?.name === 'AbortError') return 'Request aborted (exceeded local timeout).';
  const msg = err?.message || String(err);
  return msg.replace(/\s+at\s+[^\n]+/g, '').slice(0, 320);
}

/* Perform the JWT handshake. The /auth/refresh-token response already
   carries an access_token (per the DLP REST API reference), so a single
   round-trip is enough — no follow-up /auth/access-token call needed. */
async function getDlpAccessToken({ baseUrl, username, password }, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const refreshRes = await fetch(`${baseUrl}/auth/refresh-token`, {
      method: 'POST',
      headers: { username, password },
      dispatcher: DLP_DISPATCHER,
      signal: ctrl.signal,
    });
    if (!refreshRes.ok) {
      const t = await refreshRes.text().catch(() => '');
      throw new Error(`Refresh-token request failed (${refreshRes.status}). ${refreshRes.status === 403 ? 'Only Application Administrator accounts can request tokens.' : t.slice(0, 200)}`);
    }
    const refreshJson = await refreshRes.json();
    const accessToken = refreshJson.access_token;
    if (!accessToken) throw new Error('Refresh-token response missing access_token.');
    return accessToken;
  } finally {
    clearTimeout(timer);
  }
}

/* Convenience wrapper around fetch for DLP REST calls with auth header,
   self-signed cert tolerance, and a unified timeout. */
async function dlpFetch(baseUrl, accessToken, path, init = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      dispatcher: DLP_DISPATCHER,
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* ─── /api/dlp/test ──────────────────────────────────────────────
   Full auth handshake + lightweight GET /deploy/status as a sanity
   probe. Returns DLP version + deployment status on success. */
app.post('/api/dlp/test', async (req, res) => {
  const started = Date.now();
  const { url, username = '', password = '' } = req.body ?? {};

  try {
    if (!username || !password) {
      throw new Error('DLP REST API requires Application Administrator username + password.');
    }
    const baseUrl = normaliseDlpBaseUrl(url);
    const token = await getDlpAccessToken({ baseUrl, username, password });
    const dRes = await dlpFetch(baseUrl, token, '/deploy/status');
    if (!dRes.ok) {
      throw new Error(`/deploy/status returned ${dRes.status}. Token issued OK but probe failed.`);
    }
    const dJson = await dRes.json();
    const ms = Date.now() - started;
    res.json({
      ok: true,
      message: `Authenticated · DLP ${dJson.dlp_version ?? 'unknown'} · ${ms} ms`,
      server: {
        baseUrl,
        dlpVersion: dJson.dlp_version || '',
        deploymentStatus: dJson.deployment_status || 'UNKNOWN',
      },
      latencyMs: ms,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      message: describeDlpFetchError(err),
      latencyMs: Date.now() - started,
    });
  }
});

/* ─── /api/dlp/posture ──────────────────────────────────────────
   Pulls the data needed to render the report's Information Security
   Posture Dashboard. Aggregates incident telemetry server-side so the
   wizard receives a compact summary instead of raw incidents. */
/* Destination classification defaults — kept in sync with
   src/app/components/steps/dlpPosture.ts (DEFAULT_DESTINATION_PATTERNS).
   The wizard may override these per-fetch via req.body.patterns. */
const DEFAULT_DESTINATION_PATTERNS = {
  genai: [
    'chatgpt','openai','oai.','chat.openai',
    'claude.ai','anthropic',
    'gemini.google','bard.google','aistudio.google',
    'copilot.microsoft','copilot.com','m365.cloud.microsoft/chat',
    'github.com/copilot','github.copilot',
    'perplexity',
    'character.ai','character.io',
    'midjourney',
    'runwayml','runway.ml',
    'dall-e','labs.openai',
    'stability.ai','stablediffusionweb',
    'huggingface.co',
    'mistral.ai','chat.mistral',
    'deepseek',
    'you.com',
    'jasper.ai','writesonic','quillbot',
    'notion.ai','notion.so/ai',
    'replit.com',
    'cursor.sh','cursor.com',
    'cohere.ai','cohere.com',
    'pi.ai','inflection',
    'poe.com',
    'character',
  ],
  saas: [
    'drive.google','docs.google',
    'dropbox',
    'box.com','app.box',
    'sharepoint','.sharepoint.com',
    'onedrive','1drv.ms',
    'icloud',
    'mega.nz','mega.io',
    'wetransfer',
    'sendgb','send.tresorit','tresorit',
    'mediafire',
    'mailbigfile',
    'pcloud',
    'sync.com',
    'filesanywhere',
    'amazon s3','amazonaws.com/s3','s3.amazonaws',
    'azure blob','blob.core.windows',
    'gcs.','storage.googleapis',
  ],
  webmail: [
    'gmail.com','mail.google',
    'outlook.live','outlook.com','hotmail',
    'yahoo.mail','mail.yahoo',
    'protonmail','proton.me',
    'tutanota','tuta.com',
    'zoho.mail','mail.zoho',
    'gmx.com','gmx.net',
    'yandex.mail','mail.yandex',
    'aol.com',
    'fastmail',
    'mail.ru',
  ],
};

/* Sanitise an operator-supplied pattern array — strip non-strings, trim,
   drop empties, cap at 200 entries per bucket. Falls back to the default
   list when the bucket is missing or empty. */
function sanitisePatternList(arr, fallback) {
  if (!Array.isArray(arr)) return fallback;
  const cleaned = arr
    .map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
    .filter(Boolean)
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : fallback;
}

app.post('/api/dlp/posture', async (req, res) => {
  const started = Date.now();
  const { url, username = '', password = '', windowDays = 30, patterns } = req.body ?? {};
  const days = Math.max(1, Math.min(Math.floor(Number(windowDays) || 30), 365));

  /* Resolve effective pattern set — caller's lists override defaults. */
  const PAT = {
    genai:   sanitisePatternList(patterns?.genai,   DEFAULT_DESTINATION_PATTERNS.genai),
    saas:    sanitisePatternList(patterns?.saas,    DEFAULT_DESTINATION_PATTERNS.saas),
    webmail: sanitisePatternList(patterns?.webmail, DEFAULT_DESTINATION_PATTERNS.webmail),
  };

  /* First-match-wins classifier. Returns 'genai' | 'saas' | 'webmail' |
     'other'. Substring match is case-insensitive on the lowercased
     destination text. */
  const classifyDest = (dst) => {
    const s = dst.toLowerCase();
    for (const p of PAT.genai)   if (s.includes(p)) return 'genai';
    for (const p of PAT.saas)    if (s.includes(p)) return 'saas';
    for (const p of PAT.webmail) if (s.includes(p)) return 'webmail';
    return 'other';
  };

  try {
    if (!username || !password) {
      throw new Error('DLP REST API requires Application Administrator username + password.');
    }
    const baseUrl = normaliseDlpBaseUrl(url);
    const token = await getDlpAccessToken({ baseUrl, username, password });

    /* dd/MM/yyyy HH:mm:ss is the format /incidents expects per the spec. */
    const fmtDlpDate = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    /* Three independent fetches in parallel: deploy/status, enabled-names
       (DLP + DISCOVERY), and the incident window. /incidents tops out at
       10K rows; we request DLP type only (DISCOVERY would be a separate
       call but isn't included in the posture dashboard for v1). */
    const [deployRes, polDlpRes, polDiscRes, incRes] = await Promise.all([
      dlpFetch(baseUrl, token, '/deploy/status'),
      dlpFetch(baseUrl, token, '/policy/enabled-names?type=DLP'),
      dlpFetch(baseUrl, token, '/policy/enabled-names?type=DISCOVERY'),
      dlpFetch(baseUrl, token, '/incidents', {
        method: 'POST',
        body: JSON.stringify({
          type: 'INCIDENTS',
          sort_by: 'INSERT_DATE',
          from_date: fmtDlpDate(from),
          to_date: fmtDlpDate(now),
        }),
      }, 60000),
    ]);

    /* deploy/status is mandatory; missing it likely means an auth or
       network blip that the partial-success path can still tolerate. */
    const deployJson = deployRes.ok ? await deployRes.json() : {};
    const polDlpJson = polDlpRes.ok ? await polDlpRes.json() : { enabled_policies: [], total_enabled_policies: 0 };
    const polDiscJson = polDiscRes.ok ? await polDiscRes.json() : { enabled_policies: [], total_enabled_policies: 0 };
    /* /incidents returns 420 when there are NO incidents in the window —
       treat that as zero rather than a hard error. */
    const incidents = incRes.ok
      ? ((await incRes.json()).incidents ?? [])
      : (incRes.status === 420 ? [] : (() => { throw new Error(`/incidents returned ${incRes.status}`); })());

    /* ── Aggregation ─────────────────────────────────────────────
       CXO-grade categorical rollup. Top-Users surfaces login_name from
       source.* — CXO healthcheck reports universally name top offenders.
       Higher-cardinality identifiers (AD domain, run-as, host name) are
       NOT surfaced — those remain under the parser-side redaction rule. */
    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byAction = {};
    const byChannel = {};
    const byStatus = {};
    const byEndpointType = { LAPTOP: 0, DESKTOP: 0, NA: 0 };
    const byDetectedBy = {};
    const policyCounts = {};
    const destCounts = {};
    /* Top users by incident volume. login_name preferred; email username
       (left-of-@) used as a fallback so we have something even when the
       FSM only populated email_address. */
    const userCounts = {};
    /* Exfil-vector rollups — pattern-classified destinations. */
    const genaiCounts = {};
    const saasCounts = {};
    const webmailCounts = {};
    let genaiIncidentCount = 0;
    let saasIncidentCount = 0;
    let webmailIncidentCount = 0;
    /* Forensic data exposure — sum of transaction_size (bytes that
       crossed the policy boundary), bucketed by severity for the CXO
       summary. transaction_size is "by ID" per the spec, so on the list
       endpoint it's typically present only for richer incidents — we
       sum whatever we get. Fall back to total_size or maximum_matches. */
    let totalForensicBytes = 0;
    const forensicBytesBySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    let releasedCount = 0;
    let falsePositiveCount = 0;
    let ignoredCount = 0;
    let riskLevelPositiveCount = 0;
    let slaBreachCount = 0;

    const bump = (m, k) => { if (!k) return; m[k] = (m[k] || 0) + 1; };

    for (const i of incidents) {
      const sev = String(i.severity || '').toUpperCase();
      const sevKey = (sev === 'HIGH' || sev === 'MEDIUM' || sev === 'LOW') ? sev : null;
      if (sevKey) bySeverity[sevKey]++;
      bump(byAction,  String(i.action || '').toUpperCase());
      bump(byChannel, String(i.channel || '').toUpperCase());
      /* Status comes back as either uppercase enum or freeform label (e.g.
         "Closed" vs "CLOSE"). Preserve as-is for display. */
      const statusRaw = String(i.status || '').trim();
      if (statusRaw) byStatus[statusRaw] = (byStatus[statusRaw] || 0) + 1;
      const ep = String(i.endpoint_type || '').toUpperCase();
      if (ep === 'LAPTOP' || ep === 'DESKTOP' || ep === 'NA') byEndpointType[ep]++;
      bump(byDetectedBy, String(i.detected_by || '').replace(/\s+\d.*/, '').trim());
      /* policies may be ";"-delimited (e.g. "Credit Cards; PCI"). Split
         and tally each policy separately so multi-policy hits don't get
         double-counted against a phantom combined label. */
      if (i.policies) {
        for (const p of String(i.policies).split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
          policyCounts[p] = (policyCounts[p] || 0) + 1;
        }
      }

      /* destination — normalise to the host part for emails and tally
         the raw set in destCounts. Then run it through the bucket
         classifier so it lands in exactly one of genai/saas/webmail (or
         falls into the catch-all "other" — only counted in destCounts). */
      if (i.destination) {
        const raw = String(i.destination).trim();
        const dst = raw.includes('@') ? raw.split('@').pop() : raw;
        destCounts[dst] = (destCounts[dst] || 0) + 1;
        switch (classifyDest(raw)) {
          case 'genai':   genaiCounts[dst]   = (genaiCounts[dst]   || 0) + 1; genaiIncidentCount++;   break;
          case 'saas':    saasCounts[dst]    = (saasCounts[dst]    || 0) + 1; saasIncidentCount++;    break;
          case 'webmail': webmailCounts[dst] = (webmailCounts[dst] || 0) + 1; webmailIncidentCount++; break;
          /* 'other' → no bucket bump */
        }
      }

      if (i.released_incident === true) releasedCount++;
      if (i.ignored_incidents === true) ignoredCount++;
      const stU = statusRaw.toUpperCase().replace(/\s+/g, '_');
      if (stU === 'FALSE_POSITIVE') falsePositiveCount++;

      /* Source-derived rollups. The /incidents-by-ID path is the only one
         that flattens source[] into the top-level object, but the list
         path puts the first source under `source` — read both forms. */
      const src = i.source ?? (Array.isArray(i.sources) ? i.sources[0] : null);
      if (src) {
        /* CXO offender list — login_name preferred, then email handle. */
        const userLabel = String(src.login_name || '').trim()
          || (src.email_address ? String(src.email_address).split('@')[0].trim() : '');
        if (userLabel) userCounts[userLabel] = (userCounts[userLabel] || 0) + 1;
        if (src.risk_level && Number(src.risk_level) > 0) riskLevelPositiveCount++;
      }

      /* Forensic bytes. Prefer transaction_size, fall back to total_size. */
      const bytes = Number(i.transaction_size ?? i.total_size ?? 0);
      if (Number.isFinite(bytes) && bytes > 0) {
        totalForensicBytes += bytes;
        if (sevKey) forensicBytesBySeverity[sevKey] += bytes;
      }

      /* SLA breach check — NEW / IN_PROCESS older than 24h. incident_time
         arrives as "dd/MM/yyyy HH:mm:ss"; parse defensively so a bad
         value never throws inside the loop. */
      if (
        i.incident_time &&
        (stU === 'NEW' || stU === 'IN_PROCESS')
      ) {
        const [datePart, timePart] = String(i.incident_time).split(' ');
        if (datePart && timePart) {
          const [d, mo, y] = datePart.split('/');
          const incidentDate = new Date(`${y}-${mo}-${d}T${timePart}`);
          if (!Number.isNaN(incidentDate.getTime()) && (Date.now() - incidentDate.getTime()) > 86400000) {
            slaBreachCount++;
          }
        }
      }
    }

    const topN = (m, n = 10) =>
      Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([label, count]) => ({ label, count }));

    const ms = Date.now() - started;
    res.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      serverBaseUrl: baseUrl,
      latencyMs: ms,
      windowDays: days,
      dlpVersion: deployJson.dlp_version || '',
      deploymentStatus: deployJson.deployment_status || 'UNKNOWN',
      enabledDlpPolicies: Number(polDlpJson.total_enabled_policies ?? (polDlpJson.enabled_policies?.length ?? 0)),
      enabledDiscoveryPolicies: Number(polDiscJson.total_enabled_policies ?? (polDiscJson.enabled_policies?.length ?? 0)),
      enabledDlpPolicyNames: Array.isArray(polDlpJson.enabled_policies) ? polDlpJson.enabled_policies.slice(0, 50) : [],
      totalIncidents: incidents.length,
      bySeverity,
      byAction,
      byChannel,
      byStatus,
      byEndpointType,
      byDetectedBy,
      topPolicies: topN(policyCounts, 10),
      topDestinations: topN(destCounts, 10),
      topUsers:        topN(userCounts, 10),
      topGenAiApps:    topN(genaiCounts, 10),
      topSaasApps:     topN(saasCounts, 10),
      topWebmail:      topN(webmailCounts, 10),
      genAiIncidentCount: genaiIncidentCount,
      saasIncidentCount:  saasIncidentCount,
      webmailIncidentCount,
      totalForensicBytes,
      forensicBytesBySeverity,
      releasedIncidentCount: releasedCount,
      falsePositiveCount,
      ignoredCount,
      riskLevelPositiveCount,
      slaBreachCount,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      message: describeDlpFetchError(err),
      latencyMs: Date.now() - started,
    });
  }
});

/* ─────────────────────────────────────────────────────────────────
   Customer Connector — heartbeat + status
   ───────────────────────────────────────────────────────────────────
   When the customer-side connector boots, it phones home here with its
   token. We track liveness in memory; the wizard's Step 3 Customer
   Connector card polls /status every 5s to flip an ONLINE/OFFLINE pill.

   Iteration 1: no job dispatch / no payload encryption yet — just the
   identity + liveness handshake. Job-queue and AES-256-GCM decryption
   will land alongside the connector binary in a future iteration.

   Stored in process memory; restart wipes it. That's fine — the
   connector will phone home again within its heartbeat interval.
───────────────────────────────────────────────────────────────── */

/** @type {Map<string, {firstSeen: string, lastSeen: string, lastIp: string|null, total: number, version: string|null, rejected: number, lastRejectedAt: string|null, lastRejectedIp: string|null}>} */
const connectorState = new Map();

/* Per-token IP allowlist — populated by the wizard's
   `/api/connector/register` call. Empty / absent means "any IP". A
   non-empty value can be a single IP (`213.74.55.10`) or CIDR
   (`213.74.55.0/24`). The heartbeat handler enforces this strictly:
   non-matching beats are rejected with 403 and counted under
   `connectorState[token].rejected`. */
/** @type {Map<string, string>} */
const connectorAllowlist = new Map();

/* Heartbeat freshness window. The connector beats every 30s; we treat
   anything < 90s as ONLINE so a single missed beat doesn't flap. */
const CONNECTOR_ONLINE_WINDOW_MS = 90 * 1000;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = (typeof xff === 'string' && xff.length > 0)
    ? xff.split(',')[0].trim()
    : (req.ip || req.socket?.remoteAddress || null);
  /* IPv4-mapped IPv6 addresses come through Node as `::ffff:1.2.3.4`.
     Strip the prefix so allowlist comparisons against plain IPv4
     entries work as the operator typed them. */
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

/* IPv4 + CIDR matcher. Returns true when `allowed` is empty (no
   restriction), or when `clientIp` matches the literal IP or falls
   inside the CIDR block. IPv6 support is best-effort — exact-match
   only; CIDR for v6 returns false. */
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0; /* unsigned */
}

function ipMatchesAllowlist(clientIpStr, allowed) {
  if (!allowed || !clientIpStr) return true;
  const allowedTrim = allowed.trim();
  if (!allowedTrim) return true;

  /* IPv4 / CIDR fast path */
  if (allowedTrim.includes('/')) {
    const [base, prefixStr] = allowedTrim.split('/');
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const baseInt = ipv4ToInt(base);
    const clientInt = ipv4ToInt(clientIpStr);
    if (baseInt === null || clientInt === null) return false;
    if (prefix === 0) return true; /* 0.0.0.0/0 — wildcard */
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (baseInt & mask) === (clientInt & mask);
  }
  return allowedTrim === clientIpStr;
}

/* POST /api/connector/register
   Body: { token: string, allowedSourceIp?: string }
   The wizard calls this whenever the operator sets / changes the
   token or the allowed-source-IP. Companion stores the allowlist
   per-token in memory; subsequent heartbeats are validated against
   it. Empty `allowedSourceIp` clears the restriction for that token.

   Idempotent — safe to re-call after a wizard refresh or server
   restart (the companion's in-memory map is wiped on restart, so the
   wizard re-pushes the allowlist on every page open). */
app.post('/api/connector/register', (req, res) => {
  const { token, allowedSourceIp } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const ip = typeof allowedSourceIp === 'string' ? allowedSourceIp.trim() : '';
  if (ip) connectorAllowlist.set(token, ip);
  else    connectorAllowlist.delete(token);
  res.json({ ok: true, token: token.slice(0, 8) + '…', allowedSourceIp: ip || null });
});

/* POST /api/connector/deregister
   Body: { token: string }
   Wipes ALL server-side state for the given token — both the
   allowlist entry AND the heartbeat / liveness record. After
   deregistration, any heartbeat arriving with that token will be
   treated as a brand-new connector (no allowlist enforcement until
   register is called again).

   The wizard calls this in two scenarios:
     (a) operator clicks "Regenerate token" → the OLD token is
         deregistered before the new one gets pushed via /register.
         Stops the deployed connector (still using the old token)
         from continuing to phone home.
     (b) operator clicks "Revoke connector access" → explicit
         tear-down. The deployed connector starts seeing 400
         "Missing token" on its next heartbeat… actually no, the
         token is still in its config, so it'll just look like a
         brand-new connector and start fresh. To truly disable, the
         SE must also rotate to a new token + redeploy. */
app.post('/api/connector/deregister', (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const hadState     = connectorState.delete(token);
  const hadAllowlist = connectorAllowlist.delete(token);
  res.json({
    ok: true,
    token: token.slice(0, 8) + '…',
    hadState,
    hadAllowlist,
  });
});

/* POST /api/connector/heartbeat
   Body: { token: string, version?: string, encrypted?: string }
   Connector calls this every 30s. Validates:
     1. Token is non-empty.
     2. Source IP matches the registered allowlist (if one exists).
   On allowlist mismatch the heartbeat is REJECTED with 403; the
   rejection is counted under connectorState so the wizard can show
   "X rejected attempts from <wrong IP>" diagnostic info. */
app.post('/api/connector/heartbeat', (req, res) => {
  const { token, version } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const ip = clientIp(req);
  const allowed = connectorAllowlist.get(token) ?? '';
  if (allowed && !ipMatchesAllowlist(ip, allowed)) {
    /* Track the rejection so the wizard's status pill can surface
       "wrong IP" attempts even though no successful heartbeat was
       recorded. lastSeen / total stay untouched — the token is still
       considered un-phoned-home as far as ONLINE/STALE is concerned. */
    const nowIso = new Date().toISOString();
    const prev = connectorState.get(token);
    connectorState.set(token, {
      firstSeen:        prev?.firstSeen        ?? nowIso,
      lastSeen:         prev?.lastSeen         ?? nowIso,
      lastIp:           prev?.lastIp           ?? null,
      total:            prev?.total            ?? 0,
      version:          prev?.version          ?? null,
      rejected:        (prev?.rejected         ?? 0) + 1,
      lastRejectedAt:   nowIso,
      lastRejectedIp:   ip,
    });
    return res.status(403).json({
      ok: false,
      message: `Source IP ${ip} not in allowlist (${allowed}).`,
    });
  }

  const nowIso = new Date().toISOString();
  const prev = connectorState.get(token);
  connectorState.set(token, {
    firstSeen:      prev?.firstSeen      ?? nowIso,
    lastSeen:       nowIso,
    lastIp:         ip,
    total:         (prev?.total          ?? 0) + 1,
    version:        typeof version === 'string' ? version : (prev?.version ?? null),
    rejected:       prev?.rejected       ?? 0,
    lastRejectedAt: prev?.lastRejectedAt ?? null,
    lastRejectedIp: prev?.lastRejectedIp ?? null,
  });
  res.json({ ok: true, recordedAt: nowIso });
});

/* GET /api/connector/status?token=...
   Wizard polls this every 5s for the status pill. */
app.get('/api/connector/status', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const st = connectorState.get(token);
  const allowed = connectorAllowlist.get(token) ?? null;
  if (!st) {
    /* Connector never phoned home — return the empty shape so the wizard
       still has a valid object to render. */
    return res.json({
      online: false,
      lastHeartbeatAt: null,
      secondsSinceLastHeartbeat: Number.POSITIVE_INFINITY,
      lastSourceIp: null,
      totalHeartbeats: 0,
      connectorVersion: null,
      registeredAllowedSourceIp: allowed,
      rejectedAttempts: 0,
      lastRejectedAt: null,
      lastRejectedIp: null,
    });
  }
  /* `lastSeen` may be a stale placeholder if only rejections have
     been recorded — only count online when at least one accepted
     heartbeat exists (total > 0) AND it's fresh. */
  const ageMs = Date.now() - new Date(st.lastSeen).getTime();
  const online = st.total > 0 && ageMs < CONNECTOR_ONLINE_WINDOW_MS;
  res.json({
    online,
    lastHeartbeatAt: st.total > 0 ? st.lastSeen : null,
    secondsSinceLastHeartbeat: st.total > 0 ? Math.floor(ageMs / 1000) : Number.POSITIVE_INFINITY,
    lastSourceIp: st.lastIp,
    totalHeartbeats: st.total,
    connectorVersion: st.version,
    registeredAllowedSourceIp: allowed,
    rejectedAttempts: st.rejected ?? 0,
    lastRejectedAt: st.lastRejectedAt ?? null,
    lastRejectedIp: st.lastRejectedIp ?? null,
  });
});

/* Tiny health probe so the wizard can tell "no server" from "server up
   but SQL refused". GET-only so a curl from the operator is trivial. */
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'forcepoint-hc-sql-companion', port: PORT });
});

/* ─────────────────────────────────────────────────────────────────
   Boot
   ───────────────────────────────────────────────────────────────────
   Bind to 0.0.0.0 explicitly — companion is reachable from any
   interface, not just loopback. Customer Connector phones home to the
   server's public IP:PORT directly (no nginx hop required). When
   HOST=127.0.0.1 is set in env, restrict to loopback only (dev mode
   or nginx-fronted deployments where 3001 should not be public).
───────────────────────────────────────────────────────────────── */
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Forcepoint HC companion listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/test       — SQL connection test');
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/query      — run a registered DLP report (sqlKey)');
  // eslint-disable-next-line no-console
  console.log(`  GET  /api/sql/queries    — list ${Object.keys(DLP_QUERIES).length} registered templates`);
  // eslint-disable-next-line no-console
  console.log('  POST /api/dlp/test       — DLP REST API connection test');
  // eslint-disable-next-line no-console
  console.log('  POST /api/dlp/posture    — fetch Information Security Posture summary');
  // eslint-disable-next-line no-console
  console.log('  POST /api/connector/register   — register per-token IP allowlist');
  // eslint-disable-next-line no-console
  console.log('  POST /api/connector/deregister — revoke a token + clear its state');
  // eslint-disable-next-line no-console
  console.log('  POST /api/connector/heartbeat  — Customer Connector ping-in');
  // eslint-disable-next-line no-console
  console.log('  GET  /api/connector/status    — Customer Connector liveness');
  // eslint-disable-next-line no-console
  console.log('  GET  /health             — liveness probe');
});

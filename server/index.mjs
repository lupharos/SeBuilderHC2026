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

/** @type {Map<string, {firstSeen: string, lastSeen: string, lastIp: string|null, total: number, version: string|null}>} */
const connectorState = new Map();

/* Heartbeat freshness window. The connector beats every 30s; we treat
   anything < 90s as ONLINE so a single missed beat doesn't flap. */
const CONNECTOR_ONLINE_WINDOW_MS = 90 * 1000;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

/* POST /api/connector/heartbeat
   Body: { token: string, version?: string, encrypted?: string }
   Connector calls this every 30s. We record the timestamp + source IP
   keyed on the token. `encrypted` is the AES-256-GCM job-result payload
   when the connector has work to report back; for the bare heartbeat
   it's absent. (Decryption + dispatch is iteration 2.) */
app.post('/api/connector/heartbeat', (req, res) => {
  const { token, version } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const nowIso = new Date().toISOString();
  const prev = connectorState.get(token);
  connectorState.set(token, {
    firstSeen: prev?.firstSeen ?? nowIso,
    lastSeen: nowIso,
    lastIp: clientIp(req),
    total: (prev?.total ?? 0) + 1,
    version: typeof version === 'string' ? version : (prev?.version ?? null),
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
    });
  }
  const ageMs = Date.now() - new Date(st.lastSeen).getTime();
  res.json({
    online: ageMs < CONNECTOR_ONLINE_WINDOW_MS,
    lastHeartbeatAt: st.lastSeen,
    secondsSinceLastHeartbeat: Math.floor(ageMs / 1000),
    lastSourceIp: st.lastIp,
    totalHeartbeats: st.total,
    connectorVersion: st.version,
  });
});

/* Tiny health probe so the wizard can tell "no server" from "server up
   but SQL refused". GET-only so a curl from the operator is trivial. */
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'forcepoint-hc-sql-companion', port: PORT });
});

/* ─────────────────────────────────────────────────────────────────
   Boot
───────────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Forcepoint HC companion listening on http://localhost:${PORT}`);
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
  console.log('  POST /api/connector/heartbeat — Customer Connector ping-in');
  // eslint-disable-next-line no-console
  console.log('  GET  /api/connector/status    — Customer Connector liveness');
  // eslint-disable-next-line no-console
  console.log('  GET  /health             — liveness probe');
});

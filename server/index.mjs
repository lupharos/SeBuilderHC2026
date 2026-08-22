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
import { DLP_QUERIES, WEB_QUERIES } from './queries.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import PptxGenJs from 'pptxgenjs';
import {
  registerUser, loginUser, logoutUser, resolveSession, extractToken,
  listUsers, setUserStatus, setUserRole, deleteUser, getAuthInfo,
  requireAuth, requireAdmin,
  verifyMfaChallenge, beginMfaEnrollment, confirmMfaEnrollment, cancelMfaEnrollment,
  disableMfa, regenerateBackupCodes, adminResetMfa,
  adminSetPassword, changeOwnPassword,
} from './auth.mjs';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());                // Vite dev server is on a different origin
/* Raised to 2MB to accommodate large DLP incident payloads (~595KB typical
   for a 30-day window with 10K incidents). Via-Connector job results can be
   large when the FSM returns full incident details. */
app.use(express.json({ limit: '2mb' }));

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
  const body = req.body ?? {};
  const { transport, connectorToken, product } = body;

  /* Via-Connector branch — connector executes the auth probe locally
     against the per-product `sql_*` block in its connector-secrets.json.
     Same body shape as direct mode plus { transport, connectorToken,
     product } — wizard sends the report's product so the connector
     picks the right secrets block. */
  if (transport === 'via-connector') {
    if (!connectorToken || typeof connectorToken !== 'string') {
      return res.status(400).json({ ok: false, message: 'Via-Connector SQL test requires connectorToken in body.' });
    }
    if (!connectorAllowlist.has(connectorToken)) {
      return res.status(404).json({ ok: false, message: 'Connector token not registered with companion.' });
    }
    /* Encryption key check removed — token-only security. */
    if (!isConnectorOnline(connectorToken)) {
      return res.status(503).json({ ok: false, message: 'Connector for this token is OFFLINE.' });
    }
    const jobId = enqueueJobInProcess(connectorToken, 'sql.test', { product: product || 'data' });
    const done = await awaitJobInProcess(jobId, 30_000);
    const ms = Date.now() - started;
    if (!done.ok) return res.status(400).json({ ok: false, message: done.error, latencyMs: ms });
    const p = done.payload || {};
    if (p.ok) {
      /* Keep the response message intentionally bland — the connector
         already sends "Authenticated" without the customer's host:port/
         db + SQL Server banner (per the no-leak requirement). We just
         add the via-connector tag so the operator knows which transport
         answered. The `server` object DOES carry banner details for
         the detected-server panel, but the wizard only renders the
         non-sensitive fields. */
      return res.json({
        ok: true,
        message: `Authenticated via connector (${ms} ms)`,
        server: p.server || {},
        latencyMs: ms,
      });
    }
    return res.status(400).json({ ok: false, message: p.message || 'Connector reported SQL test failure.', latencyMs: ms });
  }

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
  const allQueries = { ...DLP_QUERIES, ...WEB_QUERIES };
  const entries = Object.entries(allQueries).map(([sqlKey, q]) => ({
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
const WEB_DATABASE = 'wslogdb70';
const EMAIL_DATABASE = 'esglogdb76';

app.post('/api/sql/query', async (req, res) => {
  const started = Date.now();
  const { sqlKey, windowDays, topN, transport, connectorToken, product, ...connBody } = req.body ?? {};
  if (!sqlKey || typeof sqlKey !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing "sqlKey" in request body.' });
  }
  const template = DLP_QUERIES[sqlKey] || WEB_QUERIES[sqlKey];
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

  /* Via-Connector branch — companion resolves the SQL template here
     (keeps the catalogue server-side and the queries the same as
     direct mode), then hands the final SQL string + product code to
     the connector. The connector reads its own connector-secrets.json
     (sql_Data / sql_Web / sql_Email per product) and runs the query
     against the customer-local SQL Server. No customer credentials
     ever leave the customer host. */
  if (transport === 'via-connector') {
    if (!connectorToken || typeof connectorToken !== 'string') {
      return res.status(400).json({ ok: false, message: 'Via-Connector SQL query requires connectorToken in body.' });
    }
    if (!connectorAllowlist.has(connectorToken)) {
      return res.status(404).json({ ok: false, message: 'Connector token not registered with companion.' });
    }
    /* Encryption key check removed — token-only security. */
    if (!isConnectorOnline(connectorToken)) {
      return res.status(503).json({ ok: false, message: 'Connector for this token is OFFLINE.' });
    }
    const sqlText = template.sql({ days: effectiveDays, topN: effectiveTopN });
    /* DLP queries assume the connection is already pinned to
       wbsn-data-security; the connector's sql_Data secrets block has
       that database baked in, so the product mapping handles it
       implicitly. Web / Email products use their own DBs. */
    const jobProduct = (typeof product === 'string' && product) ? product : (sqlKey.startsWith('dlp_') ? 'data' : sqlKey.startsWith('web_') ? 'web' : sqlKey.startsWith('email_') ? 'email' : 'data');
    const jobId = enqueueJobInProcess(connectorToken, 'sql.query', { product: jobProduct, sql: sqlText, sqlKey });
    const done = await awaitJobInProcess(jobId, 90_000);
    const ms = Date.now() - started;
    if (!done.ok) {
      return res.status(400).json({
        ok: false,
        sqlKey,
        windowDays: effectiveDays,
        topN: effectiveTopN,
        message: done.error || 'Connector reported SQL query failure.',
        latencyMs: ms,
      });
    }
    /* Success case: done.ok === true, so done.payload has the result */
    const p = done.payload || {};
    return res.json({
      ok: true,
      sqlKey,
      title: template.title,
      description: template.description,
      windowDays: effectiveDays,
      topN: effectiveTopN,
      rowCount: p.rowCount ?? (Array.isArray(p.rows) ? p.rows.length : 0),
      latencyMs: ms,
      rows: p.rows || [],
    });
  }

  let pool = null;
  try {
    /* DLP queries are pinned to wbsn-data-security regardless of what the
       caller passed in — keeps the connection scoped to the only DB these
       templates know about. */
    /* Force database based on query type (sqlKey prefix).
       - dlp_*: force to wbsn-data-security (Data Security database)
       - web_*: force to wslogdb70 (Web Security database)
       - email_*: force to esglogdb76 (Email Security database)
       This ensures each report runs against its correct database, regardless
       of what the caller provided. */
    let effectiveDb;
    if (sqlKey.startsWith('dlp_')) {
      effectiveDb = DLP_DATABASE;
    } else if (sqlKey.startsWith('web_')) {
      effectiveDb = WEB_DATABASE;
    } else if (sqlKey.startsWith('email_')) {
      effectiveDb = EMAIL_DATABASE;
    } else {
      /* Fallback to caller-provided database (for custom queries). */
      effectiveDb = connBody.database;
    }
    const cfg = buildSqlConfig({ ...connBody, database: effectiveDb });
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

/* Wraps a `dlp.fetch` job result so the posture aggregator (which was
   written against Response objects) keeps working unchanged. The
   connector returns `{ ok, status, body }` already-parsed-as-JSON
   when the call succeeded, or `{ ok: false, error }` when the
   connector itself failed (TLS, connection refused, etc). We mirror
   the fields the aggregator touches: `.ok`, `.status`, `.json()`,
   `.text()`. */
function makeResponseShimFromJobPayload(payload) {
  if (!payload || payload.ok === false) {
    const err = (payload && payload.error) || 'Via-Connector job returned failure.';
    return {
      ok: false,
      status: 0,
      _viaConnectorError: err,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(err),
    };
  }
  const httpOk = payload.status >= 200 && payload.status < 300;
  return {
    ok: httpOk,
    status: payload.status,
    json: () => Promise.resolve(payload.body),
    text: () => Promise.resolve(
      typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body),
    ),
  };
}

/**
 * Transport-aware DLP REST API call.
 *   ctx.mode = 'direct'         → companion fetches customer FSM with ctx.accessToken Bearer
 *   ctx.mode = 'via-connector'  → enqueue `dlp.fetch` job for ctx.connectorToken, await result
 *
 * Returns a Response (direct) or a Response-shaped shim (via-connector)
 * so callers can use `.ok` / `.status` / `.json()` uniformly. The
 * companion's posture aggregator stays untouched modulo the ctx
 * wiring.
 */
async function dlpFetchVia(ctx, path, init = {}, timeoutMs = 30000) {
  if (ctx.mode === 'direct') {
    return dlpFetch(ctx.baseUrl, ctx.accessToken, path, init, timeoutMs);
  }
  /* Via-Connector path. The connector handles its own Bearer token —
     we just hand it the relative path + method + body. JSON-decode
     the body when it's a pre-stringified payload so the connector
     can re-serialise cleanly with the correct Content-Type. */
  const method = (init.method || 'GET').toUpperCase();
  let body = init.body ?? null;
  if (typeof body === 'string' && body.length > 0) {
    try { body = JSON.parse(body); } catch { /* keep raw string */ }
  }
  const jobId = enqueueJobInProcess(ctx.connectorToken, 'dlp.fetch', {
    path,
    method,
    body,
    timeout: Math.max(10, Math.round(timeoutMs / 1000)),
  });
  /* Give the connector the full timeout PLUS a 10s buffer for the
     job round-trip itself before we synthesise a failure. */
  const done = await awaitJobInProcess(jobId, timeoutMs + 10000);
  if (!done.ok) {
    return makeResponseShimFromJobPayload({ ok: false, error: done.error });
  }
  return makeResponseShimFromJobPayload(done.payload);
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
   probe. Returns DLP version + deployment status on success.

   Transport modes (Stage 3 of the Via-Connector rollout):
     • Default (no transport / 'direct')  — companion dials the
       customer FSM with the credentials in req.body, same as
       before this rollout.
     • transport='via-connector' + connectorToken — the wizard's
       way of telling us to route the probe through the customer
       Connector .exe instead. We don't need credentials here; the
       connector has its own connector-secrets.json with whatever
       creds the customer entered. We just enqueue a `dlp.test`
       job, wait for the result, and return it in the same shape
       the direct branch produces. */
app.post('/api/dlp/test', async (req, res) => {
  const started = Date.now();
  const body = req.body ?? {};
  const { url, username = '', password = '', transport, connectorToken } = body;

  /* Via-Connector branch — connector executes the probe on its end. */
  if (transport === 'via-connector') {
    if (!connectorToken || typeof connectorToken !== 'string') {
      return res.status(400).json({ ok: false, message: 'Via-Connector test requires connectorToken in body.' });
    }
    if (!connectorAllowlist.has(connectorToken)) {
      return res.status(404).json({ ok: false, message: 'Connector token not registered with companion.' });
    }
    /* Encryption key check removed — token-only security. */
    if (!isConnectorOnline(connectorToken)) {
      return res.status(503).json({ ok: false, message: 'Connector for this token is OFFLINE.' });
    }
    const jobId = enqueueJobInProcess(connectorToken, 'dlp.test', null);
    const done = await awaitJobInProcess(jobId, 30_000);
    const ms = Date.now() - started;
    if (!done.ok) return res.status(400).json({ ok: false, message: done.error, latencyMs: ms });
    const p = done.payload || {};
    if (p.ok) {
      return res.json({
        ok: true,
        message: `Authenticated via connector · ${p.message || ''} · ${ms} ms`,
        latencyMs: ms,
      });
    }
    return res.status(400).json({ ok: false, message: p.message || 'Connector reported failure.', latencyMs: ms });
  }

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
    'copilot.microsoft','copilot.com','m365.cloud.microsoft',
    'github.com','github.copilot',
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
    'character.com',
    'chat.deepseek.com',
    'x.ai','grok.com','grok.x.ai',
    'blackbox.ai',
    'phind.com','phind.ai',
    'bolt.new','lovable.dev','v0.dev',
    'vercel.ai','sdk.vercel.ai',
    'cody.dev','sourcegraph.com',
    'tabnine.com','tabnine',
    'codeium.com','windsurf.ai','continue.dev',
    'kagi.com',
    'fireworks.a.','together.ai','replicate.com',
    'leonardo.ai','ideogram.ai','playgroundai.com',
    'canva.com','clipdrop.co',
    'suno.ai','udio.com','elevenlabs.io',
    'heygen.com','synthesia.io','pika.art',
    'gamma.app','beautiful.ai','tome.app',
    'otter.ai','harvey.ai','glean.com','reka.ai',
    'openrouter.ai','groq.com','groqcloud.com','cerebras.ai','novita.ai',
    'anythingllm.com','jan.ai','lmstudio.ai','ollama.com',
    'flowiseai.com','langchain.com','langchain.dev','langsmith.com',
    'dust.tt','mem.ai','taskade.com','clickup.com',
    'slack.com','zoom.ai',
    'grammarly.com','deepl.com','wordtune.com','sudowrite.com','copy.ai',
  ],
  saas: [
    'drive.google','docs.google',
    'dropbox',
    'box.com','app.box',
    'sharepoint','sharepoint.com',
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
    'amazon','amazonaws.com','s3.amazonaws',
    'azure','blob.core.windows',
    'gcs.com','storage.googleapis',
    'limewire.com',
    'workspace.google',
    'storage.googleapis.com','s3.amazonaws.com','blob.core.windows.net',
    'sharefile.com','citrixsharefile',
    'egnyte.com','box.net',
    'we.tl','file.io','sendspace.com','transfernow.net',
    'gofile.io','pixeldrain.com','ufile.io','wormhole.app',
    'krakenfiles.com','anonfiles','catbox.moe',
    'zippyshare','4shared.com','rapidgator.net','nitroflare.com',
    'uploaded.net','depositfiles',
    'filemail.com','smash.gg','fromsmash.com',
    'backblaze.com','digitaloceanspaces.com','wasabi.com',
    'r2.cloudflarestorage.com','cloudflare',
    'nextcloud','owncloud','synology',
    'disk.yandex',
    'mediafireusercontent','googleusercontent','drive.usercontent.google',
  ],
  webmail: [
    'gmail.com','mail.google',
    'outlook.live','outlook.com','hotmail.com',
    'yahoo.mail','mail.yahoo',
    'protonmail.com','proton.me',
    'tutanota','tuta.com',
    'zoho.mail','mail.zoho',
    'gmx.com','gmx.net',
    'yandex.mail','mail.yandex',
    'aol.com',
    'fastmail.com',
    'mail.ru',
    'live.com','msn.com','icloud.com','mail.com',
    'qq.com','163.com','126.com','naver.com',
    'inbox.lv','seznam.cz','laposte.net','rediffmail.com',
    'hushmail.com','posteo.de','runbox.com','mailfence.com',
    'disroot.org','hey.com','cock.li','zohomail.com',
    'webmail.','owa.','roundcube','squirrelmail','rainloop',
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
  const {
    url,
    username = '',
    password = '',
    windowDays = 30,
    patterns,
    /* Transport selection (Stage 3 of the Via-Connector rollout).
       Default 'direct' so existing wizards that don't send the field
       keep their current behavior. */
    transport = 'direct',
    connectorToken,
  } = req.body ?? {};
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
    /* Build the transport context. Direct mode still requires the
       creds + url from the wizard's apiConnectors.dlpApi entry;
       Via-Connector mode never sees those — the connector reads its
       own connector-secrets.json on the customer host. */
    let ctx;
    if (transport === 'via-connector') {
      if (!connectorToken || typeof connectorToken !== 'string') {
        return res.status(400).json({ ok: false, message: 'Via-Connector posture fetch requires connectorToken in body.' });
      }
      if (!connectorAllowlist.has(connectorToken)) {
        return res.status(404).json({ ok: false, message: 'Connector token not registered with companion.' });
      }
      /* Encryption key check removed — token-only security model. */
      if (!isConnectorOnline(connectorToken)) {
        return res.status(503).json({ ok: false, message: 'Connector for this token is OFFLINE.' });
      }
      ctx = { mode: 'via-connector', connectorToken };
    } else {
      if (!username || !password) {
        throw new Error('DLP REST API requires Application Administrator username + password.');
      }
      const baseUrl = normaliseDlpBaseUrl(url);
      const token = await getDlpAccessToken({ baseUrl, username, password });
      ctx = { mode: 'direct', baseUrl, accessToken: token };
    }

    /* dd/MM/yyyy HH:mm:ss is the format /incidents expects per the spec. */
    const fmtDlpDate = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    /* Three independent fetches in parallel: deploy/status, enabled-names
       (DLP + DISCOVERY), and the incident window. /incidents tops out at
       10K rows per spec section 2.1; we request DLP type only (DISCOVERY
       would be a separate call but isn't included in the posture dashboard
       for v1). For large deployments (>10K incidents in window), the
       response will be truncated—consider filtering to a shorter window
       or raising this with Forcepoint Support for pagination.
       Same call shape in both transport modes — `dlpFetchVia` hides
       the routing decision so the aggregator below stays oblivious. */
    const [deployRes, polDlpRes, polDiscRes, incRes] = await Promise.all([
      dlpFetchVia(ctx, '/deploy/status'),
      dlpFetchVia(ctx, '/policy/enabled-names?type=DLP'),
      dlpFetchVia(ctx, '/policy/enabled-names?type=DISCOVERY'),
      dlpFetchVia(ctx, '/incidents', {
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
       NOT surfaced — those remain under the parser-side redaction rule.

       NOTE: If incidents.length === 10000, the API response was likely
       truncated (per spec section 2.1, /incidents returns max 10K rows).
       In that case, topDestinations/topPolicies counts are incomplete. */
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

    /* Track which policies produced incidents — so we can surface
       never-used policies as a policy audit recommendation. */
    const usedPolicies = new Set();

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
         double-counted against a phantom combined label. Track which
         policies are actually being used so we can surface never-used ones. */
      if (i.policies) {
        for (const p of String(i.policies).split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
          policyCounts[p] = (policyCounts[p] || 0) + 1;
          usedPolicies.add(p);
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

    /* Never-Used Policies: enabled but generated 0 incidents in the window.
       This is a policy audit finding — unused policies should be reviewed
       for misconfig or unnecessary overhead. */
    const enabledDlpPoliciesList = Array.isArray(polDlpJson.enabled_policies)
      ? polDlpJson.enabled_policies
      : [];
    const neverUsedPolicies = enabledDlpPoliciesList.filter(p => !usedPolicies.has(p));

    const ms = Date.now() - started;
    res.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      /* serverBaseUrl is meaningful only in direct mode; under
         via-connector the FSM URL lives on the customer host and we
         never see it. Replace with a transport tag so the report's
         "fetched from" caption stays informative either way. */
      serverBaseUrl: ctx.mode === 'direct' ? ctx.baseUrl : `via-connector://${connectorToken.slice(0, 8)}…`,
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
      /* Policy Audit: Never-Used Policies */
      enabledDlpPoliciesCount: enabledDlpPoliciesList.length,
      usedDlpPoliciesCount: usedPolicies.size,
      neverUsedDlpPoliciesCount: neverUsedPolicies.length,
      neverUsedDlpPoliciesList: neverUsedPolicies,
      neverUsedPoliciesWindowDays: days,
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

/** @type {Map<string, {firstSeen: string, lastSeen: string, lastIp: string|null, total: number, version: string|null, rejected: number, lastRejectedAt: string|null, lastRejectedIp: string|null, selftest: {sqlData: object|null, sqlWeb: object|null, sqlEmail: object|null, sql: object|null, dlpApi: object|null}|null}>} */
const connectorState = new Map();

/* Per-token IP allowlist — populated by the wizard's
   `/api/connector/register` call. Empty / absent means "any IP". A
   non-empty value can be a single IP (`213.74.55.10`) or CIDR
   (`213.74.55.0/24`). The heartbeat handler enforces this strictly:
   non-matching beats are rejected with 403 and counted under
   `connectorState[token].rejected`. */
/** @type {Map<string, string>} */
const connectorAllowlist = new Map();

/* Per-token AES-256-GCM symmetric key, hex-encoded (64 chars = 32
   bytes). Pushed by the wizard via /api/connector/register the same
   moment the operator generates the connector.json bundle, so the
   companion can decrypt job results coming back from the connector
   .exe. Stored in RAM only — wiped on process restart, which forces
   the wizard to re-register on every page reload (already the
   existing behavior). */
/** @type {Map<string, string>} */
const connectorKeys = new Map();

/* Heartbeat freshness window. The connector beats every 30s; we treat
   anything < 90s as ONLINE so a single missed beat doesn't flap. */
const CONNECTOR_ONLINE_WINDOW_MS = 90 * 1000;

/* ─────────────────────────────────────────────────────────────────
   Job queue for "Via Connector" DLP REST API mode
   ───────────────────────────────────────────────────────────────────
   The Customer Connector is outbound-only — it phones home, the
   companion never initiates a TCP connection to it. So when the
   wizard wants the connector to execute a customer-side DLP API call
   (test, posture fetch, report run), we can't push; we have to wait
   for the connector to pull. Mechanics:

     1. Wizard POST /api/connector/job/queue
          → companion creates jobId, pushes to pendingJobs[token],
            and immediately resolves any waiting connector long-poll.
     2. Connector GET /api/connector/job/next?token=X  (long-poll, 25s)
          → if pending exists: pop & return as plaintext JSON
          → if empty: park as a waiter; resolve when a job arrives,
            else 204 No Content after 25s.
     3. Connector POST /api/connector/job/result
          → body carries an AES-256-GCM envelope produced with the
            connector's own symmetric key; companion decrypts using
            connectorKeys[token] and stashes the plaintext result.
     4. Wizard GET /api/connector/job/result?jobId=Y  (short-poll, 2s)
          → returns { status: 'pending' } until the result lands,
            then { ok, payload } / { ok: false, error }.

   Each map below keys on a different identifier (token vs jobId) so
   we don't have to walk the world to find work. */

/** Token → ordered list of jobs not yet picked up by /next. FIFO. */
const pendingJobs = new Map(); // Map<string, Array<JobRecord>>
/** jobId → JobRecord after /next handed it out, before /result lands. */
const inflightJobs = new Map(); // Map<string, JobRecord>
/** jobId → { ok, payload?, error?, completedAt } once /result arrives.
    Wizard polls /api/connector/job/result?jobId=... to drain. */
const completedJobs = new Map(); // Map<string, CompletedRecord>
/** Token → array of long-poll waiters parked on /next. Each entry
    carries a resolve fn the queue endpoint pops when a job arrives. */
const jobWaiters = new Map(); // Map<string, Array<{ resolve, timer }>>

/* Limits — defense against runaway clients / disconnected connectors.
     • PENDING_QUEUE_MAX: hard cap on pending jobs per token. Excess
       /queue requests get 503 instead of growing without bound.
     • PENDING_JOB_TTL_MS:  jobs older than this in pendingJobs get
       garbage-collected as "stale — no connector". The wizard's
       GET /result will see them as errored.
     • COMPLETED_JOB_TTL_MS: completed jobs are kept around for the
       wizard to drain, then dropped.
     • LONG_POLL_MS: how long /next holds the request open. nginx
       proxy_read_timeout in deploy.sh is 75s, so 25s gives plenty
       of headroom. */
const PENDING_QUEUE_MAX     = 64;
const PENDING_JOB_TTL_MS    = 2  * 60 * 1000; // 2 min
const COMPLETED_JOB_TTL_MS  = 5  * 60 * 1000; // 5 min
const LONG_POLL_MS          = 25 * 1000;

/**
 * @typedef {Object} JobRecord
 * @property {string} jobId
 * @property {string} token
 * @property {string} kind        // 'dlp.test' | 'dlp.posture' | 'dlp.report'
 * @property {any}    params      // plaintext — params themselves aren't sensitive
 * @property {number} createdAt   // Date.now()
 */

/**
 * @typedef {Object} CompletedRecord
 * @property {boolean} ok
 * @property {any}     [payload]  // decrypted plaintext from the connector
 * @property {string}  [error]
 * @property {number}  completedAt
 */

/* ─── AES-256-GCM envelope ───────────────────────────────────────
   Connector sends results wrapped as { iv, ct, tag } (all hex).
   Key is hex-encoded 32 bytes from the connector.json bundle.
   GCM gives confidentiality + integrity in one shot, which matches
   what the bundle already advertises (`encryptionAlgorithm: 'AES-256-GCM'`). */

/**
 * Decrypt a {iv, ct, tag} envelope produced by the connector.
 * Returns the parsed JSON object, or throws Error with a stable
 * message on any tag mismatch / malformed input.
 */
function decryptEnvelope(envelope, keyHex) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('decryptEnvelope: not an object');
  }
  const { iv, ct, tag } = envelope;
  if (typeof iv !== 'string' || typeof ct !== 'string' || typeof tag !== 'string') {
    throw new Error('decryptEnvelope: iv/ct/tag must all be hex strings');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('decryptEnvelope: key must be 64 hex chars');
  }
  const key   = Buffer.from(keyHex, 'hex');
  const ivBuf = Buffer.from(iv,  'hex');
  const ctBuf = Buffer.from(ct,  'hex');
  const tagBuf= Buffer.from(tag, 'hex');
  /* AES-GCM IV must be 12 bytes; reject anything else so we fail
     fast instead of silently miscomputing. */
  if (ivBuf.length !== 12) throw new Error('decryptEnvelope: iv must be 12 bytes (24 hex chars)');
  if (tagBuf.length !== 16) throw new Error('decryptEnvelope: tag must be 16 bytes (32 hex chars)');
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const plainBuf = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
  const plainStr = plainBuf.toString('utf8');
  try {
    return JSON.parse(plainStr);
  } catch {
    /* The connector should always send JSON; if it didn't, bubble up
       the raw string so the operator can see what arrived. */
    throw new Error(`decryptEnvelope: payload is not valid JSON: ${plainStr.slice(0, 80)}…`);
  }
}

/**
 * Mostly a debugging hook — in Stage 3 the wizard could optionally
 * encrypt request params before queueing for end-to-end secrecy.
 * Currently unused (params are non-sensitive plaintext), but exposed
 * for symmetry + future use.
 * @returns {{ iv: string, ct: string, tag: string }}
 */
// eslint-disable-next-line no-unused-vars
function encryptEnvelope(plaintextObj, keyHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('encryptEnvelope: key must be 64 hex chars');
  }
  const key   = Buffer.from(keyHex, 'hex');
  const iv    = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([cipher.update(JSON.stringify(plaintextObj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex') };
}

/* Connector liveness probe used by the /queue endpoint to refuse
   work when nobody's home — the operator gets an immediate 503
   instead of wizard-side polling that never resolves. Mirrors the
   logic in GET /api/connector/status: heartbeats land as an ISO
   string in `state.lastSeen` (not `lastHeartbeatAt`, which was the
   name I used in an earlier draft and which doesn't exist on the
   actual record). The total > 0 guard catches the
   "registered-but-no-successful-beat-yet" case where the state row
   exists only because an allowlist-rejected beat created it. */
function isConnectorOnline(token) {
  const state = connectorState.get(token);
  if (!state || !state.lastSeen || !state.total) return false;
  const ageMs = Date.now() - new Date(state.lastSeen).getTime();
  return Number.isFinite(ageMs) && ageMs < CONNECTOR_ONLINE_WINDOW_MS;
}

/* In-process job enqueue for use by other endpoints (e.g. /api/dlp/posture
   in Via-Connector mode). Skips the HTTP loopback the wizard goes
   through; mutates the same Maps the /queue endpoint would have, so
   subsequent /next + /result still work normally. Caller MUST verify
   token registration / online state / key presence — we don't repeat
   those checks here because the caller already has richer context
   (e.g. posture knows its `connectorToken` came from a logged-in
   wizard, no need to 404 it). */
function enqueueJobInProcess(connectorToken, kind, params) {
  const job = {
    jobId: randomUUID(),
    token: connectorToken,
    kind,
    params: params ?? null,
    createdAt: Date.now(),
  };
  const queue = pendingJobs.get(connectorToken) ?? [];
  queue.push(job);
  pendingJobs.set(connectorToken, queue);
  flushWaiters(connectorToken);
  return job.jobId;
}

/* Wait for a job result to land in completedJobs and drain it.
   Companion-internal counterpart of the wizard's runJobViaConnector
   polling loop. Polls every 200ms (we're in the same process — no
   HTTP cost) up to `timeoutMs`. */
async function awaitJobInProcess(jobId, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const done = completedJobs.get(jobId);
    if (done) {
      completedJobs.delete(jobId);
      return done; // { ok, payload? | error? }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: false, error: `awaitJobInProcess: job ${jobId} timed out after ${timeoutMs / 1000}s.` };
}

/* Resolve all waiters parked on /next for a given token. Returns the
   number of waiters that got served. Caller is responsible for
   ensuring there's actually a job to hand them — typically called
   right after a /queue push has appended to pendingJobs. */
function flushWaiters(token) {
  const waiters = jobWaiters.get(token);
  if (!waiters || waiters.length === 0) return 0;
  const pending = pendingJobs.get(token);
  if (!pending || pending.length === 0) return 0;
  let served = 0;
  while (waiters.length > 0 && pending.length > 0) {
    const job = pending.shift();
    const w = waiters.shift();
    clearTimeout(w.timer);
    w.resolve(job);
    served++;
  }
  if (waiters.length === 0) jobWaiters.delete(token);
  if (pending.length === 0) pendingJobs.delete(token);
  return served;
}

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
   Body: { token: string }
   Register the connector token. Security is provided by token + HTTPS.
   No IP allowlist or encryption key needed — the interactive connector
   .exe asks for all configuration at runtime.

   Idempotent — safe to re-call after a wizard refresh. */
app.post('/api/connector/register', (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  /* Register token with no IP restriction — security is token-only. */
  connectorAllowlist.set(token, '');
  res.json({
    ok: true,
    token: token.slice(0, 8) + '…',
  });
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
  /* Also wipe Via-Connector state: the encryption key (so old results
     can't be decrypted post-revoke) and any pending jobs (so a freshly
     deployed connector with the same token doesn't accidentally pick
     up work queued for the previous one). Long-poll waiters are
     resolved with null — the connector .exe sees an empty response
     and re-polls, by which point the token has no entry and it'll
     just keep heartbeating fresh. Inflight / completed jobs are
     left alone — their TTL gc handles cleanup. */
  connectorKeys.delete(token);
  pendingJobs.delete(token);
  const waiters = jobWaiters.get(token);
  if (waiters && waiters.length > 0) {
    for (const w of waiters) { clearTimeout(w.timer); w.resolve(null); }
    jobWaiters.delete(token);
  }
  res.json({
    ok: true,
    token: token.slice(0, 8) + '…',
    hadState,
    hadAllowlist,
  });
});

/* POST /api/connector/heartbeat
   Body: { token: string, version?: string, encrypted?: string }
   Connector calls this every 30s. Validates in this order:
     1. Token is non-empty                          → 400 if missing
     2. Token has been registered by the wizard     → 401 if unknown
     3. Source IP matches the registered allowlist  → 403 if mismatch
   The "registered token" requirement is the symmetry with the wizard:
   if the wizard doesn't currently know about a token (operator never
   set it, or rotated it, or disabled the connector entirely), the
   server refuses heartbeats from it. Without this rule, any random
   token would be silently accepted and a stale `connector.json` from
   a previous engagement would keep working forever. */
app.post('/api/connector/heartbeat', (req, res) => {
  const { token, version } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  const ip = clientIp(req);

  /* Whitelist check — token MUST have been registered via
     /api/connector/register first. Otherwise reject with 401 and
     don't pollute connectorState with random-token entries. */
  if (!connectorAllowlist.has(token)) {
    return res.status(401).json({
      ok: false,
      message: 'Token not registered with this server. The wizard must register the token before heartbeats are accepted.',
    });
  }

  /* IP allowlist removed — security is token-only. */

  const nowIso = new Date().toISOString();
  const prev = connectorState.get(token);
  /* Capture the selftest snapshot the connector includes with every
     heartbeat. Shape (v2 schema — three discrete SQL probes + DLP API):
       { sqlData:  {status, message, latencyMs, checkedAt} | null,
         sqlWeb:   ... | null,
         sqlEmail: ... | null,
         dlpApi:   ... | null,
         sql:      ... | null  (legacy v1 field, kept for back-compat) }
     The connector re-runs selftests every 5 minutes, so the freshest
     state always lands here within 30s + 5m of any change. We pass
     through every known field verbatim — adding `sqlData/sqlWeb/sqlEmail`
     here is what makes the wizard see all three SQL DBs. */
  const incomingSelftest = (req.body ?? {}).selftest;
  const selftest = (incomingSelftest && typeof incomingSelftest === 'object')
    ? {
        sqlData:  incomingSelftest.sqlData  ?? null,
        sqlWeb:   incomingSelftest.sqlWeb   ?? null,
        sqlEmail: incomingSelftest.sqlEmail ?? null,
        sql:      incomingSelftest.sql      ?? null,
        dlpApi:   incomingSelftest.dlpApi   ?? null,
      }
    : (prev?.selftest ?? null);

  connectorState.set(token, {
    firstSeen:      prev?.firstSeen      ?? nowIso,
    lastSeen:       nowIso,
    lastIp:         ip,
    total:         (prev?.total          ?? 0) + 1,
    version:        typeof version === 'string' ? version : (prev?.version ?? null),
    rejected:       prev?.rejected       ?? 0,
    lastRejectedAt: prev?.lastRejectedAt ?? null,
    lastRejectedIp: prev?.lastRejectedIp ?? null,
    selftest,
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
      selftest: null,
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
    selftest: st.selftest ?? null,
  });
});

/* ─────────────────────────────────────────────────────────────────
   "Via Connector" job-queue endpoints
   ───────────────────────────────────────────────────────────────────
   See block comment near `pendingJobs` for the protocol overview.
   These four endpoints form a job-pull RPC layer on top of the
   connector's outbound-only heartbeat channel. */

/* POST /api/connector/job/queue
   Body: { token: string, kind: string, params?: any }
   Caller: wizard (browser).
   Refuses with 503 when no connector is online for the token — the
   alternative (queueing into the void) leaves the wizard polling
   forever. Refuses with 412 when the wizard hasn't registered an
   encryption key, because /result decryption would fail anyway.
   Returns: { ok: true, jobId } */
app.post('/api/connector/job/queue', (req, res) => {
  const { token, kind, params } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing token.' });
  }
  if (!kind || typeof kind !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing job kind.' });
  }
  if (!connectorAllowlist.has(token)) {
    return res.status(404).json({ ok: false, message: 'Token not registered. Call /api/connector/register first.' });
  }
  /* Encryption key check removed — token-only security. */
  if (!isConnectorOnline(token)) {
    return res.status(503).json({ ok: false, message: 'Connector for this token is OFFLINE (no heartbeat within the freshness window). Wait for the customer to start forcepoint-hc-connector.exe.' });
  }
  const queue = pendingJobs.get(token) ?? [];
  if (queue.length >= PENDING_QUEUE_MAX) {
    return res.status(503).json({ ok: false, message: `Pending job queue full (${PENDING_QUEUE_MAX}) for this token. The connector is online but isn't draining work.` });
  }
  const job = {
    jobId: randomUUID(),
    token,
    kind,
    params: params ?? null,
    createdAt: Date.now(),
  };
  queue.push(job);
  pendingJobs.set(token, queue);
  /* If a /next long-poll is already parked, hand the job to it
     directly — the connector wakes up immediately instead of
     waiting another LONG_POLL_MS. */
  flushWaiters(token);
  res.json({ ok: true, jobId: job.jobId });
});

/* GET /api/connector/job/next?token=...
   Caller: customer Connector .exe.
   Long-poll. If a job is pending → return it as plaintext JSON
   immediately. Else park the request for up to LONG_POLL_MS; resolve
   on first arrival of a job for this token. On timeout → 204 No
   Content (connector re-polls).
   Response shape (200): { jobId, kind, params } — params plaintext,
   they aren't sensitive. */
app.get('/api/connector/job/next', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return res.status(400).json({ ok: false, message: 'Missing token query param.' });
  }
  if (!connectorAllowlist.has(token)) {
    return res.status(404).json({ ok: false, message: 'Token not registered.' });
  }
  /* Fast path — pending job already waiting. */
  const queue = pendingJobs.get(token);
  if (queue && queue.length > 0) {
    const job = queue.shift();
    if (queue.length === 0) pendingJobs.delete(token);
    inflightJobs.set(job.jobId, job);
    return res.json({ jobId: job.jobId, kind: job.kind, params: job.params });
  }
  /* Long-poll path — park a waiter. */
  const waiters = jobWaiters.get(token) ?? [];
  const waiter = {
    resolve: (job) => {
      if (res.writableEnded) return;
      if (!job) {
        res.status(204).end();
        return;
      }
      inflightJobs.set(job.jobId, job);
      res.json({ jobId: job.jobId, kind: job.kind, params: job.params });
    },
    timer: null,
  };
  waiter.timer = setTimeout(() => {
    /* Timed out — remove ourselves from the waiter list and 204. */
    const list = jobWaiters.get(token);
    if (list) {
      const idx = list.indexOf(waiter);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) jobWaiters.delete(token);
    }
    waiter.resolve(null);
  }, LONG_POLL_MS);
  waiters.push(waiter);
  jobWaiters.set(token, waiters);
  /* Also clean up if the client disconnects mid-wait — prevents a
     dangling waiter holding a closed response. */
  req.on('close', () => {
    if (res.writableEnded) return;
    clearTimeout(waiter.timer);
    const list = jobWaiters.get(token);
    if (list) {
      const idx = list.indexOf(waiter);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) jobWaiters.delete(token);
    }
  });
});

/* POST /api/connector/job/result
   Body: { jobId: string, ok: boolean, envelope?: { iv, ct, tag }, error?: string }
   Caller: customer Connector .exe.
   On ok=true the envelope is decrypted with the per-token key and
   the plaintext is stored for the wizard to pick up. On ok=false
   the error string is stored verbatim. Either way the inflight slot
   is freed and the result lands in completedJobs. */
app.post('/api/connector/job/result', (req, res) => {
  const { jobId, ok, envelope, error } = req.body ?? {};
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing jobId.' });
  }
  const job = inflightJobs.get(jobId);
  if (!job) {
    /* Possible causes: TTL gc swept it, or duplicate POST (connector
       retried after an ack got lost). Either way: idempotent 200 so
       the connector stops retrying. */
    return res.json({ ok: true, ignored: true });
  }
  inflightJobs.delete(jobId);
  if (ok === false || ok === 'false') {
    completedJobs.set(jobId, {
      ok: false,
      error: typeof error === 'string' ? error : 'Connector reported failure without an error message.',
      completedAt: Date.now(),
    });
    return res.json({ ok: true });
  }
  /* Token-only security: no encryption key used.
     Result payload comes unencrypted from connector. */
  try {
    const payload = typeof envelope === 'object' ? envelope : null;
    completedJobs.set(jobId, { ok: true, payload, completedAt: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    completedJobs.set(jobId, {
      ok: false,
      error: e instanceof Error ? `Result processing failed: ${e.message}` : 'Result processing failed.',
      completedAt: Date.now(),
    });
    res.json({ ok: true });
  }
});

/* GET /api/connector/job/result?jobId=...
   Caller: wizard (browser), polled every ~2s.
   Returns 200 with { status: 'pending' } while the connector is
   still working, or { ok, payload | error } once the result has
   landed. Completed records are dropped after COMPLETED_JOB_TTL_MS,
   so a wizard that polls very late will see 404 — that's intentional,
   it indicates the wizard lost track of its own request. */
app.get('/api/connector/job/result', (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : '';
  if (!jobId) {
    return res.status(400).json({ ok: false, message: 'Missing jobId query param.' });
  }
  const done = completedJobs.get(jobId);
  if (done) {
    /* One-shot drain — once the wizard reads the result, drop it.
       Stops the wizard from polling indefinitely after success. */
    completedJobs.delete(jobId);
    if (done.ok) return res.json({ status: 'done', ok: true, payload: done.payload });
    return res.json({ status: 'done', ok: false, error: done.error });
  }
  if (inflightJobs.has(jobId)) {
    return res.json({ status: 'pending', phase: 'inflight' });
  }
  /* Check pending queues — slow path, but only runs while result
     isn't ready yet. Could be optimized with a reverse index later. */
  for (const queue of pendingJobs.values()) {
    if (queue.some((j) => j.jobId === jobId)) {
      return res.json({ status: 'pending', phase: 'queued' });
    }
  }
  res.status(404).json({ ok: false, message: 'Job not found. It may have expired (TTL) or never existed.' });
});

/* GC loop: walks pendingJobs + completedJobs every minute and drops
   anything past its TTL. Pending TTL means the connector never picked
   the job up; surface that as a synthetic failure so the wizard's
   poll resolves instead of hanging. */
setInterval(() => {
  const now = Date.now();
  for (const [token, queue] of pendingJobs.entries()) {
    let i = 0;
    while (i < queue.length) {
      if (now - queue[i].createdAt > PENDING_JOB_TTL_MS) {
        const stale = queue.splice(i, 1)[0];
        completedJobs.set(stale.jobId, {
          ok: false,
          error: `Job timed out in queue after ${PENDING_JOB_TTL_MS / 1000}s — no connector picked it up.`,
          completedAt: now,
        });
      } else {
        i++;
      }
    }
    if (queue.length === 0) pendingJobs.delete(token);
  }
  for (const [jobId, rec] of completedJobs.entries()) {
    if (now - rec.completedAt > COMPLETED_JOB_TTL_MS) {
      completedJobs.delete(jobId);
    }
  }
  /* Inflight TTL: defense against a connector that picked up a job
     and never reported back. Use a longer window since some DLP
     calls take real time. */
  for (const [jobId, job] of inflightJobs.entries()) {
    if (now - job.createdAt > PENDING_JOB_TTL_MS * 2) {
      inflightJobs.delete(jobId);
      completedJobs.set(jobId, {
        ok: false,
        error: `Job timed out in flight after ${PENDING_JOB_TTL_MS / 500}s — connector picked it up but never reported back.`,
        completedAt: now,
      });
    }
  }
}, 60 * 1000).unref(); /* unref so the timer doesn't pin the process alive on shutdown */

/* GET /api/connector/agent
   ───────────────────────────────────────────────────────────────────
   Serves the customer-side connector binary straight from the deploy
   host's filesystem. The wizard exposes this through nginx as
   GET /api/connector/agent; the customer's browser downloads the .exe
   from the same origin the wizard runs on — no GitHub round-trip,
   no static asset on the SPA tree.

   `deploy.sh` copies the binary out of the repo into
   /var/lib/forcepoint-hc/ on every deploy, AND injects the absolute
   path into this service via CONNECTOR_AGENT_PATH=... so the systemd
   unit (ProtectHome=true, ProtectSystem=full) can read it.

   The default below matches deploy.sh — works out of the box for any
   Ubuntu host provisioned through that script. For local dev set
   CONNECTOR_AGENT_PATH explicitly. The endpoint is GET-only and
   serves only this one fixed path — no path-traversal surface. */
const CONNECTOR_AGENT_PATH =
  process.env.CONNECTOR_AGENT_PATH ||
  '/var/lib/forcepoint-hc/forcepoint-hc-connector.exe';

app.get('/api/connector/agent', (_req, res) => {
  /* Use accessSync(R_OK) instead of existsSync so we get the actual
     errno back when the file *exists* but the node process can't
     read it (EACCES — typically when /home/student is 700 and node
     runs as a different user). existsSync swallows EACCES and just
     returns false, which produces the misleading "not found" message
     even when the binary is sitting right there on disk. */
  try {
    fs.accessSync(CONNECTOR_AGENT_PATH, fs.constants.R_OK);
  } catch (err) {
    const code = (err && typeof err === 'object' && 'code' in err) ? err.code : 'UNKNOWN';
    const runtimeUid = typeof process.getuid === 'function' ? process.getuid() : null;
    const runtimeGid = typeof process.getgid === 'function' ? process.getgid() : null;
    /* Surface enough detail for the SE to triage from the JSON
       response alone — they shouldn't need to ssh in to diagnose. */
    const detail =
      code === 'ENOENT'
        ? 'File does not exist at this path. `git pull` in the deploy dir, or set CONNECTOR_AGENT_PATH to where the .exe actually lives.'
      : code === 'EACCES'
        ? `The node process (uid=${runtimeUid}, gid=${runtimeGid}) cannot read this path. Check permissions on every directory in the chain (\`namei -l <path>\`) and on the file itself — /home/student is often 700 and only traversable by the student user.`
      : `Filesystem error: ${code}.`;
    res.status(404).json({
      ok: false,
      code,
      path: CONNECTOR_AGENT_PATH,
      runtimeUid,
      runtimeGid,
      message: `Connector binary not accessible. ${detail}`,
    });
    return;
  }
  try {
    const stat = fs.statSync(CONNECTOR_AGENT_PATH);
    const fileName = path.basename(CONNECTOR_AGENT_PATH);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    /* Aggressive cache disable — the operator may rebuild the binary
       in-place between SE engagements, and we don't want a stale exe
       cached by the browser or any intermediate proxy. */
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    fs.createReadStream(CONNECTOR_AGENT_PATH).pipe(res);
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/* Tiny health probe so the wizard can tell "no server" from "server up
   but SQL refused". GET-only so a curl from the operator is trivial. */
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'forcepoint-hc-sql-companion', port: PORT });
});

/* ═══════════════════════════════════════════════════════════════════
   AUTH — Registration, login, sessions, admin user management
   ───────────────────────────────────────────────────────────────────
   See server/auth.mjs for the storage layer. Endpoints:
     POST /api/auth/register   — public, @forcepoint.com only,
                                 first user auto-becomes admin
     POST /api/auth/login      — public, returns { token, user }
     POST /api/auth/logout     — invalidates the caller's session
     GET  /api/auth/me         — returns { user } for the bearer token
     GET  /api/auth/info       — public bootstrap signals for the
                                 login screen (allowed domain,
                                 whether any users exist yet)
     GET    /api/auth/users               — admin
     POST   /api/auth/users/:id/approve   — admin
     POST   /api/auth/users/:id/reject    — admin
     POST   /api/auth/users/:id/suspend   — admin
     POST   /api/auth/users/:id/role      — admin (toggle admin/user)
     POST   /api/auth/users/:id/password  — admin (set a user's password)
     DELETE /api/auth/users/:id           — admin
     POST   /api/auth/password            — self-service password change */

app.get('/api/auth/info', (_req, res) => {
  res.json({ ok: true, ...getAuthInfo() });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body ?? {};
  const result = registerUser({ email, password });
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, user: result.user, bootstrapAdmin: result.bootstrapAdmin });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const result = loginUser({ email, password });
  if (!result.ok) {
    return res.status(result.code).json({
      ok: false,
      status: result.code2 || undefined,
      error: result.error,
    });
  }
  /* MFA branch — loginUser may return {ok:true, mfaRequired:true,
     challengeToken, challengeExpiresInSec} instead of a session
     when the account has the authenticator enrolled. Forward
     those fields verbatim so the frontend can swap into the
     6-digit-code challenge view. Previous bug: this handler only
     forwarded token + user, which collapsed every MFA response to
     `{ok:true, token:undefined}` and made the login UI hang. */
  if (result.mfaRequired) {
    return res.json({
      ok: true,
      mfaRequired: true,
      challengeToken: result.challengeToken,
      challengeExpiresInSec: result.challengeExpiresInSec,
    });
  }
  res.json({ ok: true, token: result.token, user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  logoutUser(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/auth/users', requireAdmin, (_req, res) => {
  res.json({ ok: true, users: listUsers() });
});

app.post('/api/auth/users/:id/approve', requireAdmin, (req, res) => {
  const result = setUserStatus(req.params.id, 'approved');
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

app.post('/api/auth/users/:id/reject', requireAdmin, (req, res) => {
  const result = setUserStatus(req.params.id, 'rejected');
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

app.post('/api/auth/users/:id/suspend', requireAdmin, (req, res) => {
  const result = setUserStatus(req.params.id, 'suspended');
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

app.post('/api/auth/users/:id/role', requireAdmin, (req, res) => {
  const target = (req.body && req.body.role) || 'user';
  /* Last-admin guard — never let an admin demote the only remaining
     admin via this endpoint, otherwise the system locks itself out. */
  if (target !== 'admin') {
    const admins = listUsers().filter(u => u.role === 'admin');
    if (admins.length <= 1 && admins[0]?.id === req.params.id) {
      return res.status(409).json({ ok: false, error: 'Cannot demote the last remaining admin.' });
    }
  }
  const result = setUserRole(req.params.id, target);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

app.delete('/api/auth/users/:id', requireAdmin, (req, res) => {
  /* Same last-admin guard for deletes. */
  const admins = listUsers().filter(u => u.role === 'admin');
  if (admins.length <= 1 && admins[0]?.id === req.params.id) {
    return res.status(409).json({ ok: false, error: 'Cannot delete the last remaining admin.' });
  }
  const result = deleteUser(req.params.id);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

/* ─── MFA endpoints ──────────────────────────────────────────────
   Two flows: (1) finishing a login when the user already has MFA
   enabled (challenge token in hand), and (2) enrollment +
   management for an already-signed-in user. Admins additionally
   get a "reset MFA" power for stuck-without-phone users. */

/* (1) Complete an MFA challenge — token came from a /login call
   that returned { mfaRequired: true, challengeToken }. */
app.post('/api/auth/mfa/verify', (req, res) => {
  const { challengeToken, code } = req.body ?? {};
  const result = verifyMfaChallenge({ challengeToken, code });
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, token: result.token, user: result.user });
});

/* (2a) Start an enrollment — generates a fresh secret + draft set
   of backup codes, returns the QR-ready otpauth URI. */
app.post('/api/auth/mfa/enroll/begin', requireAuth, (req, res) => {
  const result = beginMfaEnrollment(req.user.id);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

/* (2b) Confirm enrollment with a fresh TOTP code from the user's
   authenticator app. Returns the one-time backup codes. */
app.post('/api/auth/mfa/enroll/confirm', requireAuth, (req, res) => {
  const { code } = req.body ?? {};
  const result = confirmMfaEnrollment(req.user.id, code);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, user: result.user, backupCodes: result.backupCodes });
});

/* Cancel an in-flight enrollment (user clicks "Back" or closes the
   modal). Idempotent — safe to call when no draft exists. */
app.post('/api/auth/mfa/enroll/cancel', requireAuth, (req, res) => {
  const result = cancelMfaEnrollment(req.user.id);
  res.json(result);
});

/* Disable MFA — re-auth gated on the current password. */
app.post('/api/auth/mfa/disable', requireAuth, (req, res) => {
  const { password } = req.body ?? {};
  const result = disableMfa(req.user.id, password);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, user: result.user });
});

/* Regenerate backup codes (invalidates the previous set). Also
   re-auth gated. */
app.post('/api/auth/mfa/backup-codes/regenerate', requireAuth, (req, res) => {
  const { password } = req.body ?? {};
  const result = regenerateBackupCodes(req.user.id, password);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, backupCodes: result.backupCodes, user: result.user });
});

/* Admin override — clears another user's MFA. Used when a user
   loses their phone AND their backup codes. Last-admin guard isn't
   relevant here (we're not changing role/status); the admin gets a
   clean re-enroll on next login. */
app.post('/api/auth/users/:id/mfa/reset', requireAdmin, (req, res) => {
  const result = adminResetMfa(req.params.id);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

/* Admin override — set another user's password directly. No email on
   this companion, so the admin types a new password and relays it
   out of band. All of the target's sessions are revoked server-side. */
app.post('/api/auth/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body ?? {};
  const result = adminSetPassword(req.params.id, password);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json(result);
});

/* Self-service password change — re-auth gated on the current
   password. The caller's own session is preserved (keepToken); every
   other session for the account is booted. */
app.post('/api/auth/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const result = changeOwnPassword(req.user.id, currentPassword, newPassword, req.session.token);
  if (!result.ok) return res.status(result.code).json({ ok: false, error: result.error });
  res.json({ ok: true, user: result.user });
});

/* ─── /api/admin/versioncheck ───────────────────────────────────────
   Server-side proxy for the GitHub versioncheck.json fetch. The SPA
   used to hit api.github.com directly from the browser, but that fails
   on customer networks that block outbound to GitHub or sit behind a
   corporate proxy ("Failed to fetch" in the browser console). The
   System API host always has outbound network for its `git pull`
   workflow, so we route the check through here — same-origin from
   the browser's perspective, no CORS, no proxy juggling.
   Primary path: GitHub Contents API (invalidates on push). Fallback:
   raw.githubusercontent.com (CDN, may lag by a few minutes). */
const GITHUB_API_URL = 'https://api.github.com/repos/lupharos/SeBuilderHC2026/contents/versioncheck.json?ref=main';
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/lupharos/SeBuilderHC2026/main/versioncheck.json';

app.get('/api/admin/versioncheck', async (_req, res) => {
  const stamp = Date.now();
  /* Try Contents API first. */
  try {
    const r = await fetch(`${GITHUB_API_URL}&_=${stamp}`, {
      headers: {
        'Accept': 'application/vnd.github.raw',
        'Cache-Control': 'no-cache',
        'User-Agent': 'forcepoint-hc-companion/1.0',
      },
    });
    if (r.ok) {
      const text = await r.text();
      try {
        const json = JSON.parse(text);
        return res.json({ ok: true, source: 'github-api', fetchedAt: new Date().toISOString(), payload: json });
      } catch (parseErr) {
        return res.status(502).json({ ok: false, error: `GitHub API returned unparseable JSON: ${parseErr.message}` });
      }
    }
    /* 403 = rate-limit, 404 = repo/file moved — both fall through to raw. */
  } catch { /* network or DNS failure — try raw */ }

  /* Fallback: raw CDN. */
  try {
    const r = await fetch(`${GITHUB_RAW_URL}?_=${stamp}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'forcepoint-hc-companion/1.0',
      },
    });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `GitHub raw returned HTTP ${r.status}` });
    }
    const text = await r.text();
    const json = JSON.parse(text);
    return res.json({ ok: true, source: 'github-raw', fetchedAt: new Date().toISOString(), payload: json });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: `Could not reach GitHub from the System API host: ${err.message}`,
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   ADMIN — Self-upgrade
   ───────────────────────────────────────────────────────────────────
   One-button "pull latest + redeploy" that mirrors what the SE used to
   do manually from a shell:
       cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh
   Companion typically runs as root under systemd, but the repo is
   owned by the operator (e.g. /home/student/SeBuilderHC2026 owned by
   `student`). To keep git's working-tree ownership clean, we run the
   pull as the repo owner via `su -`, then run deploy.sh as root.

   Linux-only: process.platform must be 'linux'. The frontend is told
   so via /api/admin/platform and hides the button on every other host
   (Windows dev machines, macOS laptops, etc.) — running an Ubuntu
   bash script there would be nonsense.

   The upgrade detaches because deploy.sh restarts our own systemd unit
   mid-flight; once spawned the child runs to completion regardless of
   what happens to this process. Output is appended to a log file the
   frontend can tail via /api/admin/upgrade/log. */
/* Upgrade log path — first usable candidate wins. The systemd unit
   sets HC_UPGRADE_LOG=/var/log/forcepoint-hc/upgrade.log, which is the
   path that survives the service restart triggered by deploy.sh. On
   dev hosts where /var/log/forcepoint-hc/ doesn't exist we fall back
   to /tmp. */
function resolveUpgradeLogPath() {
  const candidates = [
    process.env.HC_UPGRADE_LOG,
    '/var/log/forcepoint-hc/upgrade.log',
    '/tmp/forcepoint-hc-upgrade.log',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const dir = path.dirname(c);
      fs.accessSync(dir, fs.constants.W_OK);
      return c;
    } catch { /* try next */ }
  }
  return '/tmp/forcepoint-hc-upgrade.log';
}
const UPGRADE_LOG_PATH = resolveUpgradeLogPath();
const UPGRADE_REPO_DEFAULTS = [
  process.env.HC_UPGRADE_REPO_PATH,
  '/home/student/SeBuilderHC2026',
  path.join(os.homedir() || '/root', 'SeBuilderHC2026'),
].filter(Boolean);

/* Resolve which repo directory exists. Returns { repo, diagnostic }:
     - repo is non-null when we found a usable checkout
     - diagnostic carries the per-candidate stat results so the platform
       endpoint can produce an actionable error message instead of just
       "set HC_UPGRADE_REPO_PATH" when the real problem is something
       like systemd's ProtectHome=true hiding /home from this unit. */
function resolveUpgradeRepo() {
  const tried = [];
  for (const candidate of UPGRADE_REPO_DEFAULTS) {
    const entry = { path: candidate, exists: false, isDir: false, hasDeploy: false, hasGit: false, errno: null };
    try {
      const st = fs.statSync(candidate);
      entry.exists = true;
      entry.isDir = st.isDirectory();
      if (entry.isDir) {
        const deploy = path.join(candidate, 'deploy.sh');
        const gitDir = path.join(candidate, '.git');
        entry.hasDeploy = fs.existsSync(deploy);
        entry.hasGit = fs.existsSync(gitDir);
        if (entry.hasDeploy && entry.hasGit) {
          tried.push(entry);
          return {
            repo: { path: candidate, deployScript: deploy, owner: st.uid },
            tried,
          };
        }
      }
    } catch (err) {
      entry.errno = err.code || null;
    }
    tried.push(entry);
  }
  return { repo: null, tried };
}

/* Heuristic: is the systemd hardening hiding /home from us? When the
   companion runs under a unit with ProtectHome=true (the default until
   the 2026-05 deploy.sh refresh) every path under /home returns ENOENT
   regardless of what's actually on disk. We detect this by checking
   /home itself — if even the parent directory is missing in our mount
   namespace, almost certainly ProtectHome is in effect. */
function isHomeNamespaceHidden() {
  if (process.platform !== 'linux') return false;
  try {
    fs.statSync('/home');
    return false;
  } catch {
    return true;
  }
}

/* Map a numeric uid to a username. Reads /etc/passwd directly — avoids
   shelling out for a single lookup. Falls back to the numeric uid when
   the entry is missing, which is still a valid `su` target. */
function uidToUsername(uid) {
  try {
    const txt = fs.readFileSync('/etc/passwd', 'utf8');
    for (const line of txt.split('\n')) {
      const [name, , uidStr] = line.split(':');
      if (parseInt(uidStr, 10) === uid) return name;
    }
  } catch { /* fall through */ }
  return String(uid);
}

app.get('/api/admin/platform', (_req, res) => {
  const platform = process.platform;
  const lookup = platform === 'linux' ? resolveUpgradeRepo() : { repo: null, tried: [] };
  const repo = lookup.repo;
  /* Diagnostic: if /home itself is invisible, the systemd unit still
     has ProtectHome=true. Tell the operator exactly what to do rather
     than the generic "set HC_UPGRADE_REPO_PATH" hint, which won't help
     here because no path under /home would be visible. */
  const homeHidden = platform === 'linux' && repo === null && isHomeNamespaceHidden();
  let reason = '';
  if (platform !== 'linux') {
    reason = 'Self-upgrade only runs on Linux — the deploy script targets Ubuntu/nginx/systemd.';
  } else if (repo === null && homeHidden) {
    reason =
      'The System API service can\'t see /home because its systemd unit still has ProtectHome=true. ' +
      'Apply the deploy.sh refresh once manually:  cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh — ' +
      'after that the in-app Upgrade button will work for future updates.';
  } else if (repo === null) {
    reason =
      'No SeBuilderHC2026 clone with deploy.sh + .git was found in the search path. ' +
      'Set HC_UPGRADE_REPO_PATH in the systemd unit Environment= to point at the SE checkout.';
  }
  res.json({
    platform,
    nodeVersion: process.version,
    runningAsRoot: typeof process.getuid === 'function' ? process.getuid() === 0 : false,
    upgradeAvailable: platform === 'linux' && repo !== null,
    repoPath: repo ? repo.path : null,
    repoOwner: repo ? uidToUsername(repo.owner) : null,
    homeHidden,
    searchPath: lookup.tried,
    reason,
  });
});

/* In-memory tracking — the actual child detaches, so this is only the
   companion's *view* of the run. After deploy.sh restarts us, the next
   process boot starts with running=false and reads the log from disk. */
let upgradeStartedAt = null;

app.post('/api/admin/upgrade', (_req, res) => {
  if (process.platform !== 'linux') {
    return res.status(412).json({ ok: false, error: 'Self-upgrade is Linux-only.' });
  }
  const { repo } = resolveUpgradeRepo();
  if (!repo) {
    const homeHidden = isHomeNamespaceHidden();
    return res.status(404).json({
      ok: false,
      error: homeHidden
        ? 'The systemd unit still has ProtectHome=true — /home is hidden from this service. Apply the deploy.sh refresh once manually (cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh) to enable in-app upgrades.'
        : 'No SeBuilderHC2026 clone found on the search path.',
    });
  }
  const ownerUser = uidToUsername(repo.owner);
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

  /* Build the upgrade command. If we're already root and the repo is
     owned by another user, `su - <user> -c '...'` keeps the git working
     tree consistently owned. If we're not root, we just run everything
     in-process and trust that whoever launched us has the rights. */
  const repoPathQ = repo.path.replace(/'/g, `'\\''`);
  const deployQ = repo.deployScript.replace(/'/g, `'\\''`);
  let cmd;
  if (isRoot && ownerUser !== 'root' && ownerUser !== String(process.getuid())) {
    cmd = `set -e; su - '${ownerUser}' -c 'cd '\\''${repoPathQ}'\\'' && git pull' && bash '${deployQ}'`;
  } else if (isRoot) {
    cmd = `set -e; cd '${repoPathQ}' && git pull && bash '${deployQ}'`;
  } else {
    cmd = `set -e; cd '${repoPathQ}' && git pull && sudo -n bash '${deployQ}'`;
  }

  /* Truncate the log so the frontend doesn't see stale output from a
     previous run. Header carries the start banner + the resolved cmd. */
  upgradeStartedAt = new Date().toISOString();
  const banner =
    `========================================================\n` +
    ` Forcepoint HC self-upgrade\n` +
    ` Started:    ${upgradeStartedAt}\n` +
    ` Repo:       ${repo.path}\n` +
    ` Owner:      ${ownerUser}\n` +
    ` Running as: ${isRoot ? 'root' : 'non-root'}\n` +
    `========================================================\n`;
  try {
    fs.writeFileSync(UPGRADE_LOG_PATH, banner, { mode: 0o644 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Cannot write log at ${UPGRADE_LOG_PATH}: ${err.message}` });
  }

  /* Open the log fd and hand it to the detached child as stdout+stderr.
     `unref()` so the child outlives our own process; deploy.sh will
     restart this systemd unit while it's still running. */
  let logFd;
  try {
    logFd = fs.openSync(UPGRADE_LOG_PATH, 'a');
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Cannot open log fd: ${err.message}` });
  }
  /* Strip NODE_ENV from the child env before spawning deploy.sh.
     systemd sets NODE_ENV=production on the unit so the running
     companion uses a production-tuned Node; but if that env leaks
     into `npm install` inside deploy.sh, npm silently skips
     devDependencies — and `vite` is a devDependency, so the next
     `npm run build` dies with "sh: vite: not found". Removing the
     variable here lets deploy.sh resolve its own NODE_ENV per-step
     (install with dev deps, build with production). */
  const childEnv = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  delete childEnv.NODE_ENV;
  const child = spawn('bash', ['-c', cmd], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: childEnv,
  });
  child.on('error', (err) => {
    try { fs.appendFileSync(UPGRADE_LOG_PATH, `\n[spawn error] ${err.message}\n`); } catch { /* noop */ }
  });
  child.unref();
  try { fs.closeSync(logFd); } catch { /* noop */ }

  res.status(202).json({
    ok: true,
    pid: child.pid,
    startedAt: upgradeStartedAt,
    repoPath: repo.path,
    logPath: UPGRADE_LOG_PATH,
    message: 'Upgrade dispatched. The System API service will restart during deploy — expect a transient connectivity gap.',
  });
});

/* Tail of the upgrade log. The frontend polls this every couple of
   seconds; we cap the response at the last ~64 KB so even a runaway
   build doesn't push megabytes through the proxy. */
app.get('/api/admin/upgrade/log', (req, res) => {
  if (process.platform !== 'linux') {
    return res.status(412).json({ ok: false, error: 'Self-upgrade is Linux-only.' });
  }
  const maxBytes = Math.min(Math.max(parseInt(String(req.query.bytes ?? '65536'), 10) || 65536, 4096), 262144);
  let log = '';
  let exists = false;
  let mtimeMs = 0;
  try {
    const st = fs.statSync(UPGRADE_LOG_PATH);
    exists = true;
    mtimeMs = st.mtimeMs;
    const fd = fs.openSync(UPGRADE_LOG_PATH, 'r');
    try {
      const start = Math.max(0, st.size - maxBytes);
      const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      log = buf.toString('utf8');
      if (start > 0) log = `[…log truncated to last ${maxBytes} bytes…]\n` + log;
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* fall through */ }
  /* "Running" is best-effort: if the log was touched in the last 10s
     we treat the upgrade as still active. After deploy.sh restarts us
     this flag self-clears once mtime crosses the threshold. */
  const running = exists && (Date.now() - mtimeMs) < 10_000;
  res.json({
    ok: true,
    exists,
    running,
    startedAt: upgradeStartedAt,
    mtime: exists ? new Date(mtimeMs).toISOString() : null,
    log,
  });
});

/* PowerPoint executive summary report generation.
   Accepts report data (health score, risks, recommendations) and
   generates a downloadable .pptx file with formatted slides. */
app.post('/api/report/export-ppt', (req, res) => {
  try {
    const {
      customerName = 'Assessment',
      healthScore = 0,
      riskSummary = [],
      recommendations = [],
      productList = [],
      generatedAt = new Date().toISOString(),
    } = req.body ?? {};

    const prs = new PptxGenJs();
    prs.defineLayout({ name: 'BLANK', width: 10, height: 7.5 });

    /* Slide 1: Title & Health Score */
    const slide1 = prs.addSlide();
    slide1.background = { color: '1F2937' };
    slide1.addText(`Forcepoint Health Check`, {
      x: 0.5, y: 0.5, w: 9, h: 0.6,
      fontSize: 36, bold: true, color: 'FFFFFF', align: 'left',
    });
    slide1.addText(`Executive Summary`, {
      x: 0.5, y: 1.2, w: 9, h: 0.4,
      fontSize: 20, color: 'E5E7EB', align: 'left',
    });
    slide1.addText(`${customerName}`, {
      x: 0.5, y: 1.8, w: 9, h: 0.4,
      fontSize: 16, color: 'D1D5DB', align: 'left',
    });
    slide1.addText(`Assessment Date: ${new Date(generatedAt).toLocaleDateString()}`, {
      x: 0.5, y: 2.3, w: 9, h: 0.3,
      fontSize: 12, color: 'B4B5B6', align: 'left',
    });

    slide1.addText(`${healthScore}`, {
      x: 0.5, y: 3.2, w: 4, h: 1.5,
      fontSize: 72, bold: true, color: healthScore >= 75 ? '10B981' : healthScore >= 50 ? 'F59E0B' : 'EF4444',
      align: 'center', valign: 'middle',
    });
    slide1.addText('Health Score', {
      x: 0.5, y: 4.8, w: 4, h: 0.3,
      fontSize: 14, color: 'D1D5DB', align: 'center',
    });

    if (productList && productList.length > 0) {
      slide1.addText('Products Assessed', {
        x: 5.2, y: 3.2, w: 4.3, h: 0.4,
        fontSize: 14, bold: true, color: 'E5E7EB',
      });
      const products = productList.slice(0, 6).map(p => `• ${p}`).join('\n');
      slide1.addText(products, {
        x: 5.2, y: 3.7, w: 4.3, h: 1.8,
        fontSize: 12, color: 'D1D5DB', valign: 'top',
      });
    }

    /* Slide 2: Top Risks */
    if (riskSummary && riskSummary.length > 0) {
      const slide2 = prs.addSlide();
      slide2.background = { color: 'F9FAFB' };
      slide2.addText('Critical Findings', {
        x: 0.5, y: 0.5, w: 9, h: 0.5,
        fontSize: 28, bold: true, color: '1F2937',
      });

      let yPos = 1.2;
      riskSummary.slice(0, 5).forEach((risk, idx) => {
        const icon = risk.severity === 'critical' ? '🔴' : risk.severity === 'high' ? '🟠' : '🟡';
        slide2.addText(icon, {
          x: 0.5, y: yPos, w: 0.4, h: 0.4,
          fontSize: 16, align: 'center',
        });
        slide2.addText(risk.title || `Finding ${idx + 1}`, {
          x: 1.1, y: yPos, w: 8.4, h: 0.4,
          fontSize: 12, bold: true, color: '1F2937',
        });
        if (risk.description) {
          yPos += 0.4;
          slide2.addText(risk.description, {
            x: 1.1, y: yPos, w: 8.4, h: 0.5,
            fontSize: 10, color: '4B5563',
          });
        }
        yPos += 0.8;
      });
    }

    /* Slide 3: Top Recommendations */
    if (recommendations && recommendations.length > 0) {
      const slide3 = prs.addSlide();
      slide3.background = { color: 'F9FAFB' };
      slide3.addText('Recommended Actions', {
        x: 0.5, y: 0.5, w: 9, h: 0.5,
        fontSize: 28, bold: true, color: '1F2937',
      });

      let yPos = 1.2;
      recommendations.slice(0, 5).forEach((rec, idx) => {
        const priorityColor = rec.priority === 'critical' ? 'DC2626' : rec.priority === 'high' ? 'F59E0B' : '6366F1';
        slide3.addShape('rect', {
          x: 0.5, y: yPos, w: 0.05, h: 0.35,
          fill: { color: priorityColor },
          line: { type: 'none' },
        });
        slide3.addText(rec.title || `Action ${idx + 1}`, {
          x: 0.7, y: yPos, w: 8.8, h: 0.35,
          fontSize: 12, bold: true, color: '1F2937', valign: 'middle',
        });
        yPos += 0.5;
      });
    }

    /* Slide 4: Next Steps */
    const slide4 = prs.addSlide();
    slide4.background = { color: '1F2937' };
    slide4.addText('Next Steps', {
      x: 0.5, y: 1.5, w: 9, h: 0.6,
      fontSize: 32, bold: true, color: 'FFFFFF', align: 'center',
    });

    const actionItems = [
      '1. Review critical findings with your team',
      '2. Prioritize recommended actions by impact',
      '3. Schedule remediation timeline',
      '4. Monitor compliance and progress',
    ];

    slide4.addText(actionItems.join('\n'), {
      x: 1, y: 2.4, w: 8, h: 2.5,
      fontSize: 14, color: 'E5E7EB', valign: 'middle', align: 'left',
    });

    slide4.addText('For detailed findings, refer to the full Health Check Report', {
      x: 0.5, y: 6.8, w: 9, h: 0.4,
      fontSize: 12, color: 'D1D5DB', align: 'center', italic: true,
    });

    const buffer = prs.write({ outputType: 'arraybuffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="HC-Executive-Summary-${Date.now()}.pptx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('PPT generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
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
  const info = getAuthInfo();
  // eslint-disable-next-line no-console
  console.log(`  Auth: ${info.userCount} user(s), ${info.adminCount} admin(s), ${info.pendingCount} pending — store ${info.storeDir}`);
  if (info.bootstrapMode) {
    // eslint-disable-next-line no-console
    console.log('  Auth: no users yet — first @forcepoint.com registration auto-becomes admin.');
  }
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/test       — SQL connection test');
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/query      — run a registered DLP or Web Security report (sqlKey)');
  // eslint-disable-next-line no-console
  console.log(`  GET  /api/sql/queries    — list ${Object.keys(DLP_QUERIES).length} DLP + ${Object.keys(WEB_QUERIES).length} Web Security templates`);
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
  console.log('  POST /api/connector/job/queue  — wizard → enqueue Via-Connector job');
  // eslint-disable-next-line no-console
  console.log('  GET  /api/connector/job/next   — connector long-poll for next job (25s)');
  // eslint-disable-next-line no-console
  console.log('  POST /api/connector/job/result — connector → encrypted job result');
  // eslint-disable-next-line no-console
  console.log('  GET  /api/connector/job/result — wizard short-poll for completed result');
  // eslint-disable-next-line no-console
  console.log(`  GET  /api/connector/agent     — serve connector .exe from ${CONNECTOR_AGENT_PATH}`);
  // eslint-disable-next-line no-console
  console.log('  POST /api/report/export-ppt  — generate PowerPoint executive summary');
  // eslint-disable-next-line no-console
  console.log('  GET  /health             — liveness probe');
});

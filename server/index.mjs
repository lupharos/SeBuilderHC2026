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
import sql from 'mssql';
import { DLP_QUERIES } from './queries.mjs';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());                // Vite dev server is on a different origin
app.use(express.json({ limit: '256kb' }));

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
  console.log(`Forcepoint HC SQL companion listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/test      — connection test');
  // eslint-disable-next-line no-console
  console.log('  POST /api/sql/query     — run a registered DLP report (sqlKey)');
  // eslint-disable-next-line no-console
  console.log(`  GET  /api/sql/queries   — list ${Object.keys(DLP_QUERIES).length} registered templates`);
  // eslint-disable-next-line no-console
  console.log('  GET  /health            — liveness probe');
});

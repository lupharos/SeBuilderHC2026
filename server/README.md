# Forcepoint HC — Local SQL Companion

This is a small Node + Express + `mssql` service that the wizard talks to when
it needs to reach a real SQL Server. The browser cannot speak TCP, so this
companion sits next to the dev server (port 3001) and proxies SQL requests.

Nothing is persisted server-side — every request opens a fresh connection,
runs its query, and closes the pool. Results are returned as JSON and treated
as runtime-only by the wizard.

## Run

```
cd server
npm install
npm start
```

Default port: **3001** (override with `PORT=4000 npm start`).

Health probe:
```
curl http://localhost:3001/health
```

## Endpoints

### `POST /api/sql/test`

Connection test + server identification.

Request body (matches the wizard's `SqlConfig`):

```json
{
  "server":   "10.10.0.50",
  "port":     1433,
  "database": "wbsn-data-security",
  "authType": "sql",
  "username": "sa",
  "password": "********"
}
```

Set `authType` to `"windows"` to attempt a trusted-connection handshake — the
service is intended to run on the same Windows host as SQL Server in that
flow.

Response on success:

```json
{
  "ok": true,
  "message": "Connected in 142 ms",
  "latencyMs": 142,
  "server": {
    "productVersion":  "16.0.4145.4",
    "edition":         "Enterprise Edition (64-bit)",
    "productLevel":    "RTM",
    "collation":       "SQL_Latin1_General_CP1_CI_AS",
    "serverName":      "WSQL01",
    "currentDatabase": "wbsn-data-security",
    "currentLogin":    "sa",
    "versionString":   "Microsoft SQL Server 2022 ..."
  }
}
```

On failure: HTTP 400 with `{ "ok": false, "message": "<reason>" }`.

### `POST /api/sql/query`

Runs one of the named report templates registered in
[`queries.mjs`](./queries.mjs).

Request body: the same `SqlConfig` fields as `/api/sql/test`, plus an
`sqlKey` that selects the template — e.g. `"dlp_top_violators"`,
`"dlp_top_policies"`, `"dlp_cloud_ai"`. Each template is partition-aware:
it looks up the currently `ONLINE_ACTIVE` partition in
`PA_EVENT_PARTITION_CATALOG` and runs dynamic SQL against
`PA_EVENTS_<partition>`.

Response on success:

```json
{
  "ok": true,
  "sqlKey": "dlp_top_violators",
  "title":  "Top Users Triggering DLP Policy Violations",
  "description": "Most active users by total DLP violation count (30-day window).",
  "rowCount": 23,
  "latencyMs": 412,
  "rows": [
    { "LOGIN_NAME": "kemal", "EMAIL": "...", "TOTAL_VIOLATIONS": 87 },
    ...
  ]
}
```

### `GET /api/sql/queries`

List the registered templates (sqlKey + title + description) so the
wizard can show the operator what's available.

### `GET /health`

Liveness probe — returns `{ ok: true, service, port }`.

## Notes

- `trustServerCertificate: true` is set so on-prem deployments with
  self-signed certs work out of the box. Remove it before pointing at a
  hardened production cluster.
- Connection / request timeouts are 8 / 15 seconds. The wizard caps its
  own fetch at 18 s.
- All error messages have stack-trace fragments stripped before being sent
  to the wizard.

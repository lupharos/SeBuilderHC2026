/* Customer Connector — outbound-only tunnel agent that the customer
   installs alongside their FSM / SQL Server. The HC application cannot
   reach the customer environment directly (firewalls), so the connector
   opens a single one-way HTTPS to the HC companion. SQL queries and DLP
   REST API calls flow through it as encrypted jobs.

   Iteration 1 (this file): UI-side config only. The connector binary
   itself isn't written yet; this scaffolds the credentials, encryption
   keys, IP allowlist, and status panel so the binary has somewhere to
   phone home when it lands. */

export interface CustomerConnectorConfig {
  /** Master switch — when false the Customer Connector card is collapsed
      and no status polling fires. */
  enabled: boolean;
  /** Random 256-bit token, hex-encoded (64 chars). Acts as the connector's
      sole identity to the HC companion. This is the ONLY credential needed
      (security provided by token + HTTPS). Rotatable — regenerating only
      requires running the .exe again. */
  token: string;
}

export const DEFAULT_CUSTOMER_CONNECTOR: CustomerConnectorConfig = {
  enabled: false,
  token: '',
};

/* Cryptographically-random 256-bit hex string. Generated via the Web
   Crypto API; the same primitive backs token and AES-256 key. */
export function randomHex256(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* Single sub-component selftest result reported by the connector
   inside each heartbeat. The connector re-runs SQL + DLP REST API
   probes every 5 minutes and ships the latest snapshot up. */
export interface ConnectorSelftestResult {
  status: 'ok' | 'fail';
  message: string;
  latencyMs: number;
  checkedAt: string;
}

export interface ConnectorSelftest {
  /* Three discrete SQL probes — one per DLP-stack DB. Each value is
     null when the connector-secrets.json on the customer host doesn't
     have that block configured. The wizard renders only the configured
     rows (no "FAIL — block missing" noise for DBs the customer simply
     doesn't expose). `sql` is the legacy single-probe field kept here
     so heartbeats from older connector .exe builds still render
     something — the UI maps it onto sqlData when the new keys are all
     absent. */
  sqlData?: ConnectorSelftestResult | null;
  sqlWeb?: ConnectorSelftestResult | null;
  sqlEmail?: ConnectorSelftestResult | null;
  sql?: ConnectorSelftestResult | null; // legacy v1 field
  dlpApi: ConnectorSelftestResult | null;
}

/* Connector status returned by GET /api/connector/status. */
export interface CustomerConnectorStatus {
  /** true when the connector has phoned home within the last 90s. */
  online: boolean;
  /** ISO timestamp of the last heartbeat, or null if never seen. */
  lastHeartbeatAt: string | null;
  /** Seconds since the last heartbeat (Infinity when never seen). */
  secondsSinceLastHeartbeat: number;
  /** IP address recorded on the last heartbeat — operator can confirm it
      matches their expected `allowedSourceIp`. */
  lastSourceIp: string | null;
  /** Monotonic counter of heartbeats received since companion started. */
  totalHeartbeats: number;
  /** Connector self-reported version string (sent in heartbeat body). */
  connectorVersion: string | null;
  /** Allowlist value the server is currently enforcing for this token —
      mirrors what the wizard pushed via /api/connector/register. */
  registeredAllowedSourceIp?: string | null;
  /** Count of heartbeats the server rejected because the source IP
      didn't match the registered allowlist. */
  rejectedAttempts?: number;
  /** Timestamp of the most recent rejection (ISO). */
  lastRejectedAt?: string | null;
  /** Source IP of the most recent rejected attempt — surfaced to the
      operator so they can correct the allowlist if it's wrong. */
  lastRejectedIp?: string | null;
  /** Result of the connector's local SQL + DLP REST API probes. The
      connector runs these every 5 minutes against the credentials
      stored in `connector-secrets.json` on the FSM host. null when
      the connector has no secrets file or the test hasn't run yet. */
  selftest?: ConnectorSelftest | null;
}

export async function fetchConnectorStatus(token: string, signal?: AbortSignal): Promise<CustomerConnectorStatus | null> {
  if (!token) return null;
  try {
    const res = await fetch(`/api/connector/status?token=${encodeURIComponent(token)}`, {
      signal: signal ?? AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as CustomerConnectorStatus;
  } catch {
    return null;
  }
}

/* Register the connector token with the HC companion.
   The token is the ONLY credential — security is token + HTTPS.
   The wizard calls this when the token is first generated. */
export async function registerConnectorAllowlist(
  token: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/connector/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: signal ?? AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* Revoke a token on the server — wipes both the allowlist entry and
   the liveness record. After this:
     - Any heartbeat with the same token starts a fresh session.
     - The wizard's status pill resets to WAITING.
   Used in two paths:
     1. Automatic — when the operator regenerates the token in the
        wizard, the OLD token is deregistered before the new one is
        registered, so the deployed connector (still using the old
        token) loses its server-side record.
     2. Manual — "Revoke connector access" button. */
export async function deregisterConnectorToken(
  token: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/connector/deregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: signal ?? AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}


/* Queue a job for the Customer Connector to execute, then short-poll
   the result endpoint until it lands. Used by the wizard's
   "Via Connector" transport branch for DLP REST API operations.

   The wrapper hides the queue/poll dance behind a normal Promise:
       const payload = await runJobViaConnector(token, 'dlp.test', null);
   On success returns the connector's decrypted payload verbatim.
   On any failure (queue rejected, connector reported failure, TTL
   timed out, response decryption failed) throws an Error whose
   message carries the companion's diagnostic so the wizard can
   render it as-is.

   The caller does NOT need to worry about encryption — the connector
   encrypts the result with the AES-256-GCM key it loaded from
   connector.json, the companion decrypts using the matching key
   pushed via /api/connector/register, and what lands here is plain
   JSON. */
export async function runJobViaConnector<T = unknown>(
  token: string,
  kind: string,
  params: unknown,
  opts?: { signal?: AbortSignal; pollIntervalMs?: number; timeoutMs?: number },
): Promise<T> {
  if (!token) throw new Error('runJobViaConnector: token is empty.');
  const signal = opts?.signal;
  const pollInterval = opts?.pollIntervalMs ?? 1500;
  /* Default timeout: 120s. Long enough for a DLP /incidents call
     (which itself can take 60s on a busy FSM) + connector handoff
     latency. Override via opts.timeoutMs for known-fast jobs. */
  const overallTimeout = opts?.timeoutMs ?? 120_000;

  /* Step 1 — enqueue. */
  const queueRes = await fetch('/api/connector/job/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, kind, params }),
    signal: signal ?? AbortSignal.timeout(8000),
  });
  if (!queueRes.ok) {
    let msg = `queue failed (${queueRes.status})`;
    try {
      const body = await queueRes.json();
      if (body?.message) msg = body.message;
    } catch { /* keep default */ }
    throw new Error(`Via-Connector: ${msg}`);
  }
  const { jobId } = (await queueRes.json()) as { ok: boolean; jobId: string };
  if (!jobId) throw new Error('Via-Connector: System API returned no jobId.');

  /* Step 2 — short-poll for result. */
  const deadline = Date.now() + overallTimeout;
  while (Date.now() < deadline) {
    /* Bail out fast on operator cancel — abort the next sleep. */
    if (signal?.aborted) throw new Error('Via-Connector: aborted by caller.');

    const pollRes = await fetch(`/api/connector/job/result?jobId=${encodeURIComponent(jobId)}`, {
      signal: signal ?? AbortSignal.timeout(8000),
    });
    if (pollRes.status === 404) {
      throw new Error('Via-Connector: job not found (TTL expired or never queued).');
    }
    if (!pollRes.ok) {
      throw new Error(`Via-Connector: result poll failed (${pollRes.status}).`);
    }
    const body = (await pollRes.json()) as
      | { status: 'pending'; phase?: string }
      | { status: 'done'; ok: true; payload: T }
      | { status: 'done'; ok: false; error: string };
    if (body.status === 'done') {
      if (body.ok) return body.payload;
      throw new Error(`Via-Connector: ${body.error || 'connector reported failure'}`);
    }
    /* pending — sleep, then poll again. */
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(`Via-Connector: timed out after ${Math.round(overallTimeout / 1000)}s waiting for job result.`);
}



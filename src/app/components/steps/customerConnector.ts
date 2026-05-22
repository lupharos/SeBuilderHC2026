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
      sole identity to the HC companion. Rotatable — regenerating only
      requires re-deploying the connector's config file. */
  token: string;
  /** IPv4 / IPv6 / CIDR the connector is expected to phone home from.
      Companion enforces this as a second layer alongside the token. Empty
      string disables the check (development only). */
  allowedSourceIp: string;
  /** AES-256-GCM symmetric key, hex-encoded (64 chars = 32 bytes). Used
      end-to-end for the encrypted job payload. Server NEVER sees this in
      plaintext over the wire — the wizard sends it once via the
      operator-driven `connector.json` download. */
  encryptionKey: string;
  /** Base URL the customer's connector phones home to. This is the
      public address of the nginx gateway in front of the HC companion
      (e.g. `https://hc.forcepoint-se.com`). nginx handles the
      `/api/connector/heartbeat` route and proxies it to the loopback
      companion. The SE fills this in per engagement; left blank by
      default so a forgotten value is obvious in the bundle. */
  hcEndpoint: string;
}

export const DEFAULT_CUSTOMER_CONNECTOR: CustomerConnectorConfig = {
  enabled: false,
  token: '',
  allowedSourceIp: '',
  encryptionKey: '',
  hcEndpoint: '',
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
  sql: ConnectorSelftestResult | null;
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

/* Push the current per-token IP allowlist to the companion. The
   wizard calls this whenever the token or allowedSourceIp changes —
   and again on mount, in case the companion was restarted and lost
   its in-memory allowlist. Empty `allowedSourceIp` clears the rule
   (no restriction). */
export async function registerConnectorAllowlist(
  token: string,
  allowedSourceIp: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/connector/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, allowedSourceIp }),
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

/* Snapshot of the operator-visible connector config that gets exported
   to the customer's connector.json. Encryption key + token live here in
   plaintext; this file leaves the SE laptop only when handed to the
   customer for deployment. */
export interface ConnectorBundle {
  _format: 'forcepoint-hc-customer-connector';
  _version: 1;
  _generatedAt: string;
  hcEndpoint: string;
  token: string;
  allowedSourceIp: string;
  encryptionAlgorithm: 'AES-256-GCM';
  encryptionKeyHex: string;
  heartbeatIntervalSeconds: 30;
}

export function buildConnectorBundle(cfg: CustomerConnectorConfig): ConnectorBundle {
  return {
    _format: 'forcepoint-hc-customer-connector',
    _version: 1,
    _generatedAt: new Date().toISOString(),
    hcEndpoint: cfg.hcEndpoint,
    token: cfg.token,
    allowedSourceIp: cfg.allowedSourceIp,
    encryptionAlgorithm: 'AES-256-GCM',
    encryptionKeyHex: cfg.encryptionKey,
    heartbeatIntervalSeconds: 30,
  };
}

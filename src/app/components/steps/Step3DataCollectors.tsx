import { useEffect, useRef, useState } from 'react';
import { Database, CheckCircle2, XCircle, Loader, ChevronDown, ChevronRight, Check, Shield, Globe, Network, FolderOpen, Upload, Trash2, Server, FileText, Play, X as XIcon, Clock, Star } from 'lucide-react';
import { REPORT_GROUPS, type ReportRunResult, type ReportDef } from '../../constants/reportDefinitions';
import { parseDlpBundle, formatMemoryGB, memoryUsagePct, statusColor, type DlpServerBundle, type UploadedFile } from './dlpServerInfoParser';
import { parseDlpDashboardPdf, type DlpDashboardSummary } from './dlpDashboardParser';
import { parseDlpAllLog, type DlpAllLogReport, type LogSeverity } from './dlpAllLogParser';
import { parseAuditSystemLogs, type AuditSystemLogsReport, type AuditSeverity } from './auditSystemLogsParser';
import { parseDlpServiceLogs, isServiceLogFilename, type ServiceLogsReport, type ServiceLogSeverity, type ServiceLogFile } from './dlpServiceLogsParser';
import { fetchDlpPosture, type DlpPostureSummary, type DlpPostureBlockId, type DestinationPatterns, DLP_POSTURE_BLOCKS, ALL_POSTURE_BLOCK_IDS, formatBytes } from './dlpPosture';
import { type CustomerConnectorConfig, type CustomerConnectorStatus, randomHex256, fetchConnectorStatus, registerConnectorAllowlist, deregisterConnectorToken, runJobViaConnector } from './customerConnector';
import { Key, Plug, RefreshCw, Activity, Globe2, Download, Eye, EyeOff, Copy } from 'lucide-react';

/* Download URL for the customer connector .exe. The Ubuntu deploy
   host already keeps the binary at
   `/home/student/SeBuilderHC2026/ConnectorAgent/forcepoint-hc-connector.exe`
   (refreshed via `git pull` during deploy), so the companion server
   serves it through `/api/connector/agent`. Relative URL means the
   wizard, the companion, and the file all stay on the same origin —
   no cross-origin pre-flight, no public GitHub asset surface, and
   the SE never has to maintain a parallel release pipeline. nginx
   in front of the companion proxies the path through unchanged. */
const CONNECTOR_EXE_URL = '/api/connector/agent';

// ── SQL Server config ────────────────────────────────────────────────────────
export interface SqlConfig {
  enabled: boolean;
  server: string;
  port: number;
  database: string;
  authType: 'windows' | 'sql';
  username: string;
  password: string;
  /* Same transport semantics as ApiConnectorConfig.transport:
       direct        — companion's mssql client dials the customer SQL Server.
                       Requires line-of-sight from the deploy host to FSM:1433.
                       Fields above (server/port/database/authType/username/
                       password) must be filled in.
       via-connector — companion enqueues `sql.test` / `sql.query` jobs
                       on the connector's outbound HTTPS channel. The
                       connector reads sql_Data / sql_Web / sql_Email
                       out of connector-secrets.json and runs the query
                       inside the customer network. Server/port/auth
                       fields are ignored on that path.
     Legacy sessions without this field default to 'direct'. */
  transport?: ApiTransport;
}
export const DEFAULT_SQL_CONFIG: SqlConfig = {
  enabled: false, server: '', port: 1433, database: '', authType: 'windows', username: '', password: '', transport: 'direct',
};

// ── REST API connectors ──────────────────────────────────────────────────────
/* Transport options for a REST API connector. Currently only the DLP
   REST API supports both modes — V Series and NGFW SMC always go
   `direct` because the SE typically has L3 reachability to those
   appliances already.
     • direct        — companion (or browser) fetches the customer's
                       API endpoint over the SE's own network path.
                       Requires line-of-sight to the customer FSM
                       host on the API port (9443 for DLP).
     • via-connector — companion enqueues each API call as an
                       encrypted job; the Customer Connector .exe
                       running INSIDE the customer environment
                       picks it up, hits the API from there, and
                       returns the result back through the same
                       outbound-only HTTPS heartbeat channel. Used
                       when the SE has no direct route to the
                       customer FSM, only to the connector. */
export type ApiTransport = 'direct' | 'via-connector';

export interface ApiConnectorConfig {
  enabled: boolean;
  url: string;
  authType: 'apikey' | 'basic';
  apiKey: string;
  username: string;
  password: string;
  /* Only meaningful when `enabled` is true. Absent / undefined on
     legacy sessions → treat as 'direct' so existing wizards keep
     their behavior. Honored by the wizard's runDlpTest / posture /
     report-run code paths once Stage 3 of the Via-Connector rollout
     ships; in the meantime the toggle persists state but the
     transport itself stays 'direct'. */
  transport?: ApiTransport;
}
export interface ApiConnectorsConfig {
  dlpApi: ApiConnectorConfig;
  vSeries: ApiConnectorConfig;
  ngfwSmc: ApiConnectorConfig;
}
const BLANK_API: ApiConnectorConfig = {
  enabled: false, url: '', authType: 'apikey', apiKey: '', username: '', password: '', transport: 'direct',
};
export const DEFAULT_API_CONNECTORS: ApiConnectorsConfig = {
  dlpApi:  { ...BLANK_API, authType: 'basic' },
  vSeries: { ...BLANK_API },
  ngfwSmc: { ...BLANK_API },
};

// ── Shared ───────────────────────────────────────────────────────────────────
/* Server identity returned by /api/sql/test on a successful connection.
   Carries everything the wizard needs to render a green "Connected to …"
   row — version, edition, latency, login, current DB. Runtime-only; not
   persisted to localStorage. */
interface SqlServerInfo {
  productVersion?: string;
  edition?: string;
  productLevel?: string;
  collation?: string;
  serverName?: string;
  currentDatabase?: string;
  currentLogin?: string;
  latencyMs?: number;
}
interface ConnStatus {
  state: 'idle' | 'testing' | 'ok' | 'error';
  message?: string;
  server?: SqlServerInfo;
}

interface Props {
  sqlConfig: SqlConfig;
  setSqlConfig: React.Dispatch<React.SetStateAction<SqlConfig>>;
  apiConnectors: ApiConnectorsConfig;
  setApiConnectors: React.Dispatch<React.SetStateAction<ApiConnectorsConfig>>;
  selectedReports: string[];
  setSelectedReports: React.Dispatch<React.SetStateAction<string[]>>;
  /* Per-report time-window override (persisted). */
  reportWindows: Record<string, number>;
  setReportWindows: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /* Runtime results of executed report queries (NOT persisted). */
  reportRuns: Record<string, ReportRunResult>;
  setReportRuns: React.Dispatch<React.SetStateAction<Record<string, ReportRunResult>>>;
  selectedProducts: Record<string, boolean>;
  dlpBundles: DlpServerBundle[];
  setDlpBundles: React.Dispatch<React.SetStateAction<DlpServerBundle[]>>;
  dlpDashboardSummary: DlpDashboardSummary | null;
  setDlpDashboardSummary: React.Dispatch<React.SetStateAction<DlpDashboardSummary | null>>;
  /* Pulled from /api/dlp/posture once the operator clicks "Fetch posture data". */
  dlpPostureSummary: DlpPostureSummary | null;
  setDlpPostureSummary: React.Dispatch<React.SetStateAction<DlpPostureSummary | null>>;
  /* Per-block visibility map driving which posture cards make it into the
     final HTML report. The whole section is emitted iff at least one
     block is ticked. */
  dlpPostureSections: Record<DlpPostureBlockId, boolean>;
  setDlpPostureSections: React.Dispatch<React.SetStateAction<Record<DlpPostureBlockId, boolean>>>;
  /* Global destination-pattern catalogue (GenAI / SaaS / Webmail).
     Read-only from Step 3 — edited via the "GenAI Apps" rail page. */
  destinationPatterns: DestinationPatterns;
  /* Customer Connector — outbound-only agent the customer installs at
     their site. Holds the token, AES-256 key, IP allowlist, and cert
     fingerprint used by the connector binary. */
  customerConnector: CustomerConnectorConfig;
  setCustomerConnector: React.Dispatch<React.SetStateAction<CustomerConnectorConfig>>;
  /* Forcepoint DLP Tomcat application log analysis result —
     `\Data Security\tomcat\logs\dlp\dlp-all.log`. null until the
     operator drops the file into the DLP Server Info card. */
  dlpAllLogReport: DlpAllLogReport | null;
  setDlpAllLogReport: React.Dispatch<React.SetStateAction<DlpAllLogReport | null>>;
  /* DLP audit-system CSV analysis result — exported from the
     `\SQL queries\AUDIT_SYSTEM_LOGS.csv` query bundled in
     DLPServerInfo. */
  auditLogReport: AuditSystemLogsReport | null;
  setAuditLogReport: React.Dispatch<React.SetStateAction<AuditSystemLogsReport | null>>;
  /* Cross-correlated analyzer for `\Data Security\Logs\` — handles
     FPR/EndPointServer/PolicyEngine[.Client]/mgmtd (C++) +
     HealthCheck/WorkScheduler/CleanupAndArchive (Python). One report
     spans all eight files; same root cause across files collapses into
     one issue with a multi-file log_sources list. */
  serviceLogsReport: ServiceLogsReport | null;
  setServiceLogsReport: React.Dispatch<React.SetStateAction<ServiceLogsReport | null>>;
  /* Star + dismiss state for log-analyzer findings. Keyed by
     `${parserScope}:${issueId}` so the same string survives a re-parse.
     parserScope ∈ {'dlp','audit','services'}; issueId is the per-parser
     stable id field. Starred issues are the only ones that flow into
     the HTML report AND auto-spawn an Urgent Action; dismissed issues
     are hidden from the wizard UI entirely. */
  starredLogIssues: Record<string, true>;
  setStarredLogIssues: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  dismissedLogIssues: Record<string, true>;
  setDismissedLogIssues: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  /* Star callback wired up at the Dashboard level — when the operator
     stars a finding for the first time, this hook spawns a matching
     Urgent Action item carrying the issue's recommendation. Decoupled
     from setStarredLogIssues so the side effect can be omitted in
     contexts where Step 9 isn't reachable. */
  onStarLogIssue: (key: string, issue: { title: string; recommendation: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; component: string }) => void;
}

const IS: React.CSSProperties = {
  fontSize: '12px', border: '1.5px solid #E2E8F0', background: '#F8FAFC',
  color: '#0F172A', borderRadius: '8px', padding: '7px 11px', outline: 'none', width: '100%',
};

const PRODUCT_MAP: Record<string, 'web' | 'dlp' | 'email'> = {
  web: 'web', data: 'dlp', email: 'email',
};

async function runTest(endpoint: string, payload: unknown): Promise<ConnStatus> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      /* 18s upper bound: SQL Server cold-start auth handshakes can take
         8+ seconds; we cap above the server's own 8s connectionTimeout. */
      signal: AbortSignal.timeout(18000),
    });
    type SqlTestOk    = { ok: boolean; message?: string; server?: SqlServerInfo; latencyMs?: number };
    type SqlTestError = { ok: false; message?: string };
    if (res.ok) {
      const d = await res.json() as SqlTestOk;
      return {
        state: 'ok',
        message: d.message || 'Connection successful',
        server: d.server ? { ...d.server, latencyMs: d.latencyMs } : undefined,
      };
    }
    const e = await res.json() as SqlTestError;
    return { state: 'error', message: e.message || `Server error (${res.status})` };
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return { state: 'error', message: timeout ? 'Connection timed out' : 'Local SQL System API not running — start it with `cd server && npm install && npm start`' };
  }
}

// ── API connector card metadata ───────────────────────────────────────────────
const API_DEFS = [
  {
    key: 'dlpApi'  as const,
    label:    'DLP REST API',
    subtitle: 'Forcepoint DLP REST API — incidents, policies, analytics',
    icon:     <Shield  size={14} style={{ color: '#16A34A' }} />,
    iconBg:   'rgba(22,163,74,0.1)',
    endpoint: '/api/dlp/test',
    placeholder: 'https://FSMServer:9443',
  },
  {
    key: 'vSeries' as const,
    label:    'V Series API',
    subtitle: 'Forcepoint Web Security V Series appliance management API',
    icon:     <Globe   size={14} style={{ color: '#0EA5E9' }} />,
    iconBg:   'rgba(14,165,233,0.1)',
    endpoint: '/api/vseries/test',
    placeholder: 'https://v-series-host:9090',
  },
  {
    key: 'ngfwSmc' as const,
    label:    'NGFW SMC API',
    subtitle: 'Forcepoint NGFW Security Management Center REST API',
    icon:     <Network size={14} style={{ color: '#7C3AED' }} />,
    iconBg:   'rgba(124,58,237,0.1)',
    endpoint: '/api/ngfw/test',
    placeholder: 'https://smc-host:8082',
  },
] as const;

// ── Mini metric tile used in the DLP Dashboard summary preview ──────────────
function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, color, fontFamily: 'monospace', marginTop: '2px', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

// ── Small read-only field row ────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em', minWidth: '110px' }}>
        {label.toUpperCase()}
      </span>
      <span style={{ color: value && value !== '—' ? '#0F172A' : '#CBD5E1', fontWeight: value && value !== '—' ? 500 : 400 }}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Single-row in the bundle services table ──────────────────────────────────
function ServiceRow({ service: s, alt }: { service: { displayName: string; name: string; state: string; startMode: string; startName: string }; alt: boolean }) {
  const state = (s.state || '').toLowerCase();
  let badgeBg = '#F1F5F9', badgeColor = '#64748B', label = (s.state || 'UNKNOWN').toUpperCase();
  if (state === 'running') { badgeBg = '#DCFCE7'; badgeColor = '#15803D'; }
  else if (state === 'stopped') { badgeBg = '#FEE2E2'; badgeColor = '#DC2626'; }
  else if (state === 'paused') { badgeBg = '#FEF3C7'; badgeColor = '#B45309'; }
  else if (state.includes('pending')) { badgeBg = '#FEF9C3'; badgeColor = '#A16207'; }
  else if (state) { badgeBg = '#FEF2F2'; badgeColor = '#DC2626'; }
  return (
    <tr style={{ background: alt ? '#FAFCFF' : 'transparent' }}>
      <td style={{ padding: '4px 8px', borderBottom: '1px solid #F1F5F9', color: '#0F172A', fontWeight: 500 }}>
        <div>{s.displayName || '—'}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '8.5px', color: '#94A3B8' }}>{s.name}</div>
      </td>
      <td style={{ padding: '4px 8px', borderBottom: '1px solid #F1F5F9', color: '#64748B' }}>{s.startMode || '—'}</td>
      <td style={{ padding: '4px 8px', borderBottom: '1px solid #F1F5F9' }}>
        <span className="font-mono"
          style={{ fontSize: '8.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: badgeBg, color: badgeColor }}>
          {label}
        </span>
      </td>
    </tr>
  );
}

// ── Section header inside a bundle card ──────────────────────────────────────
function Section({ title, badge, badgeColor, children }: { title: string; badge?: string; badgeColor?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #E2E8F0' }}>
      <div className="flex items-center gap-2 mb-2">
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0F2952', letterSpacing: '0.04em' }}>
          {title.toUpperCase()}
        </div>
        {badge && (
          <span className="px-1.5 py-0.5 rounded font-mono font-bold"
            style={{ fontSize: '9px', background: `${badgeColor || '#64748b'}15`, color: badgeColor || '#64748b', border: `1px solid ${badgeColor || '#64748b'}33` }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Bundle card — rich display for one parsed DLPServerInfo bundle ───────────
function BundleCard({ bundle: b, expanded, onToggle, onRemove }: { bundle: DlpServerBundle; expanded: boolean; onToggle: () => void; onRemove: () => void }) {
  const sys = b.systemInfo;
  const memPct = sys ? memoryUsagePct(sys) : 0;
  const memColor = memPct >= 85 ? '#DC2626' : memPct >= 70 ? '#D97706' : '#16A34A';
  const hf = b.osHotfixes;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1.5px solid #E2E8F0', background: '#FAFCFF' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={onToggle}>
        <Server size={13} style={{ color: '#2563EB', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952' }}>
            {sys?.hostName || b.bundleName}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
            {sys?.osName && <span>{sys.osName}</span>}
            {b.forcepointProducts?.dlpVersion && <><span style={{ color: '#CBD5E1' }}>•</span><span>DLP {b.forcepointProducts.dlpVersion}</span></>}
            {b.hardware && b.hardware.cpuCount > 0 && <><span style={{ color: '#CBD5E1' }}>•</span><span>{b.hardware.cpuCount} CPU</span></>}
            {sys && sys.totalPhysicalMemoryMB > 0 && <><span style={{ color: '#CBD5E1' }}>•</span><span style={{ color: memColor, fontWeight: 600 }}>RAM {memPct}%</span></>}
            {hf && hf.patchStatus !== 'UNKNOWN' && <><span style={{ color: '#CBD5E1' }}>•</span><span style={{ color: statusColor(hf.patchStatus), fontWeight: 600 }}>Patch {hf.patchStatus}</span></>}
          </div>
        </div>
        <span className="px-2 py-0.5 rounded font-mono" style={{ fontSize: '9px', background: '#F1F5F9', color: '#64748B' }}>
          {b.parsedFiles.length}/{b.fileCount} files
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="flex items-center justify-center rounded"
          style={{ width: '22px', height: '22px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}>
          <Trash2 size={12} />
        </button>
        {expanded
          ? <ChevronDown  size={13} style={{ color: '#94A3B8' }} />
          : <ChevronRight size={13} style={{ color: '#94A3B8' }} />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid #E2E8F0', background: '#fff' }}>
          {/* System Info */}
          {sys && (
            <Section title="System Info">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ fontSize: '11px' }}>
                <InfoRow label="Host Name" value={sys.hostName} />
                <InfoRow label="Domain" value={sys.domain} />
                <InfoRow label="OS" value={sys.osName} />
                <InfoRow label="OS Version" value={sys.osVersion} />
                <InfoRow label="Manufacturer" value={sys.systemManufacturer} />
                <InfoRow label="System Model" value={sys.systemModel} />
                <InfoRow label="BIOS" value={sys.biosVersion} />
                <InfoRow label="Hypervisor" value={sys.hypervisorDetected ? 'Detected' : '—'} />
                <InfoRow label="Time Zone" value={sys.timeZone} />
                <InfoRow label="Install Date" value={sys.installDate} />
                <InfoRow label="Last Boot" value={sys.bootTime} />
                <InfoRow label="Logon Server" value={sys.logonServer} />
              </div>
              {sys.networkAdapters.length > 0 && (
                <div className="mt-2.5">
                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em', marginBottom: '3px' }}>
                    NETWORK ADAPTERS ({sys.networkAdapters.length})
                  </div>
                  {sys.networkAdapters.map((n, i) => (
                    <div key={i} style={{ fontSize: '10.5px', marginBottom: '3px' }}>
                      <span style={{ color: '#0F2952', fontWeight: 600 }}>{n.name}</span>
                      {n.ipAddresses.length > 0 && <span style={{ color: '#475569', fontFamily: 'monospace', marginLeft: '8px' }}>{n.ipAddresses.join(', ')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Forcepoint Products */}
          {b.forcepointProducts && (
            <Section title="Forcepoint Products">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                {b.forcepointProducts.eipInfraInstalled && <InfoRow label="EIP Infra" value={`${b.forcepointProducts.eipInfraVersion}`} />}
                {b.forcepointProducts.dlpInstalled && <InfoRow label="Data Security (DLP)" value={`${b.forcepointProducts.dlpVersion}`} />}
                <InfoRow label="Web Security" value={b.forcepointProducts.webSecurityInstalled ? 'Installed' : 'Not installed'} />
                <InfoRow label="Email Security" value={b.forcepointProducts.emailSecurityInstalled ? 'Installed' : 'Not installed'} />
              </div>
            </Section>
          )}

          {/* Hardware */}
          {b.hardware && (
            <Section title="Hardware">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                <InfoRow label="CPU" value={b.hardware.cpuModel ? `${b.hardware.cpuCount} × ${b.hardware.cpuModel}` : `${b.hardware.cpuCount}`} />
                <InfoRow label="CPU Speed" value={b.hardware.cpuSpeedMhz ? `${b.hardware.cpuSpeedMhz} MHz` : ''} />
                <InfoRow label="RAM" value={`${formatMemoryGB(b.hardware.ramTotalMB)} total — ${b.hardware.ramUsagePercent}% used`} />
                <InfoRow label="Available RAM" value={formatMemoryGB(b.hardware.ramAvailableMB)} />
                <InfoRow label="Disk C:" value={`${b.hardware.diskCTotalGB} GB total — ${b.hardware.diskCUsagePercent}% used`} />
                <InfoRow label="Disk C: free" value={`${b.hardware.diskCFreeGB} GB`} />
              </div>
            </Section>
          )}

          {/* Hotfixes */}
          {hf && (
            <Section title={`OS Hotfixes (${hf.totalCount})`} badge={hf.patchStatus} badgeColor={statusColor(hf.patchStatus)}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                <InfoRow label="Latest Hotfix" value={hf.latestHotfixId} />
                <InfoRow label="Installed On" value={hf.latestHotfixDateRaw} />
                <InfoRow label="Days Since Last Patch" value={hf.daysSinceLastPatch != null ? `${hf.daysSinceLastPatch} days` : '—'} />
                <InfoRow label="Patch Status" value={hf.patchStatus} />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {hf.hotfixes.map(h => (
                  <span key={h.id} className="font-mono px-1.5 py-0.5 rounded" style={{ fontSize: '9.5px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }} title={h.installedOnRaw}>
                    {h.id}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Services — per-row table so the user can audit each service's actual state */}
          {b.services && (
            <Section title={`Websense Services (${b.services.totalWebsenseServices})`}
              badge={b.services.allRunning ? 'ALL RUNNING' : `${b.services.notRunning.length} NOT RUNNING`}
              badgeColor={b.services.allRunning ? '#16a34a' : '#dc2626'}>
              {b.services.notRunning.length > 0 ? (
                <div className="px-3 py-2 rounded mb-2" style={{ background: '#FEF2F2', border: '1px solid #FECACA', fontSize: '11px' }}>
                  <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: '3px' }}>⚠ Not running:</div>
                  <ul style={{ marginLeft: '14px', listStyle: 'disc', color: '#7F1D1D' }}>
                    {b.services.notRunning.map(name => <li key={name}>{name}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded mb-2" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: '11px', color: '#16A34A' }}>
                  ✓ All {b.services.totalWebsenseServices} services parsed from the bundle are Running.
                </div>
              )}

              {/* Compact per-service table */}
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '5px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0' }}>SERVICE</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0', width: '70px' }}>START</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0', width: '70px' }}>STATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.services.services.map((s, i) => <ServiceRow key={s.name + i} service={s} alt={i % 2 === 1} />)}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* SQL Server */}
          {b.sqlServer && (
            <Section title="SQL Server"
              badge={b.sqlServer.editionStatus === 'WARNING' ? `${b.sqlServer.editionStatus} EDITION` : b.sqlServer.patchStatus}
              badgeColor={statusColor(b.sqlServer.editionStatus === 'WARNING' ? 'WARNING' : b.sqlServer.patchStatus)}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                <InfoRow label="Version" value={b.sqlServer.versionShort} />
                <InfoRow label="Build Number" value={b.sqlServer.buildNumber} />
                <InfoRow label="Build Date" value={b.sqlServer.buildDate} />
                <InfoRow label="Edition" value={b.sqlServer.edition} />
              </div>
            </Section>
          )}

          {/* Database */}
          {b.database && (
            <Section title="Database">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                <InfoRow label="Name" value={b.database.name} />
                <InfoRow label="Total Size" value={`${b.database.totalSizeMB} MB`} />
                <InfoRow label="Data (.mdf)" value={`${b.database.dataFileSizeMB} MB`} />
                <InfoRow label="Log (.ldf)" value={`${b.database.logFileSizeMB} MB`} />
              </div>
            </Section>
          )}

          {/* Event Partitions (PA_EVENT_PARTITION_CATALOG.csv) */}
          {b.eventPartitions?.summary && (() => {
            const s = b.eventPartitions.summary!;
            const fmtN = (n: number) => n.toLocaleString();
            return (
              <Section title="Event Partitions"
                badge={`${s.archivedPartitionCount + s.onlinePartitionCount} TOTAL`}
                badgeColor={s.warnings.length > 0 ? '#DC2626' : '#2563EB'}>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                  <InfoRow label="Archived Parts" value={`${s.archivedPartitionCount}`} />
                  <InfoRow label="Online Parts" value={`${s.onlinePartitionCount}`} />
                  <InfoRow label="Total Events" value={fmtN(s.totalEvents)} />
                  <InfoRow label="Archived Events" value={fmtN(s.archivedEvents)} />
                  <InfoRow label="Online Events" value={fmtN(s.onlineEvents)} />
                  <InfoRow label="Active Window" value={s.activePartitionFrom && s.activePartitionTo ? `${s.activePartitionFrom} → ${s.activePartitionTo}` : '—'} />
                  <InfoRow label="Data History" value={s.dataHistoryStart && s.dataHistoryEnd ? `${s.dataHistoryStart} → ${s.dataHistoryEnd}` : '—'} />
                </div>
                {s.warnings.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {s.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '10.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '4px 7px' }}>{w}</div>
                    ))}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* DLP Config Properties (PA_CONFIG_PROPERTIES.csv) */}
          {b.configProperties && (() => {
            const c = b.configProperties;
            const yn = (v: boolean) => v ? 'Yes' : 'No';
            const flagPill = (label: string, on: boolean) => (
              <span style={{
                fontSize: '9.5px', fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: on ? '#DCFCE7' : '#F1F5F9',
                color: on ? '#15803D' : '#64748B',
                border: `1px solid ${on ? '#86EFAC' : '#E2E8F0'}`,
                fontFamily: 'monospace',
              }}>{label}: {on ? 'ON' : 'OFF'}</span>
            );
            const statusPill = (label: string, status: string) => {
              const bad = status === 'UNSYNCHRONIZED_EDIT';
              return (
                <span style={{
                  fontSize: '9.5px', fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                  background: bad ? '#FEF2F2' : '#DCFCE7',
                  color: bad ? '#A30080' : '#15803D',
                  border: `1px solid ${bad ? '#FECACA' : '#86EFAC'}`,
                  fontFamily: 'monospace',
                }}>{label}: {status || '—'}</span>
              );
            };
            return (
              <Section title="DLP Config Properties"
                badge={`${c.warnings.length} WARN${c.warnings.length === 1 ? '' : 'S'}`}
                badgeColor={c.warnings.length > 0 ? '#DC2626' : '#16A34A'}>
                {/* Event traffic totals */}
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>EVENT TRAFFIC TOTALS</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1" style={{ fontSize: '11px', marginBottom: 8 }}>
                  <InfoRow label="Web tx" value={c.webTransactionsTotal} />
                  <InfoRow label="Web size" value={c.webSizeTotal} />
                  <InfoRow label="Email tx" value={c.emailTransactionsTotal} />
                  <InfoRow label="Email size" value={c.emailSizeTotal} />
                  <InfoRow label="Discovery tx" value={c.discoveryTransactionsTotal} />
                  <InfoRow label="Discovery size" value={c.discoverySizeTotal} />
                  <InfoRow label="Mobile tx" value={c.mobileTransactionsTotal} />
                </div>
                {/* Deploy policy status */}
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>POLICY DEPLOY STATUS</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {statusPill('Policy Engine', c.policyEngineConfigStatus)}
                  {statusPill('DIM', c.dimPolicyStatus)}
                  {statusPill('DAR', c.darPolicyStatus)}
                </div>
                {/* Feature flags */}
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>FEATURE FLAGS</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {flagPill('Behavior Analytics', c.behaviorAnalyticsEnabled)}
                  {flagPill('RAP', c.rapEnabled)}
                  {flagPill('MIP', c.mipEnabled)}
                  {flagPill('Linking Service', c.linkingServiceEnabled)}
                </div>
                {/* LDAP repositories */}
                {c.ldapRepos.length > 0 && (
                  <>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>LDAP REPOSITORIES ({c.ldapRepos.length})</div>
                    <div className="flex flex-col gap-1 mb-2" style={{ fontSize: '10.5px' }}>
                      {c.ldapRepos.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span style={{ color: '#0F2952', fontWeight: 600, flex: 1 }}>{r.name}</span>
                          {flagPill('Enabled', r.enabled)}
                          <span style={{
                            fontSize: '9.5px', fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                            background: r.lastSyncOk ? '#DCFCE7' : '#FEF2F2',
                            color: r.lastSyncOk ? '#15803D' : '#A30080',
                            border: `1px solid ${r.lastSyncOk ? '#86EFAC' : '#FECACA'}`,
                            fontFamily: 'monospace',
                          }}>Last sync: {r.lastSyncOk ? 'OK' : 'FAIL'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* Misc */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                  <InfoRow label="Audit retention" value={c.auditRetentionDays ? `${c.auditRetentionDays} days` : '—'} />
                  <InfoRow label="Partition duration" value={c.partitionDurationDays ? `${c.partitionDurationDays} days` : '—'} />
                  <InfoRow label="LDAP frequency" value={c.ldapImportFrequency} />
                  <InfoRow label="LDAP import time" value={c.ldapImportTime} />
                  <InfoRow label="SIEM host" value={c.siemSyslogHost} />
                  <InfoRow label="SIEM port" value={c.siemSyslogPort} />
                  <InfoRow label="Backup path" value={c.backupPath} />
                  <InfoRow label="Backup copies" value={c.backupCopies} />
                  <InfoRow label="Backup includes forensics" value={yn(c.backupIncludesForensics)} />
                  <InfoRow label="Policy concurrency" value={c.policyConcurrencyLevel} />
                </div>
                {/* Warnings */}
                {c.warnings.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {c.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '10.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '4px 7px' }}>{w}</div>
                    ))}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* Site Elements (WS_SM_SITE_ELEMENTS.csv) */}
          {b.siteElements && (() => {
            const se = b.siteElements;
            const ss = se.syncStatus;
            const versionCount = Object.keys(se.versionInventory).length;
            return (
              <Section title="Site Elements"
                badge={`${ss.total} COMPONENTS · ${ss.syncPercentage}% SYNCED`}
                badgeColor={ss.syncPercentage < 70 ? '#DC2626' : ss.syncPercentage < 95 ? '#D97706' : '#16A34A'}>
                {/* Component counts */}
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>COMPONENT INVENTORY</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2" style={{ fontSize: '11px' }}>
                  {Object.entries(se.componentCounts).map(([name, n]) => (
                    <InfoRow key={name} label={name} value={String(n)} />
                  ))}
                </div>
                {/* Sync health */}
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>SYNC HEALTH</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 mb-2" style={{ fontSize: '11px' }}>
                  <InfoRow label="Synchronized" value={`${ss.synchronized}`} />
                  <InfoRow label="Unsync edit" value={`${ss.unsynchronizedEdit}`} />
                  <InfoRow label="Marked unsync" value={`${ss.markedUnsynchronizedEdit}`} />
                </div>
                {/* Version inventory */}
                {versionCount > 0 && (
                  <>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>
                      VERSION MIX ({versionCount} {versionCount === 1 ? 'version' : 'versions'})
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {Object.entries(se.versionInventory).map(([v, n]) => (
                        <span key={v} style={{
                          fontSize: '9.5px', fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                          background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', fontFamily: 'monospace',
                        }}>{v}: {n}</span>
                      ))}
                    </div>
                  </>
                )}
                {/* Disabled components */}
                {se.disabledComponents.length > 0 && (
                  <>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#A30080', letterSpacing: '0.05em', marginBottom: 4 }}>DISABLED COMPONENTS ({se.disabledComponents.length})</div>
                    <div className="flex flex-col gap-1 mb-2" style={{ fontSize: '10.5px' }}>
                      {se.disabledComponents.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
                          <span style={{ color: '#A30080', fontWeight: 600 }}>{d.name}</span>
                          <span style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '9.5px' }}>{d.type}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* Failed deployments */}
                {se.failedDeployments.length > 0 && (
                  <>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#A30080', letterSpacing: '0.05em', marginBottom: 4 }}>FAILED DEPLOYMENTS ({se.failedDeployments.length})</div>
                    <div className="flex flex-col gap-1 mb-2" style={{ fontSize: '10.5px' }}>
                      {se.failedDeployments.map((f, i) => (
                        <div key={i} className="px-2 py-1 rounded" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                          <div style={{ color: '#A30080', fontWeight: 600 }}>{f.name} · {f.type}</div>
                          {f.reason && <div style={{ color: '#64748B', fontSize: '9.5px', marginTop: 2 }}>{f.reason}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* DLP Application Server hostnames */}
                {se.dlpServerHostnames.length > 0 && (
                  <>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 4 }}>DLP APPLICATION SERVERS ({se.dlpServerHostnames.length})</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {se.dlpServerHostnames.map((h, i) => (
                        <span key={i} style={{
                          fontSize: '9.5px', fontWeight: 600, padding: '2px 7px', borderRadius: 3,
                          background: '#F1F5F9', color: '#0F2952', border: '1px solid #E2E8F0', fontFamily: 'monospace',
                        }}>{h}</span>
                      ))}
                    </div>
                  </>
                )}
                {/* Warnings */}
                {se.warnings.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {se.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '10.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '4px 7px' }}>{w}</div>
                    ))}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* Endpoint Clients */}
          {b.endpointClients && (
            <Section title="Endpoint Clients">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                <InfoRow label="Synced" value={`${b.endpointClients.syncedCount}`} />
                <InfoRow label="Unsynced" value={`${b.endpointClients.unsyncedCount}`} />
                <InfoRow label="Profile" value={b.endpointClients.profileName} />
                <InfoRow label="Profile Enabled" value={b.endpointClients.profileEnabled ? 'Yes' : 'No'} />
              </div>
            </Section>
          )}

          {/* Active Policies */}
          {b.activePolicies && (
            <Section title="Active Policies"
              badge={`${b.activePolicies.policyNames.length} POLICIES — ${b.activePolicies.totalRules} RULES`}
              badgeColor="#2563EB">
              {b.activePolicies.rulesWithExceptions.length > 0 && (
                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, color: '#d97706' }}>{b.activePolicies.rulesWithExceptions.length} rules have exceptions</span>
                </div>
              )}
              <div style={{ fontSize: '10.5px', color: '#475569', maxHeight: '120px', overflowY: 'auto' }}>
                {b.activePolicies.policyNames.slice(0, 30).map(p => <div key={p}>• {p}</div>)}
                {b.activePolicies.policyNames.length > 30 && <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>… and {b.activePolicies.policyNames.length - 30} more</div>}
              </div>
            </Section>
          )}

          {/* Installed Products */}
          {b.installedProducts.length > 0 && (
            <Section title={`Third-Party Installed Apps (${b.installedProducts.length})`}>
              <div style={{ fontSize: '10.5px', color: '#475569', maxHeight: '120px', overflowY: 'auto' }}>
                {b.installedProducts.map((p, i) => (
                  <div key={i} className="flex justify-between gap-2 py-0.5" style={{ borderBottom: i < b.installedProducts.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ color: '#0F2952', fontWeight: 500 }}>{p.name}</span>
                    <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{p.vendor} · {p.version}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* DEP / Misc */}
          {b.depEnabled != null && (
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0' }}>
              <span style={{ fontWeight: 600 }}>DEP (Data Execution Prevention):</span>{' '}
              <span style={{ color: b.depEnabled ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{b.depEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          )}

          {/* Diagnostic footer */}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', fontSize: '9.5px', color: '#94a3b8' }}>
            DLP Telemetry: <span style={{ fontFamily: 'monospace' }}>{b.bundleName}</span> · Parsed {b.parsedFiles.length} of {b.fileCount} files
            {b.unrecognizedFiles.length > 0 && <> · {b.unrecognizedFiles.length} unrecognized</>}
          </div>
        </div>
      )}
    </div>
  );
}

/* Colour map shared by the three log-analyzer panels — keeps the severity
   pill style in sync with the report HTML. CRITICAL / HIGH dominate;
   MEDIUM / LOW are advisory. */
type AnyLogSeverity = LogSeverity | AuditSeverity | ServiceLogSeverity;

const SEVERITY_STYLE: Record<AnyLogSeverity, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: '#FEE2E2', color: '#991B1B', border: 'rgba(220,38,38,0.35)' },
  HIGH:     { bg: '#FEF3C7', color: '#92400E', border: 'rgba(217,119,6,0.35)' },
  MEDIUM:   { bg: '#FEF9C3', color: '#854D0E', border: 'rgba(202,138,4,0.30)' },
  LOW:      { bg: '#F1F5F9', color: '#475569', border: 'rgba(100,116,139,0.30)' },
};

function severityCount(issues: ReadonlyArray<{ severity: AnyLogSeverity }>): { critical: number; high: number; medium: number; low: number } {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) {
    if (i.severity === 'CRITICAL') out.critical++;
    else if (i.severity === 'HIGH') out.high++;
    else if (i.severity === 'MEDIUM') out.medium++;
    else out.low++;
  }
  return out;
}

function IssuePill({ severity }: { severity: AnyLogSeverity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className="px-1.5 py-0.5 rounded font-mono font-bold"
      style={{ fontSize: '9px', background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {severity}
    </span>
  );
}

function DlpAllLogPanel({ report, busy, error, onPick, onDrop, onClear, isStarred, isDismissed, onToggleStar, onDismiss }: {
  report: DlpAllLogReport | null;
  busy: boolean;
  error: string;
  onPick: () => void;
  onDrop: (file: File | undefined) => void;
  onClear: () => void;
  isStarred: (issueId: string) => boolean;
  isDismissed: (issueId: string) => boolean;
  onToggleStar: (issueId: string, iss: { title: string; recommendation: string; severity: AnyLogSeverity; component: string }) => void;
  onDismiss: (issueId: string) => void;
}) {
  const counts = report ? severityCount(report.issues) : { critical: 0, high: 0, medium: 0, low: 0 };
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: report ? '1.5px solid rgba(220,38,38,0.30)' : '1.5px dashed #FCD34D', background: report ? '#FFF1F2' : 'rgba(254,243,199,0.30)' }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(220,38,38,0.10)' }}>
          <FileText size={13} style={{ color: '#DC2626' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
            DLP Tomcat App Log <span style={{ fontFamily: 'monospace', fontWeight: 400, color: '#94A3B8' }}>(dlp-all.log)</span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {report
              ? <>Parsed <strong>{report.recordCount.toLocaleString()}</strong> records · {report.errorCount} ERROR · {report.warnCount} WARN · {report.spanFirst} → {report.spanLast}{(report.staleDropped + report.lowVolumeDropped) > 0 && <> · <span style={{ color: '#94A3B8' }}>filtered {report.staleDropped} stale + {report.lowVolumeDropped} low-volume</span></>}</>
              : <>From <span style={{ fontFamily: 'monospace' }}>\Data Security\tomcat\logs\dlp\dlp-all.log</span> — auto-detected on DLP Telemetry drop, or upload directly. Findings shown only if ≥10 occurrences in last 30 days.</>}
          </div>
        </div>
        {report && (
          <div className="flex items-center gap-1">
            {counts.critical > 0 && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEE2E2', color: '#991B1B' }}>{counts.critical} CRIT</span>}
            {counts.high > 0     && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF3C7', color: '#92400E' }}>{counts.high} HIGH</span>}
            {counts.medium > 0   && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF9C3', color: '#854D0E' }}>{counts.medium} MED</span>}
          </div>
        )}
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg font-semibold"
          style={{ fontSize: '10.5px', background: busy ? '#FECACA' : '#DC2626', color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy
            ? <><Loader size={10} className="animate-spin" style={{ display: 'inline', marginRight: '4px' }} />Parsing…</>
            : <><Upload size={10} style={{ display: 'inline', marginRight: '4px' }} />{report ? 'Replace' : 'Upload'}</>}
        </button>
        {report && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center justify-center rounded"
            style={{ width: '24px', height: '24px', background: 'transparent', border: '1px solid #FECACA', color: '#DC2626', cursor: 'pointer' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>

      <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(e.dataTransfer.files?.[0]); }}>
        {error && (
          <div className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 rounded-lg"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <XCircle size={13} style={{ color: '#DC2626' }} />
            <span style={{ fontSize: '11px', color: '#991B1B' }}>{error}</span>
          </div>
        )}
        {report && (() => {
          const visible = report.issues.filter((iss) => !isDismissed(iss.id));
          if (visible.length === 0) return null;
          return (
            <div className="px-3 pb-3 space-y-1.5">
              {visible.map((iss) => (
                <LogIssueRow
                  key={`dlp-${iss.id}`}
                  title={iss.title}
                  severity={iss.severity}
                  component={iss.component}
                  description={iss.description}
                  occurrences={iss.occurrences}
                  firstSeen={iss.first_seen}
                  lastSeen={iss.last_seen}
                  recommendation={iss.recommendation}
                  starred={isStarred(iss.id)}
                  onToggleStar={() => onToggleStar(iss.id, iss)}
                  onDismiss={() => onDismiss(iss.id)}
                />
              ))}
            </div>
          );
        })()}
        {report && report.issues.length === 0 && (
          <div className="px-3 pb-3" style={{ fontSize: '11px', color: '#64748B' }}>
            {(report.staleDropped + report.lowVolumeDropped) > 0
              ? <>No reportable findings — {report.staleDropped} stale and {report.lowVolumeDropped} low-volume pattern(s) filtered out (under the ≥10 occurrences / last 30 days bar).</>
              : <>No matching error / warning patterns — log shows a clean run.</>}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditLogPanel({ report, busy, error, onPick, onDrop, onClear, isStarred, isDismissed, onToggleStar, onDismiss }: {
  report: AuditSystemLogsReport | null;
  busy: boolean;
  error: string;
  onPick: () => void;
  onDrop: (file: File | undefined) => void;
  onClear: () => void;
  isStarred: (issueId: string) => boolean;
  isDismissed: (issueId: string) => boolean;
  onToggleStar: (issueId: string, iss: { title: string; recommendation: string; severity: AnyLogSeverity; component: string }) => void;
  onDismiss: (issueId: string) => void;
}) {
  const counts = report ? severityCount(report.issues) : { critical: 0, high: 0, medium: 0, low: 0 };
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: report ? '1.5px solid rgba(124,58,237,0.30)' : '1.5px dashed #DDD6FE', background: report ? '#F5F3FF' : 'rgba(245,243,255,0.40)' }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(124,58,237,0.10)' }}>
          <FileText size={13} style={{ color: '#7C3AED' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
            DLP Audit System Logs <span style={{ fontFamily: 'monospace', fontWeight: 400, color: '#94A3B8' }}>(AUDIT_SYSTEM_LOGS.csv)</span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {report
              ? <>Parsed <strong>{report.totalRows.toLocaleString()}</strong> rows · {report.errorRows} ERROR · {report.warningRows} WARN · {report.spanFirst} → {report.spanLast}{(report.staleDropped + report.lowVolumeDropped) > 0 && <> · <span style={{ color: '#94A3B8' }}>filtered {report.staleDropped} stale + {report.lowVolumeDropped} low-volume</span></>}</>
              : <>From <span style={{ fontFamily: 'monospace' }}>\SQL queries\AUDIT_SYSTEM_LOGS.csv</span> — auto-detected on DLP Telemetry drop, or upload directly. Findings shown only if ≥10 occurrences in last 30 days.</>}
          </div>
        </div>
        {report && (
          <div className="flex items-center gap-1">
            {counts.critical > 0 && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEE2E2', color: '#991B1B' }}>{counts.critical} CRIT</span>}
            {counts.high > 0     && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF3C7', color: '#92400E' }}>{counts.high} HIGH</span>}
            {counts.medium > 0   && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF9C3', color: '#854D0E' }}>{counts.medium} MED</span>}
          </div>
        )}
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg font-semibold"
          style={{ fontSize: '10.5px', background: busy ? '#DDD6FE' : '#7C3AED', color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy
            ? <><Loader size={10} className="animate-spin" style={{ display: 'inline', marginRight: '4px' }} />Parsing…</>
            : <><Upload size={10} style={{ display: 'inline', marginRight: '4px' }} />{report ? 'Replace' : 'Upload'}</>}
        </button>
        {report && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center justify-center rounded"
            style={{ width: '24px', height: '24px', background: 'transparent', border: '1px solid #DDD6FE', color: '#7C3AED', cursor: 'pointer' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>

      <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(e.dataTransfer.files?.[0]); }}>
        {error && (
          <div className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 rounded-lg"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <XCircle size={13} style={{ color: '#DC2626' }} />
            <span style={{ fontSize: '11px', color: '#991B1B' }}>{error}</span>
          </div>
        )}
        {report && (() => {
          const visible = report.issues.filter((iss) => !isDismissed(iss.id));
          if (visible.length === 0) return null;
          return (
            <div className="px-3 pb-3 space-y-1.5">
              {visible.map((iss) => (
                <LogIssueRow
                  key={`audit-${iss.id}`}
                  title={iss.title}
                  severity={iss.severity}
                  component={iss.source}
                  description={iss.description}
                  occurrences={iss.occurrences}
                  firstSeen={iss.first_seen}
                  lastSeen={iss.last_seen}
                  recommendation={iss.recommendation}
                  starred={isStarred(iss.id)}
                  onToggleStar={() => onToggleStar(iss.id, { ...iss, component: iss.source })}
                  onDismiss={() => onDismiss(iss.id)}
                />
              ))}
            </div>
          );
        })()}
        {report && report.issues.length === 0 && (
          <div className="px-3 pb-3" style={{ fontSize: '11px', color: '#64748B' }}>
            {(report.staleDropped + report.lowVolumeDropped) > 0
              ? <>No reportable findings — {report.staleDropped} stale and {report.lowVolumeDropped} low-volume pattern(s) filtered out (under the ≥10 occurrences / last 30 days bar).</>
              : <>No matching audit patterns — CSV shows a clean run.</>}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceLogsPanel({ report, busy, error, onPick, onDropFiles, onClear, isStarred, isDismissed, onToggleStar, onDismiss }: {
  report: ServiceLogsReport | null;
  busy: boolean;
  error: string;
  onPick: () => void;
  onDropFiles: (files: FileList | undefined) => void;
  onClear: () => void;
  isStarred: (issueId: string) => boolean;
  isDismissed: (issueId: string) => boolean;
  onToggleStar: (issueId: string, iss: { title: string; recommendation: string; severity: AnyLogSeverity; component: string }) => void;
  onDismiss: (issueId: string) => void;
}) {
  const counts = report ? severityCount(report.issues) : { critical: 0, high: 0, medium: 0, low: 0 };
  const recognisedFiles = report ? report.files.filter((f) => f.family !== 'unknown') : [];
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: report ? '1.5px solid rgba(20,184,166,0.35)' : '1.5px dashed #99F6E4', background: report ? '#F0FDFA' : 'rgba(240,253,250,0.40)' }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(20,184,166,0.10)' }}>
          <FileText size={13} style={{ color: '#0D9488' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
            DLP Service Logs <span style={{ fontFamily: 'monospace', fontWeight: 400, color: '#94A3B8' }}>(FPR / EndPointServer / PolicyEngine / mgmtd / HealthCheck / WorkScheduler / CleanupAndArchive)</span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {report
              ? <>{recognisedFiles.length} file{recognisedFiles.length !== 1 ? 's' : ''} · Parsed <strong>{report.totalLines.toLocaleString()}</strong> lines · {report.totalErrors} ERROR · {report.spanFirst} → {report.spanLast}{(report.staleDropped + report.lowVolumeDropped) > 0 && <> · <span style={{ color: '#94A3B8' }}>filtered {report.staleDropped} stale + {report.lowVolumeDropped} low-volume</span></>}</>
              : <>From <span style={{ fontFamily: 'monospace' }}>\Data Security\Logs\</span> — auto-detected on DLP Telemetry drop, or select the *.log files directly. Findings shown only if ≥10 occurrences in last 30 days.</>}
          </div>
        </div>
        {report && (
          <div className="flex items-center gap-1">
            {counts.critical > 0 && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEE2E2', color: '#991B1B' }}>{counts.critical} CRIT</span>}
            {counts.high > 0     && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF3C7', color: '#92400E' }}>{counts.high} HIGH</span>}
            {counts.medium > 0   && <span className="px-1.5 py-0.5 rounded font-mono font-bold" style={{ fontSize: '9.5px', background: '#FEF9C3', color: '#854D0E' }}>{counts.medium} MED</span>}
          </div>
        )}
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg font-semibold"
          style={{ fontSize: '10.5px', background: busy ? '#99F6E4' : '#0D9488', color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy
            ? <><Loader size={10} className="animate-spin" style={{ display: 'inline', marginRight: '4px' }} />Parsing…</>
            : <><Upload size={10} style={{ display: 'inline', marginRight: '4px' }} />{report ? 'Replace' : 'Upload'}</>}
        </button>
        {report && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center justify-center rounded"
            style={{ width: '24px', height: '24px', background: 'transparent', border: '1px solid #99F6E4', color: '#0D9488', cursor: 'pointer' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>

      <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropFiles(e.dataTransfer.files ?? undefined); }}>
        {error && (
          <div className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 rounded-lg"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <XCircle size={13} style={{ color: '#DC2626' }} />
            <span style={{ fontSize: '11px', color: '#991B1B' }}>{error}</span>
          </div>
        )}
        {report && recognisedFiles.length > 0 && (
          <div className="mx-3 mb-2 px-2.5 py-1.5 rounded" style={{ background: '#fff', border: '1px solid #CCFBF1', fontSize: '10px', color: '#0F766E', fontFamily: 'monospace' }}>
            {recognisedFiles.map((f) => `${f.name} (${f.errorCount} errs)`).join(' · ')}
          </div>
        )}
        {report && (() => {
          const visible = report.issues.filter((iss) => !isDismissed(iss.id));
          if (visible.length === 0) return null;
          return (
            <div className="px-3 pb-3 space-y-1.5">
              {visible.map((iss) => (
                <LogIssueRow
                  key={`svc-${iss.id}`}
                  title={iss.title}
                  severity={iss.severity}
                  component={iss.component}
                  description={iss.description}
                  occurrences={iss.occurrences}
                  firstSeen={iss.first_seen}
                  lastSeen={iss.last_seen}
                  recommendation={iss.recommendation}
                  logSources={iss.log_sources}
                  starred={isStarred(iss.id)}
                  onToggleStar={() => onToggleStar(iss.id, iss)}
                  onDismiss={() => onDismiss(iss.id)}
                />
              ))}
            </div>
          );
        })()}
        {report && report.issues.length === 0 && (
          <div className="px-3 pb-3" style={{ fontSize: '11px', color: '#64748B' }}>
            {(report.staleDropped + report.lowVolumeDropped) > 0
              ? <>No reportable findings — {report.staleDropped} stale and {report.lowVolumeDropped} low-volume pattern(s) filtered out (under the ≥10 occurrences / last 30 days bar).</>
              : <>No matching error patterns across the service logs — services show a clean run.</>}
          </div>
        )}
      </div>
    </div>
  );
}

/* Single issue row shared by all three log-analyzer panels.
   Collapsible — first line carries the severity + title + count; the body
   (description + recommendation) is revealed on click so the panel header
   stays scannable.

   Star toggle = "include this finding in the HC report AND auto-spawn a
                 matching Urgent Action item". Sticky between sessions.
   Dismiss (X)  = "hide from the wizard UI". Doesn't affect already-spawned
                 action items — those have their own delete control. */
function LogIssueRow({
  title, severity, component, description, occurrences, firstSeen, lastSeen, recommendation,
  starred, onToggleStar, onDismiss, logSources,
}: {
  title: string;
  severity: AnyLogSeverity;
  component: string;
  description: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  recommendation: string;
  starred: boolean;
  onToggleStar: () => void;
  onDismiss: () => void;
  logSources?: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md" style={{ border: starred ? '1.5px solid #FACC15' : '1px solid #E2E8F0', background: starred ? '#FFFBEB' : '#fff' }}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <IssuePill severity={severity} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>{component}{logSources && logSources.length > 0 ? ` · ${logSources.join(', ')}` : ''}</div>
        </div>
        <span className="px-1.5 py-0.5 rounded font-mono" style={{ fontSize: '9.5px', background: '#F1F5F9', color: '#475569', fontWeight: 700 }}>
          ×{occurrences.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
          title={starred ? 'Unstar — remove from report and unlink Urgent Action.' : 'Star — include in report and spawn an Urgent Action item.'}
          className="flex items-center justify-center rounded"
          style={{ width: '22px', height: '22px', background: starred ? '#FEF3C7' : 'transparent', border: '1px solid', borderColor: starred ? '#FACC15' : '#E2E8F0', color: starred ? '#B45309' : '#94A3B8', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = starred ? '#FEF3C7' : '#FEF9C3'; e.currentTarget.style.color = '#B45309'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = starred ? '#FEF3C7' : 'transparent'; e.currentTarget.style.color = starred ? '#B45309' : '#94A3B8'; }}>
          <Star size={11} fill={starred ? '#F59E0B' : 'none'} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Hide this finding from the wizard. (Won't delete the spawned Urgent Action, if any.)"
          className="flex items-center justify-center rounded"
          style={{ width: '22px', height: '22px', background: 'transparent', border: '1px solid #E2E8F0', color: '#94A3B8', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#E2E8F0'; }}>
          <Trash2 size={11} />
        </button>
        {open
          ? <ChevronDown size={12} style={{ color: '#94A3B8' }} />
          : <ChevronRight size={12} style={{ color: '#94A3B8' }} />}
      </div>
      {open && (
        <div className="px-2.5 pb-2 pt-1" style={{ borderTop: '1px dashed #E2E8F0' }}>
          <div style={{ fontSize: '10.5px', color: '#334155', lineHeight: 1.5, marginTop: '4px' }}>{description}</div>
          <div className="flex items-center gap-3 mt-2" style={{ fontSize: '10px', color: '#64748B' }}>
            <span><Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />First {firstSeen}</span>
            <span><Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />Last {lastSeen}</span>
          </div>
          <div className="mt-2 px-2 py-1.5 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '10.5px', color: '#0F172A' }}>
            <strong style={{ color: '#0F2952' }}>Recommendation:</strong> {recommendation}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function Step3DataCollectors({
  sqlConfig, setSqlConfig,
  apiConnectors, setApiConnectors,
  selectedReports, setSelectedReports,
  reportWindows, setReportWindows,
  reportRuns, setReportRuns,
  selectedProducts,
  dlpBundles, setDlpBundles,
  dlpDashboardSummary, setDlpDashboardSummary,
  dlpPostureSummary, setDlpPostureSummary,
  dlpPostureSections, setDlpPostureSections,
  destinationPatterns,
  customerConnector, setCustomerConnector,
  dlpAllLogReport, setDlpAllLogReport,
  auditLogReport, setAuditLogReport,
  serviceLogsReport, setServiceLogsReport,
  starredLogIssues, setStarredLogIssues,
  dismissedLogIssues, setDismissedLogIssues,
  onStarLogIssue,
}: Props) {
  const [sqlStatus,  setSqlStatus]  = useState<ConnStatus>({ state: 'idle' });
  const [apiStatus,  setApiStatus]  = useState<Partial<Record<keyof ApiConnectorsConfig, ConnStatus>>>({});
  const [showPw,     setShowPw]     = useState<Partial<Record<string, boolean>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['web', 'dlp', 'email']));
  /* Every data-source card starts collapsed — operator opens only what
     they need. The chevron in each card header toggles its own entry. */
  const [cardOpen, setCardOpen] = useState<Record<string, boolean>>({});
  const toggleCard = (key: string) => setCardOpen(prev => ({ ...prev, [key]: !prev[key] }));
  const isCardOpen = (key: string) => !!cardOpen[key];
  /* Backwards-compat alias for the DLP Server Info bundle card — that
     section was previously gated on a dedicated `dlpExpanded` flag with
     a different default; now it's part of the unified collapse map. */
  const dlpExpanded = isCardOpen('dlp_server_info');
  const setDlpExpanded = (next: boolean | ((p: boolean) => boolean)) => {
    setCardOpen(prev => ({
      ...prev,
      dlp_server_info: typeof next === 'function' ? next(!!prev.dlp_server_info) : next,
    }));
  };
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string>('');
  const [parseBusy, setParseBusy] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string>('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const dashboardInputRef = useRef<HTMLInputElement>(null);
  const dlpLogInputRef = useRef<HTMLInputElement>(null);
  const auditCsvInputRef = useRef<HTMLInputElement>(null);
  const serviceLogsInputRef = useRef<HTMLInputElement>(null);
  const [dlpLogBusy, setDlpLogBusy] = useState(false);
  const [dlpLogError, setDlpLogError] = useState<string>('');
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string>('');
  const [serviceLogsBusy, setServiceLogsBusy] = useState(false);
  const [serviceLogsError, setServiceLogsError] = useState<string>('');

  /* ── Customer Connector ── */
  const [connectorStatus, setConnectorStatus] = useState<CustomerConnectorStatus | null>(null);
  /* Poll the companion's /api/connector/status every 5s when the connector
     is enabled AND a token has been generated. Empty token = no point
     polling. We bail out of the effect if the user disables. */
  useEffect(() => {
    if (!customerConnector.enabled || !customerConnector.token) {
      setConnectorStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const st = await fetchConnectorStatus(customerConnector.token);
      if (!cancelled) setConnectorStatus(st);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [customerConnector.enabled, customerConnector.token]);

  /* Track the previously-registered token so we can deregister it on
     the server when the operator rotates OR disables the connector.
     Without this, an old token stays valid forever — the deployed
     connector binary still has it in connector.json and would keep
     phoning home successfully. */
  const previouslyRegisteredTokenRef = useRef<string>('');

  /* Push the IP allowlist to the companion whenever the token or the
     allowed IP changes. Three scenarios this handles:
       1. Disabled (or no token yet)  → deregister previous token so
          a deployed connector loses its server session.
       2. Token rotated               → deregister old, register new.
       3. Allowlist IP changed        → re-register (overwrites old).
     Also re-pushes every 60s so a companion restart doesn't leave us
     with a stale allowlist. */
  useEffect(() => {
    if (!customerConnector.enabled || !customerConnector.token) {
      /* Connector turned OFF (or no token). If we had previously
         registered a token, deregister it now so the wizard's "off"
         state matches what the server enforces. */
      const prev = previouslyRegisteredTokenRef.current;
      if (prev) {
        void deregisterConnectorToken(prev);
        previouslyRegisteredTokenRef.current = '';
      }
      return;
    }
    let cancelled = false;
    const sync = async () => {
      if (cancelled) return;
      const prev = previouslyRegisteredTokenRef.current;
      const next = customerConnector.token;
      /* Token rotated since last sync — wipe server-side state for
         the old token before registering the new one. */
      if (prev && prev !== next) {
        await deregisterConnectorToken(prev);
      }
      const ok = await registerConnectorAllowlist(next);
      if (ok) previouslyRegisteredTokenRef.current = next;
    };
    void sync();
    /* Re-push every 60s — companion in-memory state is cleared on
       restart, so this is the cheapest way to converge after an
       outage without operator intervention. The encryption key is
       included in the dep array so a key rotation immediately
       triggers a re-register; otherwise the companion would hold
       the old key until the next 60s tick. */
    const id = setInterval(() => { void sync(); }, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [customerConnector.enabled, customerConnector.token]);

  /* Manual revoke — clears server-side state for the current token
     so a deployed connector loses its session. Status pill returns to
     WAITING; new heartbeats start a fresh session unless the SE also
     rotates the token + redeploys the bundle. */
  const revokeConnectorAccess = async () => {
    if (!customerConnector.token) return;
    if (!confirm(
      'Revoke this connector token on the server? '
      + 'The deployed connector will keep phoning home but the server will '
      + 'treat it as a brand-new session (allowlist re-applies on next register). '
      + 'For a hard kill, also regenerate the token and re-deploy the bundle.'
    )) return;
    const ok = await deregisterConnectorToken(customerConnector.token);
    if (!ok) {
      alert('Revoke failed — server may be unreachable. Check the API health indicator.');
    }
    /* Force the status panel to immediately reflect the revoked state.
       The 5s poll will refresh in a moment anyway. */
    setConnectorStatus(null);
    previouslyRegisteredTokenRef.current = '';
  };

  /* Auto-mint token when enabled. Token is the only credential (security via HTTPS + token). */
  useEffect(() => {
    if (!customerConnector.enabled) return;
    if (customerConnector.token) return;
    setCustomerConnector((prev) => ({
      ...prev,
      token: randomHex256(),
    }));
  }, [customerConnector.enabled, customerConnector.token, setCustomerConnector]);

  const updConnector = (patch: Partial<CustomerConnectorConfig>) =>
    setCustomerConnector((prev) => ({ ...prev, ...patch }));

  /* JSON preview state removed — connector v2 is interactive only. */

  /* JSON bundle/secrets download removed — connector v2 is interactive
     (no JSON files). Only exe download + token generation needed. */

  /* DLP REST API is basic-auth only (Application Administrator). Any session
     restored with the legacy 'apikey' authType or a lingering apiKey value
     gets normalised back to a clean basic-auth shape so the UI / server
     can't drift apart. Runs once per dlpApi snapshot. */
  useEffect(() => {
    const d = apiConnectors.dlpApi;
    if (d.authType !== 'basic' || d.apiKey !== '') {
      setApiConnectors(prev => ({
        ...prev,
        dlpApi: { ...prev.dlpApi, authType: 'basic', apiKey: '' },
      }));
    }
  }, [apiConnectors.dlpApi.authType, apiConnectors.dlpApi.apiKey, setApiConnectors]);

  const handleDashboardFile = async (file: File | undefined | null) => {
    if (!file) return;
    setDashboardError('');
    if (!/\.pdf$/i.test(file.name)) {
      setDashboardError('Please choose a PDF file exported from the Forcepoint DLP Manager Report UI.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setDashboardError(`PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 12 MB.`);
      return;
    }
    setDashboardBusy(true);
    try {
      const summary = await parseDlpDashboardPdf(file);
      if (summary.totalIncidents === 0 && summary.actions.length === 0 && summary.topChannels.length === 0) {
        setDashboardError('Could not extract DLP report data. Most common cause: the PDF was created via browser "Print → Save as PDF" instead of the DLP Manager\'s native "Export / Download PDF" button — Print-to-PDF rasterises the table cells and removes the embedded text layer this parser needs. Re-export from DLP Manager Reports and try again. (Console has the extracted text dump for diagnosis.)');
        return;
      }
      setDlpDashboardSummary(summary);
    } catch (err) {
      setDashboardError(err instanceof Error ? `Parse failed: ${err.message}` : 'Failed to parse PDF.');
    } finally {
      setDashboardBusy(false);
    }
  };

  const handleDlpLogFile = async (file: File | undefined | null) => {
    if (!file) return;
    setDlpLogError('');
    if (!/\.(log|txt)$/i.test(file.name)) {
      setDlpLogError('Please choose a .log or .txt file (Forcepoint DLP Tomcat application log — dlp-all.log).');
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      setDlpLogError(`Log is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 64 MB.`);
      return;
    }
    setDlpLogBusy(true);
    try {
      const text = await file.text();
      const report = parseDlpAllLog(text, file.name);
      if (report.recordCount === 0) {
        setDlpLogError('Could not parse any log records. Expected Forcepoint DLP Tomcat format with `YYYY-MM-DD HH:MM:SS,ms [thread] LEVEL logger - message` headers.');
        return;
      }
      setDlpAllLogReport(report);
    } catch (err) {
      setDlpLogError(err instanceof Error ? `Parse failed: ${err.message}` : 'Failed to parse log file.');
    } finally {
      setDlpLogBusy(false);
    }
  };

  const handleAuditCsvFile = async (file: File | undefined | null) => {
    if (!file) return;
    setAuditError('');
    if (!/\.csv$/i.test(file.name)) {
      setAuditError('Please choose a .csv file (AUDIT_SYSTEM_LOGS.csv from the DLP Server Telemetry SQL queries folder).');
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      setAuditError(`CSV is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 64 MB.`);
      return;
    }
    setAuditBusy(true);
    try {
      const text = await file.text();
      const report = parseAuditSystemLogs(text, file.name);
      if (report.totalRows === 0) {
        setAuditError('CSV had no parsable rows. Expected header `ID,SEVERITY,STATUS,GENERATION_TIME_TS,SOURCE_NAME,SOURCE_SUB_TYPE,MESSAGE`.');
        return;
      }
      setAuditLogReport(report);
    } catch (err) {
      setAuditError(err instanceof Error ? `Parse failed: ${err.message}` : 'Failed to parse CSV.');
    } finally {
      setAuditBusy(false);
    }
  };

  /* Star/dismiss helpers — wired up to all three log panels. Star
     mutation is bracketed by the `onStarLogIssue` Dashboard hook so
     toggling ON spawns an Urgent Action (if one isn't already linked);
     toggling OFF leaves the action alone (operator manages it manually
     from Step 9). Dismiss just hides from the wizard UI. */
  const toggleStar = (
    scope: 'dlp' | 'audit' | 'services',
    issueId: string,
    iss: { title: string; recommendation: string; severity: AnyLogSeverity; component: string },
  ) => {
    const key = `${scope}:${issueId}`;
    setStarredLogIssues((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        return next;
      }
      next[key] = true;
      // Side effect: spawn the matching Urgent Action item.
      const severity = (iss.severity === 'CRITICAL' || iss.severity === 'HIGH' || iss.severity === 'MEDIUM' || iss.severity === 'LOW')
        ? iss.severity
        : 'MEDIUM';
      onStarLogIssue(key, { title: iss.title, recommendation: iss.recommendation, severity, component: iss.component });
      return next;
    });
  };

  const toggleDismiss = (scope: 'dlp' | 'audit' | 'services', issueId: string) => {
    const key = `${scope}:${issueId}`;
    setDismissedLogIssues((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const handleServiceLogsFiles = async (files: FileList | undefined | null) => {
    if (!files || files.length === 0) return;
    setServiceLogsError('');
    setServiceLogsBusy(true);
    try {
      const collected: ServiceLogFile[] = [];
      for (const file of Array.from(files)) {
        if (!isServiceLogFilename(file.name)) continue;
        if (file.size > 64 * 1024 * 1024) continue;
        try { collected.push({ name: file.name, text: await file.text() }); } catch { /* skip */ }
      }
      if (collected.length === 0) {
        setServiceLogsError('No recognised service log filenames in the selection — expected one or more of FPR.log, EndPointServer.log, PolicyEngine.log, PolicyEngineClient.log, mgmtd.log, HealthCheck.log, WorkScheduler.log, CleanupAndArchive.log.');
        return;
      }
      const report = parseDlpServiceLogs(collected);
      setServiceLogsReport(report);
    } catch (err) {
      setServiceLogsError(err instanceof Error ? `Parse failed: ${err.message}` : 'Failed to parse service logs.');
    } finally {
      setServiceLogsBusy(false);
    }
  };

  const TEXT_EXT_RE = /\.(txt|csv|cer|pem|crt)$/i;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParseError('');
    setParseBusy(true);
    try {
      const uploaded: UploadedFile[] = [];
      /* Carry-on parses for the two files that live inside the bundle but
         aren't part of the DLPServerInfo grammar: dlp-all.log + the
         AUDIT_SYSTEM_LOGS.csv produced by the SQL queries dump. We hit
         them in the same drop so the operator doesn't have to find and
         drag them individually. */
      let dlpLogHit: { name: string; text: string } | null = null;
      let auditHit: { name: string; text: string } | null = null;
      const serviceHits: ServiceLogFile[] = [];
      for (const file of Array.from(files)) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const lowerName = file.name.toLowerCase();
        const lowerPath = relativePath.toLowerCase();
        if (/dlp-all\.log$/i.test(lowerName)) {
          if (file.size <= 64 * 1024 * 1024) {
            try { dlpLogHit = { name: file.name, text: await file.text() }; } catch { /* ignore */ }
          }
          continue;
        }
        if (/audit_system_logs\.csv$/i.test(lowerName) || /\/audit_system_logs\.csv$/i.test(lowerPath)) {
          if (file.size <= 64 * 1024 * 1024) {
            try { auditHit = { name: file.name, text: await file.text() }; } catch { /* ignore */ }
          }
          // Don't `continue` — also include in bundle parser, which has
          // its own AUDIT_SYSTEM_LOGS handling for the SQL-server-tab view.
        }
        /* Service logs live under `\Data Security\Logs\` in the bundle.
           Pick them up by basename here so the operator gets full
           cross-correlation without a separate drag. */
        if (isServiceLogFilename(file.name) && file.size <= 64 * 1024 * 1024) {
          try { serviceHits.push({ name: file.name, text: await file.text() }); } catch { /* ignore */ }
        }
        if (!TEXT_EXT_RE.test(file.name)) continue;
        let text = '';
        try { text = await file.text(); } catch { continue; }
        uploaded.push({ name: file.name, relativePath, text });
      }
      if (uploaded.length === 0 && !dlpLogHit && !auditHit && serviceHits.length === 0) {
        setParseError('No .txt or .csv files found in the selection. Make sure to point at a DLP Telemetry folder (DLPServerInfo_* export).');
        return;
      }
      if (uploaded.length > 0) {
        const bundle = parseDlpBundle(uploaded);
        setDlpBundles(prev => {
          const others = prev.filter(b => b.bundleName !== bundle.bundleName);
          return [...others, bundle];
        });
        setExpandedBundles(prev => { const n = new Set(prev); n.add(bundle.bundleId); return n; });
      }
      if (dlpLogHit) {
        try {
          const r = parseDlpAllLog(dlpLogHit.text, dlpLogHit.name);
          if (r.recordCount > 0) setDlpAllLogReport(r);
        } catch { /* surfaced only on direct upload */ }
      }
      if (auditHit) {
        try {
          const r = parseAuditSystemLogs(auditHit.text, auditHit.name);
          if (r.totalRows > 0) setAuditLogReport(r);
        } catch { /* surfaced only on direct upload */ }
      }
      if (serviceHits.length > 0) {
        try {
          const r = parseDlpServiceLogs(serviceHits);
          if (r.totalLines > 0) setServiceLogsReport(r);
        } catch { /* surfaced only on direct upload */ }
      }
    } finally {
      setParseBusy(false);
    }
  };

  const removeBundle = (bundleId: string) => {
    setDlpBundles(prev => prev.filter(b => b.bundleId !== bundleId));
  };

  const toggleBundle = (bundleId: string) =>
    setExpandedBundles(prev => { const n = new Set(prev); n.has(bundleId) ? n.delete(bundleId) : n.add(bundleId); return n; });

  const activeProducts = new Set(
    Object.entries(selectedProducts).filter(([, v]) => v).map(([k]) => PRODUCT_MAP[k]).filter(Boolean)
  );

  /* When the DLP REST API connector is on it becomes the authoritative
     source for DLP data — we hide the SQL DLP groups from Report Selection
     so the operator isn't presented with two ways to pull the same numbers.
     selectedReports state is intentionally NOT mutated; if the API is later
     disabled, prior DLP selections come back unchanged. */
  const dlpApiOn = !!apiConnectors.dlpApi?.enabled;
  const visibleReportGroups = REPORT_GROUPS.filter(
    (g) => activeProducts.has(g.product) && !(g.product === 'dlp' && dlpApiOn),
  );
  const visibleReportIds = visibleReportGroups.flatMap((g) => g.reports.map((r) => r.id));
  const visibleSelectedReports = selectedReports.filter((id) => visibleReportIds.includes(id));

  const updSql = (p: Partial<SqlConfig>) => setSqlConfig(prev => ({ ...prev, ...p }));
  const updApi = (key: keyof ApiConnectorsConfig, p: Partial<ApiConnectorConfig>) =>
    setApiConnectors(prev => ({ ...prev, [key]: { ...prev[key], ...p } }));

  const testSql = async () => {
    const transport = sqlConfig.transport ?? 'direct';
    /* Direct mode still requires a host before we can dial anything;
       Via-Connector mode has nothing to dial from the wizard side
       (the connector owns the credentials), so we just need the
       connector itself to be online + registered. */
    if (transport === 'direct' && !sqlConfig.server.trim()) return;
    setSqlStatus({ state: 'testing' });
    if (transport === 'via-connector') {
      /* Probe target: pick the first in-scope product so the operator
         sees a single representative result. DLP-only deployments
         test sql_Data; web-only test sql_Web; mixed scopes default
         to DLP since the wizard's reports skew DLP-heavy. The
         CONNECTOR-SIDE SELFTEST panel up in the Customer Connector
         card carries the full per-DB pass/fail anyway. */
      const probeProduct =
        selectedProducts.data ? 'data'
        : selectedProducts.web  ? 'web'
        : selectedProducts.email ? 'email'
        : 'data';
      try {
        const res = await fetch('/api/sql/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transport, connectorToken: customerConnector.token, product: probeProduct }),
          signal: AbortSignal.timeout(35_000),
        });
        type SqlTestOk    = { ok: boolean; message?: string; server?: SqlServerInfo; latencyMs?: number };
        type SqlTestError = { ok: false; message?: string };
        if (res.ok) {
          const d = await res.json() as SqlTestOk;
          setSqlStatus({
            state: 'ok',
            message: d.message || `SQL · ${probeProduct.toUpperCase()} authenticated via connector`,
            server: d.server ? { ...d.server, latencyMs: d.latencyMs } : undefined,
          });
        } else {
          const e = await res.json() as SqlTestError;
          setSqlStatus({ state: 'error', message: e.message || `Server error (${res.status})` });
        }
      } catch (e) {
        const timeout = e instanceof Error && e.name === 'TimeoutError';
        setSqlStatus({ state: 'error', message: timeout ? 'Via-Connector SQL test timed out' : 'Via-Connector SQL test failed' });
      }
      return;
    }
    setSqlStatus(await runTest('/api/sql/test', sqlConfig));
  };

  const testApi = async (key: keyof ApiConnectorsConfig, endpoint: string) => {
    setApiStatus(prev => ({ ...prev, [key]: { state: 'testing' } }));
    /* Via-Connector branch — only DLP API supports it. Instead of
       hitting companion's /api/dlp/test (which would dial the
       customer FSM directly), enqueue a `dlp.test` job; the
       connector .exe runs the probe locally and returns the same
       {ok, message, latencyMs} shape. */
    if (key === 'dlpApi' && apiConnectors.dlpApi.transport === 'via-connector') {
      try {
        const payload = await runJobViaConnector<{ ok: boolean; message: string; latencyMs: number }>(
          customerConnector.token,
          'dlp.test',
          null,
          { timeoutMs: 30_000 },
        );
        const result: ConnStatus = payload.ok
          ? { state: 'ok',    message: payload.message || 'Authenticated (via connector)' }
          : { state: 'error', message: payload.message || 'Connector reported failure.' };
        setApiStatus(prev => ({ ...prev, [key]: result }));
      } catch (e) {
        setApiStatus(prev => ({
          ...prev,
          [key]: { state: 'error', message: e instanceof Error ? e.message : 'Via-Connector test failed.' },
        }));
      }
      return;
    }
    const result = await runTest(endpoint, apiConnectors[key]);
    setApiStatus(prev => ({ ...prev, [key]: result }));
  };

  /* DLP posture fetch — calls the companion's /api/dlp/posture which brokers
     the JWT handshake and aggregates incidents server-side. Result lands in
     hc_dlp_posture (session-scoped, persisted) so the report can render
     without re-querying the FSM at export time. */
  const [postureFetching, setPostureFetching] = useState(false);
  const [postureError, setPostureError] = useState<string>('');
  const [postureWindow, setPostureWindow] = useState<number>(dlpPostureSummary?.windowDays ?? 30);
  const fetchPosture = async () => {
    setPostureError('');
    setPostureFetching(true);
    try {
      const summary = await fetchDlpPosture({
        url:      apiConnectors.dlpApi.url,
        authType: apiConnectors.dlpApi.authType,
        username: apiConnectors.dlpApi.username,
        password: apiConnectors.dlpApi.password,
        apiKey:   apiConnectors.dlpApi.apiKey,
        windowDays: postureWindow,
        /* Send the operator-managed pattern catalogue so the FSM's
           destination labels get bucketed using THEIR house style. */
        patterns: destinationPatterns,
        /* Transport selection — when Via-Connector is active in the
           wizard, the companion routes every DLP REST API call
           through the customer Connector .exe instead of dialing the
           customer FSM directly. companion ignores url/credentials
           in that mode. */
        transport: apiConnectors.dlpApi.transport ?? 'direct',
        connectorToken: customerConnector.token,
      });
      setDlpPostureSummary(summary);
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || /timed out/i.test(e.message));
      setPostureError(
        e instanceof Error
          ? (timeout ? 'Posture fetch timed out (System API is reachable but FSM took >75s).' : e.message)
          : 'Posture fetch failed.',
      );
    } finally {
      setPostureFetching(false);
    }
  };

  const toggleGroup    = (p: string) => setExpandedGroups(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const toggleReport   = (id: string) => setSelectedReports(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  /* Find a report by sqlKey so we can update its `state` slot. Reports
     are keyed by `id` in reportRuns; sqlKey is the lookup the server
     uses. We match them via the static ReportDef list. */
  const reportIdBySqlKey = (sqlKey: string): string => {
    for (const grp of REPORT_GROUPS) {
      const r = grp.reports.find((r) => r.sqlKey === sqlKey);
      if (r) return r.id;
    }
    return sqlKey;
  };

  /* Look up the report's product (web / dlp / email) so the
     companion's via-connector branch can route to the matching
     sql_* secrets block on the customer host. Falls back to 'data'
     for unknown sqlKeys — same default the companion uses. */
  const reportProductBySqlKey = (sqlKey: string): 'web' | 'data' | 'email' => {
    for (const grp of REPORT_GROUPS) {
      const r = grp.reports.find((rr) => rr.sqlKey === sqlKey);
      if (r) {
        if (r.product === 'web')   return 'web';
        if (r.product === 'email') return 'email';
        return 'data';
      }
    }
    return 'data';
  };

  /* Fire a single report against the companion SQL service. Pure runtime:
     results land in reportRuns and disappear on refresh. `topN` is optional
     and forwarded to the server for a TOP N clause; undefined = no cap.

     Transport branch: when sqlConfig.transport === 'via-connector',
     we tell the companion to route through the Customer Connector by
     adding { transport, connectorToken, product }. The companion
     looks up DLP_QUERIES[sqlKey], resolves the SQL string, then
     enqueues a sql.query job on the connector. The connector picks
     the matching sql_<product> block from connector-secrets.json,
     runs pyodbc locally, and returns the rows encrypted. None of
     the customer credentials touch the wizard host. */
  const runReport = async (sqlKey: string, windowDays: number, topN?: number) => {
    const id = reportIdBySqlKey(sqlKey);
    setReportRuns((prev) => ({ ...prev, [id]: { state: 'running', windowDays } }));
    try {
      const transport = sqlConfig.transport ?? 'direct';
      const bodyExtras = transport === 'via-connector'
        ? { transport, connectorToken: customerConnector.token, product: reportProductBySqlKey(sqlKey) }
        : { transport: 'direct' as const };
      const res = await fetch('/api/sql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sqlConfig, ...bodyExtras, sqlKey, windowDays, topN }),
        /* Via-Connector jobs can take up to 90s on the connector side
           (the /incidents-equivalent SQL query is the worst case),
           plus enqueue/poll round-trip. Direct mode keeps the original
           45s cap since companion+SQL are local network. */
        signal: AbortSignal.timeout(transport === 'via-connector' ? 110_000 : 45_000),
      });
      type QueryOk = { ok: true; rows: Array<Record<string, unknown>>; rowCount: number; latencyMs: number; windowDays: number };
      type QueryErr = { ok: false; message?: string; latencyMs?: number };
      const d = await res.json() as QueryOk | QueryErr;
      if (res.ok && (d as QueryOk).ok) {
        const ok = d as QueryOk;
        setReportRuns((prev) => ({
          ...prev,
          [id]: { state: 'ok', rows: ok.rows, rowCount: ok.rowCount, latencyMs: ok.latencyMs, windowDays: ok.windowDays, ranAt: new Date().toISOString() },
        }));
      } else {
        const err = d as QueryErr;
        setReportRuns((prev) => ({
          ...prev,
          [id]: { state: 'error', error: err.message || `Server returned ${res.status}`, latencyMs: err.latencyMs, windowDays, ranAt: new Date().toISOString() },
        }));
      }
    } catch (e) {
      const timeout = e instanceof Error && e.name === 'TimeoutError';
      setReportRuns((prev) => ({
        ...prev,
        [id]: { state: 'error', error: timeout ? 'Query timed out (45s)' : 'Local SQL System API not reachable — start it with `cd server && npm start`', windowDays, ranAt: new Date().toISOString() },
      }));
    }
  };

  /* Bulk-run: fire every selected report sequentially against the companion
     SQL service using a shared (windowDays, topN) tuple. Sequential to avoid
     stampeding the SQL connection pool (server caps pool.max at 1). Each
     report's per-row window is overridden to match the bulk window so the
     UI stays consistent. */
  const [bulkTopN, setBulkTopN] = useState<number>(10);
  const [bulkDays, setBulkDays] = useState<number>(30);
  const [bulkRunning, setBulkRunning] = useState<{ active: boolean; current: number; total: number }>({ active: false, current: 0, total: 0 });
  const runAllSelected = async () => {
    /* Build the run list from currently-VISIBLE selected reports — so a
       DLP selection that was made before the operator enabled the REST
       API connector doesn't quietly run when the group is hidden. */
    const targets: { id: string; sqlKey: string; fixedWindow?: boolean }[] = [];
    for (const grp of visibleReportGroups) {
      for (const r of grp.reports) {
        if (selectedReports.includes(r.id)) {
          targets.push({ id: r.id, sqlKey: r.sqlKey, fixedWindow: r.fixedWindow });
        }
      }
    }
    if (targets.length === 0) return;
    setBulkRunning({ active: true, current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      /* Persist the chosen window per row so the wizard reflects what was
         actually run; fixed-window reports keep their intrinsic window. */
      const effectiveDays = t.fixedWindow ? (reportWindows[t.id] ?? bulkDays) : bulkDays;
      if (!t.fixedWindow) {
        setReportWindows((prev) => ({ ...prev, [t.id]: bulkDays }));
      }
      setBulkRunning({ active: true, current: i + 1, total: targets.length });
      await runReport(t.sqlKey, effectiveDays, bulkTopN);
    }
    setBulkRunning({ active: false, current: 0, total: 0 });
  };
  const toggleGroupAll = (ids: string[], all: boolean) =>
    setSelectedReports(prev => all ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);

  /* Single source of truth for "is SQL ready to run reports?" used
     by BOTH the per-row Run buttons and the bulk "Run N Selected"
     button. Without this they kept drifting apart:
       direct        — SQL card enabled AND SERVER / HOST filled.
       via-connector — SQL card enabled AND Customer Connector
                       registered + ONLINE (the connector owns the
                       credentials in connector-secrets.json, so the
                       wizard's server field is intentionally empty
                       in this transport mode). */
  const sqlBackendReady = (() => {
    if (!sqlConfig.enabled) return false;
    if ((sqlConfig.transport ?? 'direct') === 'via-connector') {
      return customerConnector.enabled && !!customerConnector.token && !!connectorStatus?.online;
    }
    return !!sqlConfig.server.trim();
  })();
  /* Human-readable explanation of why sqlBackendReady is false —
     surfaced as the disabled-button tooltip so the operator knows
     which fix to apply (set a server, enable the connector, wait
     for ONLINE). Empty string when ready. */
  const sqlBackendBlocker: string = (() => {
    if (!sqlConfig.enabled) return 'Enable the SQL Server card above to run reports.';
    if ((sqlConfig.transport ?? 'direct') === 'via-connector') {
      if (!customerConnector.enabled || !customerConnector.token) return 'Via-Connector mode is selected but the Customer Connector card is OFF / has no token. Enable it above.';
      if (!connectorStatus?.online) return 'Customer Connector is registered but OFFLINE — wait for it to phone home.';
      return '';
    }
    if (!sqlConfig.server.trim()) return 'Direct mode needs the SERVER / HOST field filled in the SQL Server card above.';
    return '';
  })();

  return (
    <div className="space-y-[13px]">

      {/* Page header */}
      <div>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952' }}>Data Collection</div>
        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
          Configure data sources. Enabled connectors will populate report sections automatically.
        </div>
      </div>

      {/* Manual Input — always active */}
      <div className="rounded-xl p-[16px_22px]"
        style={{ background: 'rgba(22,163,74,0.03)', border: '2px solid rgba(22,163,74,0.25)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
              style={{ background: 'rgba(22,163,74,0.1)' }}>✏️</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Manual Input</div>
          </div>
          <span className="font-mono font-bold px-2 py-1 rounded"
            style={{ fontSize: '10px', background: 'rgba(22,163,74,0.1)', color: '#16A34A' }}>
            ● ALWAYS ACTIVE
          </span>
        </div>
        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px' }}>
          Answer checklist questions directly in the wizard UI — no connector required.
        </div>
      </div>

      {/* ─── Customer Connector — outbound-only tunnel agent ─────────
          Hidden unless at least one telemetry-bearing product is in
          scope. The card mints a unique token + AES-256-GCM key on
          first enable, lets the operator pin a server cert + restrict
          source IP, and polls the companion every 5s for the
          connector's liveness pill. */}
      {(selectedProducts.web || selectedProducts.data || selectedProducts.email) && (() => {
        const cfg = customerConnector;
        const st = connectorStatus;
        const tokenOk = !!cfg.token;
        const readyChecks = [tokenOk];
        const readyCount = readyChecks.filter(Boolean).length;
        const readyTotal = readyChecks.length;
        const onlineColor = st?.online ? '#16A34A' : (st && st.totalHeartbeats > 0) ? '#D97706' : '#94A3B8';
        const onlineLabel = st?.online ? 'ONLINE' : (st && st.totalHeartbeats > 0) ? 'STALE' : 'WAITING';

        /* Selftest summary — used both in the card header (always
           visible, even when card collapsed) and inline in the
           expanded panel. Counts the OK/FAIL split across all
           configured probes the connector itself ran:
             - SQL DLP   (wbsn-data-security)
             - SQL Web   (wslogdb70)
             - SQL Email (esglogdb76)
             - DLP REST API
           Legacy v1 connectors only sent `sql` + `dlpApi`; we fall
           back to `sql` when none of the new sql* fields are present
           so the header pill keeps showing useful info during the
           grace period after the customer rebuilds their .exe. */
        const selftest = st?.selftest;
        const hasNewSqlFields = !!(selftest?.sqlData ?? selftest?.sqlWeb ?? selftest?.sqlEmail);
        const selftestProbes = (hasNewSqlFields
          ? [selftest?.sqlData, selftest?.sqlWeb, selftest?.sqlEmail, selftest?.dlpApi]
          : [selftest?.sql, selftest?.dlpApi]
        ).filter(Boolean) as Array<{ status: string }>;
        const selftestPassCount = selftestProbes.filter((p) => p.status === 'ok').length;
        const selftestTotal = selftestProbes.length;
        const selftestAllPass = selftestTotal > 0 && selftestPassCount === selftestTotal;
        const selftestAnyFail = selftestProbes.some((p) => p.status !== 'ok');
        const selftestColor = selftestTotal === 0
          ? '#94A3B8'
          : selftestAllPass ? '#16A34A' : selftestAnyFail ? '#DC2626' : '#D97706';

        return (
          <div className="bg-white rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${cfg.enabled ? '#DDD6FE' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

            <div className="flex items-center gap-3 p-[16px_22px] cursor-pointer"
              onClick={() => toggleCard('customer_connector')}
              style={{ background: cfg.enabled ? 'rgba(124,58,237,0.03)' : 'white', borderBottom: (cfg.enabled && isCardOpen('customer_connector')) ? '1px solid #EEF0F5' : 'none' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <Plug size={14} style={{ color: '#7C3AED' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '13px', fontWeight: 700, color: cfg.enabled ? '#0F172A' : '#64748B' }}>Customer Connector</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                  Outbound-only tunnel agent installed at the customer site — opens a single HTTPS to HC, no inbound firewall rules.
                </div>
              </div>

              {cfg.enabled && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ background: `${onlineColor}14`, border: `1px solid ${onlineColor}40` }}>
                  <Activity size={12} style={{ color: onlineColor }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: onlineColor, letterSpacing: '0.05em' }}>{onlineLabel}</span>
                </div>
              )}

              {/* Selftest summary pill — always visible in the card
                  header so the SE can see SQL / DLP probe health even
                  when the body is collapsed. Empty when the connector
                  hasn't reported any selftest yet (no secrets file). */}
              {cfg.enabled && st && (() => {
                const probes = {
                  'Data': st.selftest?.sqlData ?? st.selftest?.sql,
                  'Web': st.selftest?.sqlWeb,
                  'Email': st.selftest?.sqlEmail,
                  'DLP': st.selftest?.dlpApi,
                };
                const readyProbes = Object.entries(probes)
                  .filter(([_, p]) => p)
                  .filter(([_, p]) => p?.status === 'ok')
                  .map(([name]) => name);

                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selftestTotal > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                        title={`${selftestPassCount}/${selftestTotal} local credential probes passing on the connector`}
                        style={{ background: `${selftestColor}14`, border: `1px solid ${selftestColor}40` }}>
                        {selftestAllPass
                          ? <CheckCircle2 size={12} style={{ color: selftestColor }} />
                          : <XCircle      size={12} style={{ color: selftestColor }} />}
                        <span style={{ fontSize: '11px', fontWeight: 700, color: selftestColor, letterSpacing: '0.05em' }}>
                          SELFTEST {selftestPassCount}/{selftestTotal}
                        </span>
                      </div>
                    )}
                    {readyProbes.length > 0 && (
                      <div className="flex items-center gap-1" style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600 }}>
                        {readyProbes.join(' ✓ ')} ✓
                      </div>
                    )}
                  </div>
                );
              })()}

              <button onClick={(e) => {
                  e.stopPropagation();
                  const next = !cfg.enabled;
                  updConnector({ enabled: next });
                  /* Enable → auto-open the card; Disable → auto-close. */
                  setCardOpen(prev => ({ ...prev, customer_connector: next }));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all"
                style={{
                  fontSize: '11px',
                  background: cfg.enabled ? 'rgba(124,58,237,0.07)' : '#F1F5F9',
                  color:      cfg.enabled ? '#7C3AED' : '#64748B',
                  border:     cfg.enabled ? '1.5px solid rgba(124,58,237,0.25)' : '1.5px solid #E2E8F0',
                }}>
                {cfg.enabled ? 'Enabled ✓' : 'Enable'}
              </button>
              {isCardOpen('customer_connector')
                ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
                : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
            </div>

            {cfg.enabled && isCardOpen('customer_connector') && (
              <div className="p-[16px_22px] space-y-4">

                {/* Live status banner */}
                <div className="rounded-lg p-[12px_14px] flex items-center gap-4 flex-wrap"
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Activity size={12} style={{ color: onlineColor }} />
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: onlineColor, letterSpacing: '0.04em' }}>{onlineLabel}</span>
                  </div>
                  <div style={{ width: '1px', height: '16px', background: '#E2E8F0' }} />
                  <div className="flex flex-col">
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>LAST HEARTBEAT</span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>
                      {st?.lastHeartbeatAt ? `${st.secondsSinceLastHeartbeat}s ago (${new Date(st.lastHeartbeatAt).toLocaleTimeString()})` : '— never seen —'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>SOURCE IP</span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>
                      {st?.lastSourceIp || '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>HEARTBEATS</span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>{st?.totalHeartbeats ?? 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>VERSION</span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>{st?.connectorVersion || '—'}</span>
                  </div>
                  <div className="flex-1" />

                  {/* Connector Readiness — SQL + API status at a glance */}
                  {st?.selftest && (() => {
                    const probes = {
                      'SQL Data': st.selftest.sqlData ?? st.selftest.sql,
                      'SQL Web': st.selftest.sqlWeb,
                      'SQL Email': st.selftest.sqlEmail,
                      'DLP API': st.selftest.dlpApi,
                    };
                    const ready = Object.values(probes).filter(Boolean).filter(p => p.status === 'ok').length;
                    const total = Object.values(probes).filter(Boolean).length;
                    return (
                      <div className="flex items-center gap-2">
                        {Object.entries(probes).map(([name, probe]) =>
                          probe ? (
                            <div key={name} className="flex items-center gap-1" title={`${name}: ${probe.status}`}>
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 600,
                                color: probe.status === 'ok' ? '#16A34A' : '#DC2626',
                                opacity: 0.8
                              }}>
                                {probe.status === 'ok' ? '✓' : '✗'} {name}
                              </span>
                            </div>
                          ) : null
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Configuration Summary — Simple readiness status */}
                {st && (() => {
                  const hasSQL = !!(st.selftest?.sqlData || st.selftest?.sqlWeb || st.selftest?.sqlEmail);
                  const hasAPI = !!st.selftest?.dlpApi;
                  const dataMode = hasSQL ? 'SQL Server + API' : hasAPI ? 'API-Only' : 'Waiting for selftest data...';

                  return (
                    <div className="rounded-lg p-[12px_14px]"
                      style={{ background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', marginBottom: '10px' }}>
                        CONNECTOR CONFIGURATION
                      </div>

                      {/* Data Source Mode */}
                      <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #D1D5DB' }}>
                        <div style={{ fontSize: '9px', color: '#6B7280', fontWeight: 600, marginBottom: '4px' }}>DATA SOURCE MODE</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{dataMode}</div>
                      </div>

                      {/* Database Status */}
                      {hasSQL && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '9px', color: '#6B7280', fontWeight: 600, marginBottom: '6px' }}>DATABASE CONNECTIONS</div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2" style={{ fontSize: '11px' }}>
                              <span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span>
                              <span style={{ color: '#0F172A', fontWeight: 500 }}>SQL Data (wbsn-data-security)</span>
                            </div>
                            <div className="flex items-center gap-2" style={{ fontSize: '11px' }}>
                              <span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span>
                              <span style={{ color: '#0F172A', fontWeight: 500 }}>SQL Web (wslogdb70)</span>
                            </div>
                            <div className="flex items-center gap-2" style={{ fontSize: '11px' }}>
                              <span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span>
                              <span style={{ color: '#0F172A', fontWeight: 500 }}>SQL Email (esglogdb76)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* API Status */}
                      {hasAPI && (
                        <div>
                          <div style={{ fontSize: '9px', color: '#6B7280', fontWeight: 600, marginBottom: '6px' }}>API CONNECTION</div>
                          <div className="flex items-center gap-2" style={{ fontSize: '11px' }}>
                            <span style={{ color: '#7C3AED', fontWeight: 700 }}>✓</span>
                            <span style={{ color: '#0F172A', fontWeight: 500 }}>DLP REST API</span>
                          </div>
                        </div>
                      )}

                      {!hasSQL && !hasAPI && (
                        <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                          Waiting for selftest results from connector...
                        </div>
                      )}
                    </div>
                  );
                })()}


                {/* Rejection banner — surfaces when the server has
                    refused one or more heartbeats due to allowlist
                    mismatch. SE sees the offending IP and can either
                    correct allowedSourceIp or investigate why the
                    connector is phoning home from an unexpected
                    address. */}
                {(st?.rejectedAttempts ?? 0) > 0 && (
                  <div className="rounded-lg p-[10px_14px] flex items-start gap-3"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '3px solid #DC2626' }}>
                    <XCircle size={14} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: '11.5px', color: '#7F1D1D', lineHeight: 1.55, flex: 1 }}>
                      <strong>{st!.rejectedAttempts} heartbeat{st!.rejectedAttempts === 1 ? '' : 's'} rejected</strong>{' '}
                      — source IP <span className="font-mono" style={{ background: '#fff', padding: '1px 5px', borderRadius: 3, border: '1px solid #FECACA' }}>{st!.lastRejectedIp || '?'}</span>
                      {' '}didn't match the allowlist
                      {st!.registeredAllowedSourceIp && (
                        <> (<span className="font-mono">{st!.registeredAllowedSourceIp}</span>)</>
                      )}.
                      {st!.lastRejectedAt && (
                        <span style={{ color: '#94A3B8', marginLeft: 6 }}>
                          last attempt {new Date(st!.lastRejectedAt).toLocaleTimeString()}
                        </span>
                      )}
                      <div style={{ fontSize: '10.5px', color: '#9F1239', marginTop: 4 }}>
                        Either update <strong>ALLOWED SOURCE IP / CIDR</strong> below to the real outbound IP,
                        or investigate why the connector is phoning home from <span className="font-mono">{st!.lastRejectedIp}</span>.
                      </div>
                    </div>
                  </div>
                )}

                {/* HC endpoint & IP allowlist removed — configured interactively in .exe */}

                {/* Token — read-only (security via token + HTTPS) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>CONNECTOR TOKEN (256-bit hex, HTTPS-only)</label>
                    <button onClick={() => updConnector({ token: randomHex256() })}
                      className="flex items-center gap-1"
                      style={{ fontSize: '10px', color: '#7C3AED', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      title="Generate a new random token. Must re-run connector .exe to register the new token.">
                      <RefreshCw size={9} /> Regenerate
                    </button>
                  </div>
                  <div style={{ ...IS, fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px', color: '#475569', wordBreak: 'break-all', lineHeight: 1.4, paddingTop: 6, paddingBottom: 6, cursor: 'text', userSelect: 'all' }}
                    onClick={(e) => {
                      const sel = window.getSelection();
                      if (sel) { sel.selectAllChildren(e.currentTarget); }
                    }}>
                    {cfg.token || <span style={{ color: '#CBD5E1' }}>— pending generation —</span>}
                  </div>
                </div>

                {/* Action row — download .exe only (interactive config) */}
                <div className="flex flex-wrap items-center gap-3 pt-2"
                  style={{ borderTop: '1px dashed #E2E8F0' }}>
                  {/* Connector binary download — interactive CLI (no JSON files).
                      Customer runs .exe and answers 3 prompts (HC endpoint,
                      proxy optional, SQL servers). */}
                  <a href={CONNECTOR_EXE_URL}
                    download="forcepoint-hc-connector.exe"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-all"
                    style={{
                      fontSize: '12px',
                      background: 'linear-gradient(135deg,#0F2952,#1E40AF)',
                      color: '#fff',
                      cursor: 'pointer',
                      border: '1.5px solid transparent',
                      boxShadow: '0 4px 14px rgba(15,41,82,0.30)',
                      textDecoration: 'none',
                    }}
                    title={`Download forcepoint-hc-connector.exe${st?.version ? ` (v${st.version})` : ''}. Customer runs this and answers 3 interactive prompts.`}>
                    <Download size={12} /> Download forcepoint-hc-connector.exe{st?.version && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                        (v{st.version})
                      </span>
                    )}
                  </a>
                  <button onClick={revokeConnectorAccess}
                    disabled={!tokenOk}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-all"
                    style={{
                      fontSize: '11.5px',
                      background: '#FFFFFF',
                      color: !tokenOk ? '#CBD5E1' : '#DC2626',
                      border: `1.5px solid ${!tokenOk ? '#E2E8F0' : 'rgba(220,38,38,0.3)'}`,
                      cursor: !tokenOk ? 'not-allowed' : 'pointer',
                    }}
                    title="Clear server-side state for this token — a deployed connector will lose its session.">
                    <Trash2 size={12} /> Revoke access
                  </button>
                  <span style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.5, flex: 1, minWidth: 240 }}>
                    Give customer the .exe and the token above.
                    Customer runs the .exe and is prompted for:
                    {' '}<span className="font-mono" style={{ color: '#0F2952' }}>HC endpoint</span> (IP/port),
                    {' '}<span className="font-mono" style={{ color: '#0F2952' }}>proxy settings</span> (optional),
                    and{' '}<span className="font-mono" style={{ color: '#0F2952' }}>SQL servers</span> (data/web/email).
                    Once it phones home, the status pill above turns <span style={{ color: '#16A34A', fontWeight: 700 }}>ONLINE</span>.
                  </span>
                </div>

                {/* JSON preview removed — connector v2 is interactive only. */}
              </div>
            )}
          </div>
        );
      })()}

      {/* DLP Server Info — bundle folder upload. Hidden when Data Security
          isn't in scope (Step 2) so the operator only sees collectors that
          map to a selected product. */}
      {selectedProducts.data && (
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${dlpBundles.length > 0 ? '#FCD34D' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center gap-3 p-[16px_22px] cursor-pointer"
          style={{ background: dlpBundles.length > 0 ? '#FFFBEB' : 'white', borderBottom: dlpExpanded ? '1px solid #F1F5F9' : 'none' }}
          onClick={() => setDlpExpanded(v => !v)}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(217,119,6,0.1)' }}>
            <FolderOpen size={14} style={{ color: '#D97706' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>DLP Server Telemetry</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
              Upload a Forcepoint <span style={{ fontFamily: 'monospace' }}>DLPServerInfo_*</span> folder (the "DLP Server Info" diagnostic export) — parses systeminfo, hardware, hotfixes, services, SQL Server, DB, policies, endpoint clients & more into the report
            </div>
          </div>
          {dlpBundles.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg font-mono font-bold"
              style={{ fontSize: '10.5px', background: 'rgba(217,119,6,0.1)', color: '#D97706', border: '1px solid rgba(217,119,6,0.25)' }}>
              {dlpBundles.length} FILE{dlpBundles.length !== 1 ? 'S' : ''}
            </span>
          )}
          {dlpExpanded
            ? <ChevronDown  size={16} style={{ color: '#94A3B8' }} />
            : <ChevronRight size={16} style={{ color: '#94A3B8' }} />}
        </div>

        {dlpExpanded && (
          <div className="p-[16px_22px] space-y-3">
            {/* Drop zone — accepts a whole folder via webkitdirectory, or individual files */}
            <div
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
              className="flex flex-col items-center justify-center gap-2 transition-all"
              style={{ border: '2px dashed #FCD34D', borderRadius: '10px', padding: '22px', background: 'rgba(254,243,199,0.4)' }}>
              {parseBusy
                ? <Loader size={20} className="animate-spin" style={{ color: '#D97706' }} />
                : <Upload size={20} style={{ color: '#D97706' }} />}
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#92400E' }}>
                {parseBusy ? 'Parsing telemetry…' : 'Drop a DLP Telemetry folder here, or use the buttons below'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#A16207', textAlign: 'center', maxWidth: '420px' }}>
                Generated by Forcepoint's DLP Server Info diagnostic tool (<span style={{ fontFamily: 'monospace' }}>DLPServerInfo_*</span>). We parse{' '}
                <span style={{ fontFamily: 'monospace' }}>systeminfo.txt</span>, <span style={{ fontFamily: 'monospace' }}>mem_cpu_hdd.txt</span>, <span style={{ fontFamily: 'monospace' }}>services_info.txt</span>, the <span style={{ fontFamily: 'monospace' }}>SQL queries/*</span> CSVs and more.
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: '11px', background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <FolderOpen size={11} style={{ display: 'inline', marginRight: '5px' }} />
                  Select Folder
                </button>
                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: '11px', background: '#fff', color: '#92400E', border: '1.5px solid #FCD34D', cursor: 'pointer' }}>
                  <Upload size={11} style={{ display: 'inline', marginRight: '5px' }} />
                  Select Files
                </button>
              </div>
              <input
                ref={folderInputRef}
                type="file"
                {...{ webkitdirectory: '', directory: '' } as React.HTMLAttributes<HTMLInputElement>}
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); if (folderInputRef.current) folderInputRef.current.value = ''; }}
              />
              <input
                ref={filesInputRef}
                type="file"
                accept=".txt,.csv,.cer,.pem,.crt"
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); if (filesInputRef.current) filesInputRef.current.value = ''; }}
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <XCircle size={13} style={{ color: '#DC2626' }} />
                <span style={{ fontSize: '11px', color: '#991B1B' }}>{parseError}</span>
              </div>
            )}

            {/* Parsed bundle list */}
            {dlpBundles.length > 0 && (
              <div className="space-y-2">
                {dlpBundles.map(b => <BundleCard key={b.bundleId} bundle={b} expanded={expandedBundles.has(b.bundleId)} onToggle={() => toggleBundle(b.bundleId)} onRemove={() => removeBundle(b.bundleId)} />)}
              </div>
            )}

            {/* Inline analyzers for the three log-evidence sources that
                live inside the bundle but aren't part of the
                DLPServerInfo grammar: dlp-all.log (Tomcat app log),
                AUDIT_SYSTEM_LOGS.csv (DLP audit query export), and the
                eight files under \Data Security\Logs (service logs).
                Auto-populated when the bundle folder is dropped; each
                panel also accepts direct upload. */}
            <DlpAllLogPanel
              report={dlpAllLogReport}
              busy={dlpLogBusy}
              error={dlpLogError}
              onPick={() => dlpLogInputRef.current?.click()}
              onDrop={(f) => handleDlpLogFile(f)}
              onClear={() => { setDlpAllLogReport(null); setDlpLogError(''); }}
              isStarred={(id) => !!starredLogIssues[`dlp:${id}`]}
              isDismissed={(id) => !!dismissedLogIssues[`dlp:${id}`]}
              onToggleStar={(id, iss) => toggleStar('dlp', id, iss)}
              onDismiss={(id) => toggleDismiss('dlp', id)}
            />
            <input
              ref={dlpLogInputRef}
              type="file"
              accept=".log,.txt"
              style={{ display: 'none' }}
              onChange={(e) => { handleDlpLogFile(e.target.files?.[0]); if (dlpLogInputRef.current) dlpLogInputRef.current.value = ''; }}
            />

            <AuditLogPanel
              report={auditLogReport}
              busy={auditBusy}
              error={auditError}
              onPick={() => auditCsvInputRef.current?.click()}
              onDrop={(f) => handleAuditCsvFile(f)}
              onClear={() => { setAuditLogReport(null); setAuditError(''); }}
              isStarred={(id) => !!starredLogIssues[`audit:${id}`]}
              isDismissed={(id) => !!dismissedLogIssues[`audit:${id}`]}
              onToggleStar={(id, iss) => toggleStar('audit', id, iss)}
              onDismiss={(id) => toggleDismiss('audit', id)}
            />
            <input
              ref={auditCsvInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => { handleAuditCsvFile(e.target.files?.[0]); if (auditCsvInputRef.current) auditCsvInputRef.current.value = ''; }}
            />

            <ServiceLogsPanel
              report={serviceLogsReport}
              busy={serviceLogsBusy}
              error={serviceLogsError}
              onPick={() => serviceLogsInputRef.current?.click()}
              onDropFiles={(fs) => handleServiceLogsFiles(fs)}
              onClear={() => { setServiceLogsReport(null); setServiceLogsError(''); }}
              isStarred={(id) => !!starredLogIssues[`services:${id}`]}
              isDismissed={(id) => !!dismissedLogIssues[`services:${id}`]}
              onToggleStar={(id, iss) => toggleStar('services', id, iss)}
              onDismiss={(id) => toggleDismiss('services', id)}
            />
            <input
              ref={serviceLogsInputRef}
              type="file"
              accept=".log"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { handleServiceLogsFiles(e.target.files ?? undefined); if (serviceLogsInputRef.current) serviceLogsInputRef.current.value = ''; }}
            />
          </div>
        )}
      </div>
      )}

      {/* Customer DLP Dashboard PDF — DLP-only. Skipped when Data Security
          isn't in scope. */}
      {selectedProducts.data && (
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: dlpDashboardSummary ? '1.5px solid rgba(14,165,233,0.3)' : '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>
        <div className="flex items-center gap-3 p-[16px_22px] cursor-pointer"
          style={{ background: dlpDashboardSummary ? 'rgba(14,165,233,0.04)' : 'white', borderBottom: isCardOpen('dlp_dashboard') ? '1px solid #F1F5F9' : 'none' }}
          onClick={() => toggleCard('dlp_dashboard')}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(14,165,233,0.1)' }}>
            <FileText size={14} style={{ color: '#0EA5E9' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Customer DLP Dashboard</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
              Drop the DLP Manager PDF report (incidents summary export). We parse severity / action / channel / policy / URL-category counts. Individual names are anonymized to department level.
            </div>
          </div>
          {dlpDashboardSummary && (
            <span className="px-2.5 py-1 rounded-lg font-mono font-bold"
              style={{ fontSize: '10.5px', background: 'rgba(14,165,233,0.1)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.25)' }}>
              {dlpDashboardSummary.totalIncidents.toLocaleString()} INCIDENTS
            </span>
          )}
          {isCardOpen('dlp_dashboard')
            ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
            : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
        </div>

        {isCardOpen('dlp_dashboard') && (
        <div className="p-[16px_22px] space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDashboardFile(e.dataTransfer.files?.[0]); }}
            className="flex flex-col items-center justify-center gap-2"
            style={{ border: '2px dashed #BAE6FD', borderRadius: '10px', padding: '22px', background: 'rgba(240,249,255,0.6)' }}
          >
            {dashboardBusy
              ? <Loader size={20} className="animate-spin" style={{ color: '#0EA5E9' }} />
              : <Upload size={20} style={{ color: '#0EA5E9' }} />}
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#075985' }}>
              {dashboardBusy
                ? 'Parsing PDF…'
                : dlpDashboardSummary
                  ? 'Drop a new PDF to replace, or use the buttons below'
                  : 'Drop the DLP Manager PDF here, or click to choose a file'}
            </div>
            <div style={{ fontSize: '10.5px', color: '#0369A1', textAlign: 'center', maxWidth: '480px', lineHeight: 1.5 }}>
              Standard incidents-summary export — header "Created on", filters "Date Range" / "Ignored Incident", and "Top 5" tables.
              Parsing happens locally in your browser; the PDF is never uploaded anywhere.
            </div>
            <div style={{ fontSize: '10.5px', color: '#92400E', textAlign: 'center', maxWidth: '520px', lineHeight: 1.5, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
              <strong>Important:</strong> use the DLP Manager's native <strong>Export / Download PDF</strong>{' '}
              button — do <strong>not</strong> use browser "Print → Save as PDF". Print-to-PDF rasterises the
              table cells, breaking the embedded text layer that this parser reads. If your PDF was generated by
              "Print", re-export it from the DLP Manager's Reports view.
            </div>
            <input
              ref={dashboardInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { handleDashboardFile(e.target.files?.[0]); if (dashboardInputRef.current) dashboardInputRef.current.value = ''; }}
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => dashboardInputRef.current?.click()}
                disabled={dashboardBusy}
                className="px-3 py-1.5 rounded-lg font-semibold text-white"
                style={{ fontSize: '11px', background: dashboardBusy ? '#93C5FD' : '#0EA5E9', cursor: dashboardBusy ? 'not-allowed' : 'pointer' }}
              >
                <FileText size={11} style={{ display: 'inline', marginRight: '5px' }} />
                {dlpDashboardSummary ? 'Replace PDF' : 'Choose PDF'}
              </button>
              {dlpDashboardSummary && (
                <button
                  type="button"
                  onClick={() => { setDlpDashboardSummary(null); setDashboardError(''); }}
                  className="px-3 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: '11px', background: '#fff', color: '#DC2626', border: '1.5px solid rgba(220,38,38,0.25)', cursor: 'pointer' }}
                >
                  <Trash2 size={11} style={{ display: 'inline', marginRight: '5px' }} />
                  Clear
                </button>
              )}
            </div>
          </div>

          {dashboardError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <XCircle size={13} style={{ color: '#DC2626' }} />
              <span style={{ fontSize: '11px', color: '#991B1B' }}>{dashboardError}</span>
            </div>
          )}

          {dlpDashboardSummary && (
            <div className="rounded-lg p-[12px_14px] space-y-2"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>EXTRACTED SUMMARY</div>
              <div style={{ fontSize: '11.5px', color: '#0F172A', lineHeight: 1.6 }}>
                <strong>{dlpDashboardSummary.fileName}</strong>
                <span style={{ color: '#94A3B8' }}> · </span>
                Report created {dlpDashboardSummary.reportCreatedAt}
                <span style={{ color: '#94A3B8' }}> · </span>
                Range: {dlpDashboardSummary.dateRange}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <SummaryStat label="Total" value={dlpDashboardSummary.totalIncidents.toLocaleString()} color="#0F172A" />
                <SummaryStat label="High"   value={dlpDashboardSummary.severity.high.toLocaleString()}   color="#DC2626" />
                <SummaryStat label="Medium" value={dlpDashboardSummary.severity.medium.toLocaleString()} color="#D97706" />
                <SummaryStat label="Low"    value={dlpDashboardSummary.severity.low.toLocaleString()}    color="#FACC15" />
              </div>
              <div style={{ fontSize: '10.5px', color: '#475569' }}>
                Top channel: <strong>{dlpDashboardSummary.topChannels[0]?.channel ?? '—'}</strong>
                {' · '}
                Top policy: <strong>{dlpDashboardSummary.topPolicies[0]?.policy ?? '—'}</strong>
                {' · '}
                {dlpDashboardSummary.topPolicies.length} policies · {dlpDashboardSummary.topUrlCategories.length} URL categories parsed
              </div>
              <div style={{ fontSize: '10px', color: '#64748B', fontStyle: 'italic' }}>
                ℹ Individual user names from the source PDF are aggregated to department level — no personal identifiers appear in the HC report.
              </div>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {/* SQL Server — only shown if at least one telemetry-bearing product
          (Web, DLP, or Email) is in scope. NGFW / V-Series don't query the
          on-prem SQL store. */}
      {(selectedProducts.web || selectedProducts.data || selectedProducts.email) && (
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${sqlConfig.enabled ? '#DBEAFE' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center gap-3 p-[16px_22px] cursor-pointer"
          onClick={() => toggleCard('sql_server')}
          style={{ background: sqlConfig.enabled ? '#FAFCFF' : 'white', borderBottom: (sqlConfig.enabled && isCardOpen('sql_server')) ? '1px solid #F1F5F9' : 'none' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.1)' }}>
            <Database size={14} style={{ color: '#2563EB' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: sqlConfig.enabled ? '#0F172A' : '#64748B' }}>SQL Server</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>Connect to Forcepoint FSM / DLP database for report queries</div>
          </div>
          {sqlStatus.state === 'ok' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <CheckCircle2 size={12} style={{ color: '#16A34A' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A' }}>Connected</span>
            </div>
          )}
          <button onClick={(e) => {
              e.stopPropagation();
              const next = !sqlConfig.enabled;
              updSql({ enabled: next });
              setCardOpen(prev => ({ ...prev, sql_server: next }));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '11px',
              background: sqlConfig.enabled ? 'rgba(37,99,235,0.07)' : '#F1F5F9',
              color:      sqlConfig.enabled ? '#2563EB' : '#64748B',
              border:     sqlConfig.enabled ? '1.5px solid rgba(37,99,235,0.25)' : '1.5px solid #E2E8F0',
            }}>
            {sqlConfig.enabled ? 'Enabled ✓' : 'Enable'}
          </button>
          {isCardOpen('sql_server')
            ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
            : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
        </div>

        {sqlConfig.enabled && isCardOpen('sql_server') && <div className="p-[16px_22px] space-y-4">
          {/* Transport mode picker — same semantics as the DLP REST
              API card. Direct = companion dials customer SQL Server
              itself; Via Connector = enqueue sql.test/sql.query jobs
              for the customer Connector .exe to execute locally.
              In via-connector mode the customer's connector-secrets.json
              holds the per-product sql blocks (sql_Data / sql_Web /
              sql_Email), so the wizard hides the server/port/auth/creds
              fields below. */}
          {(() => {
            const transport: ApiTransport = sqlConfig.transport ?? 'direct';
            const connEnabled = customerConnector.enabled && !!customerConnector.token;
            const connOnline  = !!connectorStatus?.online;
            return (
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                  TRANSPORT
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'direct'        as const, title: 'Direct',        sub: 'HC server contacts the customer SQL Server (needs host + creds here)' },
                    { id: 'via-connector' as const, title: 'Via Connector', sub: 'Customer Connector runs the queries (uses sql_Data / sql_Web / sql_Email from connector-secrets.json)' },
                  ]).map((opt) => {
                    const active = transport === opt.id;
                    return (
                      <button key={opt.id} type="button"
                        onClick={() => updSql({ transport: opt.id })}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all text-left"
                        style={{
                          background: active ? 'rgba(37,99,235,0.06)' : '#F8FAFC',
                          border: active ? '2px solid rgba(37,99,235,0.35)' : '1.5px solid #E2E8F0',
                          cursor: 'pointer',
                        }}>
                        <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ border: `2px solid ${active ? '#2563EB' : '#CBD5E1'}`, background: active ? '#2563EB' : 'transparent' }}>
                          {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: active ? '#2563EB' : '#334155' }}>
                            {opt.title}
                          </div>
                          <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                            {opt.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Connector liveness rails — same three states as the
                    DLP REST API card. Don't auto-fall-back; force the
                    operator to fix the connector before queries fire. */}
                {transport === 'via-connector' && !connEnabled && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <XCircle size={13} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '11px', color: '#92400E', lineHeight: 1.5 }}>
                      <strong>Customer Connector is OFF.</strong>{' '}
                      Enable the Customer Connector card above and complete the token / encryption-key setup; Via-Connector mode can't route SQL queries until the connector is registered.
                    </span>
                  </div>
                )}
                {transport === 'via-connector' && connEnabled && !connOnline && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <XCircle size={13} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '11px', color: '#991B1B', lineHeight: 1.5 }}>
                      <strong>Connector OFFLINE.</strong>{' '}
                      Connector .exe isn't phoning home; Via-Connector SQL will fail until the Customer Connector status pill turns <span style={{ color: '#16A34A', fontWeight: 700 }}>ONLINE</span>.
                    </span>
                  </div>
                )}
                {transport === 'via-connector' && connEnabled && connOnline && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                    style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '11px', color: '#15803D', lineHeight: 1.5 }}>
                      <strong>Routing SQL through connector.</strong>{' '}
                      Each report's <code>product</code> picks the matching block on the customer host
                      (DLP → <span style={{ fontFamily: 'monospace' }}>sql_Data</span>,
                      {' '}Web → <span style={{ fontFamily: 'monospace' }}>sql_Web</span>,
                      {' '}Email → <span style={{ fontFamily: 'monospace' }}>sql_Email</span>).
                      Live per-DB pass/fail is visible in the SELFTEST panel inside the Customer Connector card above.
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {(sqlConfig.transport ?? 'direct') === 'via-connector' ? (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
              style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
              <Database size={14} style={{ color: '#0D9488', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: '11px', color: '#0F766E', lineHeight: 1.55 }}>
                <strong>SQL credentials live on the customer host.</strong>{' '}
                The Customer Connector reads its three per-product SQL blocks (<span style={{ fontFamily: 'monospace' }}>sql_Data</span>,
                {' '}<span style={{ fontFamily: 'monospace' }}>sql_Web</span>,
                {' '}<span style={{ fontFamily: 'monospace' }}>sql_Email</span>)
                from <span style={{ fontFamily: 'monospace' }}>connector-secrets.json</span>.
                Nothing to enter here — when you click <strong>Run</strong> on a report below, the wizard sends the resolved
                SQL + the report's product code to the connector, which opens its local pyodbc connection
                with the matching credentials and returns the rows.
              </div>
            </div>
          ) : (
          <>
          {/* Server + Port */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>SERVER / HOST</label>
              <input style={{ ...IS, marginTop: '4px' }} placeholder="e.g. 192.168.1.10 or sql.corp.local"
                value={sqlConfig.server} onChange={e => updSql({ server: e.target.value })}
                onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
            </div>
            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>PORT</label>
              <input style={{ ...IS, marginTop: '4px', textAlign: 'right', fontFamily: 'monospace' }}
                type="number" min={1} max={65535}
                value={sqlConfig.port} onChange={e => updSql({ port: parseInt(e.target.value) || 1433 })}
                onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
            </div>
          </div>

          {/* Database — only used by the connection-test endpoint. DLP report
              queries are server-pinned to `wbsn-data-security` regardless of
              this value, so it's optional and only matters when probing other
              databases via Test Connection. */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>DATABASE</label>
            <input style={{ ...IS, marginTop: '4px' }} placeholder="auto: wbsn-data-security (DLP)"
              value={sqlConfig.database} onChange={e => updSql({ database: e.target.value })}
              onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
              onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', fontStyle: 'italic' }}>
              Leave blank — DLP queries auto-target <span style={{ fontFamily: 'monospace', color: '#475569' }}>wbsn-data-security</span>. Only set this when testing connectivity against a different database.
            </div>
          </div>

          {/* Auth type */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
              AUTHENTICATION
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['windows', 'sql'] as const).map(type => {
                const active = sqlConfig.authType === type;
                return (
                  <button key={type} onClick={() => updSql({ authType: type })}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all text-left"
                    style={{
                      background: active ? 'rgba(37,99,235,0.06)' : '#F8FAFC',
                      border: active ? '2px solid rgba(37,99,235,0.35)' : '1.5px solid #E2E8F0',
                    }}>
                    <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ border: `2px solid ${active ? '#2563EB' : '#CBD5E1'}`, background: active ? '#2563EB' : 'transparent' }}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: active ? '#2563EB' : '#334155' }}>
                        {type === 'windows' ? 'Windows Authentication' : 'SQL Server Authentication'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {type === 'windows' ? 'Uses current Windows user credentials' : 'Username & password login'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SQL credentials */}
          {sqlConfig.authType === 'sql' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>USERNAME</label>
                <input style={{ ...IS, marginTop: '4px' }} placeholder="sa"
                  value={sqlConfig.username} onChange={e => updSql({ username: e.target.value })}
                  onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                  onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>PASSWORD</label>
                <div style={{ position: 'relative', marginTop: '4px' }}>
                  <input style={{ ...IS, paddingRight: '38px' }}
                    type={showPw['sql'] ? 'text' : 'password'} placeholder="••••••••"
                    value={sqlConfig.password} onChange={e => updSql({ password: e.target.value })}
                    onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                    onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                  <button onClick={() => setShowPw(p => ({ ...p, sql: !p.sql }))}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPw['sql'] ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Detected server identity — appears only on a successful test.
              Runtime-only: SQL details are never persisted to localStorage. */}
          {sqlStatus.state === 'ok' && sqlStatus.server && (
            <div className="mt-3 rounded-lg p-3"
              style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div className="flex items-center gap-2 mb-2">
                <Database size={12} style={{ color: '#16A34A' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', letterSpacing: '0.06em' }}>
                  SQL SERVER DETECTED
                </span>
                {typeof sqlStatus.server.latencyMs === 'number' && (
                  <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: '#16A34A', background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', padding: '1px 6px', borderRadius: 4 }}>
                    {sqlStatus.server.latencyMs} ms
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: '11px' }}>
                {sqlStatus.server.edition && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Edition:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{sqlStatus.server.edition}</span></div>
                )}
                {sqlStatus.server.productVersion && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Version:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{sqlStatus.server.productVersion}{sqlStatus.server.productLevel ? ` (${sqlStatus.server.productLevel})` : ''}</span></div>
                )}
                {sqlStatus.server.serverName && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Server name:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{sqlStatus.server.serverName}</span></div>
                )}
                {sqlStatus.server.currentDatabase && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Database:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{sqlStatus.server.currentDatabase}</span></div>
                )}
                {sqlStatus.server.currentLogin && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Login:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{sqlStatus.server.currentLogin}</span></div>
                )}
                {sqlStatus.server.collation && (
                  <div><span style={{ color: '#64748B', fontWeight: 600 }}>Collation:</span> <span style={{ color: '#0F172A', fontFamily: 'monospace', fontSize: '10px' }}>{sqlStatus.server.collation}</span></div>
                )}
              </div>
            </div>
          )}
          </>
          )}

          {/* Test Connection — shared button, transport-aware gating.
                direct        — disabled until SERVER / HOST is filled.
                via-connector — disabled until the Customer Connector
                                is registered + ONLINE; clicking fires
                                a sql.test job for the first in-scope
                                product so the operator sees one
                                representative pass/fail in the SQL
                                card itself (the SELFTEST panel above
                                still shows all three per-DB results). */}
          {(() => {
            const transport = sqlConfig.transport ?? 'direct';
            const isVia = transport === 'via-connector';
            const connReady = customerConnector.enabled && !!customerConnector.token && !!connectorStatus?.online;
            const blocker = isVia ? !connReady : !sqlConfig.server.trim();
            const disabled = blocker || sqlStatus.state === 'testing';
            return (
              <div className="flex items-center gap-3">
                <button onClick={testSql}
                  disabled={disabled}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all"
                  style={{
                    fontSize: '12.5px',
                    background: disabled ? '#F1F5F9' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                    color:      disabled ? '#94A3B8' : '#fff',
                    cursor:     disabled ? 'not-allowed' : 'pointer',
                    boxShadow:  !disabled ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                    border: '1.5px solid transparent',
                  }}>
                  {sqlStatus.state === 'testing'
                    ? <><Loader size={13} className="animate-spin" /> Testing…</>
                    : <><Database size={13} /> Test Connection</>}
                </button>
                {sqlStatus.state !== 'idle' && sqlStatus.state !== 'testing' && (
                  <div className="flex items-center gap-1.5">
                    {sqlStatus.state === 'ok'
                      ? <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
                      : <XCircle     size={14} style={{ color: '#DC2626' }} />}
                    <span style={{ fontSize: '11.5px', fontWeight: 500, color: sqlStatus.state === 'ok' ? '#16A34A' : '#DC2626' }}>
                      {sqlStatus.message}
                    </span>
                  </div>
                )}
                {sqlStatus.state === 'idle' && !isVia && !sqlConfig.server.trim() && (
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>Enter server address to test</span>
                )}
                {sqlStatus.state === 'idle' && isVia && !connReady && (
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>Waiting for Customer Connector to come ONLINE…</span>
                )}
              </div>
            );
          })()}
        </div>}
      </div>
      )}

      {/* REST API connectors — each is filtered against Step 2 so only
          connectors whose product is in scope are shown. */}
      {API_DEFS.filter((def) => {
        if (def.key === 'dlpApi')   return !!selectedProducts.data;
        if (def.key === 'vSeries')  return !!(selectedProducts.appl || selectedProducts.vappl);
        if (def.key === 'ngfwSmc')  return !!selectedProducts.ngfw;
        return true;
      }).map(def => {
        const cfg = apiConnectors[def.key];
        const st  = apiStatus[def.key] ?? { state: 'idle' as const };
        const pw  = showPw[def.key] ?? false;
        const testing = st.state === 'testing';

        return (
          <div key={def.key} className="bg-white rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${cfg.enabled ? '#DBEAFE' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

            {/* Card header */}
            <div className="flex items-center gap-3 p-[16px_22px] cursor-pointer"
              onClick={() => toggleCard(def.key)}
              style={{ background: cfg.enabled ? '#FAFCFF' : 'white', borderBottom: (cfg.enabled && isCardOpen(def.key)) ? '1px solid #F1F5F9' : 'none' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: def.iconBg }}>
                {def.icon}
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '13px', fontWeight: 700, color: cfg.enabled ? '#0F172A' : '#64748B' }}>{def.label}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{def.subtitle}</div>
              </div>
              {st.state === 'ok' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                  <CheckCircle2 size={12} style={{ color: '#16A34A' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A' }}>Connected</span>
                </div>
              )}
              <button onClick={(e) => {
                  e.stopPropagation();
                  const next = !cfg.enabled;
                  updApi(def.key, { enabled: next });
                  setCardOpen(prev => ({ ...prev, [def.key]: next }));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all"
                style={{
                  fontSize: '11px',
                  background: cfg.enabled ? 'rgba(37,99,235,0.07)' : '#F1F5F9',
                  color:      cfg.enabled ? '#2563EB' : '#64748B',
                  border:     cfg.enabled ? '1.5px solid rgba(37,99,235,0.25)' : '1.5px solid #E2E8F0',
                }}>
                {cfg.enabled ? 'Enabled ✓' : 'Enable'}
              </button>
              {isCardOpen(def.key)
                ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
                : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
            </div>

            {/* Config form */}
            {cfg.enabled && isCardOpen(def.key) && (
              <div className="p-[16px_22px] space-y-4">

                {/* Base URL — hidden in DLP via-connector mode (the
                    customer-side connector reads the URL out of its
                    own connector-secrets.json; the wizard companion
                    never needs it on that path). */}
                {(def.key !== 'dlpApi' || (cfg.transport ?? 'direct') === 'direct') && (
                  <div>
                    <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>BASE URL</label>
                    <input style={{ ...IS, marginTop: '4px' }} placeholder={def.placeholder}
                      value={cfg.url} onChange={e => updApi(def.key, { url: e.target.value })}
                      onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                      onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                  </div>
                )}

                {/* Transport mode picker — DLP REST API only. Two paths
                    to the customer's API:
                      • direct        — companion fetches the BASE URL
                                        directly. Default. Works when
                                        the SE has line-of-sight to the
                                        customer FSM:9443.
                      • via-connector — companion enqueues each request
                                        as an encrypted job, the
                                        Customer Connector .exe picks
                                        it up over its outbound HTTPS
                                        heartbeat channel, executes the
                                        call inside the customer
                                        network, and returns the
                                        result. Use when the SE has no
                                        direct route to the FSM, only
                                        to the connector.
                    V-Series and NGFW SMC don't get this toggle —
                    those appliances are always reached directly. */}
                {def.key === 'dlpApi' && (() => {
                  const transport: ApiTransport = (cfg.transport ?? 'direct');
                  const connEnabled = customerConnector.enabled && !!customerConnector.token;
                  const connOnline  = !!connectorStatus?.online;
                  return (
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                        TRANSPORT
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'direct'        as const, title: 'Direct',        sub: 'HC server contacts the customer FSM (needs URL + creds here)' },
                          { id: 'via-connector' as const, title: 'Via Connector', sub: 'Customer Connector queries the FSM (uses connector-secrets.json)' },
                        ]).map((opt) => {
                          const active = transport === opt.id;
                          return (
                            <button key={opt.id} type="button"
                              onClick={() => updApi('dlpApi', { transport: opt.id })}
                              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all text-left"
                              style={{
                                background: active ? 'rgba(37,99,235,0.06)' : '#F8FAFC',
                                border: active ? '2px solid rgba(37,99,235,0.35)' : '1.5px solid #E2E8F0',
                                cursor: 'pointer',
                              }}>
                              <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                                style={{ border: `2px solid ${active ? '#2563EB' : '#CBD5E1'}`, background: active ? '#2563EB' : 'transparent' }}>
                                {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: active ? '#2563EB' : '#334155' }}>
                                  {opt.title}
                                </div>
                                <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                  {opt.sub}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Inline guard rails — Via Connector requires
                          the Customer Connector card to be enabled
                          AND the .exe to be phoning home. We don't
                          auto-fall-back to Direct (silent transport
                          swaps surprise the operator); we just block
                          forward progress with a visible warning. */}
                      {transport === 'via-connector' && !connEnabled && (
                        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                          style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                          <XCircle size={13} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: '11px', color: '#92400E', lineHeight: 1.5 }}>
                            <strong>Customer Connector is OFF.</strong>{' '}
                            Enable the Customer Connector card above and complete the token /
                            encryption-key setup; Via-Connector mode can't route requests until the
                            connector is registered.
                          </span>
                        </div>
                      )}
                      {transport === 'via-connector' && connEnabled && !connOnline && (
                        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                          <XCircle size={13} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: '11px', color: '#991B1B', lineHeight: 1.5 }}>
                            <strong>Connector OFFLINE.</strong>{' '}
                            The customer hasn't started <span style={{ fontFamily: 'monospace' }}>forcepoint-hc-connector.exe</span> yet,
                            or it's stuck. Via-Connector mode will fail until the status pill in the
                            Customer Connector card turns <span style={{ color: '#16A34A', fontWeight: 700 }}>ONLINE</span>.
                          </span>
                        </div>
                      )}
                      {transport === 'via-connector' && connEnabled && connOnline && (
                        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
                          style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                          <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: '11px', color: '#15803D', lineHeight: 1.5 }}>
                            <strong>Routing through connector.</strong>{' '}
                            All DLP REST API calls (test, posture fetch, report runs) will be
                            forwarded as encrypted jobs through the Customer Connector. Customer
                            credentials never leave their host — System API only sees encrypted payloads.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Auth type toggle — DLP REST API only supports Application
                    Administrator username + password, so we hide the auth
                    picker entirely on the DLP card. V-Series and NGFW SMC
                    still expose both modes. */}
                {def.key !== 'dlpApi' && (
                  <div>
                    <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                      AUTHENTICATION
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['apikey', 'basic'] as const).map(type => {
                        const active = cfg.authType === type;
                        return (
                          <button key={type} onClick={() => updApi(def.key, { authType: type })}
                            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all text-left"
                            style={{
                              background: active ? 'rgba(37,99,235,0.06)' : '#F8FAFC',
                              border: active ? '2px solid rgba(37,99,235,0.35)' : '1.5px solid #E2E8F0',
                            }}>
                            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                              style={{ border: `2px solid ${active ? '#2563EB' : '#CBD5E1'}`, background: active ? '#2563EB' : 'transparent' }}>
                              {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: active ? '#2563EB' : '#334155' }}>
                                {type === 'apikey' ? 'API Key' : 'Basic Auth'}
                              </div>
                              <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                {type === 'apikey' ? 'Bearer token / API key header' : 'Username & password'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Credentials — DLP is locked to basic auth (Application
                    Administrator only), so the apiKey branch never renders
                    on that card. Hidden entirely in DLP via-connector
                    mode (the connector .exe reads creds from its own
                    connector-secrets.json on the customer host). */}
                {def.key === 'dlpApi' && (cfg.transport ?? 'direct') === 'via-connector' ? (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                    style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                    <Plug size={14} style={{ color: '#0D9488', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: '11px', color: '#0F766E', lineHeight: 1.55 }}>
                      <strong>Credentials live on the customer host.</strong>{' '}
                      The Customer Connector reads its DLP REST API URL + Application
                      Administrator username / password from{' '}
                      <span style={{ fontFamily: 'monospace' }}>connector-secrets.json</span>.
                      Nothing to enter here — Test Connection and Fetch will route through
                      the connector using whatever the customer put in that file.
                    </div>
                  </div>
                ) : (def.key !== 'dlpApi' && cfg.authType === 'apikey') ? (
                  <div>
                    <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>API KEY</label>
                    <div style={{ position: 'relative', marginTop: '4px' }}>
                      <input style={{ ...IS, paddingRight: '38px', fontFamily: 'monospace' }}
                        type={pw ? 'text' : 'password'} placeholder="••••••••••••••••"
                        value={cfg.apiKey} onChange={e => updApi(def.key, { apiKey: e.target.value })}
                        onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                        onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                      <button onClick={() => setShowPw(p => ({ ...p, [def.key]: !pw }))}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {pw ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl"
                    style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>USERNAME</label>
                      <input style={{ ...IS, marginTop: '4px' }} placeholder="admin"
                        value={cfg.username} onChange={e => updApi(def.key, { username: e.target.value })}
                        onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                        onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                    </div>
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>PASSWORD</label>
                      <div style={{ position: 'relative', marginTop: '4px' }}>
                        <input style={{ ...IS, paddingRight: '38px' }}
                          type={pw ? 'text' : 'password'} placeholder="••••••••"
                          value={cfg.password} onChange={e => updApi(def.key, { password: e.target.value })}
                          onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                          onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                        <button onClick={() => setShowPw(p => ({ ...p, [def.key]: !pw }))}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {pw ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Test connection — DLP via-connector mode doesn't
                    need a URL (the connector reads its own
                    connector-secrets.json), so the disabled gate flips
                    to "connector must be online" instead. */}
                {(() => {
                  const isDlpVia = def.key === 'dlpApi' && (cfg.transport ?? 'direct') === 'via-connector';
                  const connOnline = !!connectorStatus?.online;
                  const connReady = customerConnector.enabled && !!customerConnector.token && connOnline;
                  const urlNeeded = !isDlpVia;
                  const blocker = isDlpVia ? !connReady : !cfg.url.trim();
                  const disabled = blocker || testing;
                  return (
                    <div className="flex items-center gap-3">
                      <button onClick={() => testApi(def.key, def.endpoint)}
                        disabled={disabled}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all"
                        style={{
                          fontSize: '12.5px',
                          background: disabled ? '#F1F5F9' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                          color:  disabled ? '#94A3B8' : '#fff',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          boxShadow: !disabled ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                          border: '1.5px solid transparent',
                        }}>
                        {testing
                          ? <><Loader size={13} className="animate-spin" /> Testing…</>
                          : <>Test Connection</>}
                      </button>
                      {st.state !== 'idle' && st.state !== 'testing' && (
                        <div className="flex items-center gap-1.5">
                          {st.state === 'ok'
                            ? <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
                            : <XCircle     size={14} style={{ color: '#DC2626' }} />}
                          <span style={{ fontSize: '11.5px', fontWeight: 500, color: st.state === 'ok' ? '#16A34A' : '#DC2626' }}>
                            {st.message}
                          </span>
                        </div>
                      )}
                      {st.state === 'idle' && urlNeeded && !cfg.url.trim() && (
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Enter base URL to test</span>
                      )}
                      {st.state === 'idle' && isDlpVia && !connReady && (
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Waiting for Customer Connector to come ONLINE…</span>
                      )}
                    </div>
                  );
                })()}

                {/* ── DLP-API hint: once the connection test is green the
                     operator picks blocks in the "REST API Data Selection"
                     card below; this small hint just points them there. */}
                {def.key === 'dlpApi' && st.state === 'ok' && (
                  <div className="rounded-lg mt-1 flex items-start gap-2"
                    style={{ background: 'rgba(22,163,74,0.04)', border: '1px solid rgba(22,163,74,0.18)', padding: '10px 12px' }}>
                    <CheckCircle2 size={14} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: '11.5px', color: '#15803D', lineHeight: 1.5 }}>
                      <strong>Connection ready.</strong>{' '}
                      Pick the posture blocks to include in the report from the
                      <strong> REST API Data Selection</strong> card below — categorical rollups only,
                      no individual user names cross this boundary.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Report Selection — gated on the SQL Server connector AND at least
          one report group surviving the visibility filter. When DLP API is
          on, the dlp group is hidden; if the only Step-2 product is DLP
          the card disappears entirely (the DLP REST API "Data Selection"
          card below takes over). */}
      {(selectedProducts.web || selectedProducts.data || selectedProducts.email)
        && sqlConfig.enabled
        && visibleReportGroups.length > 0 && (
      <div className="bg-white rounded-xl p-[20px_22px]"
        style={{ border: '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleCard('report_selection')}
          style={{ marginBottom: isCardOpen('report_selection') ? '1.25rem' : '0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Report Selection</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Choose which reports to include in the exported assessment
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono px-2.5 py-1 rounded-lg"
              style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(37,99,235,0.07)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.18)' }}>
              {visibleSelectedReports.length} / {visibleReportIds.length} selected
            </span>
            {isCardOpen('report_selection')
              ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
              : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
          </div>
        </div>

        {isCardOpen('report_selection') && <>
        {/* Bulk runner — fires every selected report in one go, sharing a
            Top X / Last Y window. Disabled when no SQL connection is configured
            or when nothing is selected. Sequential under the hood so the SQL
            pool isn't stampeded. */}
        <div className="rounded-lg p-[12px_14px] mb-4 flex items-center gap-3 flex-wrap"
          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Play size={13} style={{ color: '#2563EB' }} />
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>Bulk Run</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Top</label>
            <select value={bulkTopN} onChange={(e) => setBulkTopN(parseInt(e.target.value, 10))}
              disabled={bulkRunning.active}
              style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 6px', cursor: bulkRunning.active ? 'not-allowed' : 'pointer' }}>
              {[5, 10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
              <option value={0}>All</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: '#94A3B8' }} />
            <label style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Last</label>
            <select value={bulkDays} onChange={(e) => setBulkDays(parseInt(e.target.value, 10))}
              disabled={bulkRunning.active}
              style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 6px', cursor: bulkRunning.active ? 'not-allowed' : 'pointer' }}>
              {WINDOW_OPTIONS.map((d) => (<option key={d} value={d}>{d} days</option>))}
            </select>
          </div>
          <div className="flex-1" />
          {bulkRunning.active && (
            <span className="font-mono" style={{ fontSize: '10.5px', color: '#2563EB', fontWeight: 600 }}>
              Running {bulkRunning.current}/{bulkRunning.total}…
            </span>
          )}
          {(() => {
            const blocker = bulkRunning.active || visibleSelectedReports.length === 0 || !sqlBackendReady;
            const tooltip = !sqlBackendReady
              ? sqlBackendBlocker
              : visibleSelectedReports.length === 0
                ? 'Select at least one report to run'
                : 'Run every selected report sequentially';
            return (
              <button onClick={runAllSelected}
                disabled={blocker}
                title={tooltip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all"
                style={{
                  fontSize: '11px',
                  background: blocker ? '#F1F5F9' : '#2563EB',
                  color:      blocker ? '#94A3B8' : '#fff',
                  border: `1px solid ${blocker ? '#E2E8F0' : '#1D4ED8'}`,
                  cursor:    blocker ? 'not-allowed' : 'pointer',
                  boxShadow: blocker ? 'none' : '0 2px 8px rgba(37,99,235,0.3)',
                }}>
                {bulkRunning.active ? <Loader size={11} className="animate-spin" /> : <Play size={11} />}
                {bulkRunning.active ? 'Running…' : `Run ${visibleSelectedReports.length} Selected`}
              </button>
            );
          })()}
        </div>

        <div className="space-y-3">
          {visibleReportGroups.map(group => {
            const inScope = activeProducts.has(group.product);
            const groupIds = group.reports.map(r => r.id);
            const selCount = groupIds.filter(id => selectedReports.includes(id)).length;
            const allSel   = selCount === groupIds.length;
            const expanded = expandedGroups.has(group.product);

            return (
              <div key={group.product} className="rounded-xl overflow-hidden"
                style={{ border: `1.5px solid ${inScope ? group.border : '#E2E8F0'}` }}>

                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  style={{ background: inScope ? group.bg : '#FAFAFA' }}
                  onClick={() => toggleGroup(group.product)}>
                  <span style={{ fontSize: '15px' }}>{group.emoji}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: inScope ? '#0F2952' : '#94A3B8' }}>
                      {group.label}
                    </span>
                    {!inScope && (
                      <span className="px-1.5 py-0.5 rounded font-mono"
                        style={{ fontSize: '8.5px', fontWeight: 700, background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
                        NOT IN SCOPE
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: inScope ? group.color : '#94A3B8', fontWeight: 600 }}>
                    {selCount}/{groupIds.length}
                  </span>
                  <button onClick={e => { e.stopPropagation(); toggleGroupAll(groupIds, allSel); }}
                    className="px-2.5 py-1 rounded-lg font-semibold"
                    style={{ fontSize: '10px', background: allSel ? `${group.color}18` : '#F1F5F9', color: allSel ? group.color : '#64748B', border: `1px solid ${allSel ? `${group.color}33` : '#E2E8F0'}` }}>
                    {allSel ? 'Deselect All' : 'Select All'}
                  </button>
                  {expanded
                    ? <ChevronDown  size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />}
                </div>

                {expanded && (
                  <div style={{ borderTop: `1px solid ${inScope ? group.border : '#E2E8F0'}` }}>
                    {group.reports.map((report, idx) => {
                      const sel = selectedReports.includes(report.id);
                      const defaultDays = report.defaultWindowDays ?? 30;
                      const days = reportWindows[report.id] ?? defaultDays;
                      const run = reportRuns[report.id];
                      const isLast = idx === group.reports.length - 1;
                      return (
                        <ReportRow key={report.id}
                          report={report}
                          group={group}
                          selected={sel}
                          windowDays={days}
                          runResult={run}
                          isLast={isLast}
                          sqlReady={sqlBackendReady}
                          onToggle={() => toggleReport(report.id)}
                          onChangeWindow={(d) => setReportWindows((prev) => ({ ...prev, [report.id]: d }))}
                          onRun={() => runReport(report.sqlKey, days)}
                          onClear={() => setReportRuns((prev) => {
                            const next = { ...prev }; delete next[report.id]; return next;
                          })}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>}
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          REST API Data Selection — gated on the DLP REST API connector.
          Sibling to Report Selection but pulls from the FSM /incidents
          endpoint instead of PA_EVENTS_* SQL partitions. The operator
          ticks which posture blocks make it into the final HTML report.
      ═══════════════════════════════════════════════════════════════ */}
      {selectedProducts.data && apiConnectors.dlpApi?.enabled && (() => {
        const selectedCount = ALL_POSTURE_BLOCK_IDS.filter((id) => dlpPostureSections[id]).length;
        const totalCount = ALL_POSTURE_BLOCK_IDS.length;
        const allSelected = selectedCount === totalCount;
        const noneSelected = selectedCount === 0;
        const groups: Record<string, typeof DLP_POSTURE_BLOCKS> = {};
        for (const b of DLP_POSTURE_BLOCKS) (groups[b.group] ??= []).push(b);

        /* Tiny per-block preview — shown next to each row once the
           operator has fetched the posture summary. Keeps the picker
           grounded in the actual numbers instead of just labels. */
        const blockPreview = (id: DlpPostureBlockId): string | null => {
          if (!dlpPostureSummary) return null;
          const ps = dlpPostureSummary;
          const topLabel = (arr: { label: string; count: number }[]) => arr[0] ? `${arr[0].label} (${arr[0].count})` : '—';
          switch (id) {
            case 'overview':          return `v${ps.dlpVersion || '—'} · ${ps.deploymentStatus.replace(/_/g, ' ')} · ${ps.enabledDlpPolicies} DLP pol`;
            case 'severity':          return `H ${ps.bySeverity.HIGH} · M ${ps.bySeverity.MEDIUM} · L ${ps.bySeverity.LOW}`;
            case 'action':            return `${Object.keys(ps.byAction).length} action${Object.keys(ps.byAction).length === 1 ? '' : 's'}`;
            case 'channel':           return `${Object.keys(ps.byChannel).length} channels`;
            case 'status':            return `${Object.keys(ps.byStatus).length} status states`;
            case 'policies':          return `top: ${topLabel(ps.topPolicies)}`;
            case 'destinations':      return `top: ${topLabel(ps.topDestinations)}`;
            case 'users':             return ps.topUsers?.length ? `top: ${topLabel(ps.topUsers)}` : 'no user telemetry';
            case 'genai_apps':        return `${ps.genAiIncidentCount ?? 0} hits · ${(ps.topGenAiApps?.length ?? 0)} apps`;
            case 'saas_apps':         return `${ps.saasIncidentCount ?? 0} hits · ${(ps.topSaasApps?.length ?? 0)} apps`;
            case 'webmail':           return `${ps.webmailIncidentCount ?? 0} hits · ${(ps.topWebmail?.length ?? 0)} providers`;
            case 'endpoint_type':     return `L ${ps.byEndpointType.LAPTOP} · D ${ps.byEndpointType.DESKTOP} · N ${ps.byEndpointType.NA}`;
            case 'detection_sources': return `${Object.keys(ps.byDetectedBy).length} sources`;
            case 'workflow_rates':    return `FP ${ps.falsePositiveCount} · Rel ${ps.releasedIncidentCount} · Ign ${ps.ignoredCount}`;
            case 'risk_sla':          return `Risk+ ${ps.riskLevelPositiveCount ?? 0} · SLA breach ${ps.slaBreachCount ?? 0}`;
            case 'data_exposure':     return `${formatBytes(ps.totalForensicBytes ?? 0)} crossed boundary`;
          }
        };

        return (
      <div className="bg-white rounded-xl p-[20px_22px]"
        style={{ border: '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleCard('rest_api_data_selection')}
          style={{ marginBottom: isCardOpen('rest_api_data_selection') ? '1.25rem' : '0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>REST API Data Selection</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Choose which DLP REST API blocks populate the Information Security Posture Dashboard in the report
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setDlpPostureSections(prev => {
                const target = !allSelected;
                const next = { ...prev };
                for (const id of ALL_POSTURE_BLOCK_IDS) next[id] = target;
                return next;
              }); }}
              className="font-mono px-2.5 py-1 rounded-lg transition-all"
              style={{ fontSize: '10.5px', fontWeight: 700, background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="font-mono px-2.5 py-1 rounded-lg"
              style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(22,163,74,0.07)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.18)' }}>
              {selectedCount} / {totalCount} selected
            </span>
            {isCardOpen('rest_api_data_selection')
              ? <ChevronDown size={14} style={{ color: '#94A3B8' }} />
              : <ChevronRight size={14} style={{ color: '#94A3B8' }} />}
          </div>
        </div>

        {isCardOpen('rest_api_data_selection') && <>
        {/* Fetch toolbar */}
        <div className="rounded-lg p-[12px_14px] mb-4 flex items-center gap-3 flex-wrap"
          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Play size={13} style={{ color: '#16A34A' }} />
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>Pull Posture</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: '#94A3B8' }} />
            <label style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Window</label>
            <select value={postureWindow}
              onChange={(e) => setPostureWindow(parseInt(e.target.value, 10))}
              disabled={postureFetching}
              style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 6px', cursor: postureFetching ? 'not-allowed' : 'pointer' }}>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div className="flex-1" />
          {dlpPostureSummary && !postureFetching && (
            <span style={{ fontSize: '10.5px', color: '#64748B' }}>
              Last fetched <span style={{ fontFamily: 'monospace', color: '#0F172A' }}>
                {new Date(dlpPostureSummary.fetchedAt).toLocaleString()}
              </span>
            </span>
          )}
          {(() => {
            /* Fetch enable gate — depends on transport:
                 direct        — needs a real Base URL filled in.
                 via-connector — needs the Customer Connector ONLINE
                                 (the URL field is hidden in this mode,
                                 so requiring it would be a permanent
                                 dead-end). */
            const transport = apiConnectors.dlpApi.transport ?? 'direct';
            const isVia = transport === 'via-connector';
            const connReady = customerConnector.enabled && !!customerConnector.token && !!connectorStatus?.online;
            const urlMissing = !apiConnectors.dlpApi.url.trim();
            const blocker = isVia ? !connReady : urlMissing;
            const tested = apiStatus.dlpApi?.state === 'ok' || !!dlpPostureSummary;
            const disabled = postureFetching || blocker || !tested;
            const titleMsg = !tested
              ? 'Test the DLP REST API connection above before fetching posture data.'
              : blocker
                ? (isVia ? 'Waiting for Customer Connector to come ONLINE.' : 'Enter the BASE URL above first.')
                : 'Pull deploy status, enabled policies, and aggregated incident telemetry.';
            return (
              <button onClick={fetchPosture}
                disabled={disabled}
                title={titleMsg}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all"
                style={{
                  fontSize: '11px',
                  background: disabled ? '#F1F5F9' : 'linear-gradient(135deg,#16A34A,#15803D)',
                  color:      disabled ? '#94A3B8' : '#fff',
                  cursor:     disabled ? 'not-allowed' : 'pointer',
                  border: '1px solid transparent',
                  boxShadow:  disabled ? 'none' : '0 2px 8px rgba(22,163,74,0.3)',
                }}>
                {postureFetching
                  ? <><Loader size={11} className="animate-spin" /> Fetching…</>
                  : <><Play size={11} /> {dlpPostureSummary ? 'Refresh' : 'Fetch'}</>}
              </button>
            );
          })()}
        </div>

        {postureError && (
          <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <XCircle size={13} style={{ color: '#DC2626', marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: '11px', color: '#7F1D1D', lineHeight: 1.55, flex: 1, fontFamily: 'monospace' }}>
              {postureError}
            </div>
          </div>
        )}

        {noneSelected && (
          <div className="mb-3 px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <XCircle size={13} style={{ color: '#B58800', marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: '11px', color: '#92400E', lineHeight: 1.55, flex: 1 }}>
              No blocks selected — the Information Security Posture Dashboard section will be omitted from the report.
            </div>
          </div>
        )}

        {/* Block list, grouped by category */}
        <div className="space-y-3">
          {(['Overview', 'Incidents', 'Exfil Vectors', 'Org & Risk'] as const).map((groupName) => {
            const blocks = groups[groupName] ?? [];
            if (blocks.length === 0) return null;
            const groupIds = blocks.map((b) => b.id);
            const groupSelectedCount = groupIds.filter((id) => dlpPostureSections[id]).length;
            const groupAllSelected = groupSelectedCount === groupIds.length;
            return (
              <div key={groupName} className="rounded-xl overflow-hidden"
                style={{ border: '1.5px solid #E2E8F0' }}>
                <div className="flex items-center gap-3 px-4 py-2.5"
                  style={{ background: '#F8FAFC', borderBottom: '1px solid #EEF0F5' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F2952', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {groupName}
                  </div>
                  <span className="font-mono"
                    style={{ fontSize: '10px', fontWeight: 600, color: '#94A3B8' }}>
                    {groupSelectedCount}/{groupIds.length}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => setDlpPostureSections(prev => {
                      const target = !groupAllSelected;
                      const next = { ...prev };
                      for (const id of groupIds) next[id] = target;
                      return next;
                    })}
                    style={{ fontSize: '10px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                    {groupAllSelected ? 'Clear' : 'Select all'}
                  </button>
                </div>
                <div>
                  {blocks.map((b, i) => {
                    const checked = !!dlpPostureSections[b.id];
                    const preview = blockPreview(b.id);
                    const isLast = i === blocks.length - 1;
                    return (
                      <div key={b.id}
                        style={{ borderBottom: isLast ? 'none' : '1px solid #F4F6FB', background: checked ? 'rgba(22,163,74,0.04)' : 'transparent' }}>
                        <label className="flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-all">
                          <button onClick={(e) => { e.preventDefault(); setDlpPostureSections(prev => ({ ...prev, [b.id]: !checked })); }}
                            aria-label={checked ? `Deselect ${b.title}` : `Select ${b.title}`}
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: checked ? '#16A34A' : 'transparent', border: `2px solid ${checked ? '#16A34A' : '#CBD5E1'}`, cursor: 'pointer' }}>
                            {checked && <Check size={10} color="#fff" strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0"
                            onClick={() => setDlpPostureSections(prev => ({ ...prev, [b.id]: !checked }))}>
                            <div style={{ fontSize: '12px', fontWeight: checked ? 600 : 500, color: checked ? '#0F172A' : '#475569' }}>
                              {b.title}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: 2, lineHeight: 1.5 }}>
                              {b.description}
                            </div>
                          </div>
                          {preview && (
                            <span className="font-mono flex-shrink-0"
                              style={{ fontSize: '10px', color: '#475569', background: '#fff', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 4, marginTop: 2 }}>
                              {preview}
                            </span>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        </>}
      </div>
        );
      })()}
    </div>
  );
}

/* ─── Report row — checkbox + title + per-row window selector + Run button.
       When a run produces results, an expandable result preview appears below
       the row. Per-row state lives in Dashboard so it survives wizard step
       navigation; query results are intentionally NOT persisted. */
const WINDOW_OPTIONS: number[] = [7, 14, 30, 60, 90, 100, 180, 365];

function ReportRow({
  report, group, selected, windowDays, runResult, isLast, sqlReady,
  onToggle, onChangeWindow, onRun, onClear,
}: {
  report: ReportDef;
  group: { color: string };
  selected: boolean;
  windowDays: number;
  runResult: ReportRunResult | undefined;
  isLast: boolean;
  /* True only when the SQL Server connector is enabled AND has a non-empty
     server host. Drives the per-row Run button — without a configured SQL
     pool the request would fail at the companion anyway, so we surface the
     prerequisite up front instead of waiting for the round-trip error. */
  sqlReady: boolean;
  onToggle: () => void;
  onChangeWindow: (days: number) => void;
  onRun: () => void;
  onClear: () => void;
}) {
  const running = runResult?.state === 'running';
  const hasResult = runResult && (runResult.state === 'ok' || runResult.state === 'error');
  const disabled = running || !sqlReady;
  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #F4F6FB', background: selected ? `${group.color}06` : 'transparent' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 transition-all">
        <button onClick={onToggle}
          aria-label={selected ? `Deselect ${report.title}` : `Select ${report.title}`}
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: selected ? group.color : 'transparent', border: `2px solid ${selected ? group.color : '#CBD5E1'}`, cursor: 'pointer' }}>
          {selected && <Check size={10} color="#fff" strokeWidth={3} />}
        </button>
        <span className="flex-1 cursor-pointer"
          onClick={onToggle}
          style={{ fontSize: '11.5px', color: selected ? '#0F172A' : '#475569', fontWeight: selected ? 500 : 400 }}>
          {report.title}
        </span>

        {/* Window selector — hidden for fixed-window analyses */}
        {!report.fixedWindow && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Clock size={11} style={{ color: '#94A3B8' }} />
            <select value={windowDays} onChange={(e) => onChangeWindow(parseInt(e.target.value, 10))}
              style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 5px', cursor: 'pointer' }}>
              {WINDOW_OPTIONS.map((d) => (
                <option key={d} value={d}>Last {d} days</option>
              ))}
            </select>
          </div>
        )}
        {report.fixedWindow && (
          <span style={{ fontSize: '10px', color: '#94A3B8', fontStyle: 'italic', flexShrink: 0, fontFamily: 'monospace' }}>
            window: fixed (7 vs 100d)
          </span>
        )}

        {/* Run button */}
        <button onClick={onRun} disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold transition-all flex-shrink-0"
          style={{
            fontSize: '10.5px',
            background: disabled ? '#F1F5F9' : runResult?.state === 'ok' ? '#DCFCE7' : runResult?.state === 'error' ? '#FEF2F2' : '#EFF6FF',
            color:      disabled ? '#94A3B8' : runResult?.state === 'ok' ? '#16A34A' : runResult?.state === 'error' ? '#DC2626' : '#2563EB',
            border: `1px solid ${disabled ? '#E2E8F0' : runResult?.state === 'ok' ? '#BBF7D0' : runResult?.state === 'error' ? '#FECACA' : '#BFDBFE'}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          title={!sqlReady
            ? 'Enable + configure the SQL Server connector above to run reports.'
            : running
              ? 'Query in progress…'
              : 'Run this query against the connected SQL Server'}>
          {running ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
          {running ? 'Running…' : runResult?.state === 'ok' ? 'Re-run' : runResult?.state === 'error' ? 'Retry' : 'Run'}
        </button>
      </div>

      {hasResult && runResult && (
        <ReportResultPreview result={runResult} accent={group.color} onClear={onClear} />
      )}
    </div>
  );
}

/* Inline expandable preview — small table for SUCCESS, error pill for ERROR.
   Renders first 10 rows; the rest are loaded into runtime state but
   omitted from the preview to keep the page scrollable. */
function ReportResultPreview({ result, accent, onClear }: { result: ReportRunResult; accent: string; onClear: () => void }) {
  if (result.state === 'error') {
    return (
      <div className="mx-4 mb-3 px-3 py-2 rounded-lg flex items-start gap-2"
        style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
        <XCircle size={13} style={{ color: '#DC2626', marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: '11px', color: '#7F1D1D', lineHeight: 1.55, flex: 1 }}>
          <strong>Query failed</strong> · last {result.windowDays}d
          <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: '10.5px' }}>{result.error}</div>
        </div>
        <button onClick={onClear} aria-label="Dismiss"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
          <XIcon size={11} />
        </button>
      </div>
    );
  }
  if (result.state !== 'ok' || !result.rows) return null;
  const rows = result.rows;
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const preview = rows.slice(0, 10);
  const remainder = rows.length - preview.length;
  return (
    <div className="mx-4 mb-3 rounded-lg overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ background: `${accent}08`, borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={11} style={{ color: '#16A34A' }} />
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#15803D' }}>{result.rowCount ?? rows.length} rows</span>
          <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>· {result.latencyMs} ms · last {result.windowDays}d</span>
        </div>
        <button onClick={onClear} title="Clear result"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
          <XIcon size={11} />
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
          Query ran successfully but returned no rows.
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                {columns.map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '5px 10px', fontWeight: 700, color: '#64748B', fontSize: '9.5px', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ borderBottom: i < preview.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  {columns.map((c) => {
                    const v = row[c];
                    const display = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return (
                      <td key={c} style={{ padding: '4px 10px', color: '#0F172A', whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={display}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {remainder > 0 && (
            <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center', padding: '6px 0', borderTop: '1px dashed #E2E8F0', background: '#FAFCFF', fontStyle: 'italic' }}>
              + {remainder} more rows (held in runtime state)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

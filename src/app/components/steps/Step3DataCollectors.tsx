import { useRef, useState } from 'react';
import { Database, CheckCircle2, XCircle, Loader, ChevronDown, ChevronRight, Check, Shield, Globe, Network, FolderOpen, Upload, Trash2, Server } from 'lucide-react';
import { REPORT_GROUPS, ALL_REPORT_IDS } from '../../constants/reportDefinitions';
import { parseDlpBundle, formatMemoryGB, memoryUsagePct, statusColor, type DlpServerBundle, type UploadedFile } from './dlpServerInfoParser';

// ── SQL Server config ────────────────────────────────────────────────────────
export interface SqlConfig {
  enabled: boolean;
  server: string;
  port: number;
  database: string;
  authType: 'windows' | 'sql';
  username: string;
  password: string;
}
export const DEFAULT_SQL_CONFIG: SqlConfig = {
  enabled: false, server: '', port: 1433, database: '', authType: 'windows', username: '', password: '',
};

// ── REST API connectors ──────────────────────────────────────────────────────
export interface ApiConnectorConfig {
  enabled: boolean;
  url: string;
  authType: 'apikey' | 'basic';
  apiKey: string;
  username: string;
  password: string;
}
export interface ApiConnectorsConfig {
  dlpApi: ApiConnectorConfig;
  vSeries: ApiConnectorConfig;
  ngfwSmc: ApiConnectorConfig;
}
const BLANK_API: ApiConnectorConfig = {
  enabled: false, url: '', authType: 'apikey', apiKey: '', username: '', password: '',
};
export const DEFAULT_API_CONNECTORS: ApiConnectorsConfig = {
  dlpApi:  { ...BLANK_API, authType: 'basic' },
  vSeries: { ...BLANK_API },
  ngfwSmc: { ...BLANK_API },
};

// ── Shared ───────────────────────────────────────────────────────────────────
interface ConnStatus { state: 'idle' | 'testing' | 'ok' | 'error'; message?: string; }

interface Props {
  sqlConfig: SqlConfig;
  setSqlConfig: React.Dispatch<React.SetStateAction<SqlConfig>>;
  apiConnectors: ApiConnectorsConfig;
  setApiConnectors: React.Dispatch<React.SetStateAction<ApiConnectorsConfig>>;
  selectedReports: string[];
  setSelectedReports: React.Dispatch<React.SetStateAction<string[]>>;
  selectedProducts: Record<string, boolean>;
  dlpBundles: DlpServerBundle[];
  setDlpBundles: React.Dispatch<React.SetStateAction<DlpServerBundle[]>>;
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
    const res = await fetch(`http://localhost:3001${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = await res.json() as { message?: string };
      return { state: 'ok', message: d.message || 'Connection successful' };
    }
    const e = await res.json() as { message?: string };
    return { state: 'error', message: e.message || `Server error (${res.status})` };
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return { state: 'error', message: timeout ? 'Connection timed out (8s)' : 'Local backend not running — start server on port 3001' };
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
    placeholder: 'https://dlp-server:8443',
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
            Bundle: <span style={{ fontFamily: 'monospace' }}>{b.bundleName}</span> · Parsed {b.parsedFiles.length} of {b.fileCount} files
            {b.unrecognizedFiles.length > 0 && <> · {b.unrecognizedFiles.length} unrecognized</>}
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
  selectedProducts,
  dlpBundles, setDlpBundles,
}: Props) {
  const [sqlStatus,  setSqlStatus]  = useState<ConnStatus>({ state: 'idle' });
  const [apiStatus,  setApiStatus]  = useState<Partial<Record<keyof ApiConnectorsConfig, ConnStatus>>>({});
  const [showPw,     setShowPw]     = useState<Partial<Record<string, boolean>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['web', 'dlp', 'email']));
  const [dlpExpanded, setDlpExpanded] = useState(true);
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string>('');
  const [parseBusy, setParseBusy] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const TEXT_EXT_RE = /\.(txt|csv|cer|pem|crt)$/i;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParseError('');
    setParseBusy(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of Array.from(files)) {
        if (!TEXT_EXT_RE.test(file.name)) continue;
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        let text = '';
        try { text = await file.text(); } catch { continue; }
        uploaded.push({ name: file.name, relativePath, text });
      }
      if (uploaded.length === 0) {
        setParseError('No .txt or .csv files found in the selection. Make sure to point at a DLPServerInfo bundle folder.');
        return;
      }
      const bundle = parseDlpBundle(uploaded);
      setDlpBundles(prev => {
        const others = prev.filter(b => b.bundleName !== bundle.bundleName);
        return [...others, bundle];
      });
      setExpandedBundles(prev => { const n = new Set(prev); n.add(bundle.bundleId); return n; });
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

  const updSql = (p: Partial<SqlConfig>) => setSqlConfig(prev => ({ ...prev, ...p }));
  const updApi = (key: keyof ApiConnectorsConfig, p: Partial<ApiConnectorConfig>) =>
    setApiConnectors(prev => ({ ...prev, [key]: { ...prev[key], ...p } }));

  const testSql = async () => {
    if (!sqlConfig.server.trim()) return;
    setSqlStatus({ state: 'testing' });
    setSqlStatus(await runTest('/api/sql/test', sqlConfig));
  };

  const testApi = async (key: keyof ApiConnectorsConfig, endpoint: string) => {
    setApiStatus(prev => ({ ...prev, [key]: { state: 'testing' } }));
    const result = await runTest(endpoint, apiConnectors[key]);
    setApiStatus(prev => ({ ...prev, [key]: result }));
  };

  const toggleGroup    = (p: string) => setExpandedGroups(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const toggleReport   = (id: string) => setSelectedReports(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  const toggleGroupAll = (ids: string[], all: boolean) =>
    setSelectedReports(prev => all ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);

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

      {/* DLP Server Info — bundle folder upload */}
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
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>DLP Server Info</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
              Upload a Forcepoint <span style={{ fontFamily: 'monospace' }}>DLPServerInfo_*</span> bundle folder — parses systeminfo, hardware, hotfixes, services, SQL Server, DB, policies, endpoint clients & more into the report
            </div>
          </div>
          {dlpBundles.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg font-mono font-bold"
              style={{ fontSize: '10.5px', background: 'rgba(217,119,6,0.1)', color: '#D97706', border: '1px solid rgba(217,119,6,0.25)' }}>
              {dlpBundles.length} BUNDLE{dlpBundles.length !== 1 ? 'S' : ''}
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
                {parseBusy ? 'Parsing bundle…' : 'Drop a DLPServerInfo folder here, or use the buttons below'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#A16207', textAlign: 'center', maxWidth: '420px' }}>
                Generated by Forcepoint's DLPServerInfo diagnostic tool. We parse{' '}
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
          </div>
        )}
      </div>

      {/* SQL Server */}
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${sqlConfig.enabled ? '#DBEAFE' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center gap-3 p-[16px_22px]"
          style={{ background: sqlConfig.enabled ? '#FAFCFF' : 'white', borderBottom: sqlConfig.enabled ? '1px solid #F1F5F9' : 'none' }}>
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
          <button onClick={() => updSql({ enabled: !sqlConfig.enabled })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '11px',
              background: sqlConfig.enabled ? 'rgba(37,99,235,0.07)' : '#F1F5F9',
              color:      sqlConfig.enabled ? '#2563EB' : '#64748B',
              border:     sqlConfig.enabled ? '1.5px solid rgba(37,99,235,0.25)' : '1.5px solid #E2E8F0',
            }}>
            {sqlConfig.enabled ? 'Enabled ✓' : 'Enable'}
          </button>
        </div>

        {sqlConfig.enabled && <div className="p-[16px_22px] space-y-4">
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

          {/* Database */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>DATABASE</label>
            <input style={{ ...IS, marginTop: '4px' }} placeholder="e.g. fpdb or DLP_DB"
              value={sqlConfig.database} onChange={e => updSql({ database: e.target.value })}
              onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
              onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
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

          {/* Test */}
          <div className="flex items-center gap-3">
            <button onClick={testSql}
              disabled={!sqlConfig.server.trim() || sqlStatus.state === 'testing'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all"
              style={{
                fontSize: '12.5px',
                background: !sqlConfig.server.trim() || sqlStatus.state === 'testing'
                  ? '#F1F5F9' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                color: !sqlConfig.server.trim() || sqlStatus.state === 'testing' ? '#94A3B8' : '#fff',
                cursor: !sqlConfig.server.trim() || sqlStatus.state === 'testing' ? 'not-allowed' : 'pointer',
                boxShadow: sqlConfig.server.trim() && sqlStatus.state !== 'testing' ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
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
            {sqlStatus.state === 'idle' && !sqlConfig.server.trim() && (
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>Enter server address to test</span>
            )}
          </div>
        </div>}
      </div>

      {/* REST API connectors */}
      {API_DEFS.map(def => {
        const cfg = apiConnectors[def.key];
        const st  = apiStatus[def.key] ?? { state: 'idle' as const };
        const pw  = showPw[def.key] ?? false;
        const testing = st.state === 'testing';

        return (
          <div key={def.key} className="bg-white rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${cfg.enabled ? '#DBEAFE' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

            {/* Card header */}
            <div className="flex items-center gap-3 p-[16px_22px]"
              style={{ background: cfg.enabled ? '#FAFCFF' : 'white', borderBottom: cfg.enabled ? '1px solid #F1F5F9' : 'none' }}>
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
              <button onClick={() => updApi(def.key, { enabled: !cfg.enabled })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all"
                style={{
                  fontSize: '11px',
                  background: cfg.enabled ? 'rgba(37,99,235,0.07)' : '#F1F5F9',
                  color:      cfg.enabled ? '#2563EB' : '#64748B',
                  border:     cfg.enabled ? '1.5px solid rgba(37,99,235,0.25)' : '1.5px solid #E2E8F0',
                }}>
                {cfg.enabled ? 'Enabled ✓' : 'Enable'}
              </button>
            </div>

            {/* Config form */}
            {cfg.enabled && (
              <div className="p-[16px_22px] space-y-4">

                {/* Base URL */}
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>BASE URL</label>
                  <input style={{ ...IS, marginTop: '4px' }} placeholder={def.placeholder}
                    value={cfg.url} onChange={e => updApi(def.key, { url: e.target.value })}
                    onFocus={e => (e.currentTarget.style.border = '1.5px solid #93C5FD')}
                    onBlur={e =>  (e.currentTarget.style.border = '1.5px solid #E2E8F0')} />
                </div>

                {/* Auth type toggle */}
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

                {/* Credentials */}
                {cfg.authType === 'apikey' ? (
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

                {/* Test connection */}
                <div className="flex items-center gap-3">
                  <button onClick={() => testApi(def.key, def.endpoint)}
                    disabled={!cfg.url.trim() || testing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all"
                    style={{
                      fontSize: '12.5px',
                      background: !cfg.url.trim() || testing
                        ? '#F1F5F9' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                      color:  !cfg.url.trim() || testing ? '#94A3B8' : '#fff',
                      cursor: !cfg.url.trim() || testing ? 'not-allowed' : 'pointer',
                      boxShadow: cfg.url.trim() && !testing ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
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
                  {st.state === 'idle' && !cfg.url.trim() && (
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>Enter base URL to test</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Report Selection */}
      <div className="bg-white rounded-xl p-[20px_22px]"
        style={{ border: '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Report Selection</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Choose which reports to include in the exported assessment
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono px-2.5 py-1 rounded-lg"
              style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(37,99,235,0.07)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.18)' }}>
              {selectedReports.length} / {ALL_REPORT_IDS.length} selected
            </span>
            <button onClick={() => setSelectedReports(ALL_REPORT_IDS)}
              className="px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}>
              All
            </button>
            <button onClick={() => setSelectedReports([])}
              className="px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}>
              None
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {REPORT_GROUPS.map(group => {
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
                      return (
                        <div key={report.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all"
                          style={{
                            borderBottom: idx < group.reports.length - 1 ? '1px solid #F4F6FB' : 'none',
                            background: sel ? `${group.color}06` : 'transparent',
                          }}
                          onClick={() => toggleReport(report.id)}
                          onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#F8FAFF'; }}
                          onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: sel ? group.color : 'transparent', border: `2px solid ${sel ? group.color : '#CBD5E1'}` }}>
                            {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                          <span className="flex-1"
                            style={{ fontSize: '11.5px', color: sel ? '#0F172A' : '#475569', fontWeight: sel ? 500 : 400 }}>
                            {report.title}
                          </span>
                          <span className="font-mono flex-shrink-0" style={{ fontSize: '9px', color: '#CBD5E1' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

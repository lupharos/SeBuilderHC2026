import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock } from 'lucide-react';
import type { VersionDataStore, CategoryKey, SoftwareEntry } from '../../constants/versionData';

/* ═══════════════════════════════
   TYPES
═══════════════════════════════ */
type VersionStatus = 'ok' | 'warning' | 'critical' | 'eos' | 'eol' | 'unknown';

export interface VersionEntry {
  id: string;
  groupId: string;
  component: string;
  productLabel: string;
  installedVersion: string;
  status: VersionStatus;
  notes: string;
}

interface Step4Props {
  selectedProducts: Record<string, boolean>;
  versionData: VersionDataStore;
  versionEntries: Record<string, VersionEntry>;
  onVersionEntriesChange: (updater: ((prev: Record<string, VersionEntry>) => Record<string, VersionEntry>) | Record<string, VersionEntry>) => void;
}

/* ═══════════════════════════════
   COMPONENT CATALOG
═══════════════════════════════ */
export interface ComponentDef {
  groupId: string;
  component: string;
  productLabel: string;
  versionDataCategory: CategoryKey | null;
  staticLatest?: string;
  staticRelease?: string;
  staticEoSupport?: string;
}

export const CATALOG: Record<string, ComponentDef> = {
  web_fsm:        { groupId: 'web',   component: 'FSM Server',                     productLabel: 'Forcepoint Security Manager',      versionDataCategory: 'Forcepoint Data Security' },
  web_proxy:      { groupId: 'web',   component: 'Web Security',                   productLabel: 'Forcepoint Web Security',           versionDataCategory: 'Forcepoint Web Security' },
  web_endpoint:   { groupId: 'web',   component: 'Endpoint Agent (Hybrid Web)',     productLabel: 'Forcepoint Web Security',           versionDataCategory: 'DLP + Web Endpoint Agent' },
  web_cg:         { groupId: 'web',   component: 'Content Gateway',                productLabel: 'Forcepoint Web Security',           versionDataCategory: 'Forcepoint Web Security' },
  web_sql:        { groupId: 'web',   component: 'SQL Server',                     productLabel: 'Microsoft SQL Server',              versionDataCategory: null, staticLatest: 'SQL 2022 (16.x)', staticRelease: 'Nov 2022', staticEoSupport: '2033-01-11' },

  email_fsm:      { groupId: 'email', component: 'FSM Server',                     productLabel: 'Forcepoint Security Manager',      versionDataCategory: 'Forcepoint Data Security' },
  email_gw:       { groupId: 'email', component: 'Email Security Gateway',          productLabel: 'Forcepoint Email Security',         versionDataCategory: 'Forcepoint Email Security' },
  email_sql:      { groupId: 'email', component: 'SQL Server',                     productLabel: 'Microsoft SQL Server',              versionDataCategory: null, staticLatest: 'SQL 2022 (16.x)', staticRelease: 'Nov 2022', staticEoSupport: '2033-01-11' },

  dlp_fsm:        { groupId: 'dlp',   component: 'FSM Server',                     productLabel: 'Forcepoint Security Manager',      versionDataCategory: 'Forcepoint Data Security' },
  dlp_endpoint:   { groupId: 'dlp',   component: 'Endpoint Agent (DLP)',            productLabel: 'Forcepoint DLP',                   versionDataCategory: 'DLP + Web Endpoint Agent' },
  dlp_email_gw:   { groupId: 'dlp',   component: 'Email GW Policy Engine',          productLabel: 'Forcepoint DLP',                   versionDataCategory: 'Forcepoint Data Security' },
  dlp_cg:         { groupId: 'dlp',   component: 'Content Gateway Policy Engine',   productLabel: 'Forcepoint DLP',                   versionDataCategory: 'Forcepoint Data Security' },
  dlp_protector:  { groupId: 'dlp',   component: 'Protector Policy Engine',         productLabel: 'Forcepoint DLP',                   versionDataCategory: 'Forcepoint Data Security' },
  dlp_supplemental:{ groupId: 'dlp',  component: 'Supplemental DLP Server',         productLabel: 'Forcepoint DLP',                   versionDataCategory: 'Forcepoint Data Security' },
  dlp_sql:        { groupId: 'dlp',   component: 'SQL Server',                     productLabel: 'Microsoft SQL Server',              versionDataCategory: null, staticLatest: 'SQL 2022 (16.x)', staticRelease: 'Nov 2022', staticEoSupport: '2033-01-11' },

  ngfw_smc:       { groupId: 'ngfw',  component: 'SMC Server',                     productLabel: 'Forcepoint NGFW',                  versionDataCategory: null, staticLatest: '6.11.2', staticRelease: 'Oct 2024' },
  ngfw_engine:    { groupId: 'ngfw',  component: 'Firewall Engine',                productLabel: 'Forcepoint NGFW',                  versionDataCategory: null, staticLatest: '6.11.2', staticRelease: 'Oct 2024' },

  dspm_server:    { groupId: 'dspm',  component: 'DSPM Server',                    productLabel: 'Forcepoint DSPM',                  versionDataCategory: null, staticLatest: '2.5.0',   staticRelease: 'Oct 2024' },
  dspm_agent:     { groupId: 'dspm',  component: 'DSPM Agent',                     productLabel: 'Forcepoint DSPM',                  versionDataCategory: null, staticLatest: '2.5.0',   staticRelease: 'Oct 2024' },

  cls_server:     { groupId: 'cls',   component: 'Classification Server',          productLabel: 'Forcepoint Data Classification',   versionDataCategory: null, staticLatest: '11.1.0',  staticRelease: 'Sep 2024' },
  cls_agent:      { groupId: 'cls',   component: 'Classification Agent',           productLabel: 'Forcepoint Data Classification',   versionDataCategory: null, staticLatest: '11.1.0',  staticRelease: 'Sep 2024' },
};

/* ═══════════════════════════════
   VERSION DATA HELPERS
═══════════════════════════════ */
function formatGA(ga: string | null): string {
  if (!ga) return '—';
  try {
    return new Date(ga).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return ga;
  }
}

/* Resolved info for the LATEST version (top row of the category) */
export interface LatestInfo {
  latestVersion: string;
  releaseDate: string; /* formatted from GA */
}

export function resolveLatest(def: ComponentDef, vd: VersionDataStore): LatestInfo {
  if (!def.versionDataCategory) {
    return {
      latestVersion: def.staticLatest ?? '—',
      releaseDate: def.staticRelease ?? '—',
    };
  }
  const entries = vd[def.versionDataCategory] as SoftwareEntry[];
  if (!entries?.length) return { latestVersion: '—', releaseDate: '—' };
  const latest = entries[0];
  return {
    latestVersion: String(latest.Version),
    releaseDate: formatGA(latest['General Availability']),
  };
}

/* Resolved EoS dates for the INSTALLED version */
export interface InstalledDates {
  eoSale: string;
  eoMaintenance: string;
  eoSupport: string;
}

export function resolveInstalledDates(
  installedVersion: string,
  def: ComponentDef,
  vd: VersionDataStore,
): InstalledDates {
  const empty: InstalledDates = { eoSale: '—', eoMaintenance: '—', eoSupport: '—' };
  if (!installedVersion.trim() || !def.versionDataCategory) {
    if (!def.versionDataCategory && def.staticEoSupport) {
      return { eoSale: '—', eoMaintenance: '—', eoSupport: def.staticEoSupport };
    }
    return empty;
  }

  const entries = vd[def.versionDataCategory] as SoftwareEntry[];
  const match = entries.find(
    (e) => String(e.Version).toLowerCase() === installedVersion.trim().toLowerCase(),
  );
  if (!match) return empty;

  return {
    eoSale:        match['End of Sale']          ?? '—',
    eoMaintenance: match['End Of Maintenance']   ?? '—',
    eoSupport:     match['End Of Support']       ?? '—',
  };
}

const TODAY = new Date().toISOString().slice(0, 10);

function calcStatus(
  installedVersion: string,
  def: ComponentDef,
  vd: VersionDataStore,
): { status: VersionStatus; notes: string } {
  const trimmed = installedVersion.trim();
  if (!trimmed) return { status: 'unknown', notes: '' };
  if (!def.versionDataCategory) return { status: 'unknown', notes: '' };

  const entries = vd[def.versionDataCategory] as SoftwareEntry[];
  if (!entries?.length) return { status: 'unknown', notes: '' };

  const latestStr = String(entries[0].Version);
  const match = entries.find((e) => String(e.Version).toLowerCase() === trimmed.toLowerCase());

  if (!match) return { status: 'unknown', notes: 'Version not found in catalog' };

  const eoSupport = match['End Of Support'] ?? null;
  const eoMaint   = match['End Of Maintenance'] ?? null;
  const primaryDate = eoSupport ?? eoMaint ?? null;

  if (primaryDate && primaryDate < TODAY) {
    return { status: 'eos', notes: `End of Support: ${primaryDate}` };
  }

  const isLatest = String(match.Version).toLowerCase() === latestStr.toLowerCase();

  if (isLatest) {
    if (primaryDate) {
      const diff = (new Date(primaryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (diff < 180) return { status: 'warning', notes: `EoS approaching: ${primaryDate}` };
    }
    return { status: 'ok', notes: 'Latest version ✓' };
  }

  const notes = `Update available: v${latestStr}` + (primaryDate ? ` · EoS: ${primaryDate}` : '');
  if (primaryDate) {
    const diff = (new Date(primaryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 180) return { status: 'warning', notes };
  }
  return { status: 'warning', notes };
}

/* ═══════════════════════════════
   PRODUCT GROUP CONFIG
═══════════════════════════════ */
export const GROUP_CONFIG: Record<string, { label: string; productId: string; color: string; bg: string; border: string; emoji: string; componentIds: string[] }> = {
  web:   { label: 'Web Security Gateway',                    productId: 'web',   color: '#0EA5E9', bg: '#F0F9FF', border: '#BAE6FD', emoji: '🌐', componentIds: ['web_fsm','web_proxy','web_endpoint','web_cg','web_sql'] },
  email: { label: 'Email Security Gateway',                  productId: 'email', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', emoji: '✉️', componentIds: ['email_fsm','email_gw','email_sql'] },
  dlp:   { label: 'Data Security (DLP)',                     productId: 'data',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', emoji: '🔒', componentIds: ['dlp_fsm','dlp_endpoint','dlp_email_gw','dlp_cg','dlp_protector','dlp_supplemental','dlp_sql'] },
  ngfw:  { label: 'Next Generation Firewall',                productId: 'ngfw',  color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', emoji: '🛡️', componentIds: ['ngfw_smc','ngfw_engine'] },
  dspm:  { label: 'Data Security Posture Management (DSPM)', productId: 'dspm',  color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', emoji: '☁️', componentIds: ['dspm_server','dspm_agent'] },
  cls:   { label: 'Data Classification',                     productId: 'cls',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', emoji: '🏷️', componentIds: ['cls_server','cls_agent'] },
};

function getActiveComponentIds(sel: Record<string, boolean>): string[] {
  const ids: string[] = [];
  if (sel.web)   ids.push('web_fsm','web_proxy','web_endpoint','web_cg','web_sql');
  if (sel.email) ids.push('email_fsm','email_gw','email_sql');
  if (sel.data)  ids.push('dlp_fsm','dlp_endpoint','dlp_email_gw','dlp_cg','dlp_protector','dlp_supplemental','dlp_sql');
  if (sel.ngfw)  ids.push('ngfw_smc','ngfw_engine');
  if (sel.dspm)  ids.push('dspm_server','dspm_agent');
  if (sel.cls)   ids.push('cls_server','cls_agent');
  return ids;
}

/* ═══════════════════════════════
   STATUS CONFIG
═══════════════════════════════ */
export const STATUS_CFG: Record<VersionStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  ok:       { label: 'Up to Date',       color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: <CheckCircle2 size={12} /> },
  warning:  { label: 'Update Available', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: <AlertTriangle size={12} /> },
  critical: { label: 'Critical',         color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: <XCircle size={12} /> },
  eos:      { label: 'End-of-Support',   color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', icon: <Clock size={12} /> },
  eol:      { label: 'End-of-Life',      color: '#7C2D12', bg: '#FFF7ED', border: '#FDBA74', icon: <XCircle size={12} /> },
  unknown:  { label: 'Unknown',          color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', icon: <Info size={12} /> },
};

/* ═══════════════════════════════
   COMPONENT LABEL
═══════════════════════════════ */
function ComponentLabel({ component, productLabel }: { component: string; productLabel: string }) {
  const isFSM = component === 'FSM Server';
  const isSQL = component === 'SQL Server';
  const accent = isFSM ? '#2563EB' : isSQL ? '#64748B' : null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{component}</span>
        {accent && (
          <span className="px-1.5 py-px rounded" style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace', background: `${accent}14`, color: accent, border: `1px solid ${accent}26` }}>
            {isFSM ? 'FSM' : 'SQL'}
          </span>
        )}
      </div>
      <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{productLabel}</span>
    </div>
  );
}

/* ═══════════════════════════════
   DATE BADGE
═══════════════════════════════ */
function DateBadge({ value }: { value: string }) {
  if (!value || value === '—') {
    return <span style={{ fontSize: '11px', color: '#CBD5E1' }}>—</span>;
  }
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isIso) {
    return <span style={{ fontSize: '11.5px', color: '#475569', fontFamily: 'monospace' }}>{value}</span>;
  }
  const expired = value < TODAY;
  const diff = (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const soon = !expired && diff < 180;

  const color  = expired ? '#DC2626' : soon ? '#D97706' : '#475569';
  const bg     = expired ? '#FEF2F2' : soon ? '#FFFBEB' : '#F8FAFC';
  const border = expired ? '#FECACA' : soon ? '#FDE68A' : '#E2E8F0';

  return (
    <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace', color, background: bg, border: `1px solid ${border}`, borderRadius: '5px', padding: '2px 6px', whiteSpace: 'nowrap', display: 'inline-block' }}>
      {value}
    </span>
  );
}

/* ═══════════════════════════════
   INSTALLED VERSION INPUT (with autocomplete)
═══════════════════════════════ */
function InstalledVersionInput({
  value, onChange, def, vd,
}: {
  value: string;
  onChange: (v: string) => void;
  def: ComponentDef;
  vd: VersionDataStore;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const options = def.versionDataCategory
    ? (vd[def.versionDataCategory] as SoftwareEntry[]).map((e) => String(e.Version))
    : [];
  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()));

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Enter version…"
        style={{
          width: '115px', fontSize: '12px', fontFamily: 'monospace',
          padding: '5px 9px', background: '#F4F6FA',
          border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '8px',
          color: value ? '#0F172A' : '#94A3B8', outline: 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onFocusCapture={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#EFF6FF'; }}
        onBlurCapture={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.12)'; e.target.style.background = '#F4F6FA'; }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-0.5 rounded-lg overflow-hidden" style={{ top: '100%', left: 0, minWidth: '130px', background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(15,41,82,0.12)' }}>
          {filtered.slice(0, 8).map((opt) => (
            <button
              key={opt}
              onMouseDown={() => { onChange(opt); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 transition-colors"
              style={{ fontSize: '11.5px', fontFamily: 'monospace', color: '#0F172A' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════
   MAIN COMPONENT
═══════════════════════════════ */
export function Step4VersionCheck({ selectedProducts, versionData, versionEntries, onVersionEntriesChange }: Step4Props) {
  useEffect(() => {
    const activeIds = getActiveComponentIds(selectedProducts);
    onVersionEntriesChange((prev) => {
      const next = { ...prev };
      for (const id of activeIds) {
        if (!next[id] && CATALOG[id]) {
          next[id] = { id, ...CATALOG[id], installedVersion: '', status: 'unknown', notes: '' };
        }
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts]);

  const patch = (id: string, updates: Partial<VersionEntry>) =>
    onVersionEntriesChange((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));

  const handleInstalledChange = (compId: string, value: string) => {
    const def = CATALOG[compId];
    if (!def) return;
    const { status, notes } = calcStatus(value, def, versionData);
    patch(compId, { installedVersion: value, status, notes });
  };

  const store = versionEntries;
  const activeIds = getActiveComponentIds(selectedProducts);
  const activeEntries = activeIds.map((id) => store[id]).filter(Boolean) as VersionEntry[];

  const counts = {
    ok:       activeEntries.filter((e) => e.status === 'ok').length,
    warning:  activeEntries.filter((e) => e.status === 'warning').length,
    critical: activeEntries.filter((e) => ['critical', 'eos', 'eol'].includes(e.status)).length,
    unknown:  activeEntries.filter((e) => e.status === 'unknown').length,
  };

  const hasSomething = activeIds.length > 0;

  const TH = ({ children, minW }: { children: React.ReactNode; minW?: string }) => (
    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '9px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.09em', textTransform: 'uppercase', background: '#F8FAFC', borderBottom: '1px solid #EEF0F5', whiteSpace: 'nowrap', minWidth: minW }}>
      {children}
    </th>
  );

  return (
    <div className="space-y-[13px]">

      {!hasSomething && (
        <div className="rounded-2xl p-10 flex flex-col items-center gap-3" style={{ background: '#fff', border: '1.5px dashed #E2E8F0' }}>
          <Info size={24} style={{ color: '#CBD5E1' }} />
          <p style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', lineHeight: 1.6 }}>
            No products selected in <strong>Step 2 — Product Scope</strong>.<br />
            Select at least one product to load its version components.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {hasSomething && (
        <div className="bg-white rounded-xl border shadow-[0_1px_3px_rgba(15,41,82,0.07)] p-[16px_20px]" style={{ borderColor: 'rgba(15,41,82,0.08)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.1)' }}>
                <CheckCircle2 size={14} style={{ color: '#2563EB' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Version & EoS Summary</span>
            </div>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>
              {activeEntries.length} component{activeEntries.length !== 1 ? 's' : ''} tracked
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Up to Date',        color: '#16A34A', bg: 'rgba(22,163,74,0.07)',   count: counts.ok },
              { label: 'Updates Available', color: '#D97706', bg: 'rgba(217,119,6,0.07)',   count: counts.warning },
              { label: 'Critical / EoS',    color: '#DC2626', bg: 'rgba(220,38,38,0.07)',   count: counts.critical },
              { label: 'Not Entered',       color: '#64748B', bg: 'rgba(100,116,139,0.07)', count: counts.unknown },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: s.bg }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.count}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-product tables */}
      {Object.entries(GROUP_CONFIG).map(([groupKey, grp]) => {
        if (!selectedProducts[grp.productId]) return null;

        return (
          <div key={groupKey} className="bg-white rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${grp.border}`, boxShadow: '0 1px 5px rgba(15,41,82,0.06)' }}>
            {/* Group header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ background: grp.bg, borderBottom: `1.5px solid ${grp.border}` }}>
              <span style={{ fontSize: '15px' }}>{grp.emoji}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: grp.color }}>{grp.label}</span>
              <span className="px-2 py-0.5 rounded-md" style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'monospace', background: `${grp.color}18`, color: grp.color, border: `1px solid ${grp.color}30` }}>
                {grp.componentIds.length} component{grp.componentIds.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {grp.componentIds.map((cid) => {
                  const e = store[cid];
                  if (!e) return null;
                  return <div key={cid} className="w-2 h-2 rounded-full" title={`${e.component}: ${STATUS_CFG[e.status].label}`} style={{ background: STATUS_CFG[e.status].color, flexShrink: 0 }} />;
                })}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <TH minW="170px">Component</TH>
                    <TH minW="120px">Installed Version</TH>
                    <TH minW="110px">Latest Version</TH>
                    <TH minW="90px">Release Date (GA)</TH>
                    <TH minW="95px">End of Sale</TH>
                    <TH minW="105px">End of Maintenance</TH>
                    <TH minW="95px">End of Support</TH>
                    <TH minW="126px">Status</TH>
                    <TH minW="190px">Notes</TH>
                  </tr>
                </thead>
                <tbody>
                  {grp.componentIds.map((compId) => {
                    const entry = store[compId];
                    if (!entry) return null;
                    const def = CATALOG[compId];
                    const latest = resolveLatest(def, versionData);
                    const dates = resolveInstalledDates(entry.installedVersion, def, versionData);
                    const { status: autoStatus, notes: autoNotes } = entry.installedVersion
                      ? calcStatus(entry.installedVersion, def, versionData)
                      : { status: 'unknown' as VersionStatus, notes: '' };

                    const sc = STATUS_CFG[autoStatus];
                    const isFSMrow = entry.component === 'FSM Server';
                    const isSQLrow = entry.component === 'SQL Server';

                    return (
                      <tr
                        key={compId}
                        style={{ borderBottom: '1px solid #F1F4FA', background: isFSMrow ? 'rgba(37,99,235,0.025)' : isSQLrow ? 'rgba(100,116,139,0.02)' : 'transparent' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FAFBFF'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isFSMrow ? 'rgba(37,99,235,0.025)' : isSQLrow ? 'rgba(100,116,139,0.02)' : 'transparent'; }}
                      >
                        {/* Component */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <ComponentLabel component={entry.component} productLabel={entry.productLabel} />
                        </td>

                        {/* Installed Version */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <InstalledVersionInput
                            value={entry.installedVersion}
                            onChange={(v) => handleInstalledChange(compId, v)}
                            def={def}
                            vd={versionData}
                          />
                        </td>

                        {/* Latest Version — from version data */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', color: '#0F172A', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '5px', padding: '2px 7px', display: 'inline-block' }}>
                            {latest.latestVersion}
                          </span>
                        </td>

                        {/* Release Date — GA of latest version */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '11.5px', color: '#475569', fontFamily: 'monospace' }}>{latest.releaseDate}</span>
                        </td>

                        {/* End of Sale — installed version's date */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <DateBadge value={dates.eoSale} />
                        </td>

                        {/* End of Maintenance — installed version's date */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <DateBadge value={dates.eoMaintenance} />
                        </td>

                        {/* End of Support — installed version's date */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <DateBadge value={dates.eoSupport} />
                        </td>

                        {/* Status — auto calculated */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: sc.bg, border: `1.5px solid ${sc.border}`, width: 'fit-content' }}>
                            <span style={{ color: sc.color }}>{sc.icon}</span>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: sc.color, whiteSpace: 'nowrap' }}>{sc.label}</span>
                          </div>
                        </td>

                        {/* Notes — auto-filled, manually editable */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <input
                            type="text"
                            value={entry.notes !== undefined && entry.notes !== autoNotes ? entry.notes : autoNotes}
                            onChange={(e) => patch(compId, { notes: e.target.value })}
                            placeholder={autoNotes || 'Add notes…'}
                            style={{ width: '100%', minWidth: '160px', fontSize: '11px', padding: '5px 9px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.1)', borderRadius: '8px', color: '#475569', outline: 'none', transition: 'border-color 0.15s, background 0.15s' }}
                            onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#EFF6FF'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.1)'; e.target.style.background = '#F8FAFC'; }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Legend / help */}
      {hasSomething && (
        <div className="rounded-xl p-[14px_18px] flex items-start gap-3" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.12)' }}>
          <Info size={14} style={{ color: '#2563EB', marginTop: '1px', flexShrink: 0 }} />
          <div style={{ fontSize: '11.5px', color: '#334155', lineHeight: 1.65 }}>
            <span style={{ fontWeight: 700 }}>How to use: </span>
            Type or select the installed version from the dropdown.
            <strong> Latest Version</strong> and <strong>Release Date (GA)</strong> are pulled automatically from Version Data.
            <strong> End of Sale / Maintenance / Support</strong> dates reflect the <em>installed</em> version entry.
            Status and Notes are auto-calculated — click Notes to override.
          </div>
        </div>
      )}
    </div>
  );
}

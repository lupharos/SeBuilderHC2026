import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock, Zap, Trash2, Edit2, RotateCcw, EyeOff } from 'lucide-react';
import type { VersionDataStore, CategoryKey, SoftwareEntry } from '../../constants/versionData';
import type { DlpServerBundle } from './dlpServerInfoParser';

/* ═══════════════════════════════
   TYPES
═══════════════════════════════ */
export type VersionStatus = 'ok' | 'warning' | 'critical' | 'eos' | 'eol' | 'unknown';

export interface VersionEntry {
  id: string;
  groupId: string;
  component: string;
  productLabel: string;
  installedVersion: string;
  status: VersionStatus;
  notes: string;
  /** When set, takes precedence over the computed status (manual override by analyst). */
  statusOverride?: VersionStatus;
  /** True when this entry was added by the user (not in CATALOG) OR when the user
      switched a catalog row to fully-editable mode (overriding name + dates). */
  isCustom?: boolean;
  /** Manual fields for custom / overridden entries. Used when `isCustom` is true,
      regardless of whether a CATALOG def exists for this id. */
  customLatestVersion?: string;
  customReleaseDate?: string;
  customEoSale?: string;
  customEoMaintenance?: string;
  customEoSupport?: string;
  /** Tombstone — when true the entry is hidden from the assessment but kept in
      state so the useEffect won't auto-recreate it. Cleared via the "Restore"
      banner at the top of the page. */
  removed?: boolean;
}

interface Step4Props {
  selectedProducts: Record<string, boolean>;
  versionData: VersionDataStore;
  versionEntries: Record<string, VersionEntry>;
  onVersionEntriesChange: (updater: ((prev: Record<string, VersionEntry>) => Record<string, VersionEntry>) | Record<string, VersionEntry>) => void;
  dlpBundles?: DlpServerBundle[];
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

  /* DSPM + Classification components resolve from their Product Lifecycle
     category (latest version, GA, EoSale/EoM/EoSupport) just like the other
     products. When that category is empty (no entries imported yet) the row
     shows "—" and the analyst can hit Edit to fill every column manually. */
  /* DSPM Server has its own lifecycle (Forcepoint DSPM). The DSPM Agent and
     the Classification Agent are the SAME binary, so both resolve from the
     shared 'FDC + DSPM Agent' lifecycle category. The Classification Server
     resolves from the FDC server lifecycle. Empty category → "—" + manual
     Edit override on the row. */
  dspm_server:    { groupId: 'dspm',  component: 'DSPM Server',                    productLabel: 'Forcepoint DSPM',                  versionDataCategory: 'Forcepoint DSPM' },
  dspm_agent:     { groupId: 'dspm',  component: 'DSPM Agent',                     productLabel: 'Forcepoint DSPM',                  versionDataCategory: 'FDC + DSPM Agent' },

  cls_server:     { groupId: 'cls',   component: 'Classification Server',          productLabel: 'Forcepoint Data Classification',   versionDataCategory: 'Forcepoint Data Classification (FDC)' },
  cls_agent:      { groupId: 'cls',   component: 'Classification Agent',           productLabel: 'Forcepoint Data Classification',   versionDataCategory: 'FDC + DSPM Agent' },
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
export function Step4VersionCheck({ selectedProducts, versionData, versionEntries, onVersionEntriesChange, dlpBundles = [] }: Step4Props) {
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);

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

  /* Auto-fill FSM Server and SQL Server versions from latest DLPServerInfo bundle.
     The FSM Server install bundles Forcepoint Security Manager (DLP version line),
     and the bundle also captures the local SQL Server version. */
  useEffect(() => {
    if (dlpBundles.length === 0) return;

    const fsmBundle = dlpBundles.find(b => b.forcepointProducts?.dlpVersion) ?? null;
    const fsmVersion = fsmBundle?.forcepointProducts?.dlpVersion?.trim() || '';

    const sqlBundle = dlpBundles.find(b => b.sqlServer && (b.sqlServer.versionShort || b.sqlServer.versionString)) ?? null;
    const sqlVersionRaw = sqlBundle?.sqlServer?.versionShort?.trim() || sqlBundle?.sqlServer?.versionString?.trim() || '';
    /* sqlServer.versionString can be a multi-line block; collapse whitespace for the input field. */
    const sqlVersion = sqlVersionRaw.replace(/\s+/g, ' ').slice(0, 80);

    if (!fsmVersion && !sqlVersion) return;

    const activeIds = getActiveComponentIds(selectedProducts);
    const fsmIds = fsmVersion ? activeIds.filter(id => id.endsWith('_fsm') && CATALOG[id]) : [];
    const sqlIds = sqlVersion ? activeIds.filter(id => id.endsWith('_sql') && CATALOG[id]) : [];
    if (fsmIds.length === 0 && sqlIds.length === 0) return;

    let fsmFilled = 0;
    let sqlFilled = 0;
    onVersionEntriesChange(prev => {
      const next = { ...prev };
      for (const id of fsmIds) {
        const def = CATALOG[id];
        const existing = next[id];
        if (existing?.installedVersion?.trim()) continue;
        const { status, notes } = calcStatus(fsmVersion, def, versionData);
        next[id] = {
          ...(existing ?? { id, ...def, installedVersion: '', status: 'unknown' as VersionStatus, notes: '' }),
          installedVersion: fsmVersion,
          status,
          notes: notes || `Auto-filled from DLP Server Telemetry: ${fsmBundle?.bundleName ?? ''}`,
        };
        fsmFilled++;
      }
      for (const id of sqlIds) {
        const def = CATALOG[id];
        const existing = next[id];
        if (existing?.installedVersion?.trim()) continue;
        const { status, notes } = calcStatus(sqlVersion, def, versionData);
        next[id] = {
          ...(existing ?? { id, ...def, installedVersion: '', status: 'unknown' as VersionStatus, notes: '' }),
          installedVersion: sqlVersion,
          status,
          notes: notes || `Auto-filled from DLP Server Telemetry: ${sqlBundle?.bundleName ?? ''}`,
        };
        sqlFilled++;
      }
      return next;
    });

    const parts: string[] = [];
    if (fsmFilled > 0) parts.push(`FSM Server (${fsmVersion}) → ${fsmFilled} row${fsmFilled === 1 ? '' : 's'}`);
    if (sqlFilled > 0) parts.push(`SQL Server (${sqlVersion}) → ${sqlFilled} row${sqlFilled === 1 ? '' : 's'}`);
    if (parts.length > 0) {
      setAutoFillNotice(`${parts.join(' · ')}. Auto-filled from DLP Server Telemetry. Edit any value to override.`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlpBundles, selectedProducts]);

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
  /* Catalog rows for actively-selected products. Tombstoned (removed:true) rows
     are excluded from rendering — they sit in state to block useEffect from
     recreating them. The user can restore via the banner. */
  const catalogEntries = activeIds
    .map((id) => store[id])
    .filter((e): e is VersionEntry => !!e && !e.removed);
  /* Custom entries — user-added (no CATALOG def). Catalog rows that the user
     "customized" stay in catalogEntries above (their id IS in activeIds) so we
     exclude them here to avoid duplicates. */
  const customEntries = Object.values(store).filter(
    (e): e is VersionEntry => !!e?.isCustom && !e.removed
      && !!GROUP_CONFIG[e.groupId] && !!selectedProducts[GROUP_CONFIG[e.groupId].productId]
      && !activeIds.includes(e.id),
  );
  const activeEntries = [...catalogEntries, ...customEntries];

  /* Tombstoned catalog entries that the user can restore. */
  const removedEntries = Object.values(store).filter(
    (e): e is VersionEntry => !!e?.removed
      && !!GROUP_CONFIG[e.groupId] && !!selectedProducts[GROUP_CONFIG[e.groupId].productId],
  );

  /* Effective status honours manual override when present. */
  const effStatus = (e: VersionEntry): VersionStatus => e.statusOverride ?? e.status;

  const counts = {
    ok:       activeEntries.filter((e) => effStatus(e) === 'ok').length,
    warning:  activeEntries.filter((e) => effStatus(e) === 'warning').length,
    critical: activeEntries.filter((e) => ['critical', 'eos', 'eol'].includes(effStatus(e))).length,
    unknown:  activeEntries.filter((e) => effStatus(e) === 'unknown').length,
  };

  const hasSomething = activeIds.length > 0 || customEntries.length > 0;

  function addCustomComponent(groupId: string) {
    const grp = GROUP_CONFIG[groupId];
    if (!grp) return;
    const id = `custom_${groupId}_${Date.now().toString(36)}`;
    onVersionEntriesChange((prev) => ({
      ...prev,
      [id]: {
        id, groupId,
        component: '',
        productLabel: grp.label,
        installedVersion: '',
        status: 'unknown',
        notes: '',
        isCustom: true,
      },
    }));
  }

  function removeEntry(id: string) {
    onVersionEntriesChange((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      /* For pure-custom entries (no CATALOG def) we hard-delete. For catalog
         entries we tombstone so the useEffect doesn't recreate them on the
         next render — the user can restore via the banner. */
      if (CATALOG[id]) {
        return { ...prev, [id]: { ...entry, removed: true } };
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function restoreEntry(id: string) {
    onVersionEntriesChange((prev) => {
      const entry = prev[id];
      if (!entry) return prev;
      const { removed: _r, ...rest } = entry;
      void _r;
      return { ...prev, [id]: rest as VersionEntry };
    });
  }

  function restoreAll() {
    onVersionEntriesChange((prev) => {
      const next: Record<string, VersionEntry> = {};
      for (const [k, e] of Object.entries(prev)) {
        if (e?.removed) { const { removed: _r, ...rest } = e; void _r; next[k] = rest as VersionEntry; }
        else next[k] = e;
      }
      return next;
    });
  }

  /* Flip a catalog row into fully-editable (custom-style) mode. Pre-fills the
     custom* fields with the catalog's current resolved values so the user has
     a starting point to override from. */
  function customizeEntry(id: string) {
    const def = CATALOG[id];
    if (!def) return;
    const entry = store[id];
    if (!entry) return;
    const latest = resolveLatest(def, versionData);
    const dates = resolveInstalledDates(entry.installedVersion, def, versionData);
    patch(id, {
      isCustom: true,
      customLatestVersion: entry.customLatestVersion ?? (latest.latestVersion === '—' ? '' : latest.latestVersion),
      customReleaseDate:  entry.customReleaseDate  ?? (latest.releaseDate  === '—' ? '' : latest.releaseDate),
      customEoSale:       entry.customEoSale       ?? (dates.eoSale        === '—' ? '' : dates.eoSale),
      customEoMaintenance: entry.customEoMaintenance ?? (dates.eoMaintenance === '—' ? '' : dates.eoMaintenance),
      customEoSupport:    entry.customEoSupport    ?? (dates.eoSupport     === '—' ? '' : dates.eoSupport),
    });
  }

  /* Revert a catalog row from custom-style mode back to catalog defaults. */
  function revertToCatalog(id: string) {
    if (!CATALOG[id]) return;
    patch(id, {
      isCustom: false,
      customLatestVersion: undefined,
      customReleaseDate: undefined,
      customEoSale: undefined,
      customEoMaintenance: undefined,
      customEoSupport: undefined,
    });
  }

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

      {removedEntries.length > 0 && (
        <div className="rounded-xl p-[12px_16px]"
          style={{ background: 'rgba(100,116,139,0.06)', border: '1.5px solid rgba(100,116,139,0.2)' }}>
          <div className="flex items-center gap-2.5">
            <EyeOff size={14} style={{ color: '#64748B', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {removedEntries.length} component{removedEntries.length === 1 ? '' : 's'} hidden from assessment
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                {removedEntries.slice(0, 4).map((e) => e.component).join(' · ')}
                {removedEntries.length > 4 && ` · +${removedEntries.length - 4} more`}
              </div>
            </div>
            <button
              onClick={restoreAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '11px', background: '#fff', color: '#475569', border: '1.5px solid #CBD5E1', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0EA5E9'; e.currentTarget.style.color = '#0284C7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#475569'; }}
            >
              <RotateCcw size={11} /> Restore all
            </button>
            {removedEntries.length <= 6 && (
              <div className="flex items-center gap-1 flex-wrap" style={{ marginLeft: 4 }}>
                {removedEntries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => restoreEntry(e.id)}
                    title={`Restore ${e.component}`}
                    className="px-2 py-1 rounded transition-all"
                    style={{ fontSize: '10px', fontWeight: 600, background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = '#0EA5E9'; ev.currentTarget.style.color = '#0284C7'; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = '#E2E8F0'; ev.currentTarget.style.color = '#64748B'; }}
                  >
                    ↶ {e.component}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {autoFillNotice && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-[12px_16px]"
          style={{ background: 'rgba(37,99,235,0.05)', border: '1.5px solid rgba(37,99,235,0.2)' }}
        >
          <Zap size={14} style={{ color: '#2563EB', flexShrink: 0, marginTop: '1px' }} />
          <div className="flex-1">
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A8A', letterSpacing: '0.04em', marginBottom: '2px' }}>
              AUTO-FILLED FROM DLP BUNDLE
            </div>
            <div style={{ fontSize: '11px', color: '#1E40AF', lineHeight: 1.5 }}>{autoFillNotice}</div>
          </div>
          <button
            onClick={() => setAutoFillNotice(null)}
            style={{
              fontSize: '10px', fontWeight: 600, color: '#2563EB',
              background: 'transparent', border: '1px solid rgba(37,99,235,0.3)',
              borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Dismiss
          </button>
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
        const groupCustomEntries = customEntries.filter((e) => e.groupId === groupKey);
        const groupRowIds: string[] = [...grp.componentIds, ...groupCustomEntries.map((e) => e.id)];
        const totalComponents = groupRowIds.length;

        return (
          <div key={groupKey} className="bg-white rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${grp.border}`, boxShadow: '0 1px 5px rgba(15,41,82,0.06)' }}>
            {/* Group header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ background: grp.bg, borderBottom: `1.5px solid ${grp.border}` }}>
              <span style={{ fontSize: '15px' }}>{grp.emoji}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: grp.color }}>{grp.label}</span>
              <span className="px-2 py-0.5 rounded-md" style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'monospace', background: `${grp.color}18`, color: grp.color, border: `1px solid ${grp.color}30` }}>
                {totalComponents} component{totalComponents !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {groupRowIds.map((cid) => {
                  const e = store[cid];
                  if (!e) return null;
                  const s = effStatus(e);
                  return <div key={cid} className="w-2 h-2 rounded-full" title={`${e.component}: ${STATUS_CFG[s].label}`} style={{ background: STATUS_CFG[s].color, flexShrink: 0 }} />;
                })}
                <button
                  onClick={() => addCustomComponent(groupKey)}
                  className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-md transition-all"
                  style={{ fontSize: '10px', fontWeight: 600, color: grp.color, background: '#fff', border: `1px solid ${grp.color}40`, cursor: 'pointer' }}
                  title="Add a custom component to this group"
                >
                  + Add Component
                </button>
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
                  {groupRowIds.map((compId) => {
                    const entry = store[compId];
                    if (!entry || entry.removed) return null;
                    const def = CATALOG[compId];
                    const isCustomRow = !def || entry.isCustom;
                    /* Resolution priority:
                       - When isCustom = true → custom* fields win (catalog rows the user
                         customized read from their own overrides, not the catalogue).
                       - Otherwise → resolve from CATALOG + versionData if def exists. */
                    const latest = isCustomRow
                      ? { latestVersion: entry.customLatestVersion || '—', releaseDate: entry.customReleaseDate || '—' }
                      : resolveLatest(def!, versionData);
                    const dates = isCustomRow
                      ? {
                          eoSale: entry.customEoSale || '—',
                          eoMaintenance: entry.customEoMaintenance || '—',
                          eoSupport: entry.customEoSupport || '—',
                        }
                      : resolveInstalledDates(entry.installedVersion, def!, versionData);
                    const { status: autoStatus, notes: autoNotes } = def && entry.installedVersion
                      ? calcStatus(entry.installedVersion, def, versionData)
                      : { status: 'unknown' as VersionStatus, notes: '' };

                    const effective = entry.statusOverride ?? autoStatus;
                    const sc = STATUS_CFG[effective];
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
                          <div className="flex items-center gap-2">
                            {isCustomRow ? (
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={entry.component}
                                  onChange={(e) => patch(compId, { component: e.target.value })}
                                  placeholder="Component name"
                                  style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', padding: '4px 7px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '6px', outline: 'none' }}
                                />
                                <input
                                  type="text"
                                  value={entry.productLabel}
                                  onChange={(e) => patch(compId, { productLabel: e.target.value })}
                                  placeholder="Product label"
                                  style={{ fontSize: '10.5px', color: '#475569', padding: '3px 7px', background: '#F8FAFC', border: '1px solid rgba(15,41,82,0.08)', borderRadius: '5px', outline: 'none' }}
                                />
                              </div>
                            ) : (
                              <ComponentLabel component={entry.component} productLabel={entry.productLabel} />
                            )}
                            {isCustomRow && (
                              <span style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                                {def && entry.isCustom ? 'OVERRIDDEN' : 'CUSTOM'}
                              </span>
                            )}
                            {/* Row controls — Customize (catalog only), Revert (overridden catalog only), Delete (all rows) */}
                            <div className="flex items-center gap-0.5" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                              {def && !entry.isCustom && (
                                <button
                                  onClick={() => customizeEntry(compId)}
                                  title="Override the catalog defaults for this component (edit name + all dates)"
                                  className="rounded transition-all"
                                  style={{ fontSize: '10px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#0EA5E9'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(14,165,233,0.08)'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                                >
                                  <Edit2 size={10} /> Edit
                                </button>
                              )}
                              {def && entry.isCustom && (
                                <button
                                  onClick={() => revertToCatalog(compId)}
                                  title="Revert to catalog defaults"
                                  className="rounded transition-all"
                                  style={{ fontSize: '10px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#475569'; (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                                >
                                  <RotateCcw size={10} /> Revert
                                </button>
                              )}
                              <button
                                onClick={() => removeEntry(compId)}
                                title={def ? 'Hide this component from the assessment (can be restored from the banner)' : 'Remove this custom component'}
                                className="rounded transition-all"
                                style={{ fontSize: '10px', color: '#CBD5E1', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 5px', display: 'inline-flex', alignItems: 'center' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Installed Version */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {def ? (
                            <InstalledVersionInput
                              value={entry.installedVersion}
                              onChange={(v) => handleInstalledChange(compId, v)}
                              def={def}
                              vd={versionData}
                            />
                          ) : (
                            <input
                              type="text"
                              value={entry.installedVersion}
                              onChange={(e) => patch(compId, { installedVersion: e.target.value })}
                              placeholder="Enter version…"
                              style={{ width: '115px', fontSize: '12px', fontFamily: 'monospace', padding: '5px 9px', background: '#F4F6FA', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '8px', color: entry.installedVersion ? '#0F172A' : '#94A3B8', outline: 'none' }}
                            />
                          )}
                        </td>

                        {/* Latest Version */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {isCustomRow ? (
                            <input
                              type="text"
                              value={entry.customLatestVersion ?? ''}
                              onChange={(e) => patch(compId, { customLatestVersion: e.target.value })}
                              placeholder="Latest"
                              style={{ width: '100px', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', padding: '4px 8px', background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: '6px', color: '#0F172A', outline: 'none' }}
                            />
                          ) : (
                            <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', color: '#0F172A', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '5px', padding: '2px 7px', display: 'inline-block' }}>
                              {latest.latestVersion}
                            </span>
                          )}
                        </td>

                        {/* Release Date */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {isCustomRow ? (
                            <input
                              type="text"
                              value={entry.customReleaseDate ?? ''}
                              onChange={(e) => patch(compId, { customReleaseDate: e.target.value })}
                              placeholder="e.g. Mar 2025"
                              style={{ width: '100px', fontSize: '11px', fontFamily: 'monospace', padding: '4px 8px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '6px', outline: 'none', color: '#475569' }}
                            />
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#475569', fontFamily: 'monospace' }}>{latest.releaseDate}</span>
                          )}
                        </td>

                        {/* End of Sale */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {isCustomRow ? (
                            <input
                              type="text"
                              value={entry.customEoSale ?? ''}
                              onChange={(e) => patch(compId, { customEoSale: e.target.value })}
                              placeholder="YYYY-MM-DD"
                              style={{ width: '110px', fontSize: '11px', fontFamily: 'monospace', padding: '4px 8px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '6px', outline: 'none', color: '#475569' }}
                            />
                          ) : (
                            <DateBadge value={dates.eoSale} />
                          )}
                        </td>

                        {/* End of Maintenance */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {isCustomRow ? (
                            <input
                              type="text"
                              value={entry.customEoMaintenance ?? ''}
                              onChange={(e) => patch(compId, { customEoMaintenance: e.target.value })}
                              placeholder="YYYY-MM-DD"
                              style={{ width: '110px', fontSize: '11px', fontFamily: 'monospace', padding: '4px 8px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '6px', outline: 'none', color: '#475569' }}
                            />
                          ) : (
                            <DateBadge value={dates.eoMaintenance} />
                          )}
                        </td>

                        {/* End of Support — editable for custom rows */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {isCustomRow ? (
                            <input
                              type="text"
                              value={entry.customEoSupport ?? ''}
                              onChange={(e) => patch(compId, { customEoSupport: e.target.value })}
                              placeholder="YYYY-MM-DD"
                              style={{ width: '110px', fontSize: '11px', fontFamily: 'monospace', padding: '4px 8px', background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.12)', borderRadius: '6px', outline: 'none', color: '#475569' }}
                            />
                          ) : (
                            <DateBadge value={dates.eoSupport} />
                          )}
                        </td>

                        {/* Status — auto + manual override */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: sc.bg, border: `1.5px solid ${sc.border}`, width: 'fit-content' }}>
                              <span style={{ color: sc.color }}>{sc.icon}</span>
                              <span style={{ fontSize: '10.5px', fontWeight: 700, color: sc.color, whiteSpace: 'nowrap' }}>{sc.label}</span>
                              {entry.statusOverride && (
                                <span title="Manual override" style={{ fontSize: '8px', fontWeight: 800, fontFamily: 'monospace', background: '#FEF3C7', color: '#92400E', padding: '1px 4px', borderRadius: '3px', marginLeft: '2px' }}>
                                  MANUAL
                                </span>
                              )}
                            </div>
                            <select
                              value={entry.statusOverride ?? '__auto__'}
                              onChange={(e) => {
                                const v = e.target.value;
                                patch(compId, { statusOverride: v === '__auto__' ? undefined : (v as VersionStatus) });
                              }}
                              title="Override status"
                              style={{ fontSize: '10px', padding: '3px 4px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '5px', color: '#475569', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="__auto__">Auto</option>
                              <option value="ok">Up to Date</option>
                              <option value="warning">Update Available</option>
                              <option value="critical">Critical</option>
                              <option value="eos">End-of-Support</option>
                              <option value="eol">End-of-Life</option>
                              <option value="unknown">Unknown</option>
                            </select>
                          </div>
                        </td>

                        {/* Notes */}
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

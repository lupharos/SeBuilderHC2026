import {
  Cloud, FileText, Users, CreditCard, Ticket, Lightbulb,
  Server, Upload, Plus, Trash2, Edit2, Check, X, AlertCircle, FileJson, Sparkles,
} from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import type { SessionData, LicenseItem, CaseItem, FeatureRequestItem, HardwareItem, EntitlementItem } from '../Dashboard';
import { mapSalesforceJsonToSession } from '../../services/salesforceJsonImport';
import type { VersionDataStore } from '../../constants/versionData';
import { lookupHardwareLifecycle, lifecycleMilestones, lifecycleStatus, lifecycleStatusColor } from '../../utils/hardwareLifecycle';

interface Step1Props {
  sessionData: SessionData;
  updateSessionData: (updates: Partial<SessionData>) => void;
  versionData: VersionDataStore;
}

/* ─── tiny helpers ─── */
const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const SEVERITY_CFG = {
  S1: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  S2: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  S3: { bg: '#FEFCE8', text: '#CA8A04', border: '#FEF08A' },
  S4: { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
};
const STATUS_CFG: Record<string, { bg: string; text: string }> = {
  ACTIVE:   { bg: '#F0FDF4', text: '#16A34A' },
  EXPIRED:  { bg: '#FEF2F2', text: '#DC2626' },
  PENDING:  { bg: '#FFF7ED', text: '#D97706' },
};
const PRIORITY_CFG: Record<string, { bg: string; text: string; border: string }> = {
  HIGH:   { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  MEDIUM: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  LOW:    { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
};

const HC_PRODUCTS = [
  'Forcepoint Web Security',
  'Forcepoint Web Security Cloud',
  'Forcepoint Email Security',
  'Forcepoint Email Security Cloud',
  'Forcepoint DLP',
  'Forcepoint One DLP',
  'Forcepoint NGFW',
  'Forcepoint DSPM',
  'Forcepoint Data Classification',
  'Forcepoint CASB',
  'Forcepoint ONE',
  'Forcepoint Content Gateway',
  'Forcepoint Protector',
  'Forcepoint Appliance (V-Series)',
  'Forcepoint FSM',
];

/* ─────────────────── EDITABLE CELL ─────────────────── */
function EditCell({
  value,
  onChange,
  placeholder = '—',
  mono = false,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        onBlur={commit}
        className={`w-full px-2 py-1 rounded-md outline-none ${className}`}
        style={{
          fontSize: '12.5px',
          fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
          background: '#EFF6FF',
          border: '1.5px solid #93C5FD',
          color: '#0F172A',
          minWidth: '60px',
        }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      className={`cursor-pointer hover:text-blue-600 px-1 rounded transition-colors ${className}`}
      style={{
        fontSize: '12.5px',
        color: value ? '#0F172A' : '#CBD5E1',
        fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
      }}
    >
      {value || placeholder}
    </span>
  );
}

/* ─────────────────── SELECT CELL ─────────────────── */
function SelectCell<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: T[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="outline-none rounded-md px-1.5 py-0.5 cursor-pointer"
      style={{
        fontSize: '11px', fontWeight: 700,
        background: STATUS_CFG[value]?.bg || '#F8FAFC',
        color: STATUS_CFG[value]?.text || '#475569',
        border: '1px solid transparent',
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ─────────────────── LICENSE PRODUCT COMBOBOX ─────────────────── */
function LicenseProductCell({ rowId, value, onChange }: { rowId: string; value: string; onChange: (v: string) => void }) {
  const listId = `hc-products-${rowId}`;
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select or type product…"
        className="px-2 py-1 rounded-md outline-none"
        style={{
          fontSize: '12.5px', minWidth: '220px', width: '100%',
          border: '1.5px solid rgba(15,41,82,0.14)',
          background: '#F8FAFC', color: value ? '#0F172A' : '#94A3B8',
        }}
        onFocus={(e) => { e.target.style.borderColor = '#D97706'; e.target.style.background = '#FFFBEB'; }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
      />
      <datalist id={listId}>
        {HC_PRODUCTS.map((p) => <option key={p} value={p} />)}
      </datalist>
    </>
  );
}

/* ─────────────────── MONTH PICKER CELL ─────────────────── */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MonthCell({ value, onChange, accent = '#D97706' }: { value: string; onChange: (v: string) => void; accent?: string }) {
  // Native <input type="month"> displays months in the OS locale (e.g. "Ocak 2025"
  // on a Turkish Windows install) and ignores the `lang` attribute on most browsers,
  // so we render two plain selects with hard-coded English month names instead.
  const hasValue = /^\d{4}-\d{2}/.test(value);
  const yearPart  = hasValue ? value.slice(0, 4) : '';
  const monthPart = hasValue ? value.slice(5, 7) : '';

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 10; y >= currentYear - 15; y--) years.push(y);

  const commit = (y: string, m: string) => {
    if (!y || !m) { onChange(''); return; }
    onChange(`${y}-${m}`);
  };

  const selectStyle: React.CSSProperties = {
    fontSize: '11px',
    border: '1.5px solid rgba(15,41,82,0.14)',
    background: '#F8FAFC', color: '#0F172A',
    borderRadius: '6px', padding: '3px 5px',
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div className="flex items-center gap-1">
      <select value={monthPart} onChange={(e) => commit(yearPart, e.target.value)}
        style={{ ...selectStyle, minWidth: '52px' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(15,41,82,0.14)'; }}
      >
        <option value="">—</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
      <select value={yearPart} onChange={(e) => commit(e.target.value, monthPart)}
        style={{ ...selectStyle, minWidth: '60px', fontFamily: "'JetBrains Mono', monospace" }}
        onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(15,41,82,0.14)'; }}
      >
        <option value="">—</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

/* ─────────────────── SECTION HEADER ─────────────────── */
function SectionHeader({
  icon, title, count, accent, onAdd, addLabel,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  accent: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div
          className="w-[27px] h-[27px] rounded-[7px] flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{title}</span>
        {count > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-md"
            style={{ fontSize: '10px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: `${accent}12`, color: accent }}
          >
            {count}
          </span>
        )}
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
        style={{
          fontSize: '11.5px', fontWeight: 600,
          background: `${accent}10`, color: accent,
          border: `1.5px solid ${accent}28`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${accent}20`; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${accent}10`; }}
      >
        <Plus size={12} />
        {addLabel}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export function Step1CustomerInfo({ sessionData, updateSessionData, versionData }: Step1Props) {
  const vSeriesModels = versionData['V Series Appliances'].map((e) => e['Model/Version']);

  /* ── Salesforce JSON import state ── */
  const [importState, setImportState] = useState<'idle' | 'parsing' | 'loaded' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [importedFileName, setImportedFileName] = useState('');
  const [importSummary, setImportSummary] = useState<ReturnType<typeof mapSalesforceJsonToSession>['summary'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { licenses, cases, featureRequests, hardware } = sessionData;
  const entitlements: EntitlementItem[] = sessionData.entitlements ?? [];

  /* ── License helpers ── */
  const addLicense = () => {
    const row: LicenseItem = { id: uid(), product: '', quantity: '', status: 'ACTIVE', expiry: '' };
    updateSessionData({ licenses: [...licenses, row] });
  };
  const updateLicense = (id: string, patch: Partial<LicenseItem>) =>
    updateSessionData({ licenses: licenses.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteLicense = (id: string) =>
    updateSessionData({ licenses: licenses.filter((r) => r.id !== id) });

  /* ── Case helpers ── */
  const addCase = () => {
    const row: CaseItem = { id: uid(), caseNumber: '', severity: 'S4', title: '', date: '', product: '', statusLabel: '', openedBy: '', caseOwner: '', origin: '' };
    updateSessionData({ cases: [...cases, row] });
  };
  const updateCase = (id: string, patch: Partial<CaseItem>) =>
    updateSessionData({ cases: cases.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteCase = (id: string) =>
    updateSessionData({ cases: cases.filter((r) => r.id !== id) });

  /* ── Feature Request helpers ── */
  const addFR = () => {
    const row: FeatureRequestItem = { id: uid(), title: '', product: '', priority: 'MEDIUM', votes: 0, reference: '', productFamily: '', status: '', disposition: '', customerStatus: '', createdDate: '' };
    updateSessionData({ featureRequests: [...featureRequests, row] });
  };
  const updateFR = (id: string, patch: Partial<FeatureRequestItem>) =>
    updateSessionData({ featureRequests: featureRequests.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteFR = (id: string) =>
    updateSessionData({ featureRequests: featureRequests.filter((r) => r.id !== id) });

  /* ── Entitlement helpers (support contracts: Phone Support, etc.) ── */
  const addEnt = () => {
    const row: EntitlementItem = { id: uid(), name: '', type: '', status: 'ACTIVE', startDate: '', endDate: '' };
    updateSessionData({ entitlements: [...entitlements, row] });
  };
  const updateEnt = (id: string, patch: Partial<EntitlementItem>) =>
    updateSessionData({ entitlements: entitlements.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteEnt = (id: string) =>
    updateSessionData({ entitlements: entitlements.filter((r) => r.id !== id) });

  /* ── Hardware helpers ── */
  const addHW = () => {
    const row: HardwareItem = { id: uid(), model: '', serial: '—', purchased: '', units: 1, productCode: '', warranty: '', status: 'Active', warrantyStatus: 'Active', hardwareEol: '' };
    updateSessionData({ hardware: [...hardware, row] });
  };
  const updateHW = (id: string, patch: Partial<HardwareItem>) =>
    updateSessionData({ hardware: hardware.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteHW = (id: string) =>
    updateSessionData({ hardware: hardware.filter((r) => r.id !== id) });

  /* ── Salesforce JSON import handlers ── */
  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!/\.json$/i.test(file.name)) {
      setImportError('Please select a .json file exported from Salesforce.');
      setImportState('error');
      return;
    }
    setImportState('parsing');
    setImportError('');
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const { partial, summary } = mapSalesforceJsonToSession(raw);
      updateSessionData(partial);
      setImportedFileName(file.name);
      setImportSummary(summary);
      setImportState('loaded');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to parse JSON');
      setImportState('error');
    }
  };

  const handleClearImport = () => {
    setImportState('idle');
    setImportError('');
    setImportedFileName('');
    setImportSummary(null);
  };

  /* ── shared table styles ── */
  const th = {
    fontSize: '9.5px', fontWeight: 700, color: '#94A3B8',
    letterSpacing: '0.08em', padding: '0 10px 8px 10px',
    textAlign: 'left' as const,
  };
  const td = {
    padding: '6px 10px',
    borderTop: '1px solid #F1F5F9',
    verticalAlign: 'middle' as const,
  };

  return (
    <div className="space-y-[13px]">

      {/* ── Import JSON from Salesforce ── */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-[27px] h-[27px] bg-[rgba(1,118,211,0.12)] rounded-[7px] flex items-center justify-center">
              <Cloud size={14} style={{ color: '#0176D3' }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Import JSON from Salesforce</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[rgba(1,118,211,0.1)] text-[#0176D3] rounded"
            style={{ fontSize: '10px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            <FileJson size={11} /> SF EXPORT
          </span>
        </div>

        <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '12px' }}>
          Drop or select the Salesforce account JSON export (e.g.{' '}
          <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>akbank_hc.json</span>).
          Customer info, licenses, hardware, recent cases, and feature requests will be auto-filled below — every field stays editable afterwards.
        </div>

        {/* Drop zone */}
        {importState !== 'loaded' && (
          <label
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); handleImportFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
            style={{ border: '2px dashed rgba(1,118,211,0.35)', borderRadius: '10px', padding: '24px', background: 'rgba(1,118,211,0.04)' }}
          >
            {importState === 'parsing'
              ? <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              : <Upload size={22} style={{ color: '#0176D3' }} />}
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0C4A6E' }}>
              {importState === 'parsing' ? 'Parsing JSON…' : 'Drop the Salesforce JSON here, or click to browse'}
            </div>
            <div style={{ fontSize: '10.5px', color: '#0369A1', textAlign: 'center', maxWidth: '440px' }}>
              Accepted: <span style={{ fontFamily: 'monospace' }}>.json</span> exports containing
              <span style={{ fontFamily: 'monospace' }}> customer</span>, <span style={{ fontFamily: 'monospace' }}>licenses</span>, <span style={{ fontFamily: 'monospace' }}>hardware</span>, <span style={{ fontFamily: 'monospace' }}>active_cases_last5</span>, <span style={{ fontFamily: 'monospace' }}>feature_requests</span> blocks.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => { handleImportFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            />
          </label>
        )}

        {/* Error state */}
        {importState === 'error' && importError && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mt-3"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertCircle size={13} style={{ color: '#DC2626', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#991B1B', flex: 1 }}>{importError}</span>
            <button onClick={handleClearImport} className="text-red-300 hover:text-red-500 transition-colors">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Success banner with summary */}
        {importState === 'loaded' && importSummary && (
          <div className="rounded-xl overflow-hidden"
            style={{ border: '1.5px solid #BBF7D0', background: '#F0FDF4' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #BBF7D0' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#166534' }}>
                    {importSummary.customerName || sessionData.customerName || 'Customer imported'}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#15803D', fontFamily: 'monospace' }}>
                    <Sparkles size={10} style={{ display: 'inline', marginRight: '3px' }} />
                    Loaded from {importedFileName}
                  </div>
                </div>
              </div>
              <button
                onClick={handleClearImport}
                style={{ fontSize: '11px', color: '#64748B' }}
                className="hover:text-red-500 transition-colors ml-3 flex-shrink-0"
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2 px-4 py-3 text-center">
              {[
                { label: 'WBSN / SF ID', value: importSummary.forcepointId || '—', mono: true },
                { label: 'Licenses', value: String(importSummary.licenseCount) },
                { label: 'Entitlements', value: String(importSummary.entitlementCount) },
                { label: 'Hardware', value: String(importSummary.hardwareCount) },
                { label: 'Recent Cases', value: String(importSummary.caseCount) },
                { label: 'Feature Reqs', value: String(importSummary.featureRequestCount) },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', borderRadius: '6px', padding: '6px 4px', border: '1px solid #DCFCE7' }}>
                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#15803D', letterSpacing: '0.04em' }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: k.mono ? '10.5px' : '15px', fontWeight: 700, color: '#0F172A', fontFamily: k.mono ? 'monospace' : undefined, marginTop: '2px', wordBreak: 'break-all' }}>
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
            {(importSummary.supportLevel || importSummary.recommendedSupportLevel) && (
              <div className="px-4 py-2 flex items-center gap-3 flex-wrap" style={{ background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#1E40AF', letterSpacing: '0.04em' }}>SUPPORT LEVEL</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952' }}>{importSummary.supportLevel || '—'}</span>
                {importSummary.recommendedSupportLevel && importSummary.recommendedSupportLevel !== importSummary.supportLevel && (
                  <>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>→ Recommended:</span>
                    <span className="px-2 py-0.5 rounded font-semibold" style={{ fontSize: '11px', background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }}>
                      {importSummary.recommendedSupportLevel}
                    </span>
                  </>
                )}
              </div>
            )}
            {importSummary.expiredLicenseCount > 0 && (
              <div className="px-4 py-2 flex items-center gap-2"
                style={{ background: '#FFF7ED', borderTop: '1px solid #FED7AA' }}>
                <AlertCircle size={12} style={{ color: '#D97706' }} />
                <span style={{ fontSize: '11px', color: '#9A3412', fontWeight: 500 }}>
                  {importSummary.expiredLicenseCount} expired license{importSummary.expiredLicenseCount !== 1 ? 's' : ''} detected — review the Licenses section below.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-2.5 my-3.5">
        <div className="flex-1 h-px bg-[rgba(15,41,82,0.1)]" />
        <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748B' }}>or enter manually</span>
        <div className="flex-1 h-px bg-[rgba(15,41,82,0.1)]" />
      </div>

      {/* ── Manual Entry ── */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-[27px] h-[27px] bg-[#EEF2F8] rounded-[7px] flex items-center justify-center">
              <FileText size={14} style={{ color: '#475569' }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Manual Entry</span>
          </div>
          <span style={{ fontSize: '11px', color: '#64748B' }}>All fields editable</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Customer Name *', key: 'customerName', placeholder: 'e.g. Contoso Corporation' },
            { label: 'Forcepoint ID (WBSN)', key: 'forcepointId', placeholder: 'D813C8E2FC9A49…' },
            { label: 'Country / Region', key: 'country', placeholder: 'Turkey (META)' },
            { label: 'City', key: 'city', placeholder: 'Kocaeli' },
            { label: 'Theatre', key: 'theatre', placeholder: 'EMEA' },
            { label: 'Region', key: 'region', placeholder: 'META' },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.03em' }}>{label}</label>
              <input type="text"
                value={String((sessionData as Record<string, unknown>)[key] ?? '')}
                onChange={(e) => updateSessionData({ [key]: e.target.value })}
                placeholder={placeholder}
                className="px-3 py-2 border-[1.5px] border-[rgba(15,41,82,0.14)] rounded-lg text-[#0F172A] bg-[#F4F6FA] outline-none focus:border-[#2563EB]"
                style={{ fontSize: '13px' }}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.03em' }}>Industry</label>
            <input type="text" list="industry-suggestion"
              value={sessionData.industry}
              onChange={(e) => updateSessionData({ industry: e.target.value })}
              placeholder="Banking, Telecom…"
              className="px-3 py-2 border-[1.5px] border-[rgba(15,41,82,0.14)] rounded-lg text-[#0F172A] bg-[#F4F6FA] outline-none focus:border-[#2563EB]"
              style={{ fontSize: '13px' }}
            />
            <datalist id="industry-suggestion">
              {['Banking','Financial Services — Insurance','Securities & Investments','Telecom',
                'Government — Federal','Government — Defense','Energy & Utilities','Healthcare','Retail','Manufacturing']
                .map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.03em' }}>Support Level</label>
            <input type="text" list="support-level-suggestion"
              value={sessionData.supportLevel ?? ''}
              onChange={(e) => updateSessionData({ supportLevel: e.target.value })}
              placeholder="Essential / Enhanced / Enterprise"
              className="px-3 py-2 border-[1.5px] border-[rgba(15,41,82,0.14)] rounded-lg text-[#0F172A] bg-[#F4F6FA] outline-none focus:border-[#2563EB]"
              style={{ fontSize: '13px' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.03em' }}>Recommended Support Level</label>
            <input type="text" list="support-level-suggestion"
              value={sessionData.recommendedSupportLevel ?? ''}
              onChange={(e) => updateSessionData({ recommendedSupportLevel: e.target.value })}
              placeholder="Enterprise"
              className="px-3 py-2 border-[1.5px] border-[rgba(15,41,82,0.14)] rounded-lg text-[#0F172A] bg-[#F4F6FA] outline-none focus:border-[#2563EB]"
              style={{ fontSize: '13px' }}
            />
            <datalist id="support-level-suggestion">
              {['Essential','Enhanced','Enterprise','Premium'].map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* ── Account Team ── */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-[27px] h-[27px] bg-[rgba(37,99,235,0.1)] rounded-[7px] flex items-center justify-center">
            <Users size={14} style={{ color: '#2563EB' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Account Team</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Customer Success Manager', key: 'csm' },
            { label: 'Account Owner (Sales Manager)', key: 'accountOwner' },
            { label: 'Primary Sales Engineer', key: 'salesEngineer' },
            { label: 'Channel Account Manager', key: 'channelAccountManager' },
            { label: 'Reseller / Partner', key: 'partner' },
            { label: 'Distributor', key: 'distributor' },
          ].map(({ label, key }) => (
            <div key={key} className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.03em' }}>{label}</label>
              <input type="text"
                value={String((sessionData as Record<string, unknown>)[key] ?? '')}
                onChange={(e) => updateSessionData({ [key]: e.target.value })}
                placeholder="—"
                className="px-3 py-2 border-[1.5px] border-[rgba(15,41,82,0.14)] rounded-lg text-[#0F172A] bg-[#F4F6FA] outline-none focus:border-[#2563EB]"
                style={{ fontSize: '13px' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          LICENSE INFORMATION
      ══════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <SectionHeader
          icon={<CreditCard size={14} />}
          title="License Information"
          count={licenses.length}
          accent="#D97706"
          onAdd={addLicense}
          addLabel="Add Row"
        />

        {licenses.length === 0 ? (
          <EmptyState label="No licenses yet — click Add Row or import the Salesforce JSON above." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['PRODUCT', 'CODE', 'QTY', 'DEPLOYMENT', 'SUPPORT', 'STATUS', 'START', 'EXPIRY', ''].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {licenses.map((row) => (
                  <tr key={row.id} className="group hover:bg-[#FAFBFF] transition-colors">
                    <td style={td}>
                      <LicenseProductCell rowId={row.id} value={row.product} onChange={(v) => updateLicense(row.id, { product: v })} />
                    </td>
                    <td style={td}>
                      <EditCell value={row.productCode ?? ''} onChange={(v) => updateLicense(row.id, { productCode: v })} placeholder="SKU" mono />
                    </td>
                    <td style={td}>
                      <EditCell value={row.quantity} onChange={(v) => updateLicense(row.id, { quantity: v })} placeholder="20,000" mono />
                    </td>
                    <td style={td}>
                      <EditCell value={row.deploymentType ?? ''} onChange={(v) => updateLicense(row.id, { deploymentType: v })} placeholder="Hybrid / On-Premise" />
                    </td>
                    <td style={td}>
                      <EditCell value={row.supportLevel ?? ''} onChange={(v) => updateLicense(row.id, { supportLevel: v })} placeholder="Essential" />
                    </td>
                    <td style={td}>
                      <select
                        value={row.status}
                        onChange={(e) => updateLicense(row.id, { status: e.target.value as LicenseItem['status'] })}
                        className="rounded-lg px-2 py-1 outline-none cursor-pointer"
                        style={{
                          fontSize: '11px', fontWeight: 700,
                          background: STATUS_CFG[row.status]?.bg,
                          color: STATUS_CFG[row.status]?.text,
                          border: '1px solid transparent',
                        }}
                      >
                        {(['ACTIVE', 'EXPIRED', 'PENDING'] as const).map((s) => (
                          <option key={s} value={s}>● {s}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <MonthCell value={row.startDate ?? ''} onChange={(v) => updateLicense(row.id, { startDate: v })} accent="#64748B" />
                    </td>
                    <td style={td}>
                      <MonthCell value={row.expiry} onChange={(v) => updateLicense(row.id, { expiry: v })} accent="#D97706" />
                    </td>
                    <td style={{ ...td, width: 32 }}>
                      <button onClick={() => deleteLicense(row.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                        style={{ color: '#94A3B8' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                      ><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          SUPPORT ENTITLEMENTS
      ══════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <SectionHeader
          icon={<CreditCard size={14} />}
          title="Support Entitlements"
          count={entitlements.length}
          accent="#0EA5E9"
          onAdd={addEnt}
          addLabel="Add Entitlement"
        />

        {entitlements.length === 0 ? (
          <EmptyState label="No support entitlements yet — add manually or import the Salesforce JSON above." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['NAME', 'TYPE', 'STATUS', 'START', 'END', ''].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entitlements.map((row) => (
                  <tr key={row.id} className="group hover:bg-[#F0F9FF] transition-colors">
                    <td style={td}>
                      <EditCell value={row.name} onChange={(v) => updateEnt(row.id, { name: v })} placeholder="Enhanced-Akbank" />
                    </td>
                    <td style={td}>
                      <EditCell value={row.type} onChange={(v) => updateEnt(row.id, { type: v })} placeholder="Phone Support" />
                    </td>
                    <td style={td}>
                      <select
                        value={row.status}
                        onChange={(e) => updateEnt(row.id, { status: e.target.value as EntitlementItem['status'] })}
                        className="rounded-lg px-2 py-1 outline-none cursor-pointer"
                        style={{
                          fontSize: '11px', fontWeight: 700,
                          background: STATUS_CFG[row.status]?.bg,
                          color: STATUS_CFG[row.status]?.text,
                          border: '1px solid transparent',
                        }}
                      >
                        {(['ACTIVE', 'EXPIRED', 'PENDING'] as const).map((s) => (
                          <option key={s} value={s}>● {s}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <MonthCell value={row.startDate} onChange={(v) => updateEnt(row.id, { startDate: v })} accent="#64748B" />
                    </td>
                    <td style={td}>
                      <MonthCell value={row.endDate} onChange={(v) => updateEnt(row.id, { endDate: v })} accent="#0EA5E9" />
                    </td>
                    <td style={{ ...td, width: 32 }}>
                      <button onClick={() => deleteEnt(row.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                        style={{ color: '#94A3B8' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                      ><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          ACTIVE CASES + FEATURE REQUESTS
      ══════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-[13px]">

        {/* Active Cases */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <SectionHeader
            icon={<Ticket size={14} />}
            title="Active Cases (Last 5)"
            count={cases.length}
            accent="#DC2626"
            onAdd={addCase}
            addLabel="Add Case"
          />

          {cases.length === 0 ? (
            <EmptyState label="No cases yet — add manually or import the Salesforce JSON above." />
          ) : (
            <div className="space-y-2">
              {cases.map((c) => {
                const sev = SEVERITY_CFG[c.severity];
                return (
                  <div key={c.id} className="group rounded-xl p-3 relative transition-colors"
                    style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#BFDBFE')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#EEF0F5')}
                  >
                    <button onClick={() => deleteCase(c.id)}
                      className="absolute top-2 right-2 w-5 h-5 rounded-md items-center justify-center hidden group-hover:flex transition-all"
                      style={{ color: '#94A3B8' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                    ><X size={11} /></button>

                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
                        🎫 <EditCell value={c.caseNumber} onChange={(v) => updateCase(c.id, { caseNumber: v })} placeholder="Case #00000000" mono />
                      </span>
                      <select value={c.severity} onChange={(e) => updateCase(c.id, { severity: e.target.value as CaseItem['severity'] })}
                        className="rounded-md px-1.5 py-0.5 outline-none cursor-pointer"
                        style={{ fontSize: '10px', fontWeight: 700, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}` }}
                      >
                        {(['S1','S2','S3','S4'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className="mb-1.5 pr-6">
                      <EditCell
                        value={c.title}
                        onChange={(v) => updateCase(c.id, { title: v })}
                        placeholder="Case title / description…"
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                        <EditCell value={c.date} onChange={(v) => updateCase(c.id, { date: v })} placeholder="DD MMM YYYY" mono />
                      </span>
                      <span style={{ fontSize: '10px', color: '#CBD5E1' }}>·</span>
                      <EditCell value={c.product} onChange={(v) => updateCase(c.id, { product: v })} placeholder="Product" />
                      <span style={{ fontSize: '10px', color: '#CBD5E1' }}>·</span>
                      <EditCell value={c.statusLabel} onChange={(v) => updateCase(c.id, { statusLabel: v })} placeholder="Status label" />
                    </div>

                    {/* Contact metadata — opener, owner, origin */}
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 pt-2"
                      style={{ borderTop: '1px dashed #E2E8F0' }}>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>OPENED BY</span>
                        <EditCell value={c.openedBy ?? ''} onChange={(v) => updateCase(c.id, { openedBy: v })} placeholder="Customer contact" />
                      </div>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>OWNER</span>
                        <EditCell value={c.caseOwner ?? ''} onChange={(v) => updateCase(c.id, { caseOwner: v })} placeholder="Forcepoint engineer" />
                      </div>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>ORIGIN</span>
                        <EditCell value={c.origin ?? ''} onChange={(v) => updateCase(c.id, { origin: v })} placeholder="Self Service" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Feature Requests */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <SectionHeader
            icon={<Lightbulb size={14} />}
            title="Feature Requests"
            count={featureRequests.length}
            accent="#7C3AED"
            onAdd={addFR}
            addLabel="Add Request"
          />

          {featureRequests.length === 0 ? (
            <EmptyState label="No feature requests yet — add manually." />
          ) : (
            <div className="space-y-2">
              {featureRequests.map((fr) => {
                const p = PRIORITY_CFG[fr.priority];
                return (
                  <div key={fr.id} className="group rounded-xl p-3 relative transition-colors"
                    style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#DDD6FE')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#EEF0F5')}
                  >
                    <button onClick={() => deleteFR(fr.id)}
                      className="absolute top-2 right-2 w-5 h-5 rounded-md items-center justify-center hidden group-hover:flex transition-all"
                      style={{ color: '#94A3B8' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                    ><X size={11} /></button>

                    <div className="flex items-center gap-2 mb-1 flex-wrap pr-6">
                      {fr.reference && (
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold"
                          style={{ fontSize: '10px', background: 'rgba(124,58,237,0.08)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.22)' }}>
                          <EditCell value={fr.reference ?? ''} onChange={(v) => updateFR(fr.id, { reference: v })} placeholder="AFR0000" mono />
                        </span>
                      )}
                      {!fr.reference && (
                        <span className="px-1.5 py-0.5 rounded"
                          style={{ fontSize: '10px', background: '#F1F5F9', color: '#94A3B8', border: '1px dashed #CBD5E1' }}>
                          <EditCell value={fr.reference ?? ''} onChange={(v) => updateFR(fr.id, { reference: v })} placeholder="AFR0000" mono />
                        </span>
                      )}
                      <select value={fr.priority} onChange={(e) => updateFR(fr.id, { priority: e.target.value as FeatureRequestItem['priority'] })}
                        className="rounded-md px-1.5 py-0.5 outline-none cursor-pointer"
                        style={{ fontSize: '10px', fontWeight: 700, background: p.bg, color: p.text, border: `1px solid ${p.border}` }}
                      >
                        {(['HIGH','MEDIUM','LOW'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <EditCell value={fr.productFamily ?? fr.product} onChange={(v) => updateFR(fr.id, { productFamily: v, product: v })} placeholder="On-prem DLP / Hybrid Web" mono />
                    </div>

                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '12px', color: '#7C3AED' }}>💡</span>
                      <EditCell value={fr.title} onChange={(v) => updateFR(fr.id, { title: v })} placeholder="Feature request description…" className="flex-1" />
                    </div>

                    {/* Salesforce metadata sub-row: status / disposition / created date */}
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 pt-2"
                      style={{ borderTop: '1px dashed #E2E8F0' }}>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>STATUS</span>
                        <EditCell value={fr.status ?? ''} onChange={(v) => updateFR(fr.id, { status: v })} placeholder="New / Reviewed / Planned" />
                      </div>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>DISPOSITION</span>
                        <EditCell value={fr.disposition ?? ''} onChange={(v) => updateFR(fr.id, { disposition: v })} placeholder="Plan to implement" />
                      </div>
                      <div className="flex items-center gap-1" style={{ fontSize: '10.5px' }}>
                        <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>CREATED</span>
                        <EditCell value={fr.createdDate ?? ''} onChange={(v) => updateFR(fr.id, { createdDate: v })} placeholder="YYYY-MM-DD" mono />
                      </div>
                      <div className="flex items-center gap-1 ml-auto" style={{ fontSize: '10.5px' }}>
                        <span style={{ color: '#94A3B8' }}>Votes:</span>
                        <input type="number" value={fr.votes} min={0}
                          onChange={(e) => updateFR(fr.id, { votes: Number(e.target.value) })}
                          className="w-12 text-center px-1 py-0 rounded-md outline-none"
                          style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: 'rgba(124,58,237,0.07)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.2)' }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          HARDWARE
      ══════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <SectionHeader
          icon={<span style={{ fontSize: '11px', fontWeight: 700, color: '#F8FAFC' }}>V</span>}
          title="Hardware (V-Series Appliances)"
          count={hardware.length}
          accent="#0F2952"
          onAdd={addHW}
          addLabel="Add Device"
        />

        {hardware.length === 0 ? (
          <EmptyState label="No hardware records — add manually or import the Salesforce JSON above." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <datalist id="vseries-models-suggestion">
              {vSeriesModels.map((m) => <option key={m} value={m} />)}
            </datalist>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['MODEL', 'PRODUCT CODE', 'SERIAL #', 'WARRANTY', 'UNITS', ''].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hardware.map((row) => {
                  const lifecycle = lookupHardwareLifecycle(versionData, row.model, row.productCode);
                  const lcStatus = lifecycle ? lifecycleStatus(lifecycle) : null;
                  const lcColor = lcStatus ? lifecycleStatusColor(lcStatus) : '#94A3B8';
                return (
                  <React.Fragment key={row.id}>
                  <tr className="group hover:bg-[#F8FAFC] transition-colors">
                    <td style={td}>
                      <input
                        list="vseries-models-suggestion"
                        value={row.model}
                        onChange={(e) => updateHW(row.id, { model: e.target.value })}
                        placeholder="e.g. Forcepoint V20000 G1 Appliance"
                        style={{
                          fontSize: '12px',
                          padding: '4px 8px', borderRadius: '8px',
                          border: '1.5px solid rgba(15,41,82,0.14)',
                          background: '#F4F6FA', color: row.model ? '#0F172A' : '#94A3B8',
                          outline: 'none', minWidth: '230px',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#EFF6FF'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F4F6FA'; }}
                      />
                      {/* Sub-row: status / warranty status / EoL — appears under the model */}
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5" style={{ fontSize: '10px' }}>
                        <div className="flex items-center gap-1">
                          <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>STATUS</span>
                          <EditCell value={row.status ?? ''} onChange={(v) => updateHW(row.id, { status: v })} placeholder="Active" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>WARRANTY</span>
                          <EditCell value={row.warrantyStatus ?? ''} onChange={(v) => updateHW(row.id, { warrantyStatus: v })} placeholder="Active / Expired" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span style={{ fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>HW EOL</span>
                          <EditCell value={row.hardwareEol ?? ''} onChange={(v) => updateHW(row.id, { hardwareEol: v })} placeholder="—" mono />
                        </div>
                      </div>
                    </td>
                    <td style={td}>
                      <EditCell value={row.productCode ?? ''} onChange={(v) => updateHW(row.id, { productCode: v })} placeholder="V20KG1" mono />
                    </td>
                    <td style={td}>
                      <EditCell value={row.serial} onChange={(v) => updateHW(row.id, { serial: v })} placeholder="—" mono />
                    </td>
                    <td style={td}>
                      <EditCell value={row.warranty ?? ''} onChange={(v) => updateHW(row.id, { warranty: v })} placeholder="36 months onsite / Expires …" />
                    </td>
                    <td style={td}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateHW(row.id, { units: Math.max(1, row.units - 1) })}
                          className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', fontSize: '13px', lineHeight: 1 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#E2E8F0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                        >−</button>
                        <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#0F172A', minWidth: '20px', textAlign: 'center' }}>
                          {row.units}
                        </span>
                        <button
                          onClick={() => updateHW(row.id, { units: row.units + 1 })}
                          className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', fontSize: '13px', lineHeight: 1 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#E2E8F0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                        >+</button>
                        <span style={{ fontSize: '10.5px', color: '#94A3B8', marginLeft: 2 }}>
                          unit{row.units !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...td, width: 32 }}>
                      <button
                        onClick={() => deleteHW(row.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                        style={{ color: '#94A3B8' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                      ><Trash2 size={12} /></button>
                    </td>
                  </tr>
                  {/* Lifecycle cross-reference: only renders when the device matches a row in Product Lifecycle (V Series / NGFW) */}
                  {lifecycle && (
                    <tr style={{ background: '#FAFCFF' }}>
                      <td colSpan={6} style={{ padding: '6px 10px 10px', borderTop: '0', borderBottom: '1px solid #F1F5F9' }}>
                        <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: '10px' }}>
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold"
                            style={{ fontSize: '9px', background: `${lcColor}15`, color: lcColor, border: `1px solid ${lcColor}40`, letterSpacing: '0.04em' }}>
                            LIFECYCLE · {lcStatus}
                          </span>
                          <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>
                            matched to <strong style={{ color: '#0F2952' }}>{lifecycle['Model/Version']}</strong>
                          </span>
                          {lifecycleMilestones(lifecycle).filter(m => m.value !== '—').map(m => (
                            <span key={m.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                              style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
                              <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>{m.label.toUpperCase()}</span>
                              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#0F172A', fontWeight: 600 }}>{m.value}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Empty state helper ─── */
function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-6 rounded-xl"
      style={{ background: '#F8FAFC', border: '1.5px dashed #E2E8F0' }}>
      <span style={{ fontSize: '12px', color: '#94A3B8' }}>{label}</span>
    </div>
  );
}

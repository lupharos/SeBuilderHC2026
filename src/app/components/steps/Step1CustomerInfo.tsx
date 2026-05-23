import {
  Cloud, FileText, Users, CreditCard, Ticket, Lightbulb,
  Server, Upload, Plus, Trash2, Edit2, Check, X, AlertCircle, FileJson, Sparkles, Shield, ChevronDown, ChevronRight,
  HelpCircle, Copy, CheckCircle2,
} from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import type { SessionData, LicenseItem, CaseItem, FeatureRequestItem, HardwareItem, EntitlementItem, ComplianceFrameworkItem } from '../Dashboard';
import { mapSalesforceJsonToSession } from '../../services/salesforceJsonImport';
import type { VersionDataStore } from '../../constants/versionData';
import { lookupHardwareLifecycle, lifecycleMilestones, lifecycleStatus, lifecycleStatusColor } from '../../utils/hardwareLifecycle';
import { suggestComplianceFrameworks, blankFramework } from '../../utils/complianceSuggest';

interface Step1Props {
  sessionData: SessionData;
  updateSessionData: (updates: Partial<SessionData>) => void;
  versionData: VersionDataStore;
  complianceFrameworks: ComplianceFrameworkItem[];
  setComplianceFrameworks: React.Dispatch<React.SetStateAction<ComplianceFrameworkItem[]>>;
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
export function Step1CustomerInfo({ sessionData, updateSessionData, versionData, complianceFrameworks, setComplianceFrameworks }: Step1Props) {
  const vSeriesModels = versionData['V Series Appliances'].map((e) => e['Model/Version']);

  /* ── Salesforce JSON import state ── */
  const [importState, setImportState] = useState<'idle' | 'parsing' | 'loaded' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [importedFileName, setImportedFileName] = useState('');
  const [importSummary, setImportSummary] = useState<ReturnType<typeof mapSalesforceJsonToSession>['summary'] | null>(null);
  /* "How do I generate this JSON?" prompt-help panel. Toggled by the
     small (?) icon next to the SF EXPORT pill. When open, shows the
     SE the prompt template they can paste into Claude — assumes the
     Salesforce Connector is enabled and the WBSN customer ID is at
     hand. Collapses by default so the import panel stays compact. */
  const [showSfPromptHelp, setShowSfPromptHelp] = useState(false);
  const [sfPromptCopied, setSfPromptCopied] = useState(false);
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowSfPromptHelp((v) => !v); setSfPromptCopied(false); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded transition-colors"
              style={{
                fontSize: '10.5px', fontWeight: 600,
                background: showSfPromptHelp ? 'rgba(1,118,211,0.18)' : '#F1F5F9',
                color: showSfPromptHelp ? '#0C4A6E' : '#475569',
                border: `1px solid ${showSfPromptHelp ? 'rgba(1,118,211,0.35)' : '#E2E8F0'}`,
                cursor: 'pointer',
              }}
              title="Show the prompt template you can paste into Claude (with the Salesforce Connector enabled) to generate this JSON.">
              <HelpCircle size={11} /> How to generate
            </button>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[rgba(1,118,211,0.1)] text-[#0176D3] rounded"
              style={{ fontSize: '10px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              <FileJson size={11} /> SF EXPORT
            </span>
          </div>
        </div>

        <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '12px' }}>
          Drop or select the Salesforce account JSON export (e.g.{' '}
          <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>customerx_hc.json</span>).
          Customer info, licenses, hardware, recent cases, and feature requests will be auto-filled below — every field stays editable afterwards.
        </div>

        {/* Prompt help panel — collapsed by default; opened via the
            (?) "How to generate" button. Shows the SE the canonical
            Claude prompt for producing this JSON via the Salesforce
            Connector, gated on having the WBSN customer ID handy.
            Copy-to-clipboard button so they don't have to hand-select. */}
        {showSfPromptHelp && (() => {
          const promptTemplate = `Using the Salesforce Connector, look up the customer account by WBSN ID = <PASTE_WBSN_ID_HERE> and produce a single JSON file matching the structure below. Save it as customerx_hc.json. Use the customer's real Salesforce data — do not invent values; leave fields blank when the source record is empty.

{
  "customer": {
    "customerName":   "<Account.Name>",
    "forcepointId":   "<WBSN customer ID>",
    "industry":       "<Account.Industry>",
    "country":        "<Account.BillingCountry>",
    "city":           "<Account.BillingCity>",
    "theatre":        "<EMEA | NA | LATAM | APAC>",
    "region":         "<sub-region>",
    "supportLevel":   "<Essential | Enhanced | Enterprise>",
    "recommendedSupportLevel": "<Forcepoint recommendation, optional>",
    "csm":              "<CSM full name>",
    "accountOwner":     "<Account Owner full name>",
    "salesEngineer":    "<Assigned SE full name>",
    "partner":          "<Channel partner, optional>",
    "channelAccountManager": "<CAM full name, optional>",
    "distributor":      "<Distributor, optional>"
  },
  "licenses": [
    { "product": "...", "productCode": "...", "quantity": "...",
      "status": "ACTIVE | EXPIRED | PENDING",
      "expiry": "YYYY-MM-DD", "startDate": "YYYY-MM-DD",
      "deploymentType": "On-Premise | Hybrid | Cloud | N/A",
      "supportLevel":   "Essential | Enhanced | Enterprise" }
  ],
  "entitlements": [
    { "name": "...", "type": "...", "status": "ACTIVE | EXPIRED",
      "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
  ],
  "hardware": [
    { "model": "...", "productCode": "...", "units": 0,
      "warranty": "...", "warrantyStatus": "ACTIVE | EXPIRED",
      "status": "ACTIVE | RMA | DECOMMISSIONED" }
  ],
  "active_cases_last5": [
    { "caseNumber": "...", "severity": "1 | 2 | 3 | 4",
      "subject": "...", "openedBy": "...",
      "createdDate": "YYYY-MM-DD", "status": "NEW | IN_PROCESS | CLOSED" }
  ],
  "feature_requests": [
    { "title": "...", "product": "...", "status": "...",
      "disposition": "...", "createdDate": "YYYY-MM-DD" }
  ]
}

Return only the JSON file content — no commentary, no markdown fences.`;
          return (
            <div className="rounded-lg overflow-hidden mb-3"
              style={{ border: '1px solid rgba(1,118,211,0.35)' }}>
              <div className="flex items-center justify-between px-3 py-2"
                style={{ background: '#0176D3', color: '#fff' }}>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} />
                  <span style={{ fontSize: '11.5px', fontWeight: 700 }}>Claude prompt — Salesforce Connector required</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(promptTemplate);
                        setSfPromptCopied(true);
                        setTimeout(() => setSfPromptCopied(false), 1800);
                      } catch { /* clipboard blocked — ignore */ }
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded font-semibold"
                    style={{
                      fontSize: '10.5px',
                      background: 'rgba(255,255,255,0.18)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.28)',
                      cursor: 'pointer',
                    }}
                    title="Copy the prompt to the clipboard.">
                    {sfPromptCopied ? <><CheckCircle2 size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSfPromptHelp(false)}
                    className="flex items-center justify-center rounded"
                    style={{
                      width: 22, height: 22,
                      background: 'rgba(255,255,255,0.15)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.25)',
                      cursor: 'pointer',
                    }}
                    title="Hide.">
                    <X size={11} />
                  </button>
                </div>
              </div>
              <div className="px-3 py-2.5" style={{ background: '#F0F9FF', borderBottom: '1px solid rgba(1,118,211,0.18)' }}>
                <div style={{ fontSize: '10.5px', color: '#0C4A6E', lineHeight: 1.55 }}>
                  <strong>Prereqs:</strong> Salesforce Connector is enabled on your Claude account, and you have the customer's <strong>WBSN ID</strong>.
                  Paste the prompt below into Claude, replace <span style={{ fontFamily: 'monospace', background: '#fff', padding: '0 4px', borderRadius: 3 }}>&lt;PASTE_WBSN_ID_HERE&gt;</span> with the real ID,
                  send. Claude returns the JSON file content; save it as <span style={{ fontFamily: 'monospace', background: '#fff', padding: '0 4px', borderRadius: 3 }}>customerx_hc.json</span> and drop it into the dropzone below.
                </div>
              </div>
              <pre className="font-mono"
                style={{
                  margin: 0,
                  padding: '12px 14px',
                  fontSize: '10.5px',
                  lineHeight: 1.55,
                  color: '#0F172A',
                  background: '#F8FAFC',
                  maxHeight: 360,
                  overflow: 'auto',
                  whiteSpace: 'pre',
                }}>
                {promptTemplate}
              </pre>
            </div>
          );
        })()}

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

      {/* ── COMPLIANCE FRAMEWORKS ───────────────────────────────────────────
           Drives the Part 0 · Compliance Exposure section of the report.
           Auto-suggests from country/industry, then the user curates. */}
      <ComplianceFrameworksPanel
        country={sessionData.country}
        region={sessionData.region}
        industry={sessionData.industry}
        frameworks={complianceFrameworks}
        setFrameworks={setComplianceFrameworks}
      />
    </div>
  );
}

/* ─── Compliance Frameworks editor ──────────────────────────────────────── */
function ComplianceFrameworksPanel({
  country, region, industry,
  frameworks, setFrameworks,
}: {
  country?: string; region?: string; industry?: string;
  frameworks: ComplianceFrameworkItem[];
  setFrameworks: React.Dispatch<React.SetStateAction<ComplianceFrameworkItem[]>>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const enabledCount = frameworks.filter((f) => f.enabled).length;
  const upd = (id: string, patch: Partial<ComplianceFrameworkItem>) =>
    setFrameworks((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const del = (id: string) => setFrameworks((prev) => prev.filter((f) => f.id !== id));
  const addBlank = () => {
    const fresh = blankFramework();
    setFrameworks((prev) => [...prev, fresh]);
    setEditingId(fresh.id);
  };
  const autoSuggest = () => {
    const suggested = suggestComplianceFrameworks({ country, region, industry });
    /* Merge: keep user-edited entries, append any suggestions not already present by code */
    setFrameworks((prev) => {
      const haveCodes = new Set(prev.map((f) => f.code.toUpperCase()));
      const fresh = suggested.filter((s) => !haveCodes.has(s.code.toUpperCase()));
      return [...prev, ...fresh];
    });
  };
  const reset = () => { setFrameworks([]); setEditingId(null); };

  return (
    <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-[18px_22px] text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(2,62,138,0.12)' }}>
          <Shield size={15} style={{ color: '#023E8A' }} />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Compliance Frameworks</div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {frameworks.length === 0
              ? 'No frameworks selected. Click Auto-suggest to populate from customer jurisdiction, or add manually. Drives Part 0 · Compliance Exposure in the report.'
              : `${enabledCount} of ${frameworks.length} enabled — appear in the report's Part 0 Compliance Exposure section.`}
          </div>
        </div>
        {expanded ? <ChevronDown size={16} style={{ color: '#94A3B8' }} /> : <ChevronRight size={16} style={{ color: '#94A3B8' }} />}
      </button>

      {expanded && (
        <div className="p-[0_22px_18px]">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={autoSuggest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white"
              style={{ fontSize: '11px', background: 'linear-gradient(135deg,#023E8A,#012566)' }}
              title="Suggest frameworks based on the customer's country, region, and industry"
            >
              <Sparkles size={11} /> Auto-suggest from jurisdiction
            </button>
            <button
              onClick={addBlank}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: 'rgba(2,62,138,0.08)', color: '#023E8A', border: '1px solid rgba(2,62,138,0.2)' }}
            >
              <Plus size={11} /> Add custom
            </button>
            {frameworks.length > 0 && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold ml-auto"
                style={{ fontSize: '11px', background: 'rgba(220,38,38,0.05)', color: '#DA1B2E', border: '1px solid rgba(220,38,38,0.2)' }}
              >
                <Trash2 size={11} /> Clear all
              </button>
            )}
          </div>

          {frameworks.length === 0 ? (
            <EmptyState label="No compliance frameworks recorded yet." />
          ) : (
            <div className="space-y-2">
              {frameworks.map((f) => {
                const isEditing = editingId === f.id;
                return (
                  <div key={f.id}
                    className="rounded-lg p-3 transition-colors"
                    style={{
                      background: f.enabled ? '#F8FAFC' : 'rgba(241,245,249,0.5)',
                      border: `1px solid ${f.enabled ? '#E2E8F0' : 'rgba(226,232,240,0.7)'}`,
                      borderLeft: `3px solid ${f.enabled ? '#023E8A' : '#CBD5E1'}`,
                      opacity: f.enabled ? 1 : 0.6,
                    }}
                  >
                    {/* Header row: toggle + code + pillar + edit/del */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        onClick={() => upd(f.id, { enabled: !f.enabled })}
                        title={f.enabled ? 'Disable (hide from report)' : 'Enable (include in report)'}
                        className="flex items-center justify-center rounded transition-all"
                        style={{
                          width: 22, height: 22, flexShrink: 0,
                          background: f.enabled ? '#023E8A' : '#fff',
                          border: f.enabled ? '1px solid #023E8A' : '1.5px solid #CBD5E1',
                          color: '#fff',
                        }}
                      >
                        {f.enabled && <Check size={13} strokeWidth={3} />}
                      </button>
                      <span style={{
                        fontFamily: 'monospace', fontSize: '12px', fontWeight: 800, color: '#023E8A',
                        background: '#E8EDF7', padding: '3px 8px', borderRadius: 3, letterSpacing: '0.04em',
                      }}>
                        {isEditing
                          ? <EditCell value={f.code} onChange={(v) => upd(f.id, { code: v })} placeholder="KVKK" mono />
                          : f.code || '—'}
                      </span>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#228BA0', letterSpacing: '0.1em', textTransform: 'uppercase', marginLeft: 4 }}>
                        {isEditing
                          ? <EditCell value={f.pillar} onChange={(v) => upd(f.id, { pillar: v })} placeholder="Data Protection" />
                          : f.pillar}
                      </span>
                      {f.isCustom && (
                        <span style={{ fontSize: '8.5px', fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em', marginLeft: 4 }}>
                          CUSTOM
                        </span>
                      )}
                      {/* Compliance status tri-state — cycles Unassessed → Compliant → Partial → Non-Compliant */}
                      <ComplianceStatusToggle
                        status={f.complianceStatus ?? 'unassessed'}
                        onChange={(s) => upd(f.id, { complianceStatus: s })}
                      />
                      <button
                        onClick={() => setEditingId(isEditing ? null : f.id)}
                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded transition-all"
                        style={{ fontSize: '10px', fontWeight: 600, background: isEditing ? '#023E8A' : 'transparent', color: isEditing ? '#fff' : '#475569', border: `1px solid ${isEditing ? '#023E8A' : '#E2E8F0'}` }}
                      >
                        {isEditing ? <><Check size={10} /> Done</> : <><Edit2 size={10} /> Edit</>}
                      </button>
                      <button
                        onClick={() => del(f.id)}
                        className="w-6 h-6 rounded flex items-center justify-center transition-all"
                        style={{ color: '#CBD5E1' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#DA1B2E'; e.currentTarget.style.background = 'rgba(218,27,46,0.06)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                        title="Remove framework"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {/* Name */}
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
                      {isEditing
                        ? <EditCell value={f.name} onChange={(v) => upd(f.id, { name: v })} placeholder="Full descriptive name" />
                        : f.name || <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>(no name)</span>}
                    </div>

                    {/* Relevance */}
                    {isEditing ? (
                      <textarea
                        value={f.relevance}
                        onChange={(e) => upd(f.id, { relevance: e.target.value })}
                        placeholder="Why this framework applies to the customer — appears in the report below the framework name."
                        rows={2}
                        style={{
                          width: '100%', fontSize: '11px', padding: '6px 9px', borderRadius: 6,
                          border: '1.5px solid #023E8A', background: '#fff', color: '#0F172A',
                          outline: 'none', resize: 'vertical', minHeight: 48, lineHeight: 1.55, fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
                        {f.relevance || <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>(no relevance set — click Edit)</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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

/* ─── Tri-state compliance status toggle for the ComplianceFrameworksPanel ─── */
type ComplianceStatus = 'unassessed' | 'compliant' | 'partial' | 'non_compliant';
function ComplianceStatusToggle({ status, onChange }: { status: ComplianceStatus; onChange: (s: ComplianceStatus) => void }) {
  const cfg: Record<ComplianceStatus, { label: string; bg: string; color: string; border: string; icon: React.ReactNode; title: string }> = {
    unassessed:    { label: 'Not Assessed',  bg: '#F1F5F9',                  color: '#94A3B8', border: '#E2E8F0', icon: <span style={{ fontWeight: 700 }}>?</span>, title: 'Compliance not yet assessed — click to cycle: Compliant → Partial → Non-Compliant' },
    compliant:     { label: 'Compliant',     bg: 'rgba(105,188,0,0.12)',     color: '#3D6E00', border: 'rgba(105,188,0,0.32)', icon: <Check size={10} strokeWidth={3} />, title: 'Customer is COMPLIANT with this framework via Forcepoint DLP — click to cycle' },
    partial:       { label: 'Partial',       bg: 'rgba(253,206,18,0.18)',    color: '#92400E', border: 'rgba(253,206,18,0.45)', icon: <span style={{ fontWeight: 700 }}>◐</span>, title: 'PARTIAL coverage — some controls in place, others gaps. Click to cycle.' },
    non_compliant: { label: 'Non-Compliant', bg: 'rgba(218,27,46,0.1)',      color: '#DA1B2E', border: 'rgba(218,27,46,0.3)', icon: <X size={10} strokeWidth={3} />, title: 'NOT COMPLIANT — explicit gap. Click to cycle back to Not Assessed.' },
  };
  const order: ComplianceStatus[] = ['unassessed', 'compliant', 'partial', 'non_compliant'];
  const cycle = () => {
    const idx = order.indexOf(status);
    onChange(order[(idx + 1) % order.length]);
  };
  const c = cfg[status];
  return (
    <button
      onClick={cycle}
      title={c.title}
      className="flex items-center gap-1 px-2 py-1 rounded transition-all"
      style={{
        fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.04em',
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        cursor: 'pointer', textTransform: 'uppercase', marginLeft: 4,
      }}
    >
      <span className="flex items-center justify-center" style={{ width: 12, height: 12 }}>{c.icon}</span>
      <span>{c.label}</span>
    </button>
  );
}

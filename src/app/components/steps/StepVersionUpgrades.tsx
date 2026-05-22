import { useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, X, Calendar, ExternalLink, Sparkles, AlertTriangle, ListChecks, Wrench, Download, FileJson, CheckCircle2, BookOpen, Search } from 'lucide-react';

type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface VersionUpgradeProposal {
  id: string;
  product: string;          // "Forcepoint Web Security", "DLP Manager", etc.
  fromVersion: string;      // currently installed (optional)
  toVersion: string;        // target version (required)
  releaseDate: string;      // ISO date or free-form
  releaseNotesUrl?: string; // link to official notes
  whatsNew: string;         // headline new features
  bugFixes: string;         // fixed defects
  knownIssues: string;      // open issues / limitations
  deploymentNotes: string;  // pre-flight considerations
  priority: Priority;
}

const PRIORITY_CFG: Record<Priority, { label: string; text: string; bg: string; border: string }> = {
  critical: { label: 'Critical', text: '#A30080', bg: '#F9F0F6', border: '#E9CCDF' },
  high:     { label: 'High',     text: '#DA1B2E', bg: '#FEF2F2', border: '#FECACA' },
  medium:   { label: 'Medium',   text: '#B58800', bg: '#FFFBEB', border: '#FDE68A' },
  low:      { label: 'Low',      text: '#228BA0', bg: '#E5F4F8', border: '#BFE3EC' },
};

const EMPTY_FORM: Omit<VersionUpgradeProposal, 'id'> = {
  product: '',
  fromVersion: '',
  toVersion: '',
  releaseDate: '',
  releaseNotesUrl: '',
  whatsNew: '',
  bugFixes: '',
  knownIssues: '',
  deploymentNotes: '',
  priority: 'high',
};

interface Props {
  items: VersionUpgradeProposal[];
  setItems: React.Dispatch<React.SetStateAction<VersionUpgradeProposal[]>>;
  /* Read-only reference to the global Version & Release catalog. The
     wizard never edits the catalog — it only clones entries from it
     (with fresh per-session IDs) into `items`. Catalog edits happen on
     the "Version & Release Catalog" left-rail page. */
  catalog?: VersionUpgradeProposal[];
}

/* Bundle format written by exportJSON / read by handleImportJSON. The
   magic `_format` string lets us reject unrelated JSON files (HC system
   backups, template exports, etc.) with a precise error instead of a
   confusing TypeError. `_version` is a forward-compat hook — bump it if
   the schema ever gains required fields, and add a migrator below. */
const UPGRADE_BUNDLE_FORMAT = 'forcepoint-hc-version-upgrades';
const UPGRADE_BUNDLE_VERSION = 1;

const PRIORITIES_LIST: Priority[] = ['critical', 'high', 'medium', 'low'];

export function StepVersionUpgrades({ items, setItems, catalog = [] }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  /* Filtered + grouped view of the catalog for the picker. Items that
     are already in the current session (matched by product + toVersion,
     case-insensitive) are still shown but flagged + dimmed so the
     operator doesn't accidentally add the same version twice. */
  const sessionKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) s.add(`${it.product.toLowerCase()}::${it.toVersion.toLowerCase()}`);
    return s;
  }, [items]);

  const pickerEntries = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const filtered = q
      ? catalog.filter((v) =>
          v.product.toLowerCase().includes(q)
          || v.toVersion.toLowerCase().includes(q)
          || v.fromVersion.toLowerCase().includes(q)
          || v.whatsNew.toLowerCase().includes(q),
        )
      : catalog;
    return [...filtered].sort((a, b) => {
      const byProduct = a.product.localeCompare(b.product);
      if (byProduct !== 0) return byProduct;
      return b.toVersion.localeCompare(a.toVersion, undefined, { numeric: true });
    });
  }, [catalog, pickerQuery]);

  /* Clone a catalog entry into the session list with a fresh ID. The
     catalog stays untouched. */
  const addFromCatalog = (v: VersionUpgradeProposal) => {
    const { id: _id, ...rest } = v;
    void _id;
    const fresh: VersionUpgradeProposal = {
      id: `vu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...rest,
    };
    setItems((prev) => [...prev, fresh]);
  };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* Inline status for the export/import toolbar — keeps a brief
     confirmation visible after a successful import or surfaces the
     first validation error inline. null = idle. */
  const [importStatus, setImportStatus] = useState<{ kind: 'ok'; count: number } | { kind: 'error'; message: string } | null>(null);

  function exportJSON() {
    const payload = {
      _format: UPGRADE_BUNDLE_FORMAT,
      _version: UPGRADE_BUNDLE_VERSION,
      _exportedAt: new Date().toISOString(),
      items,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hc-version-upgrades-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        const obj = raw as Record<string, unknown>;
        /* Accept either the magic-format bundle OR a bare array (matches
           the export's `items` payload directly). The bare-array form is
           a convenience for hand-edited files and pasted-from-spec
           exports. */
        const rawItems: unknown[] = Array.isArray(raw)
          ? raw
          : (Array.isArray(obj?.items) ? (obj.items as unknown[]) : []);
        if (!Array.isArray(raw) && obj?._format !== UPGRADE_BUNDLE_FORMAT) {
          throw new Error(`Wrong file format — expected "_format": "${UPGRADE_BUNDLE_FORMAT}". Did you pick an HC system backup or template export by mistake?`);
        }
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          throw new Error('JSON must contain a non-empty "items" array of upgrade proposals.');
        }
        /* Validate every imported row before mutating state. New IDs are
           minted on import so re-importing the same bundle multiple
           times doesn't collide with the existing list (and doesn't
           clobber unrelated proposals that happen to share an ID). */
        const validated: VersionUpgradeProposal[] = rawItems.map((it, i) => {
          const obj = it as Record<string, unknown>;
          if (typeof obj.product !== 'string' || !obj.product.trim()) {
            throw new Error(`Item[${i}]: missing "product".`);
          }
          if (typeof obj.toVersion !== 'string' || !obj.toVersion.trim()) {
            throw new Error(`Item[${i}]: missing "toVersion".`);
          }
          const priority: Priority = (typeof obj.priority === 'string' && (PRIORITIES_LIST as string[]).includes(obj.priority))
            ? (obj.priority as Priority)
            : 'high';
          return {
            id: `vu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
            product: obj.product,
            fromVersion: typeof obj.fromVersion === 'string' ? obj.fromVersion : '',
            toVersion: obj.toVersion,
            releaseDate: typeof obj.releaseDate === 'string' ? obj.releaseDate : '',
            releaseNotesUrl: typeof obj.releaseNotesUrl === 'string' ? obj.releaseNotesUrl : '',
            whatsNew: typeof obj.whatsNew === 'string' ? obj.whatsNew : '',
            bugFixes: typeof obj.bugFixes === 'string' ? obj.bugFixes : '',
            knownIssues: typeof obj.knownIssues === 'string' ? obj.knownIssues : '',
            deploymentNotes: typeof obj.deploymentNotes === 'string' ? obj.deploymentNotes : '',
            priority,
          };
        });
        setItems((prev) => [...prev, ...validated]);
        setImportStatus({ kind: 'ok', count: validated.length });
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err) {
        setImportStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to parse file.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openEdit = (v: VersionUpgradeProposal) => {
    setEditId(v.id);
    const { id: _id, ...rest } = v;
    void _id;
    setForm({ ...rest });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelForm = () => { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); };
  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editId === id) cancelForm();
  };

  const submit = () => {
    if (!form.product.trim() || !form.toVersion.trim()) return;
    if (editId) {
      setItems((prev) => prev.map((i) => (i.id === editId ? { ...i, ...form } : i)));
    } else {
      const fresh: VersionUpgradeProposal = { id: `vu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...form };
      setItems((prev) => [...prev, fresh]);
    }
    cancelForm();
  };

  const inputStyle: React.CSSProperties = {
    fontSize: '12.5px', border: '1.5px solid rgba(15,41,82,0.14)',
    background: '#F8FAFC', color: '#0F172A', borderRadius: '8px',
    padding: '8px 12px', outline: 'none', width: '100%',
    fontFamily: 'inherit',
  };
  const taStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.6 };
  const labelStyle: React.CSSProperties = { fontSize: '10.5px', fontWeight: 600, color: '#334155' };

  return (
    <div className="space-y-[13px]">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(2,62,138,0.1)' }}>
              <ArrowUp size={15} style={{ color: '#023E8A' }} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>New Version Upgrade Proposals</div>
              <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                {items.length === 0
                  ? 'Propose a target version upgrade with what\'s new, bug fixes, known issues, and pre-deployment guidance.'
                  : `${items.length} upgrade proposal${items.length !== 1 ? 's' : ''} — appear in Part III · Roadmap & Strategy of the report.`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportJSON}
              disabled={items.length === 0}
              title={items.length === 0 ? 'No proposals to export yet — add at least one first' : `Export ${items.length} proposal${items.length === 1 ? '' : 's'} to JSON for reuse on other customers`}
              className="flex items-center gap-1.5 h-[32px] px-3 rounded-lg font-semibold transition-all"
              style={{
                fontSize: '11.5px',
                background: items.length === 0 ? '#F1F5F9' : '#FFFFFF',
                color: items.length === 0 ? '#94A3B8' : '#0F2952',
                border: `1px solid ${items.length === 0 ? '#E2E8F0' : '#CBD5E1'}`,
                cursor: items.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <Download size={12} /> Export JSON
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import a JSON bundle previously exported from another customer — items are appended with fresh IDs"
              className="flex items-center gap-1.5 h-[32px] px-3 rounded-lg font-semibold transition-all"
              style={{ fontSize: '11.5px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            >
              <FileJson size={12} /> Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportJSON}
            />
            <button
              onClick={() => setShowPicker(true)}
              disabled={catalog.length === 0}
              title={catalog.length === 0
                ? 'Version & Release Catalog is empty — add versions on the catalog page (left rail) first'
                : `Pick from the ${catalog.length}-entry Version & Release Catalog`}
              className="flex items-center gap-1.5 h-[32px] px-3 rounded-lg font-semibold transition-all"
              style={{
                fontSize: '11.5px',
                background: catalog.length === 0 ? '#F1F5F9' : 'rgba(124,58,237,0.08)',
                color: catalog.length === 0 ? '#94A3B8' : '#5B21B6',
                border: `1px solid ${catalog.length === 0 ? '#E2E8F0' : 'rgba(124,58,237,0.3)'}`,
                cursor: catalog.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <BookOpen size={12} /> Add from Catalog{catalog.length > 0 ? ` (${catalog.length})` : ''}
            </button>
            <button
              onClick={() => (showForm ? cancelForm() : openAdd())}
              className="flex items-center gap-1.5 h-[32px] px-4 rounded-lg font-semibold text-white transition-all"
              style={{ fontSize: '12px', background: 'linear-gradient(135deg, #023E8A, #012566)', boxShadow: '0 2px 8px rgba(2,62,138,0.3)' }}
            >
              {showForm ? <X size={13} /> : <Plus size={13} />}
              {showForm ? 'Cancel' : 'New Upgrade Proposal'}
            </button>
          </div>
        </div>
        {importStatus && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg"
            style={{
              background: importStatus.kind === 'ok' ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.06)',
              border: `1px solid ${importStatus.kind === 'ok' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
            }}>
            {importStatus.kind === 'ok'
              ? <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
              : <AlertTriangle size={13} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />}
            <span style={{ fontSize: '11.5px', color: importStatus.kind === 'ok' ? '#15803D' : '#7F1D1D', lineHeight: 1.5 }}>
              {importStatus.kind === 'ok'
                ? `Imported ${importStatus.count} upgrade proposal${importStatus.count === 1 ? '' : 's'} — appended to the existing list with fresh IDs.`
                : `Import failed — ${importStatus.message}`}
            </span>
          </div>
        )}
      </div>

      {/* Catalog picker — modal overlay. Lists every catalog entry with
          a one-click "Add" button. Entries already present in the
          session (matched by product + toVersion) are flagged and
          dimmed but still clickable, so the operator can intentionally
          re-add a duplicate if they want a second copy to edit. */}
      {showPicker && (
        <div
          onClick={() => setShowPicker(false)}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(15,41,82,0.5)', backdropFilter: 'blur(2px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl flex flex-col"
            style={{ width: 'min(720px, 92vw)', maxHeight: '82vh' }}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #EEF2F8' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <BookOpen size={16} style={{ color: '#7C3AED' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Pick from Version &amp; Release Catalog</div>
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: 1 }}>
                  Clones the selected entry into this session with a fresh ID. Catalog stays untouched.
                </div>
              </div>
              <button onClick={() => setShowPicker(false)}
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ background: '#F1F5F9', color: '#475569' }}>
                <X size={14} />
              </button>
            </div>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #EEF2F8' }}>
              <Search size={13} style={{ color: '#94A3B8' }} />
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Filter by product, version, or what's new…"
                autoFocus
                style={{ flex: 1, fontSize: '12.5px', border: 'none', outline: 'none', background: 'transparent', color: '#0F172A' }}
              />
              <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{pickerEntries.length} of {catalog.length}</div>
            </div>
            <div className="overflow-y-auto" style={{ flex: 1 }}>
              {pickerEntries.length === 0 ? (
                <div className="p-8 text-center" style={{ fontSize: '12px', color: '#64748B' }}>
                  No catalog entries match "{pickerQuery}".
                </div>
              ) : (
                pickerEntries.map((v) => {
                  const alreadyHas = sessionKeySet.has(`${v.product.toLowerCase()}::${v.toVersion.toLowerCase()}`);
                  const cfg = PRIORITY_CFG[v.priority];
                  return (
                    <div key={v.id}
                      className="px-5 py-3 flex items-start gap-3"
                      style={{ borderBottom: '1px solid #F4F6FA', opacity: alreadyHas ? 0.55 : 1 }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 3 }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#023E8A' }}>{v.product}</span>
                          {v.fromVersion && (
                            <>
                              <span style={{ fontSize: '11px', color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>{v.fromVersion}</span>
                              <span style={{ fontSize: '11px', color: '#CBD5E1' }}>→</span>
                            </>
                          )}
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', fontFamily: "'JetBrains Mono', monospace" }}>{v.toVersion}</span>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '1px 6px', borderRadius: 4,
                            color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}`,
                          }}>{cfg.label}</span>
                          {alreadyHas && (
                            <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em', color: '#16A34A', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 4, padding: '1px 6px' }}>
                              ALREADY IN SESSION
                            </span>
                          )}
                          {v.releaseDate && (
                            <span style={{ fontSize: '10.5px', color: '#64748B' }}>· {v.releaseDate}</span>
                          )}
                        </div>
                        {v.whatsNew && (
                          <div style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {v.whatsNew.split('\n').slice(0, 2).join('\n')}
                            {v.whatsNew.split('\n').length > 2 && '…'}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { addFromCatalog(v); setShowPicker(false); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md font-semibold text-white flex-shrink-0"
                        style={{ fontSize: '11px', background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', cursor: 'pointer' }}>
                        <Plus size={11} /> Add
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #EEF2F8', background: '#F8FAFC' }}>
              <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                Manage the catalog from the <strong>Version &amp; Release Catalog</strong> page in the left rail.
              </div>
              <button onClick={() => setShowPicker(false)}
                className="px-3 py-1.5 rounded-md font-semibold"
                style={{ fontSize: '11.5px', background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-[rgba(2,62,138,0.25)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>
            {editId ? 'Edit Version Upgrade Proposal' : 'New Version Upgrade Proposal'}
          </div>

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-5 flex flex-col gap-1">
              <label style={labelStyle}>Product / Solution *</label>
              <input
                value={form.product}
                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                placeholder="e.g. Forcepoint Web Security, DLP Manager, NGFW"
                style={inputStyle}
              />
            </div>
            <div className="col-span-3 flex flex-col gap-1">
              <label style={labelStyle}>From Version</label>
              <input
                value={form.fromVersion}
                onChange={(e) => setForm((f) => ({ ...f, fromVersion: e.target.value }))}
                placeholder="e.g. 10.3 HF2"
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <div className="col-span-4 flex flex-col gap-1">
              <label style={labelStyle}>To Version *</label>
              <input
                value={form.toVersion}
                onChange={(e) => setForm((f) => ({ ...f, toVersion: e.target.value }))}
                placeholder="e.g. 10.4"
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>

            <div className="col-span-4 flex flex-col gap-1">
              <label style={labelStyle}>Release Date</label>
              <input
                value={form.releaseDate}
                onChange={(e) => setForm((f) => ({ ...f, releaseDate: e.target.value }))}
                placeholder="2026-03-15  or  Q1 2026"
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <div className="col-span-5 flex flex-col gap-1">
              <label style={labelStyle}>Release Notes URL</label>
              <input
                value={form.releaseNotesUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, releaseNotesUrl: e.target.value }))}
                placeholder="https://support.forcepoint.com/..."
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <div className="col-span-3 flex flex-col gap-1">
              <label style={labelStyle}>Priority</label>
              <div className="flex gap-1 mt-1">
                {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => {
                  const cfg = PRIORITY_CFG[p];
                  const isActive = form.priority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setForm((f) => ({ ...f, priority: p }))}
                      className="flex-1 py-2 rounded-lg transition-all"
                      style={{
                        fontSize: '9px', fontWeight: 700, fontFamily: 'monospace',
                        background: isActive ? cfg.bg : '#F8FAFC',
                        color: isActive ? cfg.text : '#94A3B8',
                        border: isActive ? `1.5px solid ${cfg.border}` : '1.5px solid rgba(15,41,82,0.07)',
                      }}
                    >
                      {cfg.label.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-6 flex flex-col gap-1">
              <label style={labelStyle}>
                <Sparkles size={11} style={{ display: 'inline', marginRight: 4, color: '#36B0C9' }} />
                What's New
              </label>
              <textarea
                value={form.whatsNew}
                onChange={(e) => setForm((f) => ({ ...f, whatsNew: e.target.value }))}
                placeholder="Headline new capabilities — bullet list or short paragraphs. Markdown not required."
                rows={4}
                style={taStyle}
              />
            </div>
            <div className="col-span-6 flex flex-col gap-1">
              <label style={labelStyle}>
                <Wrench size={11} style={{ display: 'inline', marginRight: 4, color: '#69BC00' }} />
                Bug Fixes
              </label>
              <textarea
                value={form.bugFixes}
                onChange={(e) => setForm((f) => ({ ...f, bugFixes: e.target.value }))}
                placeholder="Fixed defects relevant to this customer's deployment — focus on the ones they're likely to have hit."
                rows={4}
                style={taStyle}
              />
            </div>

            <div className="col-span-6 flex flex-col gap-1">
              <label style={labelStyle}>
                <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, color: '#DA1B2E' }} />
                Known Issues
              </label>
              <textarea
                value={form.knownIssues}
                onChange={(e) => setForm((f) => ({ ...f, knownIssues: e.target.value }))}
                placeholder="Open defects, limitations, or unsupported scenarios in this release. Honest disclosure builds trust."
                rows={4}
                style={taStyle}
              />
            </div>
            <div className="col-span-6 flex flex-col gap-1">
              <label style={labelStyle}>
                <ListChecks size={11} style={{ display: 'inline', marginRight: 4, color: '#023E8A' }} />
                Pre-Deployment Considerations
              </label>
              <textarea
                value={form.deploymentNotes}
                onChange={(e) => setForm((f) => ({ ...f, deploymentNotes: e.target.value }))}
                placeholder="Backup needs, downtime window, dependencies (SQL, OS, .NET), order of operations, rollback plan."
                rows={4}
                style={taStyle}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-3.5">
            <button
              onClick={submit}
              disabled={!form.product.trim() || !form.toVersion.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white transition-all"
              style={{
                fontSize: '12px',
                background: form.product.trim() && form.toVersion.trim() ? 'linear-gradient(135deg, #023E8A, #012566)' : '#CBD5E1',
                boxShadow: form.product.trim() && form.toVersion.trim() ? '0 2px 8px rgba(2,62,138,0.3)' : 'none',
                cursor: form.product.trim() && form.toVersion.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {editId ? 'Save Changes' : <><Plus size={13} /> Add Proposal</>}
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2 rounded-lg font-semibold"
              style={{ fontSize: '12px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[24px_24px]">
          <div className="text-center py-10">
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>⬆️</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No Upgrade Proposals Yet</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto 20px' }}>
              When you want to recommend a target version to the customer, capture the release context here — what's new, what's fixed, what's still broken, and what to watch out for during deployment.
            </div>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white"
              style={{ fontSize: '12.5px', background: 'linear-gradient(135deg, #023E8A, #012566)', boxShadow: '0 2px 8px rgba(2,62,138,0.3)' }}
            >
              <Plus size={14} /> Add First Upgrade Proposal
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((v) => {
            const pCfg = PRIORITY_CFG[v.priority];
            const isHttp = /^https?:\/\//i.test((v.releaseNotesUrl ?? '').trim());
            return (
              <div
                key={v.id}
                className="bg-white rounded-xl border overflow-hidden"
                style={{ borderColor: 'rgba(15,41,82,0.08)', boxShadow: '0 1px 3px rgba(15,41,82,0.05)', borderLeft: `4px solid ${pCfg.text}` }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 p-[14px_18px] flex-wrap" style={{ background: '#F8FAFC', borderBottom: '1px solid #EEF0F5' }}>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(2,62,138,0.1)', color: '#023E8A' }}>
                    <ArrowUp size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#023E8A' }}>{v.product}</span>
                      {v.fromVersion && (
                        <span className="px-1.5 py-0.5 rounded font-mono"
                          style={{ fontSize: '9.5px', fontWeight: 600, background: '#F1F5F9', color: '#475569' }}>
                          {v.fromVersion}
                        </span>
                      )}
                      <span style={{ color: '#94A3B8', fontSize: '11px' }}>→</span>
                      <span className="px-1.5 py-0.5 rounded font-mono"
                        style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(2,62,138,0.1)', color: '#023E8A', border: '1px solid rgba(2,62,138,0.22)' }}>
                        v{v.toVersion}
                      </span>
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ fontSize: '9px', fontWeight: 700, background: pCfg.bg, color: pCfg.text, border: `1px solid ${pCfg.border}`, letterSpacing: '0.05em' }}>
                        {pCfg.label.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5" style={{ fontSize: '10.5px', color: '#64748B' }}>
                      {v.releaseDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} /> <span className="font-mono">{v.releaseDate}</span>
                        </span>
                      )}
                      {isHttp && (
                        <a href={v.releaseNotesUrl} target="_blank" rel="noopener"
                          className="flex items-center gap-1"
                          style={{ color: '#228BA0', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          <ExternalLink size={10} /> Release notes
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(v)}
                      className="w-7 h-7 rounded flex items-center justify-center transition-all"
                      style={{ color: '#94A3B8', background: '#F1F5F9' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#023E8A'; e.currentTarget.style.background = 'rgba(2,62,138,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F1F5F9'; }}
                      title="Edit proposal"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => deleteItem(v.id)}
                      className="w-7 h-7 rounded flex items-center justify-center transition-all"
                      style={{ color: '#CBD5E1' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#DA1B2E'; e.currentTarget.style.background = 'rgba(218,27,46,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                      title="Delete proposal"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Body — 4 quadrants */}
                <div className="grid grid-cols-2 gap-3 p-[14px_18px]">
                  <DetailBlock icon={<Sparkles size={11} />} accent="#36B0C9" label="What's New" text={v.whatsNew} />
                  <DetailBlock icon={<Wrench size={11} />} accent="#69BC00" label="Bug Fixes" text={v.bugFixes} />
                  <DetailBlock icon={<AlertTriangle size={11} />} accent="#DA1B2E" label="Known Issues" text={v.knownIssues} />
                  <DetailBlock icon={<ListChecks size={11} />} accent="#023E8A" label="Pre-Deployment Considerations" text={v.deploymentNotes} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailBlock({ icon, accent, label, text }: { icon: React.ReactNode; accent: string; label: string; text: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: '#FAFCFF', border: '1px solid #EEF0F5', borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ color: accent }}>{icon}</span>
        <span style={{ fontSize: '9.5px', fontWeight: 700, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: text ? '#1D252C' : '#CBD5E1', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontStyle: text ? 'normal' : 'italic' }}>
        {text || '(empty — add details to populate this section in the report)'}
      </div>
    </div>
  );
}

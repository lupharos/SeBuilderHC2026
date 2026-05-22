import { useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, ArrowUpCircle, X, Download, FileJson, CheckCircle2,
  AlertTriangle, Calendar, ExternalLink, Sparkles, ListChecks, Wrench, Search,
} from 'lucide-react';
import type { VersionUpgradeProposal } from './steps/StepVersionUpgrades';

/* Version & Release Catalog
   ─────────────────────────
   Standalone library of upgrade proposals shared across customer sessions.
   The wizard's "New Version Upgrade Proposals" step can pick from this
   catalogue instead of typing the same proposal again for every customer.

   - Same shape as the wizard step's VersionUpgradeProposal (reused type
     so import/export bundles are interchangeable between the two).
   - Persisted in its own localStorage key (`hc_version_upgrade_catalog`)
     — independent from any wizard session.
   - JSON export/import uses the same `_format` magic string as the wizard
     bundle, so a file exported from one place imports cleanly into the
     other. */

type Priority = VersionUpgradeProposal['priority'];

/* Catalog UI never asks the operator for a per-entry priority — every
   imported wizard proposal inherits the underlying type's `priority`
   default. Priority remains a wizard-side decision because urgency is
   relative to the customer's current installed version, not the release
   itself. Kept the valid-values list around because JSON imports may
   carry a `priority` from older exports, and we validate it. */
const PRIORITIES_LIST: Priority[] = ['critical', 'high', 'medium', 'low'];

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

const CATALOG_BUNDLE_FORMAT = 'forcepoint-hc-version-upgrades';
const CATALOG_BUNDLE_VERSION = 1;

interface Props {
  catalog: VersionUpgradeProposal[];
  setCatalog: React.Dispatch<React.SetStateAction<VersionUpgradeProposal[]>>;
}

export function VersionUpgradeCatalogPage({ catalog, setCatalog }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'ok'; count: number } | { kind: 'error'; message: string } | null>(null);

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
    setCatalog((prev) => prev.filter((i) => i.id !== id));
    if (editId === id) cancelForm();
  };

  const submit = () => {
    if (!form.product.trim() || !form.toVersion.trim()) return;
    if (editId) {
      setCatalog((prev) => prev.map((i) => (i.id === editId ? { ...i, ...form } : i)));
    } else {
      const fresh: VersionUpgradeProposal = {
        id: `vu-cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...form,
      };
      setCatalog((prev) => [...prev, fresh]);
    }
    cancelForm();
  };

  function exportJSON() {
    const payload = {
      _format: CATALOG_BUNDLE_FORMAT,
      _version: CATALOG_BUNDLE_VERSION,
      _exportedAt: new Date().toISOString(),
      items: catalog,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hc-version-upgrade-catalog-${stamp}.json`;
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
        const rawItems: unknown[] = Array.isArray(raw)
          ? raw
          : (Array.isArray(obj?.items) ? (obj.items as unknown[]) : []);
        if (!Array.isArray(raw) && obj?._format !== CATALOG_BUNDLE_FORMAT) {
          throw new Error(`Wrong file format — expected "_format": "${CATALOG_BUNDLE_FORMAT}".`);
        }
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          throw new Error('JSON must contain a non-empty "items" array of upgrade proposals.');
        }
        const validated: VersionUpgradeProposal[] = rawItems.map((it, i) => {
          const o = it as Record<string, unknown>;
          if (typeof o.product !== 'string' || !o.product.trim()) throw new Error(`Item[${i}]: missing "product".`);
          if (typeof o.toVersion !== 'string' || !o.toVersion.trim()) throw new Error(`Item[${i}]: missing "toVersion".`);
          const priority: Priority = (typeof o.priority === 'string' && (PRIORITIES_LIST as string[]).includes(o.priority))
            ? (o.priority as Priority)
            : 'high';
          return {
            id: `vu-cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
            product: o.product,
            fromVersion: typeof o.fromVersion === 'string' ? o.fromVersion : '',
            toVersion: o.toVersion,
            releaseDate: typeof o.releaseDate === 'string' ? o.releaseDate : '',
            releaseNotesUrl: typeof o.releaseNotesUrl === 'string' ? o.releaseNotesUrl : '',
            whatsNew: typeof o.whatsNew === 'string' ? o.whatsNew : '',
            bugFixes: typeof o.bugFixes === 'string' ? o.bugFixes : '',
            knownIssues: typeof o.knownIssues === 'string' ? o.knownIssues : '',
            deploymentNotes: typeof o.deploymentNotes === 'string' ? o.deploymentNotes : '',
            priority,
          };
        });
        setCatalog((prev) => [...prev, ...validated]);
        setImportStatus({ kind: 'ok', count: validated.length });
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err) {
        setImportStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to parse file.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* Group by product for the list view — operator scans by product name
     ("Forcepoint DLP", "Forcepoint Endpoint", etc.) more naturally than
     by date or priority. */
  const grouped = useMemo(() => {
    const map = new Map<string, VersionUpgradeProposal[]>();
    for (const v of catalog) {
      const key = v.product || '(Unspecified product)';
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    /* Sort each product's versions by toVersion semver-ish desc so newest
       is on top. */
    for (const list of map.values()) {
      list.sort((a, b) => b.toVersion.localeCompare(a.toVersion, undefined, { numeric: true }));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map(([product, list]) => [product, list.filter((v) =>
        product.toLowerCase().includes(q)
        || v.toVersion.toLowerCase().includes(q)
        || v.fromVersion.toLowerCase().includes(q)
        || v.releaseDate.toLowerCase().includes(q)
        || v.whatsNew.toLowerCase().includes(q),
      )] as [string, VersionUpgradeProposal[]])
      .filter(([, list]) => list.length > 0);
  }, [grouped, query]);

  const inputStyle: React.CSSProperties = {
    fontSize: '12.5px', border: '1.5px solid rgba(15,41,82,0.14)',
    background: '#F8FAFC', color: '#0F172A', borderRadius: '8px',
    padding: '8px 12px', outline: 'none', width: '100%',
    fontFamily: 'inherit',
  };
  const taStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.6 };
  const labelStyle: React.CSSProperties = { fontSize: '10.5px', fontWeight: 600, color: '#334155' };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F4F7FB' }}>
      {/* Sticky page header — mirrors the OS / Browser Support Matrix page
          so the toolbar (Export / Import / Add) stays visible while the
          operator scrolls a long catalog. */}
      <div className="flex items-center justify-between px-8 py-5 flex-shrink-0 gap-4 flex-wrap"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#023E8A,#012566)' }}>
            <ArrowUpCircle size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952', letterSpacing: '-0.01em' }}>
              Version &amp; Release Catalog
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', maxWidth: 760 }}>
              Reusable library of upgrade proposals — fill once, then pick from this catalog inside any customer's "New Version Upgrade Proposals" wizard step. Edits here don't touch existing wizard sessions.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={exportJSON}
            disabled={catalog.length === 0}
            title={catalog.length === 0 ? 'Catalog is empty — add at least one version first' : `Export ${catalog.length} version entry${catalog.length === 1 ? '' : 'ies'} to JSON`}
            className="flex items-center gap-1.5 h-[32px] px-3 rounded-lg font-semibold transition-all"
            style={{
              fontSize: '11.5px',
              background: catalog.length === 0 ? '#F1F5F9' : '#FFFFFF',
              color: catalog.length === 0 ? '#94A3B8' : '#0F2952',
              border: `1px solid ${catalog.length === 0 ? '#E2E8F0' : '#CBD5E1'}`,
              cursor: catalog.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={12} /> Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import a JSON bundle of versions — entries are appended with fresh catalog IDs"
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
            onClick={() => (showForm ? cancelForm() : openAdd())}
            className="flex items-center gap-1.5 h-[32px] px-4 rounded-lg font-semibold text-white transition-all"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg, #023E8A, #012566)', boxShadow: '0 2px 8px rgba(2,62,138,0.3)' }}
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Cancel' : 'Add Version'}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-[13px]">
        {importStatus && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg"
            style={{
              background: importStatus.kind === 'ok' ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.06)',
              border: `1px solid ${importStatus.kind === 'ok' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
            }}>
            {importStatus.kind === 'ok'
              ? <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
              : <AlertTriangle size={13} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />}
            <span style={{ fontSize: '11.5px', color: importStatus.kind === 'ok' ? '#15803D' : '#7F1D1D', lineHeight: 1.5 }}>
              {importStatus.kind === 'ok'
                ? `Imported ${importStatus.count} version entr${importStatus.count === 1 ? 'y' : 'ies'} into the catalog.`
                : `Import failed — ${importStatus.message}`}
            </span>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-[rgba(2,62,138,0.25)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>
              {editId ? 'Edit Catalog Entry' : 'Add Catalog Entry'}
            </div>
            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-6 flex flex-col gap-1">
                <label style={labelStyle}>Product / Solution *</label>
                <input value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  placeholder="e.g. Forcepoint DLP, DLP Endpoint, NGFW" style={inputStyle} />
              </div>
              <div className="col-span-3 flex flex-col gap-1">
                <label style={labelStyle}>Version *</label>
                <input value={form.toVersion} onChange={(e) => setForm((f) => ({ ...f, toVersion: e.target.value }))}
                  placeholder="e.g. 10.4 or 26.04" style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }} />
              </div>
              <div className="col-span-3 flex flex-col gap-1">
                <label style={labelStyle}>Release Date</label>
                <input value={form.releaseDate} onChange={(e) => setForm((f) => ({ ...f, releaseDate: e.target.value }))}
                  placeholder="2026-03-15  or  Q1 2026" style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }} />
              </div>

              <div className="col-span-12 flex flex-col gap-1">
                <label style={labelStyle}>Release Notes URL</label>
                <input value={form.releaseNotesUrl ?? ''} onChange={(e) => setForm((f) => ({ ...f, releaseNotesUrl: e.target.value }))}
                  placeholder="https://help.forcepoint.com/…" style={inputStyle} />
              </div>

              <div className="col-span-12 flex flex-col gap-1">
                <label style={labelStyle}><Sparkles size={11} className="inline mr-1" style={{ color: '#7C3AED' }} /> What's New</label>
                <textarea value={form.whatsNew} onChange={(e) => setForm((f) => ({ ...f, whatsNew: e.target.value }))}
                  placeholder="One bullet per line — headline new features, capabilities, or integrations." style={taStyle} />
              </div>
              <div className="col-span-6 flex flex-col gap-1">
                <label style={labelStyle}><Wrench size={11} className="inline mr-1" style={{ color: '#16A34A' }} /> Bug Fixes</label>
                <textarea value={form.bugFixes} onChange={(e) => setForm((f) => ({ ...f, bugFixes: e.target.value }))}
                  placeholder="Notable resolved defects." style={taStyle} />
              </div>
              <div className="col-span-6 flex flex-col gap-1">
                <label style={labelStyle}><AlertTriangle size={11} className="inline mr-1" style={{ color: '#D97706' }} /> Known Issues</label>
                <textarea value={form.knownIssues} onChange={(e) => setForm((f) => ({ ...f, knownIssues: e.target.value }))}
                  placeholder="Open issues / limitations to flag pre-upgrade." style={taStyle} />
              </div>
              <div className="col-span-12 flex flex-col gap-1">
                <label style={labelStyle}><ListChecks size={11} className="inline mr-1" style={{ color: '#0EA5E9' }} /> Deployment Notes</label>
                <textarea value={form.deploymentNotes} onChange={(e) => setForm((f) => ({ ...f, deploymentNotes: e.target.value }))}
                  placeholder="Pre-flight checks, prerequisites, upgrade order." style={taStyle} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={submit}
                disabled={!form.product.trim() || !form.toVersion.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
                style={{
                  fontSize: '12px',
                  background: form.product.trim() && form.toVersion.trim() ? 'linear-gradient(135deg, #023E8A, #012566)' : '#CBD5E1',
                  cursor: form.product.trim() && form.toVersion.trim() ? 'pointer' : 'not-allowed',
                }}>
                {editId ? 'Save Changes' : <><Plus size={13} /> Add to Catalog</>}
              </button>
              <button onClick={cancelForm}
                className="px-4 py-2 rounded-lg font-semibold"
                style={{ fontSize: '12px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        {catalog.length > 0 && (
          <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] p-[10px_14px] flex items-center gap-2">
            <Search size={14} style={{ color: '#64748B' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by product, version, or content…"
              style={{ flex: 1, fontSize: '12.5px', border: 'none', outline: 'none', background: 'transparent', color: '#0F172A' }}
            />
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{catalog.length} total</div>
          </div>
        )}

        {/* List */}
        {catalog.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[rgba(15,41,82,0.15)] p-10 text-center">
            <ArrowUpCircle size={28} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Catalog is empty</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: 4, maxWidth: 520, margin: '4px auto 0' }}>
              Add a version with <strong>Add Version</strong> above, or paste an existing bundle via <strong>Import JSON</strong>. Once populated, the wizard's "New Version Upgrade Proposals" step will let you pick from this catalog.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] p-6 text-center" style={{ fontSize: '12px', color: '#64748B' }}>
            No catalog entries match "{query}".
          </div>
        ) : (
          filtered.map(([product, list]) => (
            <div key={product} className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2"
                style={{ background: 'rgba(2,62,138,0.04)', borderBottom: '1px solid rgba(15,41,82,0.06)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#023E8A' }}>{product}</div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>· {list.length} version{list.length === 1 ? '' : 's'}</div>
              </div>
              <div>
                {list.map((v) => (
                  <div key={v.id}
                    className="px-5 py-3 flex items-start gap-3"
                    style={{ borderBottom: '1px solid rgba(15,41,82,0.04)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', fontFamily: "'JetBrains Mono', monospace" }}>{v.toVersion}</span>
                        {v.releaseDate && (
                          <span className="flex items-center gap-1" style={{ fontSize: '10.5px', color: '#64748B' }}>
                            <Calendar size={10} /> {v.releaseDate}
                          </span>
                        )}
                        {v.releaseNotesUrl && (
                          <a href={v.releaseNotesUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1"
                            style={{ fontSize: '10.5px', color: '#0EA5E9' }}>
                            <ExternalLink size={10} /> Release Notes
                          </a>
                        )}
                      </div>
                      {(v.whatsNew || v.deploymentNotes) && (
                        <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                          {(v.whatsNew || v.deploymentNotes).split('\n').slice(0, 3).join('\n')}
                          {(v.whatsNew || v.deploymentNotes).split('\n').length > 3 && '…'}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(v)} title="Edit"
                        className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => deleteItem(v.id)} title="Delete"
                        className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

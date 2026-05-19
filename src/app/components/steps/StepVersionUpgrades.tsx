import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, X, Calendar, ExternalLink, Sparkles, AlertTriangle, ListChecks, Wrench } from 'lucide-react';

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
}

export function StepVersionUpgrades({ items, setItems }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

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

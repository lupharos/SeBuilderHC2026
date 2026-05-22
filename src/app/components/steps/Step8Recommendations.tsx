import { useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, Clock, Circle, X, ChevronDown, ChevronRight, Star } from 'lucide-react';

type Priority = 'critical' | 'high' | 'medium' | 'low';
type Status = 'open' | 'in_progress' | 'done';
type Effort = 'low' | 'medium' | 'high';
type RecCategory =
  | 'new_server'
  | 'hw_upgrade'
  | 'migration'
  | 'version_upgrade'
  | 'storage'
  | 'ssl_security'
  | 'config_change'
  | 'custom';

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  category: RecCategory;
  product: string;
  priority: Priority;
  effort: Effort;
  status: Status;
  /** Recommended target version (e.g. "10.4", "26.02") — only meaningful when category === 'version_upgrade'. */
  targetVersion?: string;
  /** Release notes URL for the target version. */
  releaseNotesUrl?: string;
  /** Inline release notes text or release-notes highlights (optional). */
  releaseNotes?: string;
  /** When true, this recommendation appears in the report's "High-Level Recommendations"
      block AND in "Key Observations". When false (or unset), it only appears in the full
      recommendations table in Part III. */
  featured?: boolean;
}

const CAT_CFG: Record<RecCategory, { label: string; icon: string; color: string; hint: string }> = {
  new_server:      { label: 'New Server',      icon: '🖥️', color: '#7C3AED', hint: 'Add new server or appliance' },
  hw_upgrade:      { label: 'HW Upgrade',      icon: '⚡', color: '#6366F1', hint: 'RAM, CPU upgrade' },
  migration:       { label: 'Migration',        icon: '🔄', color: '#0D9488', hint: 'Platform or device migration' },
  version_upgrade: { label: 'Version Upgrade', icon: '⬆️', color: '#2563EB', hint: 'Firmware or software update' },
  storage:         { label: 'Storage',          icon: '💾', color: '#0891B2', hint: 'Disk expansion, add storage' },
  ssl_security:    { label: 'SSL / Security',   icon: '🔒', color: '#DC2626', hint: 'SSL, TLS, hardening' },
  config_change:   { label: 'Config Change',    icon: '⚙️', color: '#D97706', hint: 'Policy or settings tuning' },
  custom:          { label: 'Custom',           icon: '📝', color: '#64748B', hint: 'Other recommendation' },
};

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; border: string }> = {
  critical: { label: 'Critical', bg: 'rgba(220,38,38,0.07)',  text: '#DC2626', border: 'rgba(220,38,38,0.2)' },
  high:     { label: 'High',     bg: 'rgba(217,119,6,0.07)',  text: '#D97706', border: 'rgba(217,119,6,0.2)' },
  medium:   { label: 'Medium',   bg: 'rgba(245,158,11,0.07)', text: '#B45309', border: 'rgba(245,158,11,0.2)' },
  low:      { label: 'Low',      bg: 'rgba(16,185,129,0.07)', text: '#059669', border: 'rgba(16,185,129,0.2)' },
};

const EFFORT_CFG: Record<Effort, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#16A34A' },
  medium: { label: 'Medium', color: '#D97706' },
  high:   { label: 'High',   color: '#DC2626' },
};

const STATUS_CFG: Record<Status, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  open:        { label: 'Open',        icon: <Circle size={11} />,       bg: '#F1F5F9',               text: '#64748B' },
  in_progress: { label: 'In Progress', icon: <Clock size={11} />,        bg: 'rgba(37,99,235,0.08)',  text: '#2563EB' },
  done:        { label: 'Done',        icon: <CheckCircle2 size={11} />, bg: 'rgba(22,163,74,0.1)',   text: '#16A34A' },
};

const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low'];
const CAT_ORDER: RecCategory[] = ['new_server', 'hw_upgrade', 'migration', 'version_upgrade', 'storage', 'ssl_security', 'config_change', 'custom'];

const EMPTY_FORM: Omit<Recommendation, 'id' | 'status'> = {
  title: '',
  detail: '',
  category: 'config_change',
  product: '',
  priority: 'medium',
  effort: 'medium',
  targetVersion: '',
  releaseNotesUrl: '',
  releaseNotes: '',
};

export function Step8Recommendations({ recommendations, setRecommendations }: { recommendations: Recommendation[]; setRecommendations: React.Dispatch<React.SetStateAction<Recommendation[]>> }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

  const openAdd = (category?: RecCategory) => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, category: category ?? 'config_change' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEdit = (rec: Recommendation) => {
    setEditId(rec.id);
    setForm({
      title: rec.title, detail: rec.detail, category: rec.category, product: rec.product,
      priority: rec.priority, effort: rec.effort,
      targetVersion: rec.targetVersion ?? '',
      releaseNotesUrl: rec.releaseNotesUrl ?? '',
      releaseNotes: rec.releaseNotes ?? '',
    });
    setShowForm(true);
  };

  const saveForm = () => {
    if (!form.title.trim()) return;
    if (editId) {
      setRecommendations((prev) => prev.map((r) => (r.id === editId ? { ...r, ...form } : r)));
    } else {
      const newRec: Recommendation = { id: `rec-${Date.now()}`, ...form, status: 'open' };
      setRecommendations((prev) => [...prev, newRec]);
    }
    setShowForm(false);
    setEditId(null);
  };

  const cancelForm = () => { setShowForm(false); setEditId(null); };

  const deleteRec = (id: string) => setRecommendations((prev) => prev.filter((r) => r.id !== id));

  const cycleStatus = (id: string) => {
    const order: Status[] = ['open', 'in_progress', 'done'];
    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const idx = order.indexOf(r.status);
        return { ...r, status: order[(idx + 1) % order.length] };
      }),
    );
  };

  const toggleFeatured = (id: string) =>
    setRecommendations((prev) => prev.map((r) => (r.id === id ? { ...r, featured: !r.featured } : r)));

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = filterPriority === 'all' ? recommendations : recommendations.filter((r) => r.priority === filterPriority);
  const doneCount = recommendations.filter((r) => r.status === 'done').length;
  const countByPriority = (p: Priority) => recommendations.filter((r) => r.priority === p).length;

  const inputStyle = {
    fontSize: '12.5px',
    border: '1.5px solid rgba(15,41,82,0.14)',
    background: '#F8FAFC',
    color: '#0F172A',
    borderRadius: '8px',
    padding: '8px 12px',
    outline: 'none',
    width: '100%',
    lineHeight: '1.5',
  };

  return (
    <div className="space-y-[13px]">

      {/* Add / Edit Form */}
      {showForm && (
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,41,82,0.08)]"
          style={{ border: '1.5px solid rgba(37,99,235,0.3)' }}
        >
          <div className="p-[20px_22px]">
            {/* Form header */}
            <div className="flex items-center justify-between mb-5">
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                {editId ? 'Edit Recommendation' : 'New Recommendation'}
              </div>
              <button
                onClick={cancelForm}
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{ color: '#94A3B8', background: '#F1F5F9' }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Category grid */}
            <div className="mb-5">
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Category</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {CAT_ORDER.map((cat) => {
                  const cfg = CAT_CFG[cat];
                  const isActive = form.category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className="rounded-xl p-2.5 text-left transition-all"
                      style={{
                        background: isActive ? `${cfg.color}10` : '#F8FAFC',
                        border: isActive ? `1.5px solid ${cfg.color}45` : '1.5px solid rgba(15,41,82,0.07)',
                      }}
                    >
                      <div style={{ fontSize: '20px', marginBottom: '5px' }}>{cfg.icon}</div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: isActive ? cfg.color : '#334155' }}>{cfg.label}</div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px', lineHeight: 1.3 }}>{cfg.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div className="mb-3">
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                Title <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.category === 'version_upgrade' ? 'e.g. Upgrade FSM Server to v8.9.1' :
                  form.category === 'hw_upgrade' ? 'e.g. Upgrade RAM on NGFW appliance to 32 GB' :
                  form.category === 'ssl_security' ? 'e.g. Enable SSL inspection for all outbound traffic' :
                  form.category === 'storage' ? 'e.g. Add disk space to V10 appliance (87% full)' :
                  form.category === 'migration' ? 'e.g. Migrate V5000 appliances to V10000 G4' :
                  form.category === 'new_server' ? 'e.g. Add secondary DLP Management Server' :
                  'e.g. Enable IPS inline prevention mode'
                }
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
              />
            </div>

            {/* Product + Detail row */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                  Product / Area
                </label>
                <input
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  placeholder="e.g. NGFW, DLP, Web"
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>
              <div className="col-span-2">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                  Detail / Notes
                </label>
                <textarea
                  value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  placeholder="Describe the issue, impact, and expected outcome…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>
            </div>

            {/* Priority + Effort */}
            <div className="grid grid-cols-2 gap-5 mb-5">
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>Priority</label>
                <div className="flex gap-1.5">
                  {PRIORITY_ORDER.map((p) => {
                    const cfg = PRIORITY_CFG[p];
                    const isActive = form.priority === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setForm((f) => ({ ...f, priority: p }))}
                        className="flex-1 py-1.5 rounded-lg transition-all"
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
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>Effort</label>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high'] as Effort[]).map((ef) => {
                    const cfg = EFFORT_CFG[ef];
                    const isActive = form.effort === ef;
                    return (
                      <button
                        key={ef}
                        onClick={() => setForm((f) => ({ ...f, effort: ef }))}
                        className="flex-1 py-1.5 rounded-lg transition-all"
                        style={{
                          fontSize: '9px', fontWeight: 700, fontFamily: 'monospace',
                          background: isActive ? `${cfg.color}12` : '#F8FAFC',
                          color: isActive ? cfg.color : '#94A3B8',
                          border: isActive ? `1.5px solid ${cfg.color}35` : '1.5px solid rgba(15,41,82,0.07)',
                        }}
                      >
                        {ef.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Release Notes fields previously lived here when category was
                "Version Upgrade", but version-specific details (target version,
                release notes URL, highlights) are already captured in detail on
                the next page (Step 9 — Version Upgrade Proposals). Keeping them
                here too is duplicate data-entry. The type fields stay on the
                Recommendation interface for backward-compat with existing
                sessions, but no UI emits them on new recommendations. */}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={saveForm}
                disabled={!form.title.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white transition-all"
                style={{
                  fontSize: '12px',
                  background: form.title.trim() ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : '#CBD5E1',
                  cursor: form.title.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: form.title.trim() ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                }}
              >
                {editId ? 'Save Changes' : <><Plus size={13} /> Add Recommendation</>}
              </button>
              <button
                onClick={cancelForm}
                className="px-4 py-2 rounded-lg font-semibold transition-all"
                style={{ fontSize: '12px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {recommendations.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[24px_24px]">
          <div className="text-center mb-6">
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>💡</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No Recommendations Yet</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
              Add recommendations for your customer based on the health check findings.
              Choose a type below to get started.
            </div>
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', textAlign: 'center', marginBottom: '12px' }}>
            QUICK ADD BY TYPE
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {CAT_ORDER.map((cat) => {
              const cfg = CAT_CFG[cat];
              return (
                <button
                  key={cat}
                  onClick={() => openAdd(cat)}
                  className="rounded-xl p-3 text-center transition-all"
                  style={{ background: '#F8FAFC', border: '1.5px solid rgba(15,41,82,0.07)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${cfg.color}08`; e.currentTarget.style.borderColor = `${cfg.color}35`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = 'rgba(15,41,82,0.07)'; }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{cfg.icon}</div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155' }}>{cfg.label}</div>
                  <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '3px', lineHeight: 1.3 }}>{cfg.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter / overview bar */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[16px_20px]">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Recommendations</div>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{doneCount}</span>
                <span> / {recommendations.length} resolved</span>
              </span>
              {!showForm && (
                <button
                  onClick={() => openAdd()}
                  className="flex items-center gap-1.5 h-[28px] px-3 rounded-lg font-semibold text-white text-[11px]"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', boxShadow: '0 2px 6px rgba(37,99,235,0.25)' }}
                >
                  <Plus size={11} /> Add
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterPriority('all')}
              className="px-3 py-1.5 rounded-full transition-all"
              style={{
                fontSize: '11px', fontWeight: 600,
                background: filterPriority === 'all' ? '#0F172A' : '#F1F5F9',
                color: filterPriority === 'all' ? '#fff' : '#64748B',
                border: filterPriority === 'all' ? '1.5px solid #0F172A' : '1.5px solid #E2E8F0',
              }}
            >
              All ({recommendations.length})
            </button>
            {PRIORITY_ORDER.map((p) => {
              const cfg = PRIORITY_CFG[p];
              const count = countByPriority(p);
              if (count === 0) return null;
              const isActive = filterPriority === p;
              return (
                <button
                  key={p}
                  onClick={() => setFilterPriority(isActive ? 'all' : p)}
                  className="px-3 py-1.5 rounded-full transition-all"
                  style={{
                    fontSize: '11px', fontWeight: 600,
                    background: isActive ? cfg.bg : '#F8FAFC',
                    color: isActive ? cfg.text : '#64748B',
                    border: isActive ? `1.5px solid ${cfg.border}` : '1.5px solid #E2E8F0',
                  }}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List grouped by priority */}
      {PRIORITY_ORDER.map((priority) => {
        const group = filtered.filter((r) => r.priority === priority);
        if (group.length === 0) return null;
        const pCfg = PRIORITY_CFG[priority];
        return (
          <div key={priority}>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pCfg.text }} />
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: pCfg.text, letterSpacing: '0.07em' }}>
                {pCfg.label.toUpperCase()} · {group.length}
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(15,41,82,0.07)' }} />
            </div>

            <div className="space-y-2">
              {group.map((rec) => {
                const catCfg = CAT_CFG[rec.category];
                const sCfg = STATUS_CFG[rec.status];
                const eCfg = EFFORT_CFG[rec.effort];
                const isOpen = expanded[rec.id];

                return (
                  <div
                    key={rec.id}
                    className="bg-white rounded-xl overflow-hidden transition-all"
                    style={{
                      border: '1px solid rgba(15,41,82,0.08)',
                      boxShadow: `inset 3px 0 0 ${catCfg.color}, 0 1px 3px rgba(15,41,82,0.05)`,
                      opacity: rec.status === 'done' ? 0.72 : 1,
                    }}
                  >
                    <div style={{ padding: '13px 16px 13px 18px' }}>
                      <div className="flex items-start gap-3">
                        {/* Category icon */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[17px]"
                          style={{ background: `${catCfg.color}12`, marginTop: '1px' }}
                        >
                          {catCfg.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <div
                            style={{
                              fontSize: '12.5px', fontWeight: 600, lineHeight: 1.4,
                              textDecoration: rec.status === 'done' ? 'line-through' : 'none',
                              color: rec.status === 'done' ? '#94A3B8' : '#0F172A',
                              marginBottom: '5px',
                            }}
                          >
                            {rec.title}
                          </div>

                          {/* Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="px-1.5 py-0.5 rounded"
                              style={{ fontSize: '8.5px', fontWeight: 700, background: `${catCfg.color}12`, color: catCfg.color, border: `1px solid ${catCfg.color}28` }}
                            >
                              {catCfg.label.toUpperCase()}
                            </span>
                            {rec.product && (
                              <span
                                className="px-1.5 py-0.5 rounded font-mono"
                                style={{ fontSize: '8.5px', fontWeight: 700, background: 'rgba(37,99,235,0.07)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.15)' }}
                              >
                                {rec.product}
                              </span>
                            )}
                            <span style={{ fontSize: '9px', fontWeight: 600, color: eCfg.color }}>
                              {eCfg.label} effort
                            </span>
                          </div>

                          {/* Detail (when expanded) */}
                          {isOpen && rec.detail && (
                            <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.65, marginTop: '8px' }}>
                              {rec.detail}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleFeatured(rec.id)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-all"
                            style={{
                              color: rec.featured ? '#EAB308' : '#CBD5E1',
                              background: rec.featured ? 'rgba(234,179,8,0.12)' : '#F1F5F9',
                            }}
                            title={rec.featured
                              ? 'Featured — appears in High-Level Recommendations + Key Observations'
                              : 'Click to feature this recommendation in the report'}
                            aria-label={rec.featured ? 'Unfeature' : 'Feature'}
                          >
                            <Star size={12} fill={rec.featured ? '#EAB308' : 'transparent'} strokeWidth={rec.featured ? 0 : 2} />
                          </button>
                          <button
                            onClick={() => cycleStatus(rec.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all"
                            style={{ fontSize: '10px', fontWeight: 600, background: sCfg.bg, color: sCfg.text }}
                            title="Click to advance status"
                          >
                            {sCfg.icon}
                            <span>{sCfg.label}</span>
                          </button>
                          <button
                            onClick={() => openEdit(rec)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-all"
                            style={{ color: '#94A3B8', background: '#F1F5F9' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F1F5F9'; }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => deleteRec(rec.id)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-all"
                            style={{ color: '#CBD5E1', background: 'transparent' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Trash2 size={11} />
                          </button>
                          {rec.detail && (
                            <button
                              onClick={() => toggleExpand(rec.id)}
                              className="w-6 h-6 rounded flex items-center justify-center"
                              style={{ color: '#94A3B8', background: '#F1F5F9' }}
                            >
                              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Add button at bottom */}
      {recommendations.length > 0 && !showForm && (
        <button
          onClick={() => openAdd()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all"
          style={{ border: '2px dashed rgba(15,41,82,0.12)', fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)'; e.currentTarget.style.color = '#2563EB'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(15,41,82,0.12)'; e.currentTarget.style.color = '#64748B'; }}
        >
          <Plus size={14} /> Add Recommendation
        </button>
      )}
    </div>
  );
}

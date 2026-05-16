import { useState } from 'react';
import { Plus, CheckCircle2, Clock, Circle, Trash2, Calendar, Pencil, X, Star } from 'lucide-react';

type Priority = 'critical' | 'high' | 'medium' | 'low';
type Status = 'not_started' | 'in_progress' | 'done';

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  priority: Priority;
  status: Status;
  product: string;
  /** When true, this action appears in the report's "Top Priority Actions" block AND in
      "Key Observations". When false (or unset), it only appears in the full Next Steps table. */
  featured?: boolean;
}

const P_CFG: Record<Priority, { label: string; text: string; bg: string; border: string }> = {
  critical: { label: 'Critical', text: '#DC2626', bg: 'rgba(220,38,38,0.07)', border: 'rgba(220,38,38,0.2)' },
  high:     { label: 'High',     text: '#D97706', bg: 'rgba(217,119,6,0.07)',  border: 'rgba(217,119,6,0.2)' },
  medium:   { label: 'Medium',   text: '#B45309', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)' },
  low:      { label: 'Low',      text: '#059669', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)' },
};

const S_CFG: Record<Status, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  not_started: { label: 'Not Started', icon: <Circle size={11} />,       bg: '#F1F5F9',               text: '#64748B' },
  in_progress: { label: 'In Progress', icon: <Clock size={11} />,        bg: 'rgba(37,99,235,0.08)',  text: '#2563EB' },
  done:        { label: 'Done',        icon: <CheckCircle2 size={11} />, bg: 'rgba(22,163,74,0.1)',   text: '#16A34A' },
};

const STATUS_ORDER: Status[] = ['not_started', 'in_progress', 'done'];

const EMPTY_FORM = { task: '', owner: '', dueDate: '', priority: 'medium' as Priority, product: '' };

export function Step9NextSteps({ items, setItems }: { items: ActionItem[]; setItems: React.Dispatch<React.SetStateAction<ActionItem[]>> }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cycleStatus = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const idx = STATUS_ORDER.indexOf(item.status);
        return { ...item, status: STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] };
      }),
    );
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const toggleFeatured = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, featured: !i.featured } : i)));

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: ActionItem) => {
    setEditId(item.id);
    setForm({ task: item.task, owner: item.owner, dueDate: item.dueDate, priority: item.priority, product: item.product });
    setShowForm(true);
  };

  const saveForm = () => {
    if (!form.task.trim()) return;
    if (editId) {
      setItems((prev) => prev.map((i) => (i.id === editId ? { ...i, ...form } : i)));
    } else {
      const newItem: ActionItem = {
        id: `a-${Date.now()}`,
        task: form.task,
        owner: form.owner || 'TBD',
        dueDate: form.dueDate,
        priority: form.priority,
        status: 'not_started',
        product: form.product,
      };
      setItems((prev) => [...prev, newItem]);
    }
    setShowForm(false);
    setEditId(null);
  };

  const cancelForm = () => { setShowForm(false); setEditId(null); };

  const doneCount = items.filter((i) => i.status === 'done').length;
  const inProgCount = items.filter((i) => i.status === 'in_progress').length;
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  const inputCls = 'px-3 py-2 rounded-lg outline-none transition-all';
  const inputStyle = { fontSize: '12.5px', border: '1.5px solid rgba(15,41,82,0.14)', background: '#F8FAFC', color: '#0F172A' };

  return (
    <div className="space-y-[13px]">

      {/* Progress bar (only when items exist) */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Action Plan Progress</div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              <span style={{ fontWeight: 700, color: '#16A34A' }}>{doneCount}</span> done ·{' '}
              <span style={{ fontWeight: 700, color: '#2563EB' }}>{inProgCount}</span> in progress ·{' '}
              <span style={{ fontWeight: 600 }}>{items.length - doneCount - inProgCount}</span> pending
            </div>
          </div>
          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #2563EB, #7C3AED)' }}
            />
          </div>
          <div className="mt-1.5 text-right" style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
            {progress}% complete
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(15,41,82,0.08)]"
          style={{ border: '1.5px solid rgba(37,99,235,0.3)' }}
        >
          <div className="p-[18px_22px]">
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                {editId ? 'Edit Action Item' : 'Add Action Item'}
              </div>
              <button onClick={cancelForm} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: '#94A3B8', background: '#F1F5F9' }}>
                <X size={13} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Task (full width) */}
              <div className="col-span-2 flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Task Description *</label>
                <input
                  value={form.task}
                  onChange={(e) => setForm((f) => ({ ...f, task: e.target.value }))}
                  placeholder="e.g. Upgrade NGFW firmware to 7.1.3"
                  className={inputCls}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>

              {/* Owner */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Owner</label>
                <input
                  value={form.owner}
                  onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                  placeholder="e.g. Network Team"
                  className={inputCls}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>

              {/* Due Date */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className={inputCls}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>

              {/* Product */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Product / Area</label>
                <input
                  value={form.product}
                  onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                  placeholder="e.g. NGFW, WEB, DLP"
                  className={inputCls}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Priority</label>
                <div className="flex gap-1.5">
                  {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => {
                    const cfg = P_CFG[p];
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
            </div>

            <div className="flex gap-2 mt-3.5">
              <button
                onClick={saveForm}
                disabled={!form.task.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white transition-all"
                style={{
                  fontSize: '12px',
                  background: form.task.trim() ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : '#CBD5E1',
                  cursor: form.task.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: form.task.trim() ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                }}
              >
                {editId ? 'Save Changes' : <><Plus size={13} /> Add Item</>}
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
      {items.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[24px_24px]">
          <div className="text-center py-8">
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No Action Items Yet</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 20px' }}>
              Define the next steps for your customer — assign owners, due dates, and track progress here.
            </div>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition-all"
              style={{ fontSize: '12.5px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
            >
              <Plus size={14} /> Add First Action Item
            </button>
          </div>
        </div>
      )}

      {/* Action Items Table */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] overflow-hidden">
          {/* Table header */}
          <div
            className="grid px-4 py-2.5"
            style={{
              gridTemplateColumns: '1fr 120px 100px 90px 110px 56px',
              background: '#F8FAFC',
              borderBottom: '1px solid rgba(15,41,82,0.08)',
            }}
          >
            {['Action Item', 'Owner', 'Due Date', 'Priority', 'Status', ''].map((col) => (
              <div key={col} style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {col}
              </div>
            ))}
          </div>

          {/* Rows */}
          {items.map((item, idx) => {
            const pCfg = P_CFG[item.priority];
            const sCfg = S_CFG[item.status];
            return (
              <div
                key={item.id}
                className="grid items-center px-4 py-3 transition-all"
                style={{
                  gridTemplateColumns: '1fr 120px 100px 90px 110px 56px',
                  borderBottom: idx < items.length - 1 ? '1px solid rgba(15,41,82,0.05)' : 'none',
                  opacity: item.status === 'done' ? 0.65 : 1,
                  background: item.status === 'done' ? 'rgba(22,163,74,0.02)' : 'white',
                }}
              >
                {/* Task */}
                <div style={{ paddingRight: '12px' }}>
                  <div style={{
                    fontSize: '12.5px', fontWeight: 500, color: item.status === 'done' ? '#94A3B8' : '#0F172A',
                    textDecoration: item.status === 'done' ? 'line-through' : 'none',
                    lineHeight: 1.45,
                  }}>
                    {item.task}
                  </div>
                  {item.product && (
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', marginTop: '2px' }}>
                      {item.product}
                    </div>
                  )}
                </div>

                {/* Owner */}
                <div style={{ fontSize: '11.5px', color: '#475569' }}>{item.owner}</div>

                {/* Due Date */}
                <div className="flex items-center gap-1" style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                  {item.dueDate ? (
                    <>
                      <Calendar size={10} style={{ color: '#94A3B8', flexShrink: 0 }} />
                      {item.dueDate}
                    </>
                  ) : '—'}
                </div>

                {/* Priority */}
                <div>
                  <span
                    className="px-2 py-0.5 rounded"
                    style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'monospace', background: pCfg.bg, color: pCfg.text, border: `1px solid ${pCfg.border}` }}
                  >
                    {pCfg.label.toUpperCase()}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <button
                    onClick={() => cycleStatus(item.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all"
                    style={{ fontSize: '10px', fontWeight: 600, background: sCfg.bg, color: sCfg.text }}
                    title="Click to advance status"
                  >
                    {sCfg.icon}
                    <span>{sCfg.label}</span>
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleFeatured(item.id)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-all"
                    style={{
                      color: item.featured ? '#EAB308' : '#CBD5E1',
                      background: item.featured ? 'rgba(234,179,8,0.12)' : 'transparent',
                    }}
                    title={item.featured
                      ? 'Featured — appears in Top Priority Actions + Key Observations'
                      : 'Click to feature this action in the report'}
                    aria-label={item.featured ? 'Unfeature' : 'Feature'}
                  >
                    <Star size={11} fill={item.featured ? '#EAB308' : 'transparent'} strokeWidth={item.featured ? 0 : 2} />
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-all"
                    style={{ color: '#CBD5E1' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-all"
                    style={{ color: '#CBD5E1' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add item button (when list is not empty and form is hidden) */}
      {items.length > 0 && !showForm && (
        <button
          onClick={openAdd}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all"
          style={{ border: '2px dashed rgba(15,41,82,0.12)', fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)'; e.currentTarget.style.color = '#2563EB'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(15,41,82,0.12)'; e.currentTarget.style.color = '#64748B'; }}
        >
          <Plus size={14} /> Add Action Item
        </button>
      )}
    </div>
  );
}

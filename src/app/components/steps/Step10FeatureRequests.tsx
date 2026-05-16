import { useState } from 'react';
import { Plus, ThumbsUp, Trash2, Rocket, X } from 'lucide-react';

type FRStatus = 'submitted' | 'under_review' | 'planned' | 'delivered';
type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface FeatureRequest {
  id: string;
  product: string;
  title: string;
  description: string;
  businessJustification: string;
  priority: Priority;
  status: FRStatus;
  votes: number;
  hasVoted: boolean;
}

const ST_CFG: Record<FRStatus, { label: string; bg: string; text: string }> = {
  submitted:    { label: 'Submitted',    bg: '#F1F5F9',               text: '#64748B' },
  under_review: { label: 'Under Review', bg: 'rgba(37,99,235,0.08)',  text: '#2563EB' },
  planned:      { label: 'Planned',      bg: 'rgba(124,58,237,0.08)', text: '#7C3AED' },
  delivered:    { label: 'Delivered',    bg: 'rgba(22,163,74,0.1)',   text: '#16A34A' },
};

const P_CFG: Record<Priority, { text: string; bg: string; border: string }> = {
  critical: { text: '#DC2626', bg: 'rgba(220,38,38,0.07)', border: 'rgba(220,38,38,0.2)' },
  high:     { text: '#D97706', bg: 'rgba(217,119,6,0.07)',  border: 'rgba(217,119,6,0.2)' },
  medium:   { text: '#B45309', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)' },
  low:      { text: '#059669', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)' },
};

const EMPTY_FORM = {
  product: '', title: '', description: '', businessJustification: '', priority: 'medium' as Priority,
};

export function Step10FeatureRequests({ items, setItems }: { items: FeatureRequest[]; setItems: React.Dispatch<React.SetStateAction<FeatureRequest[]>> }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const vote = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, votes: item.hasVoted ? item.votes - 1 : item.votes + 1, hasVoted: !item.hasVoted }
          : item,
      ),
    );
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const submit = () => {
    if (!form.title.trim() || !form.product.trim()) return;
    const newFR: FeatureRequest = {
      id: `fr-${Date.now()}`,
      ...form,
      status: 'submitted',
      votes: 0,
      hasVoted: false,
    };
    setItems((prev) => [newFR, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const inputStyle = {
    fontSize: '12.5px', border: '1.5px solid rgba(15,41,82,0.14)',
    background: '#F8FAFC', color: '#0F172A', borderRadius: '8px',
    padding: '8px 12px', outline: 'none', width: '100%',
  };

  return (
    <div className="space-y-[13px]">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(124,58,237,0.1)' }}>
              <Rocket size={15} style={{ color: '#7C3AED' }} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Customer Feature Requests</div>
              <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                {items.length === 0
                  ? 'No requests yet — add enhancement requests for this customer'
                  : `${items.length} request${items.length !== 1 ? 's' : ''} · ${items.filter((i) => i.status === 'planned' || i.status === 'delivered').length} accepted by product team`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 h-[32px] px-4 rounded-lg font-semibold text-white transition-all"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Cancel' : 'New Request'}
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-[rgba(124,58,237,0.25)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>
            New Customer Feature Request
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Product *</label>
                <select
                  value={form.product}
                  onChange={(e) => setForm((p) => ({ ...p, product: e.target.value }))}
                  style={{ ...inputStyle, padding: '7px 12px' } as React.CSSProperties}
                >
                  <option value="">Select product…</option>
                  {['Web Security', 'Email Security', 'DLP / Data Security', 'NGFW', 'DSPM', 'Classification', 'Appliance'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Priority</label>
                <div className="flex gap-1.5 mt-1">
                  {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => {
                    const cfg = P_CFG[p];
                    const isActive = form.priority === p;
                    return (
                      <button key={p} onClick={() => setForm((f) => ({ ...f, priority: p }))}
                        className="flex-1 py-2 rounded-lg transition-all"
                        style={{
                          fontSize: '9px', fontWeight: 700, fontFamily: 'monospace',
                          background: isActive ? cfg.bg : '#F8FAFC',
                          color: isActive ? cfg.text : '#94A3B8',
                          border: isActive ? `1.5px solid ${cfg.border}` : '1.5px solid rgba(15,41,82,0.07)',
                        }}>
                        {p.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Feature Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Brief description of the requested feature"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#7C3AED'; e.target.style.background = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detailed description of what the feature should do…"
                rows={2}
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 } as React.CSSProperties}
                onFocus={(e) => { e.target.style.borderColor = '#7C3AED'; e.target.style.background = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>Business Justification</label>
              <textarea
                value={form.businessJustification}
                onChange={(e) => setForm((p) => ({ ...p, businessJustification: e.target.value }))}
                placeholder="Why is this important? What business impact does it address?"
                rows={2}
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 } as React.CSSProperties}
                onFocus={(e) => { e.target.style.borderColor = '#7C3AED'; e.target.style.background = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC'; }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={!form.title.trim() || !form.product.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white transition-all"
                style={{
                  fontSize: '12px',
                  background: form.title.trim() && form.product.trim() ? 'linear-gradient(135deg, #7C3AED, #6D28D9)' : '#CBD5E1',
                  boxShadow: form.title.trim() && form.product.trim() ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                  cursor: form.title.trim() && form.product.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                <Plus size={13} /> Submit Request
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg font-semibold"
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
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <div className="text-center py-10">
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🚀</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No Customer Feature Requests</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6, maxWidth: '380px', margin: '0 auto 20px' }}>
              Log feature requests from the customer to forward to the Forcepoint product team.
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white"
              style={{ fontSize: '12.5px', background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}
            >
              <Plus size={14} /> Add First Request
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((item) => {
            const stCfg = ST_CFG[item.status];
            const pCfg = P_CFG[item.priority];
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border transition-all"
                style={{ borderColor: 'rgba(15,41,82,0.08)', boxShadow: '0 1px 3px rgba(15,41,82,0.05)' }}
              >
                <div className="p-[15px_18px]">
                  <div className="flex items-start gap-3">
                    {/* Vote */}
                    <button
                      onClick={() => vote(item.id)}
                      className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0 transition-all"
                      title="Upvote"
                    >
                      <ThumbsUp
                        size={14}
                        style={{ color: item.hasVoted ? '#7C3AED' : '#CBD5E1', fill: item.hasVoted ? '#7C3AED' : 'none' }}
                      />
                      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace', color: item.hasVoted ? '#7C3AED' : '#94A3B8' }}>
                        {item.votes}
                      </span>
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{item.title}</span>
                        <span className="px-1.5 py-0.5 rounded font-mono"
                          style={{ fontSize: '8.5px', fontWeight: 700, background: 'rgba(37,99,235,0.07)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.15)' }}>
                          {item.product}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono"
                          style={{ fontSize: '8.5px', fontWeight: 700, background: pCfg.bg, color: pCfg.text, border: `1px solid ${pCfg.border}` }}>
                          {item.priority.toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 rounded-full ml-auto"
                          style={{ fontSize: '9.5px', fontWeight: 600, background: stCfg.bg, color: stCfg.text }}>
                          {stCfg.label}
                        </span>
                      </div>

                      {item.description && (
                        <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.6, marginBottom: '6px' }}>
                          {item.description}
                        </div>
                      )}

                      {item.businessJustification && (
                        <div className="px-2.5 py-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.1)' }}>
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#7C3AED', letterSpacing: '0.05em' }}>BUSINESS JUSTIFICATION </span>
                          <span style={{ fontSize: '11px', color: '#475569' }}>{item.businessJustification}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                      style={{ color: '#CBD5E1' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

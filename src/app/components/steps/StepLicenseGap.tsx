import { Plus, Trash2, KeyRound, ArrowUpRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LicenseGapItem, LicenseItem } from '../Dashboard';

interface Props {
  licenseGaps: LicenseGapItem[];
  setLicenseGaps: React.Dispatch<React.SetStateAction<LicenseGapItem[]>>;
  existingLicenses: LicenseItem[];
}

const PRIORITY_CFG: Record<NonNullable<LicenseGapItem['priority']>, { label: string; bg: string; color: string; border: string }> = {
  critical: { label: 'CRITICAL', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  high:     { label: 'HIGH',     bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
  medium:   { label: 'MEDIUM',   bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
  low:      { label: 'LOW',      bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
};

const IS: CSSProperties = {
  fontSize: '12px', border: '1.5px solid #E2E8F0',
  background: '#F8FAFC', color: '#0F172A',
  borderRadius: '8px', padding: '7px 10px', outline: 'none', width: '100%',
};

export function StepLicenseGap({ licenseGaps, setLicenseGaps, existingLicenses }: Props) {

  const addGap = () => {
    const empty: LicenseGapItem = {
      id: `gap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product: '',
      productCode: '',
      currentQuantity: '',
      recommendedAdditional: '',
      priority: 'medium',
      rationale: '',
    };
    setLicenseGaps((prev) => [...prev, empty]);
  };

  const prefillFromLicense = (lic: LicenseItem) => {
    const empty: LicenseGapItem = {
      id: `gap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product: lic.product,
      productCode: lic.productCode || '',
      currentQuantity: lic.quantity || '',
      recommendedAdditional: '',
      priority: 'medium',
      rationale: '',
    };
    setLicenseGaps((prev) => [...prev, empty]);
  };

  const upd = (id: string, patch: Partial<LicenseGapItem>) =>
    setLicenseGaps((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const del = (id: string) => setLicenseGaps((prev) => prev.filter((g) => g.id !== id));

  const prefillCandidates = existingLicenses.filter(
    (lic) => !licenseGaps.some((g) => g.product === lic.product && (lic.productCode || '') === (g.productCode || '')),
  );

  return (
    <div className="space-y-[13px]">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(8,145,178,0.1)' }}>
            <KeyRound size={15} style={{ color: '#0891B2' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>License Gap</div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
              {licenseGaps.length === 0
                ? 'Record products where the customer needs additional licenses — appears in the report as "Recommended License Extension"'
                : `${licenseGaps.length} product gap${licenseGaps.length === 1 ? '' : 's'} recorded · each line is sized per product`}
            </div>
          </div>
          <button
            onClick={addGap}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg,#0891B2,#06B6D4)', boxShadow: '0 2px 8px rgba(8,145,178,0.28)' }}
          >
            <Plus size={13} /> Add License Gap
          </button>
        </div>
      </div>

      {/* Quick-add from existing licenses */}
      {prefillCandidates.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] p-[14px_18px]">
          <div className="flex items-center gap-2 mb-2.5">
            <ArrowUpRight size={13} style={{ color: '#0891B2' }} />
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Quick-add from existing licenses
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {prefillCandidates.map((lic) => (
              <button
                key={lic.id}
                onClick={() => prefillFromLicense(lic)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all"
                style={{
                  fontSize: '11px', fontWeight: 600, color: '#0E7490',
                  background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.22)',
                  cursor: 'pointer',
                }}
                title={`${lic.product}${lic.productCode ? ` · ${lic.productCode}` : ''} · current qty ${lic.quantity || '—'}`}
              >
                <Plus size={10} />
                <span>{lic.product.length > 38 ? lic.product.slice(0, 36) + '…' : lic.product}</span>
                {lic.quantity && <span style={{ fontFamily: 'monospace', opacity: 0.65 }}>· {lic.quantity}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {licenseGaps.length === 0 && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center gap-3"
          style={{ background: '#fff', border: '1.5px dashed #E2E8F0' }}
        >
          <KeyRound size={26} style={{ color: '#CBD5E1' }} />
          <div style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', lineHeight: 1.6, maxWidth: '460px' }}>
            No license gaps recorded yet. Add a gap entry for any product where the customer
            should consider expanding licensing — the entries appear in the final report as
            <strong> Recommended License Extension</strong> right under the License Gap Analysis table.
          </div>
          <button
            onClick={addGap}
            className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg,#0891B2,#06B6D4)' }}
          >
            <Plus size={13} /> Add the first license gap
          </button>
        </div>
      )}

      {/* Gap cards */}
      {licenseGaps.map((g, idx) => {
        const prioCfg = PRIORITY_CFG[g.priority ?? 'medium'];
        const recN = parseInt(g.recommendedAdditional, 10);
        const curN = parseInt(g.currentQuantity ?? '', 10);
        const totalAfter = Number.isFinite(recN) && Number.isFinite(curN) ? curN + recN : null;

        return (
          <div
            key={g.id}
            className="bg-white rounded-xl border overflow-hidden"
            style={{ borderColor: 'rgba(15,41,82,0.08)', boxShadow: '0 1px 3px rgba(15,41,82,0.06)' }}
          >
            <div
              className="flex items-center gap-3 p-[14px_18px]"
              style={{ background: '#F8FAFC', borderBottom: '1px solid #EEF0F5' }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(8,145,178,0.12)', color: '#0891B2', fontWeight: 800, fontSize: '12px', fontFamily: 'monospace' }}
              >
                {String(idx + 1).padStart(2, '0')}
              </div>
              <div className="flex-1" style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                {g.product || <span style={{ color: '#94A3B8', fontWeight: 500, fontStyle: 'italic' }}>(unnamed product)</span>}
                {g.productCode && (
                  <span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', fontWeight: 500 }}>
                    {g.productCode}
                  </span>
                )}
              </div>
              <span
                className="px-2 py-0.5 rounded font-bold"
                style={{
                  fontSize: '9.5px', letterSpacing: '0.06em',
                  background: prioCfg.bg, color: prioCfg.color, border: `1px solid ${prioCfg.border}`,
                }}
              >
                {prioCfg.label}
              </span>
              <button
                onClick={() => del(g.id)}
                className="w-7 h-7 rounded flex items-center justify-center transition-all"
                style={{ color: '#CBD5E1' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="p-[16px_18px] grid grid-cols-12 gap-3">
              {/* Product name */}
              <div className="col-span-7">
                <label style={labelStyle}>PRODUCT</label>
                <input
                  value={g.product}
                  onChange={(e) => upd(g.id, { product: e.target.value })}
                  placeholder="e.g. Forcepoint DLP Endpoint (IP Protection)"
                  style={IS}
                />
              </div>
              {/* Product code */}
              <div className="col-span-5">
                <label style={labelStyle}>PRODUCT CODE (OPTIONAL)</label>
                <input
                  value={g.productCode ?? ''}
                  onChange={(e) => upd(g.id, { productCode: e.target.value })}
                  placeholder="e.g. FDLPEIP"
                  style={{ ...IS, fontFamily: 'monospace' }}
                />
              </div>

              {/* Current qty */}
              <div className="col-span-3">
                <label style={labelStyle}>CURRENT QTY</label>
                <input
                  type="number" min={0}
                  value={g.currentQuantity ?? ''}
                  onChange={(e) => upd(g.id, { currentQuantity: e.target.value })}
                  placeholder="e.g. 20000"
                  style={{ ...IS, fontFamily: 'monospace', textAlign: 'right' }}
                />
              </div>
              {/* Recommended additional */}
              <div className="col-span-3">
                <label style={{ ...labelStyle, color: '#0E7490' }}>+ ADDITIONAL</label>
                <input
                  type="number" min={0}
                  value={g.recommendedAdditional}
                  onChange={(e) => upd(g.id, { recommendedAdditional: e.target.value })}
                  placeholder="e.g. 5000"
                  style={{ ...IS, fontFamily: 'monospace', textAlign: 'right', borderColor: '#A5F3FC', background: '#F0FDFF' }}
                />
              </div>
              {/* Total */}
              <div className="col-span-3">
                <label style={labelStyle}>TOTAL AFTER</label>
                <div
                  style={{
                    ...IS, background: '#F8FAFC', color: totalAfter == null ? '#94A3B8' : '#0F172A',
                    fontFamily: 'monospace', textAlign: 'right', fontWeight: 700, fontSize: '12.5px',
                  }}
                >
                  {totalAfter == null ? '—' : totalAfter.toLocaleString()}
                </div>
              </div>
              {/* Priority */}
              <div className="col-span-3">
                <label style={labelStyle}>PRIORITY</label>
                <select
                  value={g.priority ?? 'medium'}
                  onChange={(e) => upd(g.id, { priority: e.target.value as LicenseGapItem['priority'] })}
                  style={{ ...IS, cursor: 'pointer' }}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Rationale */}
              <div className="col-span-12">
                <label style={labelStyle}>RATIONALE (OPTIONAL)</label>
                <textarea
                  value={g.rationale ?? ''}
                  onChange={(e) => upd(g.id, { rationale: e.target.value })}
                  placeholder="Why this gap exists — new business unit, M&A, headcount growth, expanded scope, etc."
                  rows={2}
                  style={{ ...IS, resize: 'none', lineHeight: 1.6 } as CSSProperties}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.07em',
  color: '#64748B',
  marginBottom: '5px',
};

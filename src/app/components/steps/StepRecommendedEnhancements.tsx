import { Check, Sparkles, Award, Lightbulb } from 'lucide-react';
import { ENHANCEMENTS, ENHANCEMENT_IDS, type Enhancement } from '../../constants/enhancements';

interface Props {
  selectedEnhancements: string[];
  setSelectedEnhancements: React.Dispatch<React.SetStateAction<string[]>>;
}

export function StepRecommendedEnhancements({ selectedEnhancements, setSelectedEnhancements }: Props) {
  const selected = new Set(selectedEnhancements);

  const toggle = (id: string) =>
    setSelectedEnhancements(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => setSelectedEnhancements([...ENHANCEMENT_IDS]);
  const selectNone = () => setSelectedEnhancements([]);

  return (
    <div className="space-y-[13px]">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952' }}>Recommended Enhancements</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', maxWidth: '720px' }}>
            Select the Forcepoint product enhancements you want to surface as proposed next-step initiatives for the customer.
            Selected items appear in a dedicated section at the end of the executive PDF report with full business justification.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono px-2.5 py-1 rounded-lg"
            style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(234,88,12,0.07)', color: '#EA580C', border: '1px solid rgba(234,88,12,0.18)' }}>
            {selected.size} / {ENHANCEMENTS.length} selected
          </span>
          <button onClick={selectAll}
            className="px-3 py-1.5 rounded-lg font-semibold"
            style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0', cursor: 'pointer' }}>
            All
          </button>
          <button onClick={selectNone}
            className="px-3 py-1.5 rounded-lg font-semibold"
            style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0', cursor: 'pointer' }}>
            None
          </button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-[12px]">
        {ENHANCEMENTS.map(e => (
          <EnhancementCard key={e.id} enhancement={e} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} />
        ))}
      </div>

      {/* Footer hint */}
      <div className="bg-white rounded-xl p-[12px_18px] flex items-center gap-3"
        style={{ border: '1px dashed #E2E8F0' }}>
        <Lightbulb size={14} style={{ color: '#EA580C', flexShrink: 0 }} />
        <div style={{ fontSize: '11px', color: '#64748B' }}>
          Click any card to toggle. Only selected enhancements appear in the customer report. Use the "All" button to recommend every available enhancement.
        </div>
      </div>
    </div>
  );
}

function EnhancementCard({ enhancement: e, selected, onToggle }: { enhancement: Enhancement; selected: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background: selected ? '#fff' : '#FAFCFF',
        border: selected ? `2px solid ${e.accent}` : '1.5px solid #E2E8F0',
        boxShadow: selected ? `0 4px 14px ${e.accent}22` : '0 1px 4px rgba(15,41,82,0.04)',
      }}>

      {/* Header */}
      <div className="flex items-center gap-3 p-[14px_18px]"
        style={{ background: selected ? `${e.accent}0c` : 'transparent', borderBottom: selected ? `1px solid ${e.accent}33` : '1px solid #F1F5F9' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: selected ? `${e.accent}18` : '#F1F5F9', fontSize: '18px' }}>
          {e.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: selected ? e.accent : '#0F2952' }}>
              {e.shortName}
            </span>
            <span className="font-mono px-1.5 py-0.5 rounded"
              style={{ fontSize: '8.5px', fontWeight: 700, background: `${e.accent}15`, color: e.accent, border: `1px solid ${e.accent}33` }}>
              {e.category.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>
            {e.name}
          </div>
        </div>
        <div className="flex items-center justify-center flex-shrink-0 rounded-full"
          style={{ width: '24px', height: '24px', border: selected ? `2px solid ${e.accent}` : '2px solid #CBD5E1', background: selected ? e.accent : 'transparent', transition: 'all 0.15s' }}>
          {selected && <Check size={13} color="#fff" strokeWidth={3} />}
        </div>
      </div>

      {/* Tagline */}
      <div className="p-[12px_18px_8px]">
        <div className="flex items-start gap-2">
          <Sparkles size={11} style={{ color: e.accent, marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#0F172A', lineHeight: 1.5 }}>
            {e.tagline}
          </div>
        </div>
      </div>

      {/* Why + Business value (always shown, dimmed when unselected) */}
      <div className="p-[0_18px_14px]" style={{ opacity: selected ? 1 : 0.7 }}>
        <div className="mt-2.5">
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: '3px' }}>
            WHY WE RECOMMEND IT
          </div>
          <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.6 }}>
            {e.whyWeRecommendIt}
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
            <Award size={10} style={{ color: e.accent }} />
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: e.accent, letterSpacing: '0.06em' }}>BUSINESS VALUE</span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#334155', lineHeight: 1.6 }}>
            {e.businessValue}
          </div>
        </div>
      </div>
    </div>
  );
}

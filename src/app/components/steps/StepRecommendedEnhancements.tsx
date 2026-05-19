import { useState } from 'react';
import { Check, Sparkles, Award, Lightbulb, Edit2, RotateCcw, X } from 'lucide-react';
import { ENHANCEMENTS, ENHANCEMENT_IDS, type Enhancement } from '../../constants/enhancements';
import type { EnhancementOverride } from '../Dashboard';

interface Props {
  selectedEnhancements: string[];
  setSelectedEnhancements: React.Dispatch<React.SetStateAction<string[]>>;
  enhancementOverrides: Record<string, EnhancementOverride>;
  setEnhancementOverrides: React.Dispatch<React.SetStateAction<Record<string, EnhancementOverride>>>;
}

/** Merge catalogue defaults with any per-session overrides. The returned
    object has the shape of an Enhancement and is safe to use everywhere
    the catalogue Enhancement was used (rendering, report HTML). */
export function mergeEnhancement(e: Enhancement, ovr?: EnhancementOverride): Enhancement {
  if (!ovr) return e;
  return {
    ...e,
    name: ovr.name?.trim() ? ovr.name : e.name,
    tagline: ovr.tagline?.trim() ? ovr.tagline : e.tagline,
    whyWeRecommendIt: ovr.whyWeRecommendIt?.trim() ? ovr.whyWeRecommendIt : e.whyWeRecommendIt,
    businessValue: ovr.businessValue?.trim() ? ovr.businessValue : e.businessValue,
  };
}

export function StepRecommendedEnhancements({ selectedEnhancements, setSelectedEnhancements, enhancementOverrides, setEnhancementOverrides }: Props) {
  const selected = new Set(selectedEnhancements);
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelectedEnhancements(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => setSelectedEnhancements([...ENHANCEMENT_IDS]);
  const selectNone = () => setSelectedEnhancements([]);

  const updateOverride = (id: string, patch: Partial<EnhancementOverride>) =>
    setEnhancementOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const resetOverride = (id: string) =>
    setEnhancementOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const overrideCount = Object.keys(enhancementOverrides).filter((k) =>
    enhancementOverrides[k] && (enhancementOverrides[k].name || enhancementOverrides[k].tagline || enhancementOverrides[k].whyWeRecommendIt || enhancementOverrides[k].businessValue)
  ).length;

  return (
    <div className="space-y-[13px]">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952' }}>Recommended Enhancements</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', maxWidth: '720px' }}>
            Select the Forcepoint product enhancements you want to surface as proposed next-step initiatives for the customer.
            Click <strong>Edit</strong> on any card to tailor the name, tagline, "Why we recommend it", or "Business value" text for this customer — the catalogue defaults stay intact.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono px-2.5 py-1 rounded-lg"
            style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(234,88,12,0.07)', color: '#EA580C', border: '1px solid rgba(234,88,12,0.18)' }}>
            {selected.size} / {ENHANCEMENTS.length} selected
          </span>
          {overrideCount > 0 && (
            <span className="font-mono px-2.5 py-1 rounded-lg"
              style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(2,62,138,0.07)', color: '#023E8A', border: '1px solid rgba(2,62,138,0.18)' }}
              title={`${overrideCount} enhancement${overrideCount === 1 ? '' : 's'} have customized text`}>
              {overrideCount} customized
            </span>
          )}
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
        {ENHANCEMENTS.map(e => {
          const ovr = enhancementOverrides[e.id];
          const effective = mergeEnhancement(e, ovr);
          const hasOverride = !!ovr && !!(ovr.name || ovr.tagline || ovr.whyWeRecommendIt || ovr.businessValue);
          return (
            <EnhancementCard
              key={e.id}
              base={e}
              effective={effective}
              hasOverride={hasOverride}
              selected={selected.has(e.id)}
              isEditing={editingId === e.id}
              onToggle={() => toggle(e.id)}
              onEdit={() => setEditingId(editingId === e.id ? null : e.id)}
              onUpdate={(patch) => updateOverride(e.id, patch)}
              onReset={() => resetOverride(e.id)}
            />
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="bg-white rounded-xl p-[12px_18px] flex items-center gap-3"
        style={{ border: '1px dashed #E2E8F0' }}>
        <Lightbulb size={14} style={{ color: '#EA580C', flexShrink: 0 }} />
        <div style={{ fontSize: '11px', color: '#64748B' }}>
          Click any card to toggle selection. Click <strong>Edit</strong> to customize the text for this customer. Click <strong>Reset</strong> to restore the catalogue default. Only selected enhancements appear in the customer report.
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  base: Enhancement;
  effective: Enhancement;
  hasOverride: boolean;
  selected: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onUpdate: (patch: Partial<EnhancementOverride>) => void;
  onReset: () => void;
}

function EnhancementCard({ base: e, effective, hasOverride, selected, isEditing, onToggle, onEdit, onUpdate, onReset }: CardProps) {
  const view = effective;
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: selected ? '#fff' : '#FAFCFF',
        border: selected ? `2px solid ${e.accent}` : '1.5px solid #E2E8F0',
        boxShadow: selected ? `0 4px 14px ${e.accent}22` : '0 1px 4px rgba(15,41,82,0.04)',
      }}>

      {/* Header */}
      <div
        onClick={(ev) => { if (!isEditing) { ev.stopPropagation(); onToggle(); } }}
        className={`flex items-center gap-3 p-[14px_18px] ${isEditing ? '' : 'cursor-pointer'}`}
        style={{ background: selected ? `${e.accent}0c` : 'transparent', borderBottom: selected ? `1px solid ${e.accent}33` : '1px solid #F1F5F9' }}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: selected ? `${e.accent}18` : '#F1F5F9', fontSize: '18px' }}>
          {e.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: selected ? e.accent : '#0F2952' }}>
              {e.shortName}
            </span>
            <span className="font-mono px-1.5 py-0.5 rounded"
              style={{ fontSize: '8.5px', fontWeight: 700, background: `${e.accent}15`, color: e.accent, border: `1px solid ${e.accent}33` }}>
              {e.category.toUpperCase()}
            </span>
            {hasOverride && (
              <span className="px-1.5 py-0.5 rounded font-mono font-bold"
                style={{ fontSize: '8.5px', background: 'rgba(2,62,138,0.1)', color: '#023E8A', border: '1px solid rgba(2,62,138,0.25)', letterSpacing: '0.06em' }}
                title="This enhancement has customized text for this session">
                ✎ EDITED
              </span>
            )}
          </div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>
            {view.name}
          </div>
        </div>
        <button
          onClick={(ev) => { ev.stopPropagation(); onEdit(); }}
          className="flex items-center gap-1 px-2 py-1 rounded transition-all flex-shrink-0"
          style={{
            fontSize: '10px', fontWeight: 600,
            background: isEditing ? e.accent : 'transparent',
            color: isEditing ? '#fff' : '#475569',
            border: `1px solid ${isEditing ? e.accent : '#E2E8F0'}`,
          }}
          title={isEditing ? 'Close editor' : 'Edit text for this customer'}
        >
          {isEditing ? <><X size={10} /> Close</> : <><Edit2 size={10} /> Edit</>}
        </button>
        {hasOverride && !isEditing && (
          <button
            onClick={(ev) => { ev.stopPropagation(); onReset(); }}
            className="flex items-center gap-1 px-2 py-1 rounded transition-all flex-shrink-0"
            style={{ fontSize: '10px', fontWeight: 600, background: 'transparent', color: '#94A3B8', border: '1px solid #E2E8F0' }}
            title="Restore catalogue defaults"
          >
            <RotateCcw size={10} /> Reset
          </button>
        )}
        <div className="flex items-center justify-center flex-shrink-0 rounded-full ml-1"
          style={{ width: '24px', height: '24px', border: selected ? `2px solid ${e.accent}` : '2px solid #CBD5E1', background: selected ? e.accent : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
          onClick={(ev) => { ev.stopPropagation(); onToggle(); }}
        >
          {selected && <Check size={13} color="#fff" strokeWidth={3} />}
        </div>
      </div>

      {/* Body — VIEW mode */}
      {!isEditing && (
        <>
          <div className="p-[12px_18px_8px]">
            <div className="flex items-start gap-2">
              <Sparkles size={11} style={{ color: e.accent, marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#0F172A', lineHeight: 1.5 }}>
                {view.tagline}
              </div>
            </div>
          </div>
          <div className="p-[0_18px_14px]" style={{ opacity: selected ? 1 : 0.7 }}>
            <div className="mt-2.5">
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: '3px' }}>
                WHY WE RECOMMEND IT
              </div>
              <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.6 }}>
                {view.whyWeRecommendIt}
              </div>
            </div>
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
                <Award size={10} style={{ color: e.accent }} />
                <span style={{ fontSize: '9.5px', fontWeight: 700, color: e.accent, letterSpacing: '0.06em' }}>BUSINESS VALUE</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#334155', lineHeight: 1.6 }}>
                {view.businessValue}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Body — EDIT mode */}
      {isEditing && (
        <div className="p-[12px_18px_16px] space-y-2.5"
          style={{ background: `${e.accent}06` }}
        >
          <FieldEditor
            label="Name (full)"
            placeholder={e.name}
            value={effective.name === e.name ? '' : effective.name}
            originalValue={e.name}
            accent={e.accent}
            onChange={(v) => onUpdate({ name: v })}
            multiline={false}
          />
          <FieldEditor
            label="Tagline"
            placeholder={e.tagline}
            value={effective.tagline === e.tagline ? '' : effective.tagline}
            originalValue={e.tagline}
            accent={e.accent}
            onChange={(v) => onUpdate({ tagline: v })}
            multiline
            rows={2}
          />
          <FieldEditor
            label="Why we recommend it"
            placeholder={e.whyWeRecommendIt}
            value={effective.whyWeRecommendIt === e.whyWeRecommendIt ? '' : effective.whyWeRecommendIt}
            originalValue={e.whyWeRecommendIt}
            accent={e.accent}
            onChange={(v) => onUpdate({ whyWeRecommendIt: v })}
            multiline
            rows={4}
          />
          <FieldEditor
            label="Business value"
            placeholder={e.businessValue}
            value={effective.businessValue === e.businessValue ? '' : effective.businessValue}
            originalValue={e.businessValue}
            accent={e.accent}
            onChange={(v) => onUpdate({ businessValue: v })}
            multiline
            rows={4}
          />
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px dashed ${e.accent}33` }}>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold"
              style={{ fontSize: '11px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0' }}
            >
              <RotateCcw size={11} /> Reset to catalogue
            </button>
            <span style={{ fontSize: '10px', color: '#94A3B8', fontStyle: 'italic' }}>
              Empty fields fall back to the catalogue default below.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  label, placeholder, value, originalValue, accent, onChange, multiline, rows,
}: {
  label: string;
  placeholder: string;
  value: string;
  originalValue: string;
  accent: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  const isOverridden = value.trim().length > 0;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </label>
        {isOverridden && (
          <span style={{ fontSize: '8.5px', fontWeight: 700, background: `${accent}18`, color: accent, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em' }}>
            CUSTOM
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 3}
          style={{
            width: '100%', fontSize: '11.5px', padding: '8px 10px', borderRadius: 6,
            border: isOverridden ? `1.5px solid ${accent}` : '1.5px solid #E2E8F0',
            background: '#fff', color: '#0F172A',
            outline: 'none', resize: 'vertical', minHeight: 56, lineHeight: 1.55, fontFamily: 'inherit',
          }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', fontSize: '12px', padding: '7px 10px', borderRadius: 6,
            border: isOverridden ? `1.5px solid ${accent}` : '1.5px solid #E2E8F0',
            background: '#fff', color: '#0F172A', outline: 'none',
          }}
        />
      )}
      {!isOverridden && (
        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px', lineHeight: 1.5, fontStyle: 'italic' }}>
          Default: {originalValue.length > 140 ? originalValue.slice(0, 138) + '…' : originalValue}
        </div>
      )}
    </div>
  );
}

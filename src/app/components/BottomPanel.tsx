import { ChevronLeft, ArrowRight, Save, Check, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { isStepSkipped } from '../constants/steps';

interface BottomPanelProps {
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  stepColor: string;
  saveState: 'idle' | 'saving' | 'saved';
  onSave: () => void;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  blockReason?: string;
  selectedProducts: Record<string, boolean>;
}

export function BottomPanel({
  currentStep,
  totalSteps,
  stepTitle,
  stepColor,
  saveState,
  onSave,
  onCancel,
  onPrev,
  onNext,
  blockReason,
  selectedProducts,
}: BottomPanelProps) {
  /* Dots reflect visible-only steps so a deselected product doesn't show as
     an inert grey dot on the progress strip. */
  const visibleSteps = Array.from({ length: totalSteps }, (_, i) => i + 1)
    .filter((s) => !isStepSkipped(s, selectedProducts));
  const visibleIdx = visibleSteps.indexOf(currentStep);
  const progress = visibleSteps.length > 1
    ? Math.round((Math.max(0, visibleIdx) / (visibleSteps.length - 1)) * 100)
    : 100;
  const isFirst = visibleIdx === 0;
  const isLast = visibleIdx === visibleSteps.length - 1;
  const isBlocked = !!blockReason && !isLast;

  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{
        background: '#FFFFFF',
        borderTop: '1.5px solid #EEF0F5',
        boxShadow: '0 -4px 16px rgba(15,41,82,0.06)',
      }}
    >
      {/* Top progress line */}
      <div className="w-full" style={{ height: '3px', background: '#F1F5F9' }}>
        <div
          className="h-full transition-all duration-500 ease-in-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${stepColor}CC, ${stepColor})`,
            borderRadius: '0 3px 3px 0',
          }}
        />
      </div>

      {/* Main row */}
      <div className="flex items-center px-6 py-3 gap-5">

        {/* Left: step chip + title */}
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0" style={{ width: '220px' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-white flex-shrink-0"
            style={{
              fontSize: '11px',
              background: `linear-gradient(135deg, ${stepColor}, ${stepColor}CC)`,
              boxShadow: `0 3px 10px ${stepColor}35`,
            }}
          >
            {String(currentStep).padStart(2, '0')}
          </div>
          <div className="min-w-0">
            <div
              style={{
                fontSize: '8.5px',
                color: '#94A3B8',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Current Step
            </div>
            <div
              className="truncate"
              style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}
            >
              {stepTitle}
            </div>
          </div>
        </div>

        {/* Center: dots + percentage — driven by visibleSteps so skipped
            steps don't leave grey gaps on the strip. */}
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {visibleSteps.map((s) => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width: s === currentStep ? '18px' : '5px',
                height: '5px',
                background:
                  s < currentStep
                    ? '#86EFAC'
                    : s === currentStep
                    ? stepColor
                    : '#E2E8F0',
              }}
            />
          ))}
          <span
            className="ml-2 font-mono"
            style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}
          >
            {progress}%
          </span>
        </div>

        {/* Validation message */}
        {isBlocked && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.22)' }}>
            <AlertCircle size={12} style={{ color: '#D97706', flexShrink: 0 }} />
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#D97706' }}>{blockReason}</span>
          </div>
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Cancel Session — discards in-progress data and returns to HC Sessions */}
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '12px',
              background: '#FEF2F2',
              color: '#DC2626',
              border: '1.5px solid #FECACA',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; }}
            title="Discard this Health Check session and return to HC Sessions"
          >
            <X size={13} />
            Cancel
          </button>

          {/* Save Session */}
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '12px',
              background:
                saveState === 'saved'
                  ? '#DCFCE7'
                  : saveState === 'saving'
                  ? '#F8FAFC'
                  : '#F8FAFC',
              color:
                saveState === 'saved'
                  ? '#16A34A'
                  : '#475569',
              border:
                saveState === 'saved'
                  ? '1.5px solid #BBF7D0'
                  : '1.5px solid #E2E8F0',
              minWidth: '120px',
            }}
          >
            {saveState === 'saving' ? (
              <>
                <div
                  className="w-3 h-3 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#CBD5E1', borderTopColor: '#64748B' }}
                />
                Saving…
              </>
            ) : saveState === 'saved' ? (
              <>
                <Check size={13} />
                Saved!
              </>
            ) : (
              <>
                <Save size={13} />
                Save Session
              </>
            )}
          </button>

          {/* Divider */}
          <div
            className="flex-shrink-0"
            style={{ width: '1px', height: '28px', background: '#E2E8F0' }}
          />

          {/* Back */}
          <button
            onClick={onPrev}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold transition-all hover:bg-[#EEF2F8]"
            style={{
              fontSize: '12px',
              background: '#F1F5F9',
              color: '#475569',
              border: '1.5px solid #E2E8F0',
              opacity: isFirst ? 0.35 : 1,
              cursor: isFirst ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={14} />
            Back
          </button>

          {/* Continue / Complete */}
          <button
            onClick={!isBlocked ? onNext : undefined}
            disabled={isLast || isBlocked}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl font-semibold text-white transition-all"
            style={{
              fontSize: '12px',
              background: isLast || isBlocked
                ? '#CBD5E1'
                : `linear-gradient(135deg, ${stepColor}, ${stepColor}CC)`,
              cursor: isLast || isBlocked ? 'not-allowed' : 'pointer',
              boxShadow: !isLast && !isBlocked ? `0 4px 14px ${stepColor}40` : 'none',
              minWidth: '120px',
            }}
          >
            {isLast ? (
              <>
                <CheckCircle2 size={13} />
                Complete
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

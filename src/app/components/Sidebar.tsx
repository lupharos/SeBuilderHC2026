import { Check, ChevronRight, Plus } from 'lucide-react';
import type { SessionData } from './Dashboard';
import { STEP_COLORS, STEP_LABELS, TOTAL_STEPS, isStepSkipped } from '../constants/steps';
import type { VersionEntry } from './steps/Step4VersionCheck';
import type { EndpointAgentSummary } from './steps/endpointAgentParser';

interface SidebarProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  sessionData: SessionData;
  onNewSession: () => void;
  selectedProducts: Record<string, boolean>;
  versionEntries?: Record<string, VersionEntry>;
  endpointAgentSummary?: EndpointAgentSummary | null;
}

const ALL_STEPS = Array.from({ length: TOTAL_STEPS }, (_, i) => ({
  id: i + 1,
  label: STEP_LABELS[i + 1] ?? `Step ${i + 1}`,
  code: String(i + 1).padStart(2, '0'),
}));

export function Sidebar({ currentStep, onStepChange, sessionData, onNewSession, selectedProducts, versionEntries, endpointAgentSummary }: SidebarProps) {
  /* Filter out steps the current product scope makes irrelevant. The original
     step IDs are preserved (so STEP_COLORS / state keys still match); the
     sidebar simply doesn't render them. */
  const steps = ALL_STEPS.filter((s) => !isStepSkipped(s.id, selectedProducts, versionEntries, endpointAgentSummary));
  const initials = sessionData.customerName
    ? sessionData.customerName.substring(0, 2).toUpperCase()
    : '—';
  /* Progress is measured against the VISIBLE wizard length, not TOTAL_STEPS,
     so deselecting an unused product doesn't show 7/17 progress when only
     15 steps actually apply. */
  const visibleIdx = steps.findIndex((s) => s.id === currentStep);
  const progress = steps.length > 1
    ? Math.round((Math.max(0, visibleIdx) / (steps.length - 1)) * 100)
    : 100;
  const activeColor = STEP_COLORS[currentStep] || '#3B82F6';

  return (
    <div
      className="w-[248px] flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        background: '#FFFFFF',
        borderRight: '1px solid #EEF0F5',
      }}
    >
      {/* Session Header */}
      <div
        className="px-4 pt-4 pb-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #F0F2F7' }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div
            className="text-[9px] font-bold uppercase tracking-[0.12em]"
            style={{ color: '#94A3B8' }}
          >
            Active Session
          </div>
          <button
            onClick={onNewSession}
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all hover:scale-105"
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              background: 'rgba(37,99,235,0.08)',
              color: '#2563EB',
              border: '1px solid rgba(37,99,235,0.18)',
            }}
            title="Start a new blank session"
          >
            <Plus size={10} strokeWidth={2.5} />
            New
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-white flex-shrink-0"
            style={{
              fontSize: '11px',
              background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)',
              boxShadow: '0 2px 8px rgba(29,78,216,0.2)',
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold truncate"
              style={{ fontSize: '12.5px', color: '#0F172A' }}
            >
              {sessionData.customerName || 'No customer set'}
            </div>
            <div
              className="font-mono truncate mt-0.5"
              style={{ fontSize: '10px', color: '#94A3B8' }}
            >
              {sessionData.forcepointId || 'New session'}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.07em' }}>
              PROGRESS
            </span>
            <span style={{ fontSize: '10px', color: activeColor, fontWeight: 700, fontFamily: 'monospace' }}>
              {progress}%
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${activeColor}, ${activeColor}99)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto py-2 px-2.5">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isActive = step.id === currentStep;
          const isLocked = step.id > currentStep;
          const isLast = index === steps.length - 1;
          const stepColor = STEP_COLORS[step.id] || '#3B82F6';

          return (
            <div key={step.id} className="relative">
              {/* Connector line */}
              {!isLast && (
                <div
                  className="absolute left-[21px] top-[34px] w-px"
                  style={{
                    height: '18px',
                    background: isCompleted ? '#86EFAC' : isActive ? '#BFDBFE' : '#E2E8F0',
                    zIndex: 0,
                  }}
                />
              )}

              <button
                onClick={() => !isLocked && onStepChange(step.id)}
                disabled={isLocked}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-all relative z-10"
                style={{
                  background: isActive ? `${stepColor}0E` : 'transparent',
                  border: isActive ? `1px solid ${stepColor}28` : '1px solid transparent',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.35 : 1,
                  marginBottom: '1px',
                }}
                onMouseEnter={e => {
                  if (!isLocked && !isActive) {
                    e.currentTarget.style.background = '#F8FAFC';
                  }
                }}
                onMouseLeave={e => {
                  if (!isLocked && !isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Step circle */}
                <div
                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: isCompleted
                      ? '#DCFCE7'
                      : isActive
                      ? `${stepColor}18`
                      : '#F1F5F9',
                    border: isCompleted
                      ? '1.5px solid #86EFAC'
                      : isActive
                      ? `1.5px solid ${stepColor}60`
                      : '1.5px solid #E2E8F0',
                    boxShadow: isActive ? `0 0 0 3px ${stepColor}10` : 'none',
                  }}
                >
                  {isCompleted ? (
                    <Check size={11} style={{ color: '#16A34A' }} strokeWidth={2.5} />
                  ) : (
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: isActive ? stepColor : '#94A3B8',
                      }}
                    >
                      {step.code}
                    </span>
                  )}
                </div>

                {/* Step label */}
                <div className="flex-1 text-left min-w-0">
                  <div
                    className="truncate"
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? stepColor : isCompleted ? '#374151' : '#64748B',
                    }}
                  >
                    {step.label}
                  </div>
                </div>

                {isActive && (
                  <ChevronRight size={12} style={{ color: stepColor, flexShrink: 0, opacity: 0.7 }} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #F0F2F7' }}
      >
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
        >
          <div>
            <div style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.07em' }}>STEP</div>
            <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {String(currentStep).padStart(2, '0')}
              <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 400 }}> / {String(TOTAL_STEPS).padStart(2, '0')}</span>
            </div>
          </div>
          {/* Conic progress circle */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(${activeColor} ${progress * 3.6}deg, #E2E8F0 0deg)`,
              boxShadow: `0 0 0 3px white, 0 0 0 3.5px ${activeColor}20`,
            }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'white' }}
            >
              <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'monospace', color: activeColor }}>
                {progress}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
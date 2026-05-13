import { Shield, AlertTriangle, XCircle, FileText } from 'lucide-react';

interface CancelSessionModalProps {
  customerName: string;
  forcepointId: string;
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  filledFieldCount: number;   // rough "how much will be lost" indicator
  onConfirm: () => void;
  onCancel: () => void;
}

/* ─── Discard-session modal — matches the Sign Out modal styling ─── */
export function CancelSessionModal({
  customerName,
  forcepointId,
  currentStep,
  totalSteps,
  stepTitle,
  filledFieldCount,
  onConfirm,
  onCancel,
}: CancelSessionModalProps) {
  const initials = customerName ? customerName.substring(0, 2).toUpperCase() : 'HC';
  const progress = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,18,35,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-[420px] rounded-2xl overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 24px 60px rgba(10,18,35,0.18)', border: '1px solid #E2E8F0' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Shield size={15} className="text-blue-300" />
          </div>
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>
              Forcepoint Intelligence Platform
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
              DISCARD HC SESSION
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pt-6 pb-5">
          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
              <AlertTriangle size={20} style={{ color: '#DC2626' }} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Cancel Health Check Session?
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6 }}>
                All in-progress data will be cleared from memory and you'll return to the HC Sessions page. Previously saved sessions are not affected.
              </div>
            </div>
          </div>

          {/* Session info card */}
          <div className="rounded-xl p-3 mb-4"
            style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: 8 }}>
              CURRENT SESSION
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ fontSize: '11px', background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)' }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                  {customerName || 'Unnamed Customer'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {forcepointId ? `ID: ${forcepointId} · ` : ''}Step {currentStep}/{totalSteps} — {stepTitle}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full flex-shrink-0"
                style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#B45309' }}>{progress}%</span>
              </div>
            </div>
          </div>

          {/* "What will be cleared" */}
          <div className="rounded-xl p-3 mb-5"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <XCircle size={12} style={{ color: '#DC2626' }} />
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#991B1B', letterSpacing: '0.07em' }}>
                THIS WILL CLEAR
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#7F1D1D', lineHeight: 1.6 }}>
              Customer info, product scope, checklist answers, version data, server details, recommendations,
              action items, feature requests, DLP bundles, certificates, and recommended enhancements.
            </div>
            {filledFieldCount > 0 && (
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px dashed #FECACA' }}>
                <FileText size={11} style={{ color: '#991B1B' }} />
                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#991B1B' }}>
                  ~{filledFieldCount} field{filledFieldCount !== 1 ? 's' : ''} have been filled and will be lost.
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl font-semibold transition-all"
              style={{ fontSize: '13px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; }}
            >
              Keep Working
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{ fontSize: '13px', background: 'linear-gradient(135deg, #DC2626, #B91C1C)', boxShadow: '0 3px 12px rgba(220,38,38,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <XCircle size={13} />
              Discard Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

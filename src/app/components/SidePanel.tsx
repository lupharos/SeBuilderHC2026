import { useState } from 'react';
import { X, LogOut, Mail, Shield, AlertTriangle } from 'lucide-react';
import type { PanelType } from './Dashboard';

interface SidePanelProps {
  panelType: PanelType;
  onClose: () => void;
  onNavigate: (step: number) => void;
  onLogout?: () => void;
}

/* ─── Corporate Logout Modal ─── */
function LogoutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,18,35,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-[380px] rounded-2xl overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 24px 60px rgba(10,18,35,0.18)', border: '1px solid #E2E8F0' }}
        onClick={(e) => e.stopPropagation()}
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
              Forcepoint HC Studio
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
              SECURE SESSION MANAGEMENT
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
                Sign Out
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6 }}>
                You are about to sign out of HC Studio. Any unsaved changes will be lost.
              </div>
            </div>
          </div>

          {/* Session info card */}
          <div className="rounded-xl p-3 mb-5"
            style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: 8 }}>
              ACTIVE SESSION
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ fontSize: '11px', background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)' }}>
                FP
              </div>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>Admin User</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>admin@forcepoint.com · EMEA · SE</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full flex-shrink-0"
                style={{ background: '#DCFCE7', border: '1px solid #BBF7D0' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#16A34A' }}>ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl font-semibold transition-all"
              style={{ fontSize: '13px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{ fontSize: '13px', background: 'linear-gradient(135deg, #DC2626, #B91C1C)', boxShadow: '0 3px 12px rgba(220,38,38,0.25)' }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const templateList = [
  { name: 'Appliance HC',       desc: '48 questions · 6 sections', color: '#0F2952',  tag: 'V-SERIES',      step: 5 },
  { name: 'Web Security HC',    desc: '42 questions · 6 sections', color: '#2563EB',  tag: 'WEB',           step: 5 },
  { name: 'Email Security HC',  desc: '40 questions · 6 sections', color: '#7C3AED',  tag: 'EMAIL',         step: 5 },
  { name: 'Data Security HC',   desc: '41 questions · 6 sections', color: '#0D9488',  tag: 'DLP',           step: 5 },
  { name: 'NGFW HC',            desc: '85 questions · 8 sections', color: '#D97706',  tag: 'NGFW',          step: 5 },
  { name: 'DSPM HC',            desc: '46 questions · 6 sections', color: '#EA580C',  tag: 'DSPM',          step: 5 },
  { name: 'Classification HC',  desc: '51 questions · 7 sections', color: '#16A34A',  tag: 'CLASS',         step: 5 },
];

export function SidePanel({ panelType, onClose, onNavigate, onLogout }: SidePanelProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    onLogout ? onLogout() : window.location.reload();
  };

  return (
    <>
    {showLogoutModal && (
      <LogoutModal
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutModal(false)}
      />
    )}
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        width: '320px',
        background: '#FFFFFF',
        borderLeft: '1px solid #EEF0F5',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.05)',
      }}
    >
      {/* Panel Header */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #F0F2F7' }}
      >
        <div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#0F172A',
            }}
          >
            {panelType === 'templates' ? 'HC Templates' : 'My Profile'}
          </div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>
            {panelType === 'templates'
              ? 'Select a template for Step 5'
              : 'Account settings & session'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: '#F1F5F9', color: '#64748B' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {panelType === 'templates' && (
          <div className="space-y-2">
            <p style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '12px', lineHeight: 1.6 }}>
              Pre-built question sets. Click <strong>Use Template</strong> to navigate to Step 5 with the selected checklist.
            </p>
            {templateList.map((tmpl) => (
              <button
                key={tmpl.tag}
                onClick={() => onNavigate(tmpl.step)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group"
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #EEF0F5',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${tmpl.color}40`;
                  e.currentTarget.style.background = `${tmpl.color}08`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#EEF0F5';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
              >
                {/* Color bar */}
                <div
                  className="w-1 h-9 rounded-full flex-shrink-0"
                  style={{ background: tmpl.color }}
                />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                    {tmpl.name}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
                    {tmpl.desc}
                  </div>
                </div>
                <span
                  className="px-2 py-0.5 rounded-md flex-shrink-0"
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    background: `${tmpl.color}14`,
                    color: tmpl.color,
                    border: `1px solid ${tmpl.color}28`,
                  }}
                >
                  {tmpl.tag}
                </span>
              </button>
            ))}

            <div
              className="flex items-start gap-2 p-3 rounded-xl mt-3"
              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
            >
              <div className="mt-0.5">💡</div>
              <p style={{ fontSize: '11px', color: '#1D4ED8', lineHeight: 1.6 }}>
                All template questions can be freely edited in Step 5 — Per-Product Checklist.
              </p>
            </div>
          </div>
        )}

        {panelType === 'profile' && (
          <div>
            {/* Avatar */}
            <div className="flex flex-col items-center py-4 mb-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center font-mono font-bold text-white mb-3"
                style={{
                  fontSize: '18px',
                  background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)',
                  boxShadow: '0 8px 24px rgba(29,78,216,0.3)',
                }}
              >
                AD
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                Admin User
              </div>
              <div
                className="flex items-center gap-1.5 mt-1"
                style={{ fontSize: '12px', color: '#64748B' }}
              >
                <Mail size={11} />
                admin@forcepoint.com
              </div>
              <div
                className="mt-2 px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{
                  background: '#DCFCE7',
                  border: '1px solid #BBF7D0',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#16A34A',
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ACTIVE SESSION
              </div>
            </div>

            {/* Info grid */}
            <div
              className="rounded-xl p-3 mb-4 space-y-2.5"
              style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
            >
              {[
                { label: 'Role', value: 'System Engineer' },
                { label: 'Region', value: 'EMEA' },
                { label: 'License', value: 'Enterprise' },
                { label: 'Version', value: 'HC Studio v3.0' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{item.label}</span>
                  <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: 500 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Logout */}
            <button
              onClick={() => setShowLogoutModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-all"
              style={{
                fontSize: '13px',
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FEE2E2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FEF2F2';
              }}
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
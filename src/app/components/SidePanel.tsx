import { useState } from 'react';
import { X, LogOut, Mail, Shield, AlertTriangle } from 'lucide-react';
import type { PanelType } from './Dashboard';
import { VersionCheckCard, useVersionCheck } from './SystemUpgrade';
import { MfaSecurityCard } from './MfaSecurity';
import { useAuth } from '../auth/AuthContext';

interface SidePanelProps {
  panelType: PanelType;
  onClose: () => void;
  onNavigate: (step: number) => void;
}

/* Email helpers — keep the avatar + name labels readable for the
   wider variety of names that now show up in the side panel. */
function emailLocalPart(email: string | undefined): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

function emailInitials(email: string | undefined): string {
  const local = emailLocalPart(email);
  if (!local) return '··';
  /* "kartikarslan" → "KA"; "k.artikarslan" → "KA"; "first.last" → "FL". */
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (local.slice(0, 2)).toUpperCase();
}

/* ─── Corporate Logout Modal ─── */
function LogoutModal({ onConfirm, onCancel, user }: { onConfirm: () => void; onCancel: () => void; user: { email: string; role: 'admin' | 'user' } | null }) {
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
                {emailInitials(user?.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emailLocalPart(user?.email) || 'Signed in'}</div>
                <div style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email ?? '—'} · {user?.role === 'admin' ? 'ADMIN' : 'USER'}
                </div>
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

export function SidePanel({ panelType, onClose, onNavigate }: SidePanelProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { user, logout } = useAuth();
  /* Single hook drives the Profile panel's release-management card.
     Fires a one-shot fetch to GitHub for the latest versioncheck.json
     and exposes a refresh() the operator can trigger manually. */
  const versionCheck = useVersionCheck();

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    /* Real logout: invalidates the session server-side and clears
       the local token. AuthProvider unmounts Dashboard once the
       user goes null, falling back to the LoginScreen. */
    logout();
  };

  return (
    <>
    {showLogoutModal && (
      <LogoutModal
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutModal(false)}
        user={user ? { email: user.email, role: user.role } : null}
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
            {/* Avatar — derives initials + display name from the
                signed-in user's email. Role badge swaps between
                ADMIN (blue) and USER (grey) instead of the old
                fixed "Active session" pill. */}
            <div className="flex flex-col items-center py-4 mb-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center font-mono font-bold text-white mb-3"
                style={{
                  fontSize: '18px',
                  background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)',
                  boxShadow: '0 8px 24px rgba(29,78,216,0.3)',
                }}
              >
                {emailInitials(user?.email)}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                {emailLocalPart(user?.email) || 'Signed in'}
              </div>
              <div
                className="flex items-center gap-1.5 mt-1"
                style={{ fontSize: '12px', color: '#64748B' }}
              >
                <Mail size={11} />
                {user?.email ?? '—'}
              </div>
              <div
                className="mt-2 px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{
                  background: user?.role === 'admin' ? '#EFF6FF' : '#DCFCE7',
                  border: `1px solid ${user?.role === 'admin' ? '#BFDBFE' : '#BBF7D0'}`,
                  fontSize: '10px',
                  fontWeight: 700,
                  color: user?.role === 'admin' ? '#1D4ED8' : '#16A34A',
                  letterSpacing: '0.06em',
                }}
              >
                <Shield size={9} />
                {user?.role === 'admin' ? 'ADMINISTRATOR' : 'USER'}
              </div>
            </div>

            {/* Info grid — pulls from the live session. Registered/
                last sign-in are useful for the SE to verify which
                account they're using on a shared lab machine. */}
            <div
              className="rounded-xl p-3 mb-4 space-y-2.5"
              style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
            >
              {[
                { label: 'Status', value: user?.status ? user.status.toUpperCase() : '—' },
                { label: 'Role', value: user?.role === 'admin' ? 'Administrator' : 'System Engineer' },
                { label: 'Registered', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
                { label: 'Last sign-in', value: user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—' },
                { label: 'Version', value: `${__BUILD_INFO__.productName} ${__BUILD_INFO__.productVersion}` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{item.label}</span>
                  <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: 500 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Security — Two-Factor Authentication management.
                Sits ABOVE Version Check so account security is the
                first thing the user sees after the account info
                grid. Enrollment, disable, and backup-code regen all
                open dedicated modals over the panel. */}
            <MfaSecurityCard />

            {/* Version Check — pulls versioncheck.json straight from
                the GitHub repo and compares against the version baked
                into this bundle. When they differ the panel shows the
                exact SSH command the operator runs on the Ubuntu host
                to pull, redeploy, and statuscheck. */}
            <VersionCheckCard state={versionCheck} />

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
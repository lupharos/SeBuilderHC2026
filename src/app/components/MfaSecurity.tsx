import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck, ShieldOff, Smartphone, KeyRound, RefreshCw, Copy, Check,
  Download, AlertTriangle, X, Lock, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

/* ─── Security card ─────────────────────────────────────────────────
   Lives inside the Profile side panel. Surfaces the current MFA
   status and exposes Enable / Disable / "Show backup codes" /
   "Regenerate codes" actions. The actual flows open modal
   overlays so the small panel area doesn't get cramped. */
export function MfaSecurityCard() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState<null | 'enroll' | 'disable' | 'regenerate' | 'password'>(null);

  if (!user) return null;

  const enabled = user.mfaEnabled;
  const remaining = user.backupCodesRemaining;
  /* Low-backup-code warning — anything ≤3 of the original 10 nudges
     the user to regenerate before they're stuck without recovery. */
  const lowBackup = enabled && remaining <= 3;

  return (
    <>
      <div className="rounded-xl p-3 mb-3"
        style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: enabled ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.08)' }}>
            {enabled
              ? <ShieldCheck size={13} style={{ color: '#16A34A' }} strokeWidth={2.5} />
              : <ShieldOff size={13} style={{ color: '#DC2626' }} strokeWidth={2.5} />}
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>Two-Factor Authentication</div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              {enabled
                ? `Authenticator app enrolled · ${remaining} backup code${remaining === 1 ? '' : 's'} remaining`
                : 'Disabled · sign-in uses email + password only'}
            </div>
          </div>
        </div>

        {lowBackup && (
          <div className="px-2 py-1.5 rounded-md mb-2 flex items-start gap-1.5"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={11} style={{ color: '#B58800', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: '10px', color: '#92400E', lineHeight: 1.5 }}>
              Only {remaining} backup code{remaining === 1 ? '' : 's'} left. Regenerate to mint a new set of 10.
            </span>
          </div>
        )}

        {enabled ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => setOpen('regenerate')}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              <RefreshCw size={11} /> Regen codes
            </button>
            <button onClick={() => setOpen('disable')}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '11px', background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
              <ShieldOff size={11} /> Disable
            </button>
          </div>
        ) : (
          <button onClick={() => setOpen('enroll')}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold transition-all"
            style={{
              fontSize: '12px',
              background: 'linear-gradient(135deg, #1D4ED8, #1E40AF)',
              color: '#fff',
              border: '1px solid transparent',
              boxShadow: '0 2px 8px rgba(29,78,216,0.25)',
            }}>
            <ShieldCheck size={12} /> Enable two-factor
          </button>
        )}

        {/* Password is a separate concern from MFA but lives in the same
            security card — always available regardless of MFA state. */}
        <div style={{ height: 1, background: '#EEF0F5', margin: '10px 0' }} />
        <button onClick={() => setOpen('password')}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-all"
          style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
          <KeyRound size={11} /> Change password
        </button>
      </div>

      {open === 'enroll' && (
        <EnrollmentModal onDone={() => { refreshUser(); setOpen(null); }} onClose={() => setOpen(null)} />
      )}
      {open === 'disable' && (
        <DisableModal onDone={() => { refreshUser(); setOpen(null); }} onClose={() => setOpen(null)} />
      )}
      {open === 'regenerate' && (
        <RegenerateModal onDone={() => { refreshUser(); setOpen(null); }} onClose={() => setOpen(null)} />
      )}
      {open === 'password' && (
        <ChangePasswordModal onDone={() => setOpen(null)} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/* ─── Change-password modal (self-service) ───────────────────────────
   Re-auth gated on the current password (same pattern as Disable MFA).
   POST /api/auth/password — the server keeps this session alive and
   revokes the account's other sessions. */
function ChangePasswordModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}`);
        return;
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Change password" onClose={onClose}>
      {done ? (
        <>
          <div className="px-3 py-2.5 rounded-md mb-3 flex items-start gap-2"
            style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <Check size={14} style={{ color: '#16A34A', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '11.5px', color: '#15803D', lineHeight: 1.5 }}>
              Password updated. This session stays signed in; any other devices were signed out.
            </div>
          </div>
          <button onClick={onDone}
            className="w-full py-2.5 rounded-xl font-semibold text-white"
            style={{ fontSize: '13px', background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
            Done
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Current password</Label>
            <PasswordField value={current} onChange={setCurrent} autoComplete="current-password" />
          </div>
          <div>
            <Label>New password</Label>
            <PasswordField value={next} onChange={setNext} autoComplete="new-password" />
            {tooShort && <div style={{ fontSize: '10.5px', color: '#DC2626', marginTop: 5 }}>Must be at least 8 characters.</div>}
          </div>
          <div>
            <Label>Confirm new password</Label>
            <PasswordField value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {mismatch && <div style={{ fontSize: '10.5px', color: '#DC2626', marginTop: 5 }}>Passwords don't match.</div>}
          </div>
          {error && <InlineError message={error} />}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose}
              className="py-2 rounded-lg font-semibold"
              style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="py-2 rounded-lg font-semibold text-white"
              style={{
                fontSize: '12.5px',
                background: !canSubmit ? '#93C5FD' : 'linear-gradient(135deg, #1D4ED8, #1E40AF)',
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
              }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

/* ─── Enrollment modal ────────────────────────────────────────────── */
type EnrollPhase = 'loading' | 'qr' | 'confirm' | 'codes' | 'error';

function EnrollmentModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [phase, setPhase] = useState<EnrollPhase>('loading');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);

  /* Kick off enrollment on mount. Server returns the secret + the
     otpauth URI; we render the URI as an SVG QR code locally. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/mfa/enroll/begin', { method: 'POST' });
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok || !json.ok) {
          setError(json.error || `Server returned ${r.status}`);
          setPhase('error');
          return;
        }
        setSecret(json.secret);
        setOtpauthUri(json.otpauthUri);
        const svg = await QRCode.toString(json.otpauthUri, {
          type: 'svg',
          margin: 1,
          width: 220,
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
        if (!cancelled) {
          setQrSvg(svg);
          setPhase('qr');
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setPhase('error');
        }
      }
    })();
    /* If the modal closes mid-flight, fire-and-forget the cancel
       so the server-side draft doesn't sit around for 10 minutes. */
    return () => {
      cancelled = true;
      fetch('/api/auth/mfa/enroll/cancel', { method: 'POST' }).catch(() => { /* swallow */ });
    };
  }, []);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const r = await fetch('/api/auth/mfa/enroll/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}`);
        return;
      }
      setBackupCodes(json.backupCodes || []);
      setPhase('codes');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <ModalShell title={phase === 'codes' ? 'Save your backup codes' : 'Enable two-factor authentication'} onClose={onClose}
      lockClose={phase === 'codes'}>
      {phase === 'loading' && (
        <div className="py-12 flex flex-col items-center gap-3" style={{ color: '#94A3B8', fontSize: '13px' }}>
          <RefreshCw size={18} className="animate-spin" />
          Generating your authenticator secret…
        </div>
      )}

      {phase === 'error' && (
        <div className="py-6 text-center">
          <AlertTriangle size={28} className="mx-auto mb-3" style={{ color: '#DC2626' }} />
          <div style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600, marginBottom: 6 }}>Enrollment failed</div>
          <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>{error}</div>
        </div>
      )}

      {(phase === 'qr' || phase === 'confirm') && (
        <>
          <div className="mb-4" style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
            Scan the QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy, …) and enter the 6-digit code it shows.
          </div>
          <div className="grid grid-cols-[220px_1fr] gap-4 items-start mb-4">
            <div className="rounded-xl p-3 flex items-center justify-center"
              style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>
            <div>
              <Label>Can't scan? Enter manually</Label>
              <CopyableValue value={secret} />
              <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: 8, lineHeight: 1.5 }}>
                Account: <strong style={{ color: '#475569' }}>your email</strong><br />
                Type: <strong style={{ color: '#475569' }}>Time-based (TOTP)</strong><br />
                Digits: 6 · Period: 30s · SHA-1
              </div>
            </div>
          </div>

          <form onSubmit={handleConfirm} className="space-y-3">
            <Label>Enter the 6-digit code from your authenticator app</Label>
            <CodeInput value={code} onChange={setCode} />
            {error && <InlineError message={error} />}
            <button type="submit" disabled={verifying || code.length !== 6}
              className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                fontSize: '13px',
                background: (verifying || code.length !== 6) ? '#93C5FD' : 'linear-gradient(135deg, #16A34A, #15803D)',
                cursor: (verifying || code.length !== 6) ? 'not-allowed' : 'pointer',
                boxShadow: (verifying || code.length !== 6) ? 'none' : '0 3px 14px rgba(22,163,74,0.25)',
              }}>
              {verifying ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying…</> : <><ShieldCheck size={13} /> Activate two-factor</>}
            </button>
          </form>
          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: 12, lineHeight: 1.55 }}>
            Lost the QR? Cancel and start over — the secret is regenerated.
          </div>
        </>
      )}

      {phase === 'codes' && (
        <BackupCodesPanel codes={backupCodes} onContinue={onDone} />
      )}
    </ModalShell>
  );
}

/* ─── Backup codes display ───────────────────────────────────────── */
function BackupCodesPanel({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const blob = codes.join('\n');

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(blob);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const downloadAll = () => {
    const data = `Forcepoint HC Studio — backup codes\nGenerated ${new Date().toLocaleString()}\n\n${blob}\n\nEach code can be used once. Keep them somewhere safe.\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' }));
    a.download = `hc-studio-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <>
      <div className="px-3 py-2 rounded-md mb-3 flex items-start gap-2"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <AlertTriangle size={14} style={{ color: '#B58800', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '11.5px', color: '#92400E', lineHeight: 1.5 }}>
          <strong>This is your only chance to save these codes.</strong>{' '}
          Each code can be used once if you lose access to your authenticator app. They will <strong>never</strong> be shown again.
        </div>
      </div>

      <div className="rounded-xl p-3 mb-3" style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {codes.map((c, i) => (
            <div key={c} className="flex items-center gap-2">
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', fontFamily: 'JetBrains Mono, monospace', minWidth: 18 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <code style={{ fontSize: '13px', color: '#86EFAC', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>
                {c}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={copyAll}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold transition-all"
          style={{ fontSize: '12px', background: copied ? '#F0FDF4' : '#F1F5F9', color: copied ? '#15803D' : '#334155', border: `1px solid ${copied ? '#BBF7D0' : '#E2E8F0'}` }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button onClick={downloadAll}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold transition-all"
          style={{ fontSize: '12px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}>
          <Download size={12} /> Download .txt
        </button>
      </div>

      <label className="flex items-start gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ marginTop: 2 }} />
        <span style={{ fontSize: '12px', color: '#334155', lineHeight: 1.55 }}>
          I have saved my backup codes somewhere safe.
        </span>
      </label>

      <button onClick={onContinue} disabled={!acknowledged}
        className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
        style={{
          fontSize: '13px',
          background: acknowledged ? 'linear-gradient(135deg, #16A34A, #15803D)' : '#93C5FD',
          cursor: acknowledged ? 'pointer' : 'not-allowed',
          boxShadow: acknowledged ? '0 3px 14px rgba(22,163,74,0.25)' : 'none',
        }}>
        I've saved them — finish
        <ChevronRight size={14} />
      </button>
    </>
  );
}

/* ─── Disable modal ──────────────────────────────────────────────── */
function DisableModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}`);
        return;
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <ModalShell title="Disable two-factor authentication" onClose={onClose}>
      <div className="px-3 py-2 rounded-md mb-3 flex items-start gap-2"
        style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
        <AlertTriangle size={14} style={{ color: '#DC2626', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '11.5px', color: '#991B1B', lineHeight: 1.5 }}>
          Disabling MFA removes the secret and all unused backup codes. Sign-in will require email + password only.
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Label>Confirm with your password</Label>
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <InlineError message={error} />}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose}
            className="py-2 rounded-lg font-semibold"
            style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !password}
            className="py-2 rounded-lg font-semibold text-white"
            style={{
              fontSize: '12.5px',
              background: (loading || !password) ? '#FCA5A5' : 'linear-gradient(135deg, #DC2626, #B91C1C)',
              cursor: (loading || !password) ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Disabling…' : 'Disable MFA'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Regenerate-backup-codes modal ──────────────────────────────── */
function RegenerateModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/mfa/backup-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}`);
        return;
      }
      setNewCodes(json.backupCodes);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  if (newCodes) {
    return (
      <ModalShell title="New backup codes" onClose={onDone} lockClose>
        <BackupCodesPanel codes={newCodes} onContinue={onDone} />
      </ModalShell>
    );
  }
  return (
    <ModalShell title="Regenerate backup codes" onClose={onClose}>
      <div className="px-3 py-2 rounded-md mb-3 flex items-start gap-2"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <AlertTriangle size={14} style={{ color: '#B58800', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '11.5px', color: '#92400E', lineHeight: 1.5 }}>
          Generating new backup codes invalidates the current set. You'll get a fresh set of 10 single-use codes.
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Label>Confirm with your password</Label>
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <InlineError message={error} />}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose}
            className="py-2 rounded-lg font-semibold"
            style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !password}
            className="py-2 rounded-lg font-semibold text-white"
            style={{
              fontSize: '12.5px',
              background: (loading || !password) ? '#93C5FD' : 'linear-gradient(135deg, #1D4ED8, #1E40AF)',
              cursor: (loading || !password) ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Working…' : 'Generate new codes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Small UI atoms shared by the modals ────────────────────────── */
function ModalShell({
  title, children, onClose, lockClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** When true, the backdrop click + Esc no-op. Used on the
   *  "Save your backup codes" screen so the user can't accidentally
   *  dismiss it before saving the codes. */
  lockClose?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(10,18,35,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={lockClose ? undefined : onClose}>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          width: 540,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 48px)',
          background: '#fff',
          boxShadow: '0 24px 60px rgba(10,18,35,0.25)',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(29,78,216,0.2)', border: '1px solid rgba(29,78,216,0.35)' }}>
            <Smartphone size={14} className="text-blue-300" />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{title}</div>
          </div>
          {!lockClose && (
            <button onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="px-5 py-4 overflow-y-auto" style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="relative">
      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        className="w-full pl-10 pr-4 py-2.5 rounded-xl outline-none transition-all text-slate-900"
        style={{
          fontSize: '18px',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.2em',
          textAlign: 'center',
          background: '#F8FAFC',
          border: '1.5px solid #E2E8F0',
        }}
        onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
        onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
      />
    </div>
  );
}

function PasswordField({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        placeholder="••••••••••"
        className="w-full pl-10 pr-10 py-2.5 rounded-xl outline-none transition-all text-slate-900"
        style={{ fontSize: '13.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
        onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
        onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
      />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* no clipboard */ }
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md"
      style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
      <code style={{ fontSize: '11px', color: '#86EFAC', fontFamily: 'JetBrains Mono, monospace', flex: 1, wordBreak: 'break-all' }}>
        {value}
      </code>
      <button onClick={copy}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded"
        style={{
          fontSize: '9.5px', fontWeight: 700,
          background: copied ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.06)',
          color: copied ? '#86EFAC' : '#CBD5E1',
          border: `1px solid ${copied ? 'rgba(134,239,172,0.35)' : 'rgba(255,255,255,0.12)'}`,
        }}>
        {copied ? <Check size={9} /> : <Copy size={9} />}
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
      <AlertTriangle size={13} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: '12px', color: '#991B1B', lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

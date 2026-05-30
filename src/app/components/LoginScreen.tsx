import { useEffect, useRef, useState } from 'react';
import { Shield, Mail, Lock, Eye, EyeOff, UserPlus, AlertTriangle, Clock, CheckCircle2, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth, LOGOUT_REASON_KEY } from '../auth/AuthContext';

type Mode = 'login' | 'register';

/* ─── Login screen ───────────────────────────────────────────────────
   Real auth against the System API. Two stacked views:
     • Login   — email + password, surfaces friendly inline messages
                 for pending / rejected / suspended account states.
     • Register — email + password + confirm. Restricted server-side
                  to @forcepoint.com addresses, but we hint at that
                  here too so the operator sees the rule before they
                  hit submit.
   First-user bootstrap is highlighted via /api/auth/info so the very
   first SE to land knows their registration will auto-promote them
   to admin. */
export function LoginScreen() {
  const { login, verifyMfa, register, info } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  /* Surface a one-time "signed out for inactivity" notice when the
     idle timer in AuthContext was what brought us back here. Read +
     clear the flag on mount so it shows once, not on every reload. */
  const [idleNotice, setIdleNotice] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(LOGOUT_REASON_KEY) === 'idle') {
        setIdleNotice(true);
        localStorage.removeItem(LOGOUT_REASON_KEY);
      }
    } catch { /* storage blocked */ }
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* ── Left Panel (decorative) ── */}
      <div className="hidden lg:flex w-[52%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #040C1E 0%, #071428 40%, #0B1F3A 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }} />
        <div className="absolute top-[-120px] left-[-80px] w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #3B82F6, transparent 70%)' }} />
        <div className="absolute bottom-[-80px] right-[-60px] w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #8B5CF6, transparent 70%)' }} />
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-blue-400"
              style={{
                width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px`,
                left: `${(i * 7 + 5) % 95}%`, top: `${(i * 13 + 8) % 90}%`,
                opacity: 0.1 + (i % 5) * 0.04,
                animation: `pulse ${2 + (i % 3)}s ease-in-out infinite`,
                animationDelay: `${(i * 0.4) % 3}s`,
              }} />
          ))}
        </div>
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="200" x2="600" y2="400" stroke="#60A5FA" strokeWidth="1"/>
          <line x1="100" y1="0" x2="500" y2="600" stroke="#818CF8" strokeWidth="0.5"/>
          <line x1="300" y1="0" x2="100" y2="700" stroke="#34D399" strokeWidth="0.5"/>
          <line x1="0" y1="400" x2="700" y2="200" stroke="#60A5FA" strokeWidth="1"/>
        </svg>

        <div className="relative z-10 flex flex-col h-full p-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}>
              <Shield className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-white font-bold tracking-tight" style={{ fontSize: '15px' }}>Forcepoint</span>
              <span className="ml-1.5 font-light text-blue-300" style={{ fontSize: '15px' }}>HC Studio</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-blue-300 font-mono" style={{ fontSize: '10.5px', letterSpacing: '0.08em' }}>
                  {__BUILD_INFO__.productName.toUpperCase()} {__BUILD_INFO__.productVersion}
                </span>
              </div>
              <h1 className="text-white mb-4"
                style={{ fontSize: '38px', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                Security health,<br />
                <span style={{ background: 'linear-gradient(90deg, #60A5FA, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  delivered precisely.
                </span>
              </h1>
              <p className="text-blue-200/60" style={{ fontSize: '14px', lineHeight: 1.7 }}>
                Professional HealthCheck assessments for Forcepoint<br />
                products — structured, scalable, and export-ready.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {['FP', 'SE', 'AD'].map((initials, i) => (
                <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold border-2"
                  style={{ fontSize: '9px', background: ['#2563EB', '#7C3AED', '#0D9488'][i], borderColor: '#040C1E' }}>
                  {initials}
                </div>
              ))}
            </div>
            <span className="text-blue-300/40" style={{ fontSize: '11.5px' }}>Used by Forcepoint SE teams globally</span>
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-[400px] py-4">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}>
              <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-900" style={{ fontSize: '15px' }}>
              Forcepoint <span className="text-blue-600">HC Studio</span>
            </span>
          </div>

          {idleNotice && mode === 'login' && (
            <div className="mb-4 px-3.5 py-3 rounded-xl flex items-start gap-2.5"
              style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Clock size={15} style={{ color: '#B58800', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#92400E' }}>Signed out for inactivity</div>
                <div style={{ fontSize: '11.5px', color: '#A16207', lineHeight: 1.5, marginTop: 2 }}>
                  Your session ended after 15 minutes idle. Please sign in again to continue.
                </div>
              </div>
              <button onClick={() => setIdleNotice(false)}
                style={{ fontSize: '11px', fontWeight: 600, color: '#92400E' }}>Dismiss</button>
            </div>
          )}

          {mode === 'login'
            ? <LoginForm onLogin={login} onVerifyMfa={verifyMfa} onSwitchToRegister={() => setMode('register')} info={info} />
            : <RegisterForm onRegister={register} onSwitchToLogin={() => setMode('login')} info={info} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Login form ─────────────────────────────────────────────────── */
function LoginForm({
  onLogin,
  onVerifyMfa,
  onSwitchToRegister,
  info,
}: {
  onLogin: ReturnType<typeof useAuth>['login'];
  onVerifyMfa: ReturnType<typeof useAuth>['verifyMfa'];
  onSwitchToRegister: () => void;
  info: ReturnType<typeof useAuth>['info'];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  /* Distinguishes pending/rejected/suspended states from a generic
     auth failure so the inline banner can pick the right color +
     icon. */
  const [errorKind, setErrorKind] = useState<'generic' | 'pending' | 'rejected' | 'suspended'>('generic');
  const [loading, setLoading] = useState(false);
  /* MFA challenge state — when the server answers `mfaRequired: true`,
     we squirrel the challenge token here and flip the form into the
     code-prompt view. Password is cleared on the way through to
     limit the time it sits in memory. */
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; expiresInSec: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setErrorKind('generic'); setLoading(true);
    const result = await onLogin(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      if (result.pending)   setErrorKind('pending');
      else if (result.rejected) setErrorKind('rejected');
      else if (result.suspended) setErrorKind('suspended');
      return;
    }
    if ('mfaRequired' in result && result.mfaRequired) {
      setMfaChallenge({ token: result.challengeToken, expiresInSec: result.challengeExpiresInSec });
      setPassword(''); // wipe the password — we don't need it for the code step
      return;
    }
    /* result.ok && !mfaRequired → AuthProvider already swapped to Dashboard,
       no further work for this form. */
  };

  if (mfaChallenge) {
    return (
      <MfaChallengeForm
        email={email}
        challengeToken={mfaChallenge.token}
        expiresInSec={mfaChallenge.expiresInSec}
        onVerify={onVerifyMfa}
        onCancel={() => { setMfaChallenge(null); setError(''); }}
      />
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-slate-900 mb-1.5"
          style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Welcome back
        </h2>
        <p className="text-slate-500" style={{ fontSize: '13.5px' }}>
          {info?.bootstrapMode
            ? 'No accounts yet — register to bootstrap as administrator.'
            : 'Sign in to your HC Studio account'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <TextInput
          label="EMAIL"
          icon={<Mail size={14} />}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@forcepoint.com"
          autoComplete="email"
        />
        <PasswordInput
          label="PASSWORD"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          autoComplete="current-password"
        />

        {error && <InlineErrorBanner kind={errorKind} message={error} />}

        <button
          type="submit"
          disabled={loading || info?.bootstrapMode}
          title={info?.bootstrapMode ? 'No accounts exist yet — register first to bootstrap as administrator.' : ''}
          className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{
            fontSize: '13.5px',
            background: (loading || info?.bootstrapMode) ? '#93C5FD' : 'linear-gradient(135deg, #0F172A, #1E293B)',
            boxShadow: (loading || info?.bootstrapMode) ? 'none' : '0 3px 14px rgba(15,23,42,0.2)',
            cursor: (loading || info?.bootstrapMode) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </>
          ) : 'Sign In →'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        <span style={{ fontSize: '12.5px', color: '#64748B' }}>New here?</span>
        <button
          onClick={onSwitchToRegister}
          className="font-semibold transition-colors"
          style={{ fontSize: '12.5px', color: '#2563EB' }}
        >
          Create an account
        </button>
      </div>

      {/* Footer hint with the allowed-domain rule + admin count.
          Shown small so it doesn't dominate the form but visible
          enough that the SE knows what to expect. */}
      {info && (
        <div className="mt-4 px-3 py-2 rounded-lg" style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}>
          <div style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.5 }}>
            Registration restricted to <strong style={{ color: '#0F172A' }}>{info.allowedDomain}</strong> addresses.
            {info.userCount > 0 && (
              <> Currently <strong style={{ color: '#0F172A' }}>{info.userCount}</strong> account{info.userCount === 1 ? '' : 's'} ({info.adminCount} admin{info.adminCount === 1 ? '' : 's'}{info.pendingCount > 0 ? `, ${info.pendingCount} pending` : ''}).</>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Register form ──────────────────────────────────────────────── */
function RegisterForm({
  onRegister,
  onSwitchToLogin,
  info,
}: {
  onRegister: ReturnType<typeof useAuth>['register'];
  onSwitchToLogin: () => void;
  info: ReturnType<typeof useAuth>['info'];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<null | { bootstrap: boolean }>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const result = await onRegister(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess({ bootstrap: result.bootstrapAdmin });
  };

  if (success) {
    return (
      <>
        <div className="mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: success.bootstrap ? '#F0FDF4' : '#FFFBEB', border: `1.5px solid ${success.bootstrap ? '#BBF7D0' : '#FDE68A'}` }}>
            {success.bootstrap ? <CheckCircle2 size={22} style={{ color: '#16A34A' }} /> : <Clock size={22} style={{ color: '#B58800' }} />}
          </div>
          <h2 className="text-slate-900 mb-1.5"
            style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {success.bootstrap ? 'Account ready' : 'Awaiting admin approval'}
          </h2>
          <p className="text-slate-500" style={{ fontSize: '13.5px', lineHeight: 1.6 }}>
            {success.bootstrap
              ? 'You registered first, so you have been promoted to administrator. Sign in below to start managing accounts.'
              : 'Your account has been created. An administrator needs to approve it before you can sign in. You can come back to this screen and try again later.'}
          </p>
        </div>
        <button
          onClick={onSwitchToLogin}
          className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{
            fontSize: '13.5px',
            background: 'linear-gradient(135deg, #0F172A, #1E293B)',
            boxShadow: '0 3px 14px rgba(15,23,42,0.2)',
          }}
        >
          Go to sign-in →
        </button>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-slate-900 mb-1.5"
          style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Create an account
        </h2>
        <p className="text-slate-500" style={{ fontSize: '13.5px' }}>
          {info?.bootstrapMode
            ? 'Your registration will bootstrap the system administrator.'
            : `Restricted to ${info?.allowedDomain ?? '@forcepoint.com'} addresses. An admin must approve new accounts.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <TextInput
          label="EMAIL"
          icon={<Mail size={14} />}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={`name${info?.allowedDomain ?? '@forcepoint.com'}`}
          autoComplete="email"
        />
        <PasswordInput
          label="PASSWORD"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <PasswordInput
          label="CONFIRM PASSWORD"
          value={confirm}
          onChange={setConfirm}
          show={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          autoComplete="new-password"
        />

        {error && <InlineErrorBanner kind="generic" message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{
            fontSize: '13.5px',
            background: loading ? '#93C5FD' : 'linear-gradient(135deg, #16A34A, #15803D)',
            boxShadow: loading ? 'none' : '0 3px 14px rgba(22,163,74,0.25)',
          }}
        >
          {loading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Registering…
            </>
          ) : (
            <>
              <UserPlus size={14} />
              Create account
            </>
          )}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        <span style={{ fontSize: '12.5px', color: '#64748B' }}>Already have an account?</span>
        <button
          onClick={onSwitchToLogin}
          className="font-semibold transition-colors"
          style={{ fontSize: '12.5px', color: '#2563EB' }}
        >
          Sign in
        </button>
      </div>
    </>
  );
}

/* ─── MFA challenge form ─────────────────────────────────────────── */
function MfaChallengeForm({
  email,
  challengeToken,
  expiresInSec,
  onVerify,
  onCancel,
}: {
  email: string;
  challengeToken: string;
  expiresInSec: number;
  onVerify: ReturnType<typeof useAuth>['verifyMfa'];
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(expiresInSec);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Countdown so the user knows how long they have before the
     challenge expires and they need to re-enter their password. */
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  /* Auto-focus on mount so the user can start typing immediately. */
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await onVerify(challengeToken, code.trim());
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      /* Server burns the challenge on any failure, so we kick
         the user back to the password step. */
      setTimeout(onCancel, 1500);
      return;
    }
    /* AuthProvider has flipped — Dashboard will mount next render. */
  };

  /* Normalise the input as it's typed: strip non-allowed chars,
     auto-insert the dash for backup codes mid-stream so paste +
     typing both feel natural. */
  const onCodeChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^0-9A-Z-]/g, '');
    setCode(cleaned);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE' }}>
          <ShieldCheck size={22} style={{ color: '#1D4ED8' }} />
        </div>
        <h2 className="text-slate-900 mb-1.5"
          style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Two-factor verification
        </h2>
        <p className="text-slate-500" style={{ fontSize: '13.5px', lineHeight: 1.6 }}>
          Open your authenticator app and enter the 6-digit code for{' '}
          <strong style={{ color: '#0F172A' }}>{email}</strong>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em' }}>
              AUTHENTICATION CODE
            </label>
            <span style={{ fontSize: '10.5px', color: remaining < 30 ? '#DC2626' : '#94A3B8', fontFamily: 'JetBrains Mono, monospace' }}>
              {remaining > 0 ? `Expires in ${mins}:${String(secs).padStart(2, '0')}` : 'Expired'}
            </span>
          </div>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="123456  or  XXXX-XXXX"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={20}
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all text-slate-900"
              style={{
                fontSize: '16px',
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.12em',
                textAlign: 'center',
                background: '#F8FAFC',
                border: '1.5px solid #E2E8F0',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
              onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
            />
          </div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: 6, lineHeight: 1.5 }}>
            Lost your phone? Enter one of your backup codes in <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>XXXX-XXXX</code> form.
          </div>
        </div>

        {error && <InlineErrorBanner kind="generic" message={error} />}

        <button
          type="submit"
          disabled={loading || remaining === 0}
          className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{
            fontSize: '13.5px',
            background: (loading || remaining === 0) ? '#93C5FD' : 'linear-gradient(135deg, #1D4ED8, #1E40AF)',
            boxShadow: (loading || remaining === 0) ? 'none' : '0 3px 14px rgba(29,78,216,0.25)',
            cursor: (loading || remaining === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying…
            </>
          ) : 'Verify code →'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-center">
        <button
          onClick={onCancel}
          className="font-semibold transition-colors"
          style={{ fontSize: '12.5px', color: '#64748B' }}
        >
          ← Back to sign-in
        </button>
      </div>
    </>
  );
}

/* ─── Reusable form atoms ────────────────────────────────────────── */
function TextInput({
  label, icon, type, value, onChange, placeholder, autoComplete,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full pl-10 pr-4 py-2.5 rounded-xl outline-none transition-all text-slate-900"
          style={{ fontSize: '13.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
          onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
          onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
        />
      </div>
    </div>
  );
}

function PasswordInput({
  label, value, onChange, show, onToggle, autoComplete, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em' }}>{label}</label>
        {hint && <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{hint}</span>}
      </div>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••••"
          autoComplete={autoComplete}
          required
          className="w-full pl-10 pr-10 py-2.5 rounded-xl outline-none transition-all text-slate-900"
          style={{ fontSize: '13.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0' }}
          onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
          onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function InlineErrorBanner({
  kind, message,
}: {
  kind: 'generic' | 'pending' | 'rejected' | 'suspended';
  message: string;
}) {
  const cfg = kind === 'pending'
    ? { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: <Clock size={14} style={{ color: '#B58800' }} /> }
    : kind === 'rejected'
      ? { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', icon: <AlertTriangle size={14} style={{ color: '#DC2626' }} /> }
      : kind === 'suspended'
        ? { bg: '#FFF7ED', border: '#FED7AA', color: '#9A3412', icon: <AlertTriangle size={14} style={{ color: '#EA580C' }} /> }
        : { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', icon: <AlertTriangle size={14} style={{ color: '#DC2626' }} /> };
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
      <span style={{ fontSize: '12.5px', color: cfg.color, lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

import { useState } from 'react';
import { Shield, User, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

const MANUAL_USERS: Record<string, string> = {
  'admin':          'Forcepoint1!',
  'kartikarslan':   'Forcepoint1!',
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  /* Manual form state */
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    setManualLoading(true);
    setTimeout(() => {
      if (MANUAL_USERS[username.toLowerCase()] === password) {
        onLogin();
      } else {
        setManualError('Invalid username or password.');
        setManualLoading(false);
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* ── Left Panel ── */}
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

          <div className="mb-6">
            <h2 className="text-slate-900 mb-1.5"
              style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Welcome back
            </h2>
            <p className="text-slate-500" style={{ fontSize: '13.5px' }}>
              Sign in to your HC Studio account
            </p>
          </div>

          {/* ── Manual Login Form ── */}
          <form onSubmit={handleManualLogin} className="space-y-3">
            {/* Username */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                USERNAME
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl outline-none transition-all text-slate-900"
                  style={{
                    fontSize: '13.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
                  onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl outline-none transition-all text-slate-900"
                  style={{
                    fontSize: '13.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#fff'; }}
                  onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Manual error */}
            {manualError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span style={{ fontSize: '12.5px', color: '#DC2626' }}>{manualError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={manualLoading}
              className="w-full py-2.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                fontSize: '13.5px',
                background: manualLoading ? '#93C5FD' : 'linear-gradient(135deg, #0F172A, #1E293B)',
                boxShadow: manualLoading ? 'none' : '0 3px 14px rgba(15,23,42,0.2)',
              }}
            >
              {manualLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign In →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

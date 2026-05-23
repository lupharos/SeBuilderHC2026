import { useEffect, useState } from 'react';
import { FolderOpen, Braces, Layers, ClipboardCheck, MonitorSmartphone, Sparkles, Activity, ArrowUpCircle, BookOpen } from 'lucide-react';

export type ActiveView = 'wizard' | 'templates' | 'sessions' | 'versions' | 'endpoint_matrix' | 'destination_patterns' | 'version_upgrade_catalog' | 'help_guide';

interface NavigationRailProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  onOpenProfile: () => void;
  /* Clicking the Health Check Wizard icon starts a brand-new session (resets
     all wizard state + navigates to the wizard view). This is intentionally
     destructive — saved sessions remain in the HC Sessions list and can be
     re-opened from there. */
  onStartWizardSession: () => void;
}

/* Persistent health indicator state — driven by polling /health every
   15s. Lives in the navigation rail so it's visible on every view. */
interface HealthState {
  state: 'checking' | 'ok' | 'fail';
  latencyMs?: number;
  lastCheckAt?: Date;
  message?: string;
}

function useApiHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>({ state: 'checking' });
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const started = Date.now();
      try {
        const res = await fetch('/health', { signal: AbortSignal.timeout(3000) });
        const latencyMs = Date.now() - started;
        if (cancelled) return;
        if (res.ok) {
          setHealth({ state: 'ok', latencyMs, lastCheckAt: new Date() });
        } else {
          setHealth({ state: 'fail', latencyMs, lastCheckAt: new Date(), message: `HTTP ${res.status}` });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error
          ? (err.name === 'TimeoutError' ? 'timed out (>3s)' : err.message)
          : 'fetch failed';
        setHealth({ state: 'fail', lastCheckAt: new Date(), message: msg });
      }
    };
    probe();
    const id = setInterval(probe, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return health;
}

export function NavigationRail({ activeView, onChangeView, onOpenProfile, onStartWizardSession }: NavigationRailProps) {
  const health = useApiHealth();
  return (
    <div
      className="w-[60px] flex flex-col items-center py-4 gap-1 flex-shrink-0 relative z-20"
      style={{
        background: 'linear-gradient(180deg, #060E20 0%, #081424 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Logo */}
      <div className="mb-5 mt-1">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
            boxShadow: '0 0 16px rgba(37,99,235,0.35)',
          }}
          onClick={() => onChangeView('wizard')}
          title="Forcepoint HC Studio"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z"
              fill="white"
              fillOpacity="0.9"
            />
            <path
              d="M9 12L11 14L15 10"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Divider */}
      <div className="w-8 h-px mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Nav buttons — order matters. Operator lands on HC Sessions
          by default; HC Wizard sits in slot 2 so a "start new" is one
          click away. Settings pages (Rule Engine, Product Lifecycle,
          etc.) follow; Help Guide is last, just above the divider. */}
      <NavButton
        icon={<FolderOpen size={16} />}
        label="HC Sessions"
        active={activeView === 'sessions'}
        onClick={() => onChangeView('sessions')}
      />
      <NavButton
        icon={<ClipboardCheck size={16} />}
        label="Health Check Wizard — starts a new session"
        active={activeView === 'wizard'}
        onClick={onStartWizardSession}
      />
      <NavButton
        icon={<Braces size={16} />}
        label="HC Rule Engine"
        active={activeView === 'templates'}
        onClick={() => onChangeView('templates')}
      />
      <NavButton
        icon={<Layers size={16} />}
        label="Product Lifecycle"
        active={activeView === 'versions'}
        onClick={() => onChangeView('versions')}
      />
      <NavButton
        icon={<MonitorSmartphone size={16} />}
        label="OS / Browser Support Matrix"
        active={activeView === 'endpoint_matrix'}
        onClick={() => onChangeView('endpoint_matrix')}
      />
      <NavButton
        icon={<Sparkles size={16} />}
        label="GenAI Apps & Destination Patterns"
        active={activeView === 'destination_patterns'}
        onClick={() => onChangeView('destination_patterns')}
      />
      <NavButton
        icon={<ArrowUpCircle size={16} />}
        label="Version & Release Catalog"
        active={activeView === 'version_upgrade_catalog'}
        onClick={() => onChangeView('version_upgrade_catalog')}
      />
      <NavButton
        icon={<BookOpen size={16} />}
        label="Help Guide — usage instructions, workflows, troubleshooting"
        active={activeView === 'help_guide'}
        onClick={() => onChangeView('help_guide')}
      />

      <div className="flex-1" />
      <div className="w-8 h-px mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* API health indicator — polls /health every 15s */}
      <HealthIndicator health={health} />

      <div className="w-8 h-px mt-3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* User avatar */}
      <div className="relative group">
        <button
          onClick={onOpenProfile}
          className="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-white transition-all hover:scale-105"
          style={{
            fontSize: '11px',
            background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)',
            border: '2px solid rgba(255,255,255,0.1)',
          }}
          title="Profile & Logout"
        >
          AD
        </button>
        <Tooltip>Profile & Settings</Tooltip>
      </div>

      {/* Build version chip — short SHA changes on every commit, so
          SE can tell which code is live just by glancing at the rail.
          Hover reveals full version + ISO build timestamp. The whole
          chip is wrapped in `.group` so the Tooltip helper used above
          can re-attach without bespoke styling. */}
      <BuildVersionChip />
    </div>
  );
}

function BuildVersionChip() {
  const info = __BUILD_INFO__;
  /* Built-time defaults; defensive against `define` not running (eg.
     in a Vitest run that bypasses the vite plugin). The chip primarily
     advertises the customer-facing release label (productVersion), with
     the commit SHA tucked into the tooltip for build traceability. */
  const productName = info?.productName ?? 'HC Studio';
  const productVersion = info?.productVersion ?? 'v0.0';
  const commit = info?.commit ?? 'dev';
  const version = info?.version ?? '0.0.0';
  const builtAt = info?.builtAt ?? '';
  let builtLocal = '';
  try { builtLocal = new Date(builtAt).toLocaleString(); } catch { builtLocal = builtAt; }
  return (
    <div className="relative group mt-3">
      <div
        className="px-2 py-0.5 rounded font-mono text-center"
        title={`${productName} ${productVersion} · ${commit} · built ${builtLocal}`}
        style={{
          fontSize: '8.5px',
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.55)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          minWidth: '46px',
          whiteSpace: 'nowrap',
        }}
      >
        {productVersion}
      </div>
      <Tooltip>
        <div style={{ lineHeight: 1.55 }}>
          <strong style={{ color: '#fff' }}>{productName} {productVersion}</strong>
          <br />
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>build {commit} · v{version}</span>
          {builtLocal && (
            <>
              <br />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>built {builtLocal}</span>
            </>
          )}
        </div>
      </Tooltip>
    </div>
  );
}

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all relative"
        style={{
          background: active ? 'rgba(59,130,246,0.18)' : 'transparent',
          color: active ? '#60A5FA' : 'rgba(255,255,255,0.3)',
          border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
          }
        }}
      >
        {active && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
            style={{ background: '#3B82F6' }}
          />
        )}
        {icon}
      </button>
      <Tooltip>{label}</Tooltip>
    </div>
  );
}

function HealthIndicator({ health }: { health: HealthState }) {
  const cfg = health.state === 'ok'
    ? { color: '#16A34A', glow: 'rgba(34,197,94,0.45)',  label: 'System API Online',   pulse: false }
    : health.state === 'fail'
      ? { color: '#DC2626', glow: 'rgba(220,38,38,0.45)', label: 'System API Offline',  pulse: false }
      : { color: '#94A3B8', glow: 'rgba(148,163,184,0.4)', label: 'System API Checking…', pulse: true };

  const lastSeen = health.lastCheckAt
    ? `${Math.floor((Date.now() - health.lastCheckAt.getTime()) / 1000)}s ago`
    : '—';

  return (
    <div className="relative group">
      <button
        aria-label={cfg.label}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
        style={{
          background: `${cfg.color}1A`,
          border: `1px solid ${cfg.color}55`,
          cursor: 'default',
        }}>
        <span
          className={cfg.pulse ? 'animate-pulse' : ''}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: cfg.color,
            boxShadow: `0 0 8px ${cfg.glow}`,
          }}
        />
      </button>
      <Tooltip>
        <div style={{ minWidth: 180 }}>
          <div className="flex items-center gap-1.5" style={{ fontWeight: 700 }}>
            <Activity size={11} style={{ color: cfg.color }} />
            {cfg.label}
          </div>
          <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px', color: 'rgba(255,255,255,0.65)' }}>
            endpoint: <span style={{ color: 'rgba(255,255,255,0.85)' }}>/health</span><br />
            last check: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{lastSeen}</span><br />
            {typeof health.latencyMs === 'number' && (
              <>latency: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{health.latencyMs} ms</span><br /></>
            )}
            {health.message && (
              <>note: <span style={{ color: '#FCA5A5' }}>{health.message}</span></>
            )}
          </div>
        </div>
      </Tooltip>
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-[50px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
      style={{
        background: '#0B1424',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.85)',
        fontSize: '11.5px',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {children}
    </div>
  );
}

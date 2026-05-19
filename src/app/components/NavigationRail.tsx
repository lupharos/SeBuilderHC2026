import { FolderOpen, Braces, Layers, ClipboardCheck, MonitorSmartphone } from 'lucide-react';

export type ActiveView = 'wizard' | 'templates' | 'sessions' | 'versions' | 'endpoint_matrix';

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

export function NavigationRail({ activeView, onChangeView, onOpenProfile, onStartWizardSession }: NavigationRailProps) {
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

      {/* Nav buttons */}
      <NavButton
        icon={<FolderOpen size={16} />}
        label="HC Sessions"
        active={activeView === 'sessions'}
        onClick={() => onChangeView('sessions')}
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
        icon={<ClipboardCheck size={16} />}
        label="Health Check Wizard — starts a new session"
        active={activeView === 'wizard'}
        onClick={onStartWizardSession}
      />

      <div className="flex-1" />
      <div className="w-8 h-px mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />

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

import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AuthProvider, useAuth } from './auth/AuthContext';

/* Top-level shell. AuthProvider owns the session token + the current
   user; this gate decides whether to render LoginScreen or Dashboard
   based on what AuthContext reports. */
function AppShell() {
  const { user, loading } = useAuth();

  /* Brief flash on first paint while /api/auth/me is in flight. A
     full splash screen would be overkill — the LoginScreen shows up
     almost immediately on cold start. */
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#040C1E',
        color: 'rgba(255,255,255,0.55)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        letterSpacing: '0.04em',
      }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

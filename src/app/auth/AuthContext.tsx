import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';

/* ─── Authenticated user shape (returned by /api/auth/me) ────────── */
export type AuthUser = {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  role: 'admin' | 'user';
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
  /** True once the user has completed authenticator-app enrollment. */
  mfaEnabled: boolean;
  /** Timestamp when MFA was enrolled, or null if disabled. */
  mfaEnrolledAt: string | null;
  /** Unused backup codes remaining. Drives the "regenerate codes"
   *  prompt in the Profile Security card. */
  backupCodesRemaining: number;
};

export type AuthInfo = {
  allowedDomain: string;
  userCount: number;
  pendingCount: number;
  adminCount: number;
  bootstrapMode: boolean;
};

type LoginResult =
  /** Password-only login succeeded — caller is now signed in. */
  | { ok: true; user: AuthUser }
  /** Password verified but MFA is enabled — caller must follow up with
   *  verifyMfa(challengeToken, code) to finish the login. */
  | { ok: true; mfaRequired: true; challengeToken: string; challengeExpiresInSec: number }
  | { ok: false; error: string; pending?: boolean; rejected?: boolean; suspended?: boolean };

type MfaVerifyResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

type RegisterResult =
  | { ok: true; user: AuthUser; bootstrapAdmin: boolean }
  | { ok: false; error: string };

type Ctx = {
  /** Current user, or null when not signed in / loading. */
  user: AuthUser | null;
  /** Public bootstrap signals for the login screen (allowed domain, etc). */
  info: AuthInfo | null;
  /** True while the initial /api/auth/me probe is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Completes a login that required MFA — token came from the
   *  login() response. Accepts a 6-digit authenticator code OR a
   *  single-use backup code in `XXXX-XXXX` format. */
  verifyMfa: (challengeToken: string, code: string) => Promise<MfaVerifyResult>;
  register: (email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  /** Re-fetch /api/auth/me — used after MFA enrollment to pick up the
   *  flipped mfaEnabled flag. */
  refreshUser: () => Promise<void>;
  /** Refresh /api/auth/info — used after admin actions affect counts. */
  refreshInfo: () => Promise<void>;
};

const TOKEN_STORAGE_KEY = 'hc_auth_token';

/* ─── Global fetch interceptor ────────────────────────────────────
   Attaches the stored bearer token to every same-origin /api/* call
   except registration + login (which mint the token). Wraps the
   native fetch once at module load; existing call sites continue
   working unchanged. */
let installedInterceptor = false;
function installFetchInterceptor() {
  if (installedInterceptor || typeof window === 'undefined') return;
  installedInterceptor = true;
  const original = window.fetch.bind(window);
  window.fetch = async function (input: RequestInfo | URL, init: RequestInit = {}) {
    /* Resolve the URL string regardless of input shape — string,
       URL, or Request — so we can pattern-match against /api/auth/*. */
    let url: string;
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else if (typeof Request !== 'undefined' && input instanceof Request) url = input.url;
    else url = String(input);

    const needsAuth =
      url.includes('/api/') &&
      !url.includes('/api/auth/register') &&
      !url.includes('/api/auth/login') &&
      !url.includes('/api/auth/info') &&
      /* Customer Connector binary authenticates with its own
         per-token allowlist — leave those alone. */
      !url.includes('/api/connector/');

    if (needsAuth) {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) {
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }
    return original(input, init);
  };
}

/* React context — instantiated once at module load so child
   components can call useAuth() before the provider mounts and get
   a sensible default (loading: true). */
const AuthCtx = createContext<Ctx>({
  user: null,
  info: null,
  loading: true,
  login: async () => ({ ok: false, error: 'AuthProvider not mounted.' }),
  verifyMfa: async () => ({ ok: false, error: 'AuthProvider not mounted.' }),
  register: async () => ({ ok: false, error: 'AuthProvider not mounted.' }),
  logout: async () => {},
  refreshUser: async () => {},
  refreshInfo: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  installFetchInterceptor();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  /* Boot probe: if there's a stored token, ask the server who we
     are. A 401 means the token expired — wipe it and fall through
     to the login screen. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      /* Always fetch /api/auth/info — the login screen needs it to
         show the bootstrap-mode hint. */
      try {
        const r = await fetch('/api/auth/info');
        if (r.ok) {
          const json = await r.json();
          if (!cancelled) setInfo({
            allowedDomain: json.allowedDomain,
            userCount: json.userCount,
            pendingCount: json.pendingCount,
            adminCount: json.adminCount,
            bootstrapMode: json.bootstrapMode,
          });
        }
      } catch { /* System API offline — info stays null */ }

      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const r = await fetch('/api/auth/me');
        if (!r.ok) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          if (!cancelled) { setUser(null); setLoading(false); }
          return;
        }
        const json = await r.json();
        if (!cancelled) {
          setUser(json.user);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshInfo = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/info');
      if (r.ok) {
        const json = await r.json();
        setInfo({
          allowedDomain: json.allowedDomain,
          userCount: json.userCount,
          pendingCount: json.pendingCount,
          adminCount: json.adminCount,
          bootstrapMode: json.bootstrapMode,
        });
      }
    } catch { /* swallow */ }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        return {
          ok: false,
          error: json.error || `Login failed (${r.status}).`,
          pending: json.status === 'pending',
          rejected: json.status === 'rejected',
          suspended: json.status === 'suspended',
        };
      }
      /* MFA gate — server says password's good but we need a code.
         Caller flips to the challenge UI and follows up via
         verifyMfa(). Token + user are NOT set yet. */
      if (json.mfaRequired) {
        return {
          ok: true,
          mfaRequired: true,
          challengeToken: json.challengeToken,
          challengeExpiresInSec: json.challengeExpiresInSec ?? 300,
        };
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, json.token);
      setUser(json.user);
      refreshInfo();
      return { ok: true, user: json.user };
    } catch (e) {
      return { ok: false, error: `Could not reach the System API: ${(e as Error).message}` };
    }
  }, [refreshInfo]);

  const verifyMfa = useCallback(async (challengeToken: string, code: string): Promise<MfaVerifyResult> => {
    try {
      const r = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, code }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        return { ok: false, error: json.error || `MFA verification failed (${r.status}).` };
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, json.token);
      setUser(json.user);
      refreshInfo();
      return { ok: true, user: json.user };
    } catch (e) {
      return { ok: false, error: `Could not reach the System API: ${(e as Error).message}` };
    }
  }, [refreshInfo]);

  const refreshUser = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        const json = await r.json();
        setUser(json.user);
      }
    } catch { /* swallow */ }
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<RegisterResult> => {
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        return { ok: false, error: json.error || `Registration failed (${r.status}).` };
      }
      await refreshInfo();
      return { ok: true, user: json.user, bootstrapAdmin: !!json.bootstrapAdmin };
    } catch (e) {
      return { ok: false, error: `Could not reach the System API: ${(e as Error).message}` };
    }
  }, [refreshInfo]);

  const logout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* swallow */ }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    refreshInfo();
  }, [refreshInfo]);

  const value = useMemo<Ctx>(() => ({
    user, info, loading, login, verifyMfa, register, logout, refreshUser, refreshInfo,
  }), [user, info, loading, login, verifyMfa, register, logout, refreshUser, refreshInfo]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

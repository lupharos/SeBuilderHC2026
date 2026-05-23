import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, CheckCircle2, Terminal, Copy, Check } from 'lucide-react';

/* ─── Version check ──────────────────────────────────────────────────
   Fetches versioncheck.json from the GitHub repo's main branch and
   compares the advertised version against the one baked into the
   bundle at build time. When they differ the operator has a newer
   release waiting and we surface an "Upgrade recommended" panel that
   tells them the exact SSH command to run on the deploy host —
   intentionally NOT an in-app trigger, because executing
   `sudo bash deploy.sh` end-to-end requires manual oversight (it
   restarts the service mid-flight and may need attention if any
   step fails). */

/* Raw content URL on GitHub. Public file, CORS-friendly — fetchable
   straight from the browser without proxying. */
const GITHUB_VERSIONCHECK_URL =
  'https://raw.githubusercontent.com/lupharos/SeBuilderHC2026/main/versioncheck.json';

/* The single canonical upgrade command the operator runs on the
   Ubuntu host. Mirrors the workflow used since the first deploy:
     1. pull the latest tree
     2. run deploy.sh under sudo (builds frontend, refreshes systemd,
        redeploys to nginx, syncs the connector binary)
     3. statuscheck.sh confirms each service is healthy. */
export const UPGRADE_SHELL_COMMAND =
  'cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh && bash statuscheck.sh';

export type VersionCheckPayload = {
  productName?: string;
  version?: string;
  releasedAt?: string;
  notes?: string;
};

export type VersionCheckState = {
  current: { productName: string; version: string; releasedAt: string };
  latest: VersionCheckPayload | null;
  /** True when latest version differs from build-time version. */
  hasUpdate: boolean;
  loading: boolean;
  error: string | null;
  /** Force a re-fetch — used by the manual "Re-check" button. */
  refresh: () => void;
};

/* Normalise "2025.05.01" / "v2025.05" → array of integers so we can
   compare across the year.month.patch format the JSON uses. Anything
   non-numeric collapses to 0 so a stray "rc1" suffix doesn't poison
   the compare. */
function compareVersions(a: string, b: string): number {
  const norm = (s: string) =>
    s.replace(/^v/i, '').split(/[.\-+]/).map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const A = norm(a);
  const B = norm(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const ai = A[i] ?? 0;
    const bi = B[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export function useVersionCheck(): VersionCheckState {
  const [latest, setLatest] = useState<VersionCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        /* Cache-bust so the browser doesn't serve a stale copy after
           the operator pushes a new release to GitHub. */
        const r = await fetch(`${GITHUB_VERSIONCHECK_URL}?_=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`GitHub returned HTTP ${r.status}`);
        const json = (await r.json()) as VersionCheckPayload;
        if (!cancelled) setLatest(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const current = {
    productName: __BUILD_INFO__.productName,
    version: __BUILD_INFO__.productVersion.replace(/^v/, ''),
    releasedAt: __BUILD_INFO__.releasedAt,
  };
  const latestVersion = (latest?.version ?? '').replace(/^v/, '');
  const hasUpdate = !!latestVersion && compareVersions(latestVersion, current.version) > 0;

  return {
    current,
    latest,
    hasUpdate,
    loading,
    error,
    refresh: () => setTick((n) => n + 1),
  };
}

/* ─── Version check card ─────────────────────────────────────────────
   The single Profile-panel widget for release management. Shows the
   current build's version, the latest version on GitHub, and (when
   they differ) the exact SSH command the operator runs to upgrade. */
export function VersionCheckCard({ state }: { state: VersionCheckState }) {
  const { current, latest, hasUpdate, loading, error, refresh } = state;
  const [copied, setCopied] = useState(false);
  const latestVersionLabel = latest?.version
    ? (latest.version.startsWith('v') ? latest.version : `v${latest.version}`)
    : '—';
  const currentLabel = current.version.startsWith('v') ? current.version : `v${current.version}`;

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(UPGRADE_SHELL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — operator can still select + copy */ }
  };

  return (
    <div className="rounded-xl p-3 mb-4"
      style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: hasUpdate ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.1)' }}>
          <Sparkles size={13} style={{ color: hasUpdate ? '#16A34A' : '#2563EB' }} strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>Version Check</div>
          <div style={{ fontSize: '10px', color: '#94A3B8' }}>
            {loading
              ? 'Checking GitHub…'
              : error
                ? `Check failed: ${error}`
                : `Source: lupharos/SeBuilderHC2026 · main`}
          </div>
        </div>
        <button
          onClick={refresh}
          title="Re-check versioncheck.json on GitHub"
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
          style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Current + Latest pair */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-lg p-2"
          style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Current
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
            {currentLabel}
          </div>
          {current.releasedAt && (
            <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: 1 }}>
              {current.releasedAt}
            </div>
          )}
        </div>
        <div className="rounded-lg p-2"
          style={{
            background: hasUpdate ? '#F0FDF4' : '#FFFFFF',
            border: `1px solid ${hasUpdate ? '#BBF7D0' : '#E2E8F0'}`,
          }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: hasUpdate ? '#16A34A' : '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Latest (GitHub)
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: hasUpdate ? '#15803D' : '#0F172A', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
            {latestVersionLabel}
          </div>
          {latest?.releasedAt && (
            <div style={{ fontSize: '9.5px', color: hasUpdate ? '#16A34A' : '#94A3B8', marginTop: 1 }}>
              {latest.releasedAt}
            </div>
          )}
        </div>
      </div>

      {/* Status row */}
      {!loading && !error && (
        hasUpdate ? (
          <>
            <div className="px-2 py-2 rounded-md mb-2"
              style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div className="flex items-start gap-1.5">
                <Sparkles size={11} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#15803D' }}>
                    Upgrade recommended
                  </div>
                  {latest?.notes && (
                    <div style={{ fontSize: '10px', color: '#475569', marginTop: 3, lineHeight: 1.5 }}>
                      {latest.notes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SSH command card — the operator runs this on the
                Ubuntu deploy host to pull + redeploy + verify. */}
            <div className="rounded-md p-2"
              style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Terminal size={11} className="text-emerald-400" />
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    RUN ON DEPLOY HOST
                  </span>
                </div>
                <button
                  onClick={copyCommand}
                  title="Copy command to clipboard"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 600,
                    background: copied ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.06)',
                    color: copied ? '#86EFAC' : '#CBD5E1',
                    border: `1px solid ${copied ? 'rgba(134,239,172,0.35)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
              </div>
              <code style={{
                fontSize: '10.5px',
                color: '#86EFAC',
                fontFamily: 'JetBrains Mono, monospace',
                display: 'block',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.55,
              }}>
                {UPGRADE_SHELL_COMMAND}
              </code>
            </div>
          </>
        ) : (
          <div className="px-2 py-1.5 rounded-md flex items-center gap-1.5"
            style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', fontSize: '10.5px', color: '#075985' }}>
            <CheckCircle2 size={11} style={{ color: '#0284C7' }} />
            You're on the latest version.
          </div>
        )
      )}
    </div>
  );
}

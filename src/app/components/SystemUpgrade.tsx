import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Server, AlertTriangle, CheckCircle2, XCircle, Terminal } from 'lucide-react';

/* ─── System Upgrade ─────────────────────────────────────────────────
   Self-upgrade trigger for the Ubuntu-hosted companion. Talks to:
     GET  /api/admin/platform          → tells us whether the host can
                                         actually run the upgrade.
     POST /api/admin/upgrade           → kicks off a detached
                                         `git pull && bash deploy.sh`.
     GET  /api/admin/upgrade/log       → tail the upgrade log.
   The button is hidden entirely when the companion responds that it's
   not on Linux or no repo is configured — running these commands on a
   Windows dev box would be nonsensical, so we don't expose them. */

export type UpgradePlatformInfo = {
  platform: string;
  nodeVersion: string;
  runningAsRoot: boolean;
  upgradeAvailable: boolean;
  repoPath: string | null;
  repoOwner: string | null;
  /** True when the systemd unit still has ProtectHome=true — /home
   *  is invisible to the System API and a one-time manual deploy.sh
   *  refresh is required before in-app upgrades can run. */
  homeHidden?: boolean;
  reason: string;
};

export function useUpgradePlatform(): UpgradePlatformInfo | null {
  const [info, setInfo] = useState<UpgradePlatformInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/platform', { method: 'GET' });
        if (!r.ok) return;
        const json = await r.json();
        if (!cancelled) setInfo(json);
      } catch { /* companion offline — leave info null */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return info;
}

/* ─── System Maintenance card ─────────────────────────────────────── */
export function SystemMaintenanceCard({ info }: { info: UpgradePlatformInfo | null }) {
  const [showModal, setShowModal] = useState(false);
  /* When info is null the companion is unreachable — we still render the
     card but disable the button with a meaningful tooltip. */
  const supported = info?.upgradeAvailable === true;
  const reason = info?.reason || (info === null ? 'System API is unreachable — start the System API to enable upgrades.' : '');
  return (
    <>
      <div
        className="rounded-xl p-3 mb-4"
        style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)' }}>
            <Server size={13} style={{ color: '#7C3AED' }} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>System Maintenance</div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
              {supported
                ? `Linux host · ${info?.repoOwner ?? '—'}@${info?.repoPath ?? ''}`
                : 'Self-upgrade unavailable on this host'}
            </div>
          </div>
        </div>

        <button
          onClick={() => supported && setShowModal(true)}
          disabled={!supported}
          title={supported ? 'git pull && bash deploy.sh on the Ubuntu host' : reason}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition-all"
          style={{
            fontSize: '12px',
            background: supported ? 'linear-gradient(135deg, #2563EB, #7C3AED)' : '#F1F5F9',
            color: supported ? '#fff' : '#94A3B8',
            border: '1px solid transparent',
            cursor: supported ? 'pointer' : 'not-allowed',
            boxShadow: supported ? '0 2px 8px rgba(124,58,237,0.25)' : 'none',
          }}
        >
          <Download size={12} />
          Check for Updates
        </button>

        {!supported && reason && (
          <div className="mt-2 px-2 py-1.5 rounded-md"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '10px', color: '#92400E', lineHeight: 1.5 }}>
            {reason}
          </div>
        )}
        {!supported && info?.homeHidden && (
          <div className="mt-2 px-2 py-2 rounded-md"
            style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: 4 }}>
              ONE-TIME FIX
            </div>
            <code style={{ fontSize: '10px', color: '#86EFAC', fontFamily: 'JetBrains Mono, monospace', display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              cd ~/SeBuilderHC2026 &amp;&amp; git pull &amp;&amp; sudo bash deploy.sh
            </code>
          </div>
        )}
      </div>

      {showModal && (
        <UpgradeModal
          info={info!}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/* ─── Upgrade modal ────────────────────────────────────────────────── */
type Phase = 'confirm' | 'running' | 'restarting' | 'done' | 'failed';

function UpgradeModal({ info, onClose }: { info: UpgradePlatformInfo; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [log, setLog] = useState<string>('');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logBoxRef = useRef<HTMLPreElement>(null);
  /* Counter of consecutive failed log polls — used to flip into the
     "restarting" phase when deploy.sh kills our own service. */
  const consecutiveFails = useRef(0);

  const startUpgrade = async () => {
    try {
      const r = await fetch('/api/admin/upgrade', { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `System API returned ${r.status}`);
        setPhase('failed');
        return;
      }
      setStartedAt(json.startedAt || new Date().toISOString());
      setPhase('running');
    } catch (e) {
      setError((e as Error).message);
      setPhase('failed');
    }
  };

  /* Poll the log every 2s while we're running/restarting. The companion
     itself gets restarted mid-run, so a /log call returning a network
     error doesn't mean the upgrade failed — it means deploy.sh is
     swapping our process. Wait for it to come back. */
  useEffect(() => {
    if (phase !== 'running' && phase !== 'restarting') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/upgrade/log?bytes=131072', { method: 'GET' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (cancelled) return;
        consecutiveFails.current = 0;
        if (typeof json.log === 'string') setLog(json.log);
        if (phase === 'restarting' && !json.running) {
          /* Companion answered after a restart cycle — upgrade is done.
             Decide success vs failure based on the tail of the log. */
          const tail = (json.log || '').slice(-2000).toLowerCase();
          if (/deploy.*complete|✓ deploy|✔ done|successfully|completed/.test(tail)) {
            setPhase('done');
          } else if (/error|failed|fatal|abort/.test(tail)) {
            setPhase('failed');
          } else {
            /* Couldn't tell — call it done since the service is back. */
            setPhase('done');
          }
        } else if (phase === 'running' && !json.running && json.exists) {
          /* Companion didn't restart yet — could be the early git-pull
             phase finishing instantly, or deploy.sh hasn't started yet.
             Give it one more cycle before declaring done. */
          consecutiveFails.current += 1;
          if (consecutiveFails.current >= 3) setPhase('done');
        }
      } catch {
        /* Companion went away — deploy.sh is restarting us. Flip into
           restarting phase and keep polling; we'll detect the come-back
           on the next successful response. */
        if (cancelled) return;
        consecutiveFails.current += 1;
        if (consecutiveFails.current >= 1 && phase === 'running') {
          setPhase('restarting');
        }
      }
    };
    const id = setInterval(tick, 2000);
    tick(); // immediate first poll
    return () => { cancelled = true; clearInterval(id); };
  }, [phase]);

  /* Stick scroll to bottom as new log lines come in. */
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(10,18,35,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={phase === 'confirm' || phase === 'done' || phase === 'failed' ? onClose : undefined}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          width: phase === 'confirm' ? 460 : 720,
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
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.35)' }}>
            {phase === 'running' || phase === 'restarting'
              ? <RefreshCw size={14} className="text-violet-300 animate-spin" />
              : phase === 'done' ? <CheckCircle2 size={14} className="text-emerald-300" />
              : phase === 'failed' ? <XCircle size={14} className="text-red-300" />
              : <Server size={14} className="text-violet-300" />}
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>
              {phase === 'confirm'   && 'Confirm System Upgrade'}
              {phase === 'running'   && 'Upgrade in Progress'}
              {phase === 'restarting'&& 'System API Restarting'}
              {phase === 'done'      && 'Upgrade Complete'}
              {phase === 'failed'    && 'Upgrade Failed'}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
              {phase === 'confirm'    && 'GIT PULL · BASH DEPLOY.SH'}
              {phase === 'running'    && (startedAt ? `STARTED ${new Date(startedAt).toLocaleTimeString()}` : 'WORKING…')}
              {phase === 'restarting' && 'WAITING FOR SERVICE TO COME BACK'}
              {phase === 'done'       && 'SERVICE READY · PAGE RELOAD RECOMMENDED'}
              {phase === 'failed'     && 'SEE LOG BELOW'}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex-1 overflow-hidden flex flex-col">
          {phase === 'confirm' && (
            <>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
                  <AlertTriangle size={18} style={{ color: '#B58800' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                    This will redeploy the application.
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                    The System API service will restart during deploy. Active sessions
                    keep their wizard state, but expect a few seconds of API downtime.
                  </div>
                </div>
              </div>
              <div className="rounded-lg p-3 mb-4"
                style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Terminal size={12} className="text-emerald-400" />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    REMOTE COMMAND
                  </span>
                </div>
                <code style={{ fontSize: '11.5px', color: '#86EFAC', fontFamily: 'JetBrains Mono, monospace', display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  cd {info.repoPath ?? '<repo>'} &amp;&amp; git pull &amp;&amp; sudo bash deploy.sh
                </code>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: 8, fontFamily: 'monospace' }}>
                  Repo owner: <span style={{ color: '#CBD5E1' }}>{info.repoOwner ?? '—'}</span>
                  {' · '}
                  System API uid: <span style={{ color: '#CBD5E1' }}>{info.runningAsRoot ? 'root' : 'non-root'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl font-semibold transition-all"
                  style={{ fontSize: '13px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}
                >
                  Cancel
                </button>
                <button
                  onClick={startUpgrade}
                  className="flex-1 py-2.5 rounded-xl font-semibold transition-all"
                  style={{ fontSize: '13px', background: 'linear-gradient(135deg, #2563EB, #7C3AED)', color: '#fff', border: '1px solid transparent', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}
                >
                  Start Upgrade
                </button>
              </div>
            </>
          )}

          {(phase === 'running' || phase === 'restarting' || phase === 'done' || phase === 'failed') && (
            <>
              {phase === 'restarting' && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <RefreshCw size={12} className="text-amber-600 animate-spin" />
                  <span style={{ fontSize: '11.5px', color: '#92400E', fontWeight: 500 }}>
                    deploy.sh restarted the System API service. Reconnecting…
                  </span>
                </div>
              )}
              {phase === 'done' && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
                  style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  <span style={{ fontSize: '11.5px', color: '#15803D', fontWeight: 500 }}>
                    Service is back online. Reload the page to pick up the new build.
                  </span>
                </div>
              )}
              {phase === 'failed' && error && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <XCircle size={12} className="text-red-600" />
                  <span style={{ fontSize: '11.5px', color: '#991B1B', fontWeight: 500 }}>
                    {error}
                  </span>
                </div>
              )}
              <pre
                ref={logBoxRef}
                className="flex-1 rounded-lg p-3 overflow-auto"
                style={{
                  background: '#0F172A',
                  border: '1px solid #1E293B',
                  color: '#86EFAC',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  lineHeight: 1.5,
                  maxHeight: 360,
                  minHeight: 240,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {log || '(waiting for output…)'}
              </pre>
              <div className="flex gap-2 mt-4">
                {(phase === 'running' || phase === 'restarting') && (
                  <button
                    disabled
                    className="flex-1 py-2.5 rounded-xl font-semibold"
                    style={{ fontSize: '13px', background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0', cursor: 'not-allowed' }}
                  >
                    Running — please wait
                  </button>
                )}
                {phase === 'done' && (
                  <>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl font-semibold"
                      style={{ fontSize: '13px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}
                    >
                      Close
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="flex-1 py-2.5 rounded-xl font-semibold"
                      style={{ fontSize: '13px', background: 'linear-gradient(135deg, #16A34A, #15803D)', color: '#fff', border: '1px solid transparent' }}
                    >
                      Reload Now
                    </button>
                  </>
                )}
                {phase === 'failed' && (
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl font-semibold"
                    style={{ fontSize: '13px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}
                  >
                    Close
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import {
  FolderOpen, Folder, Trash2, ArrowUpRight, Search, Clock,
  CheckCircle2, ChevronRight, BarChart2, Layers, Plus,
  Download, Upload, AlertCircle, X, ShieldCheck, RefreshCw,
} from 'lucide-react';
import type { HCSession } from './Dashboard';
import { STEP_COLORS, STEP_LABELS, TOTAL_STEPS } from '../constants/steps';
import {
  downloadBackup, parseBackup, summarize, applyBackup,
  type SystemBackup, type BackupSummary,
} from '../utils/systemBackup';

interface SessionsPageProps {
  sessions: HCSession[];
  onLoadSession: (session: HCSession) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
  currentSessionId?: string;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function SessionsPage({
  sessions, onLoadSession, onDeleteSession, onNewSession, currentSessionId,
}: SessionsPageProps) {
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  /* System backup state — Export downloads immediately; Import shows a
     summary modal so the operator confirms before the destructive restore. */
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [restorePreview, setRestorePreview] = useState<{ backup: SystemBackup; summary: BackupSummary; fileName: string } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function handleExportBackup() {
    try {
      downloadBackup();
    } catch (err) {
      setRestoreError(`Backup export failed: ${(err as Error).message}`);
    }
  }

  function triggerRestore() {
    setRestoreError(null);
    backupInputRef.current?.click();
  }

  async function handleBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoreError(null);
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      setRestorePreview({ backup, summary: summarize(backup), fileName: file.name });
    } catch (err) {
      setRestoreError((err as Error).message);
    }
  }

  function confirmRestore() {
    if (!restorePreview) return;
    try {
      applyBackup(restorePreview.backup);
      /* React state mirrors localStorage via useLocalStorage hooks, which
         only read on mount. A page reload is the cleanest way to re-hydrate
         the whole tree from the restored payload. */
      window.location.reload();
    } catch (err) {
      setRestoreError(`Restore failed: ${(err as Error).message}`);
      setRestorePreview(null);
    }
  }

  async function handleGetUpdates() {
    /* Fetch backup.json from GitHub repo and import it */
    try {
      setRestoreError(null);
      const url = 'https://raw.githubusercontent.com/lupharos/SeBuilderHC2026/main/template/backup.json';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}: ${response.statusText}`);
      }
      const text = await response.text();
      const backup = parseBackup(text);
      setRestorePreview({ backup, summary: summarize(backup), fileName: 'GitHub Template Updates' });
    } catch (err) {
      setRestoreError(`Failed to fetch updates from GitHub: ${(err as Error).message}`);
    }
  }

  const filtered = sessions.filter(
    (s) =>
      s.customerName.toLowerCase().includes(search.toLowerCase()) ||
      s.forcepointId.toLowerCase().includes(search.toLowerCase()),
  );

  /* Completed = operator clicked Done on the last step. Reaching the last
     step without clicking Done still counts as in-progress. */
  const completedCount = sessions.filter((s) => !!s.completedAt).length;
  const inProgressCount = sessions.length - completedCount;
  const avgProgress = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + ((s.currentStep - 1) / (TOTAL_STEPS - 1)) * 100, 0) / sessions.length)
    : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F4F7FB' }}>

      {/* Page Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-8 py-0"
        style={{
          height: '64px',
          background: '#FFFFFF',
          borderBottom: '1.5px solid #EEF0F5',
          boxShadow: '0 1px 4px rgba(15,41,82,0.05)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(37,99,235,0.1)' }}
          >
            <Folder size={15} style={{ color: '#2563EB' }} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
              HC Sessions
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
              Saved health-check sessions
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleBackupFile}
          />
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all"
            style={{ fontSize: '12px', color: '#0F2952', background: '#FFFFFF', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Download a full backup of sessions, templates, and every catalogue (hc_* localStorage keys)"
          >
            <Download size={13} />
            Export Backup
          </button>
          <button
            onClick={triggerRestore}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all"
            style={{ fontSize: '12px', color: '#0F2952', background: '#FFFFFF', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Restore from a previously-exported backup JSON. Replaces all current HC data."
          >
            <Upload size={13} />
            Import Backup
          </button>
          <button
            onClick={handleGetUpdates}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition-all hover:scale-[1.02]"
            style={{
              fontSize: '12.5px',
              background: 'linear-gradient(135deg, #059669, #10B981)',
              boxShadow: '0 4px 14px rgba(5,150,105,0.35)',
            }}
            title="Fetch latest template updates from GitHub repository"
          >
            <RefreshCw size={14} strokeWidth={2.5} />
            Get Updates
          </button>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions…"
              className="pl-8 pr-4 py-2 rounded-xl outline-none transition-all"
              style={{
                fontSize: '12px',
                width: '220px',
                background: '#F8FAFC',
                border: '1.5px solid #E2E8F0',
                color: '#334155',
              }}
              onFocus={(e) => (e.currentTarget.style.border = '1.5px solid #BFDBFE')}
              onBlur={(e) => (e.currentTarget.style.border = '1.5px solid #E2E8F0')}
            />
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            {
              label: 'Total Sessions',
              value: sessions.length,
              icon: <Layers size={16} style={{ color: '#2563EB' }} />,
              iconBg: 'rgba(37,99,235,0.1)',
              color: '#2563EB',
            },
            {
              label: 'In Progress',
              value: inProgressCount,
              icon: <BarChart2 size={16} style={{ color: '#F59E0B' }} />,
              iconBg: 'rgba(245,158,11,0.1)',
              color: '#F59E0B',
            },
            {
              label: 'Completed',
              value: completedCount,
              icon: <CheckCircle2 size={16} style={{ color: '#16A34A' }} />,
              iconBg: 'rgba(22,163,74,0.1)',
              color: '#16A34A',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl flex items-center gap-4 px-5 py-4"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8ECF2',
                boxShadow: '0 1px 4px rgba(15,41,82,0.06)',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: stat.iconBg }}
              >
                {stat.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#0F172A',
                    fontFamily: 'monospace',
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                  {stat.label}
                </div>
              </div>
              {sessions.length > 0 && stat.label === 'In Progress' && (
                <div className="ml-auto text-right">
                  <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>Avg. Progress</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: stat.color, fontFamily: 'monospace' }}>
                    {avgProgress}%
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-2xl py-20"
            style={{ background: '#FFFFFF', border: '1.5px dashed #D1D9E8' }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: '#F1F5F9' }}
            >
              <FolderOpen size={28} style={{ color: '#CBD5E1' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#94A3B8' }}>
              {search ? 'No sessions found' : 'No sessions yet'}
            </div>
            <div style={{ fontSize: '12.5px', color: '#CBD5E1', marginTop: '6px', marginBottom: '20px' }}>
              {search
                ? 'Try a different keyword'
                : 'Start a new HC Session and save your progress to see it here'}
            </div>
            {!search && (
              <button
                onClick={onNewSession}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition-all hover:scale-105"
                style={{
                  fontSize: '13px',
                  background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                }}
              >
                <Plus size={14} strokeWidth={2.5} />
                Start New HC Session
              </button>
            )}
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E8ECF2',
              boxShadow: '0 1px 4px rgba(15,41,82,0.06)',
            }}
          >
            {/* Table header */}
            <div
              className="grid px-5 py-3"
              style={{
                gridTemplateColumns: '2fr 1.2fr 1.8fr 1fr 80px',
                gap: '12px',
                borderBottom: '1.5px solid #F0F3F8',
                background: '#FAFBFD',
              }}
            >
              {['Customer', 'Forcepoint ID', 'Current Step', 'Saved At', ''].map((col) => (
                <div
                  key={col}
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94A3B8',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {col}
                </div>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((session) => {
              const isActive = session.id === currentSessionId;
              const stepColor = STEP_COLORS[session.currentStep] || '#3B82F6';
              const stepLabel = STEP_LABELS[session.currentStep] || `Step ${session.currentStep}`;
              const progress = Math.min(100, Math.max(0, Math.round(((session.currentStep - 1) / (TOTAL_STEPS - 1)) * 100)));
              const initials = session.customerName ? session.customerName.substring(0, 2).toUpperCase() : '??';
              const isDeleting = deleteConfirm === session.id;

              return (
                <div
                  key={session.id}
                  className="grid px-5 items-center transition-all group"
                  style={{
                    gridTemplateColumns: '2fr 1.2fr 1.8fr 1fr 80px',
                    gap: '12px',
                    height: '64px',
                    borderBottom: '1px solid #F4F6FB',
                    background: isActive ? 'rgba(37,99,235,0.03)' : 'transparent',
                    borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#FAFBFF';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Customer */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-white flex-shrink-0"
                      style={{
                        fontSize: '10px',
                        background: `linear-gradient(135deg, ${stepColor}, ${stepColor}BB)`,
                      }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="truncate"
                          style={{ fontSize: '13px', fontWeight: 600, color: isActive ? '#2563EB' : '#0F172A' }}
                        >
                          {session.customerName || 'Unnamed Session'}
                        </div>
                        {session.completedAt && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded flex-shrink-0"
                            title={`Marked complete on ${formatDate(session.completedAt)}`}
                            style={{ fontSize: '8.5px', fontWeight: 800, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', letterSpacing: '0.06em' }}
                          >
                            <CheckCircle2 size={9} strokeWidth={3} /> COMPLETED
                          </span>
                        )}
                      </div>
                      {isActive && (
                        <div style={{ fontSize: '9.5px', color: '#2563EB', fontWeight: 600 }}>
                          Active Session
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Forcepoint ID */}
                  <div className="font-mono truncate" style={{ fontSize: '11.5px', color: '#64748B' }}>
                    {session.forcepointId || '—'}
                  </div>

                  {/* Step + progress */}
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold flex-shrink-0"
                        style={{
                          fontSize: '9px',
                          background: `${stepColor}12`,
                          color: stepColor,
                          border: `1px solid ${stepColor}22`,
                        }}
                      >
                        <ChevronRight size={8} />
                        {stepLabel}
                      </span>
                      <span style={{ fontSize: '9.5px', color: '#94A3B8', fontFamily: 'monospace', flexShrink: 0 }}>
                        {session.currentStep}/{TOTAL_STEPS}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: stepColor }} />
                      </div>
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 700, color: stepColor, flexShrink: 0 }}>
                        {progress}%
                      </span>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1.5" style={{ color: '#94A3B8' }}>
                    <Clock size={11} />
                    <span style={{ fontSize: '11px' }}>{formatDate(session.savedAt)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    {isDeleting ? (
                      <button
                        onClick={() => { onDeleteSession(session.id); setDeleteConfirm(null); }}
                        className="px-2 py-1 rounded-lg text-white flex-shrink-0"
                        style={{ fontSize: '9.5px', fontWeight: 700, background: '#DC2626' }}
                      >
                        Confirm
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onLoadSession(session)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                          style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}
                          title="Open session"
                        >
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(session.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                          style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}
                          title="Delete session"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restore-error toast */}
      {restoreError && !restorePreview && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 460, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
          <AlertCircle size={16} style={{ color: '#991B1B', marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', marginBottom: 2 }}>Backup restore failed</div>
            <div style={{ fontSize: 11.5, color: '#7F1D1D' }}>{restoreError}</div>
          </div>
          <button onClick={() => setRestoreError(null)}
            style={{ background: 'transparent', border: 'none', color: '#991B1B', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Restore confirmation modal */}
      {restorePreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,41,82,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 14, maxWidth: 540, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #EEF0F5', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#FBBF24,#F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F2952' }}>Restore from backup</div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, fontFamily: 'monospace' }}>{restorePreview.fileName}</div>
              </div>
            </div>
            <div style={{ padding: '16px 22px' }}>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 11.5, color: '#92400E', lineHeight: 1.55 }}>
                <strong>Heads up:</strong> Restore is destructive. Every saved session, template, certificate, matrix, and catalogue currently in this browser will be replaced with the backup's contents. The page will reload once the restore completes.
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Backup contents</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <SummaryTile label="Sessions"              value={restorePreview.summary.sessionCount} />
                <SummaryTile label="Templates"             value={restorePreview.summary.templateCount} />
                <SummaryTile label="Version Upgrades"      value={restorePreview.summary.versionUpgradesCount} />
                <SummaryTile label="Certificates"          value={restorePreview.summary.certificatesCount} />
                <SummaryTile label="DLP Telemetry Files"   value={restorePreview.summary.dlpBundlesCount} />
                <SummaryTile label="Compliance Frameworks" value={restorePreview.summary.complianceFrameworksCount} />
                <SummaryTile label="OS / Browser Matrix"   value={restorePreview.summary.hasMatrix ? 'Yes' : '—'} />
                <SummaryTile label="Product Lifecycle"     value={restorePreview.summary.hasVersionData ? 'Yes' : '—'} />
              </div>

              <div style={{ marginTop: 12, fontSize: 10.5, color: '#94A3B8', fontFamily: 'monospace' }}>
                {restorePreview.summary.keyCount} hc_* keys total · exported {restorePreview.summary.exportedAt ? new Date(restorePreview.summary.exportedAt).toLocaleString('en-GB') : 'unknown'}
              </div>
            </div>
            <div style={{ padding: '12px 22px', borderTop: '1px solid #EEF0F5', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#F8FAFC' }}>
              <button onClick={() => setRestorePreview(null)}
                style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmRestore}
                style={{ fontSize: 12, fontWeight: 700, padding: '8px 14px', background: '#F59E0B', color: '#fff', border: '1px solid #D97706', borderRadius: 8, cursor: 'pointer' }}>
                Replace all data &amp; restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F2952', fontFamily: 'Inter, sans-serif', marginTop: 2, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

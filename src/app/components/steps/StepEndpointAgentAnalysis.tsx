import { useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, AlertCircle, RefreshCw, Trash2, Monitor, ShieldOff, ServerCog, Clock, Lock, Download, CheckCircle2 } from 'lucide-react';
import { parseEndpointAgentCsv, type EndpointAgentSummary } from './endpointAgentParser';
import { generateEndpointTextReport } from './endpointAgentTextReport';

interface Props {
  summary: EndpointAgentSummary | null;
  setSummary: (s: EndpointAgentSummary | null) => void;
}

export function StepEndpointAgentAnalysis({ summary, setSummary }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = async (file: File) => {
    setParseError(null);
    setIsParsing(true);
    try {
      const text = await file.text();
      const result = parseEndpointAgentCsv(text, file.name);
      if (result.totalRecords === 0) {
        setParseError('No records parsed — verify the file is a Forcepoint DLP Endpoint Status Log export (semicolon-delimited).');
        setIsParsing(false);
        return;
      }
      setSummary(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setIsParsing(false);
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  /* ─── Upload state ─── */
  if (!summary) {
    return (
      <div className="space-y-[13px]">
        <Header summary={null} />
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3"
          style={{ border: '1.5px dashed #CBD5E1' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(6,182,212,0.12)' }}>
            <Upload size={22} style={{ color: '#06B6D4' }} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', textAlign: 'center' }}>
            Upload the Endpoint Status Log
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', maxWidth: '480px', lineHeight: 1.6 }}>
            Drop the Forcepoint DLP <strong>Endpoint Status Log</strong> CSV export here. Semicolon-delimited;
            UTF-8 with optional BOM. Parsed entirely in your browser — nothing is uploaded.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
            className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg,#06B6D4,#0891B2)', opacity: isParsing ? 0.6 : 1 }}
          >
            {isParsing ? 'Parsing…' : <><Upload size={13} /> Choose CSV file</>}
          </button>
          {parseError && (
            <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <AlertCircle size={12} style={{ color: '#DC2626' }} />
              <span style={{ fontSize: '11.5px', color: '#7F1D1D' }}>{parseError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Summary state ─── */
  const handleDownloadTxt = () => {
    if (!summary) return;
    const text = generateEndpointTextReport(summary);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${summary.fileName.replace(/\.[^.]+$/, '') || 'endpoint'}_analysis_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-[13px]">
      <Header summary={summary}
        onReimport={() => fileInputRef.current?.click()}
        onClear={() => setSummary(null)}
        onDownloadTxt={handleDownloadTxt}
        isParsing={isParsing}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={onSelect}
        className="hidden"
      />
      {parseError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertCircle size={13} style={{ color: '#DC2626' }} />
          <span style={{ fontSize: '12px', color: '#7F1D1D' }}>{parseError}</span>
        </div>
      )}

      <KpiCards s={summary} />
      <RiskFindings s={summary} />

      <div className="grid grid-cols-2 gap-[13px]">
        <Panel title="Agent Version Distribution" icon={<Monitor size={13} />} accent="#06B6D4">
          <div style={{ fontSize: '10.5px', color: '#475569', marginBottom: 8, padding: '6px 9px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, lineHeight: 1.5 }}>
            Mark which version is the customer's <strong>active production agent</strong>. Step 6 (Endpoint Compatibility) will evaluate against the version you pick here instead of auto-detecting the highest version seen.
            {summary.activeVersion && (
              <span style={{ display: 'block', marginTop: 4, color: '#0891B2', fontWeight: 600 }}>
                Active: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{summary.activeVersion}</span>
              </span>
            )}
          </div>
          <table className="w-full" style={{ fontSize: '11.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEF0F5', color: '#94A3B8' }}>
                <th className="text-left py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>VERSION</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>COUNT</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>%</th>
                <th className="text-center py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>STATUS</th>
                <th className="text-center py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>ACTIVE</th>
              </tr>
            </thead>
            <tbody>
              {summary.versionDistribution.map((v) => {
                const isLatest = v.version === summary.latestVersion;
                const isActive = v.version === summary.activeVersion;
                const setActive = () => setSummary({
                  ...summary,
                  activeVersion: isActive ? null : v.version,
                });
                return (
                  <tr key={v.version}
                    style={{
                      borderBottom: '1px solid #F4F6FA',
                      background: isActive ? 'rgba(8,145,178,0.06)' : 'transparent',
                    }}>
                    <td className="py-1.5 px-2 font-mono" style={{ color: '#0F172A', fontWeight: isLatest ? 700 : 500 }}>{v.version}</td>
                    <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#334155' }}>{v.count.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#64748B' }}>{v.pct}%</td>
                    <td className="py-1.5 px-2 text-center">
                      {isLatest && <Badge color="#16A34A" bg="rgba(22,163,74,0.1)">LATEST</Badge>}
                      {v.isOutdated && <Badge color="#DC2626" bg="rgba(220,38,38,0.08)">OUTDATED</Badge>}
                      {!isLatest && !v.isOutdated && <Badge color="#94A3B8" bg="#F1F5F9">CURRENT</Badge>}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <button
                        onClick={setActive}
                        title={isActive ? 'Click to clear — Step 6 will fall back to the latest version' : 'Mark this as the active production agent'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: isActive ? '3px 8px' : '3px 7px',
                          fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
                          background: isActive ? '#0891B2' : '#FFFFFF',
                          color: isActive ? '#FFFFFF' : '#475569',
                          border: `1px solid ${isActive ? '#0E7490' : '#CBD5E1'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {isActive ? <><CheckCircle2 size={10} /> ACTIVE</> : 'Set active'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Client Status Breakdown" icon={<ShieldOff size={13} />} accent="#DB2777">
          <table className="w-full" style={{ fontSize: '11.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEF0F5', color: '#94A3B8' }}>
                <th className="text-left py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>STATUS</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>COUNT</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {summary.clientStatusBreakdown.map((r) => {
                const isDisabled = /^(disabled|stopped|not[-_ ]?running|offline)$/i.test(r.status);
                return (
                  <tr key={r.status} style={{ borderBottom: '1px solid #F4F6FA' }}>
                    <td className="py-1.5 px-2" style={{ color: isDisabled ? '#DC2626' : '#0F172A', fontWeight: 500 }}>{r.status}</td>
                    <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#334155' }}>{r.count.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right font-mono" style={{ color: isDisabled ? '#DC2626' : '#64748B', fontWeight: isDisabled ? 700 : 500 }}>{r.pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Endpoint Server Distribution" icon={<ServerCog size={13} />} accent="#3B82F6">
          {summary.serverImbalance && (
            <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-md"
              style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)' }}>
              <AlertTriangle size={11} style={{ color: '#D97706' }} />
              <span style={{ fontSize: '10.5px', color: '#92400E', fontWeight: 600 }}>
                Load imbalance: {summary.serverImbalance.topPct - summary.serverImbalance.bottomPct}% spread
              </span>
            </div>
          )}
          <table className="w-full" style={{ fontSize: '11.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEF0F5', color: '#94A3B8' }}>
                <th className="text-left py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>SERVER</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>COUNT</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {summary.serverDistribution.map((r) => (
                <tr key={r.server} style={{ borderBottom: '1px solid #F4F6FA' }}>
                  <td className="py-1.5 px-2 font-mono" style={{ color: '#0F172A', fontWeight: 500, fontSize: '11px' }}>{r.server}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#334155' }}>{r.count.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#64748B' }}>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Microsoft RMS Status" icon={<Lock size={13} />} accent="#7C3AED">
          {summary.rmsActiveCount + summary.rmsInactiveCount === 0 ? (
            <div style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic' }}>
              No RMS data reported by any endpoint.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-3" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)' }}>
                  <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 700, letterSpacing: '0.06em' }}>ACTIVE</div>
                  <div style={{ fontSize: '22px', color: '#16A34A', fontWeight: 800, lineHeight: 1.2, marginTop: '4px' }}>
                    {summary.rmsActiveCount.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg p-3"
                  style={{
                    background: summary.rmsInactivePct >= 25 ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)',
                    border: `1px solid ${summary.rmsInactivePct >= 25 ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}`,
                  }}>
                  <div style={{ fontSize: '10px', color: summary.rmsInactivePct >= 25 ? '#DC2626' : '#D97706', fontWeight: 700, letterSpacing: '0.06em' }}>
                    INACTIVE
                  </div>
                  <div style={{ fontSize: '22px', color: summary.rmsInactivePct >= 25 ? '#DC2626' : '#D97706', fontWeight: 800, lineHeight: 1.2, marginTop: '4px' }}>
                    {summary.rmsInactiveCount.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                  <div className="h-full"
                    style={{
                      width: `${100 - summary.rmsInactivePct}%`,
                      background: summary.rmsInactivePct >= 25 ? '#DC2626' : '#16A34A',
                      transition: 'width .4s',
                    }} />
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '5px' }}>
                  {summary.rmsInactivePct}% inactive · RMS-protected email/file DLP coverage
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      {summary.staleCount > 0 && (
        <Panel title={`Stale Endpoints (> 30 days)`} icon={<Clock size={13} />} accent="#EA580C">
          <div className="mb-2" style={{ fontSize: '11.5px', color: '#64748B' }}>
            Showing {summary.staleSample.length} of {summary.staleCount.toLocaleString()} stale endpoints (most stale first).
          </div>
          <div className="grid grid-cols-2 gap-1.5" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {summary.staleSample.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                style={{ background: '#FFF7ED', border: '1px solid rgba(234,88,12,0.15)' }}>
                <Monitor size={11} style={{ color: '#EA580C', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#0F172A', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.hostname}
                </span>
                <span style={{ fontSize: '10px', color: '#EA580C', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>
                  {e.daysOld}d
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ─── sub components ───────────────────────────── */

function Header({ summary, onReimport, onClear, onDownloadTxt, isParsing }: {
  summary: EndpointAgentSummary | null;
  onReimport?: () => void;
  onClear?: () => void;
  onDownloadTxt?: () => void;
  isParsing?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_22px]">
      <div className="flex items-center gap-3">
        <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(6,182,212,0.12)' }}>
          <Monitor size={15} style={{ color: '#06B6D4' }} />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Endpoint Agent Analysis</div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {summary
              ? <>
                  <span style={{ fontFamily: 'monospace', color: '#0F172A' }}>{summary.fileName}</span>
                  {' · '}{summary.totalRecords.toLocaleString()} endpoints
                  {' · '}imported {new Date(summary.importedAt).toLocaleString()}
                </>
              : 'Parses the Forcepoint DLP Endpoint Status Log to surface outdated agents, disabled clients, sync drift and load imbalance.'}
          </div>
        </div>
        {summary && (
          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadTxt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white"
              style={{ fontSize: '11px', background: 'linear-gradient(135deg,#06B6D4,#0891B2)' }}
              title="Download the 13-section technical analysis as a .txt file"
            >
              <Download size={11} /> Download TXT Analysis
            </button>
            <button
              onClick={onReimport}
              disabled={isParsing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: 'rgba(6,182,212,0.1)', color: '#0E7490', border: '1px solid rgba(6,182,212,0.25)' }}
            >
              <RefreshCw size={11} /> Reimport
            </button>
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: 'rgba(220,38,38,0.05)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCards({ s }: { s: EndpointAgentSummary }) {
  const cards = [
    { label: 'TOTAL ENDPOINTS', value: s.totalRecords.toLocaleString(), tone: 'neutral' as const },
    { label: 'OUTDATED (<25.x)', value: s.outdatedCount.toLocaleString(), sub: `${s.outdatedPct}% of fleet`, tone: s.outdatedCount > 0 ? 'critical' as const : 'ok' as const },
    { label: 'DISABLED CLIENTS', value: s.disabledCount.toLocaleString(), sub: `${s.disabledPct}% of fleet`, tone: s.disabledCount > 0 ? 'warning' as const : 'ok' as const },
    { label: 'SYNCED = FALSE', value: s.unsyncedCount.toLocaleString(), sub: `${s.unsyncedPct}% stale policy`, tone: s.unsyncedCount > 0 ? 'warning' as const : 'ok' as const },
    { label: 'STALE (>30 DAYS)', value: s.staleCount.toLocaleString(), sub: `${s.stalePct}% not reporting`, tone: s.staleCount > 0 ? 'warning' as const : 'ok' as const },
    { label: 'RMS INACTIVE', value: s.rmsInactiveCount.toLocaleString(), sub: `${s.rmsInactivePct}% of RMS-eligible`, tone: s.rmsInactivePct >= 25 ? 'critical' as const : s.rmsInactivePct > 0 ? 'warning' as const : 'ok' as const },
  ];
  const toneColors = {
    neutral:  { val: '#0F172A', label: '#94A3B8' },
    ok:       { val: '#16A34A', label: '#94A3B8' },
    warning:  { val: '#D97706', label: '#94A3B8' },
    critical: { val: '#DC2626', label: '#94A3B8' },
  };
  return (
    <div className="grid grid-cols-6 gap-[13px]">
      {cards.map((c) => {
        const tone = toneColors[c.tone];
        return (
          <div key={c.label} className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[14px_16px]">
            <div style={{ fontSize: '9px', fontWeight: 700, color: tone.label, letterSpacing: '0.07em' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.1, color: tone.val, marginTop: '5px' }}>{c.value}</div>
            {c.sub && (
              <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{c.sub}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RiskFindings({ s }: { s: EndpointAgentSummary }) {
  const hasRisk = s.topFindings.length > 1 || !/no material/i.test(s.topFindings[0] ?? '');
  return (
    <div className="rounded-xl p-[16px_22px]"
      style={{
        background: hasRisk ? 'rgba(220,38,38,0.04)' : 'rgba(22,163,74,0.05)',
        border: `1.5px solid ${hasRisk ? 'rgba(220,38,38,0.2)' : 'rgba(22,163,74,0.2)'}`,
      }}>
      <div className="flex items-center gap-2 mb-2.5">
        {hasRisk
          ? <AlertTriangle size={14} style={{ color: '#DC2626' }} />
          : <FileText size={14} style={{ color: '#16A34A' }} />}
        <div style={{ fontSize: '12px', fontWeight: 700, color: hasRisk ? '#7F1D1D' : '#14532D' }}>
          Key Risk Summary
        </div>
      </div>
      <ul className="space-y-1.5">
        {s.topFindings.map((f, i) => (
          <li key={i} className="flex items-start gap-2" style={{ fontSize: '12px', color: '#334155', lineHeight: 1.55 }}>
            <span style={{ color: hasRisk ? '#DC2626' : '#16A34A', fontWeight: 700, flexShrink: 0 }}>•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, icon, accent, children }: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[16px_20px]">
      <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <span style={{ color: accent }}>{icon}</span>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded font-mono"
      style={{ fontSize: '9px', fontWeight: 700, color, background: bg, letterSpacing: '0.05em' }}>
      {children}
    </span>
  );
}

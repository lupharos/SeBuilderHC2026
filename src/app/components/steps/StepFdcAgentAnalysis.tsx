import { useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, AlertCircle, RefreshCw, Trash2, Monitor, Tag, Wifi, WifiOff, Clock, Globe } from 'lucide-react';
import { parseFdcAgentCsv, type FdcAgentSummary } from './fdcAgentParser';

interface Props {
  summary: FdcAgentSummary | null;
  setSummary: (s: FdcAgentSummary | null) => void;
}

const ACCENT = '#16A34A';

export function StepFdcAgentAnalysis({ summary, setSummary }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = async (file: File) => {
    setParseError(null);
    setIsParsing(true);
    try {
      const text = await file.text();
      const result = parseFdcAgentCsv(text, file.name);
      if (result.totalRecords === 0) {
        setParseError('No records parsed — verify this is a Forcepoint Data Classification "Agent Management" CSV export (Host name, Operating system, Agent version, Online status, Last seen).');
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

  if (!summary) {
    return (
      <div className="space-y-[13px]">
        <Header summary={null} />
        <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
          className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3" style={{ border: '1.5px dashed #CBD5E1' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.12)' }}>
            <Upload size={22} style={{ color: ACCENT }} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', textAlign: 'center' }}>
            Upload the DSPM + FDC Agent Management export
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', maxWidth: '500px', lineHeight: 1.6 }}>
            Drop the Forcepoint Data Classification <strong>Agent Management</strong> CSV here (Host name, User, Operating
            system, Domain, IP, Agent version, Online status, Last seen). Parsed entirely in your browser — nothing is uploaded.
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/plain" onChange={onSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={isParsing}
            className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
            style={{ fontSize: '12px', background: 'linear-gradient(135deg,#16A34A,#15803D)', opacity: isParsing ? 0.6 : 1 }}>
            {isParsing ? 'Parsing…' : <><Upload size={13} /> Choose CSV file</>}
          </button>
          {parseError && (
            <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <AlertCircle size={12} style={{ color: '#DC2626' }} />
              <span style={{ fontSize: '11.5px', color: '#7F1D1D' }}>{parseError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <Header summary={summary} onReimport={() => fileInputRef.current?.click()} onClear={() => setSummary(null)} isParsing={isParsing} />
      <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/plain" onChange={onSelect} className="hidden" />
      {parseError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertCircle size={13} style={{ color: '#DC2626' }} />
          <span style={{ fontSize: '12px', color: '#7F1D1D' }}>{parseError}</span>
        </div>
      )}

      <KpiCards s={summary} />
      <RiskFindings s={summary} />

      <div className="grid grid-cols-2 gap-[13px]">
        <Panel title="Agent Version Distribution" icon={<Tag size={13} />} accent={ACCENT}>
          <DistTable
            rows={summary.versionDistribution.map((v) => ({
              label: v.version, count: v.count, pct: v.pct,
              badge: v.isLatest ? { text: 'LATEST', color: '#16A34A', bg: 'rgba(22,163,74,0.1)' }
                : v.isOutdated ? { text: 'OUTDATED', color: '#DC2626', bg: 'rgba(220,38,38,0.08)' }
                : { text: 'CURRENT', color: '#94A3B8', bg: '#F1F5F9' },
            }))}
            mono
          />
        </Panel>

        <Panel title="Online / Offline" icon={<Wifi size={13} />} accent="#0EA5E9">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg p-3" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.18)' }}>
              <div className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#16A34A', fontWeight: 700, letterSpacing: '0.06em' }}><Wifi size={11} /> ONLINE</div>
              <div style={{ fontSize: '22px', color: '#16A34A', fontWeight: 800, lineHeight: 1.2, marginTop: '4px' }}>{summary.onlineCount.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: '#64748B', marginTop: 2 }}>{summary.onlinePct}% of records</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: summary.offlinePct >= 50 ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)', border: `1px solid ${summary.offlinePct >= 50 ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}` }}>
              <div className="flex items-center gap-1.5" style={{ fontSize: '10px', color: summary.offlinePct >= 50 ? '#DC2626' : '#D97706', fontWeight: 700, letterSpacing: '0.06em' }}><WifiOff size={11} /> OFFLINE</div>
              <div style={{ fontSize: '22px', color: summary.offlinePct >= 50 ? '#DC2626' : '#D97706', fontWeight: 800, lineHeight: 1.2, marginTop: '4px' }}>{summary.offlineCount.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: '#64748B', marginTop: 2 }}>{summary.offlinePct}% of records</div>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
            <div className="h-full" style={{ width: `${summary.onlinePct}%`, background: '#16A34A', transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '6px' }}>
            {summary.uniqueHosts.toLocaleString()} unique host{summary.uniqueHosts === 1 ? '' : 's'} · {summary.totalRecords.toLocaleString()} record{summary.totalRecords === 1 ? '' : 's'}
            {summary.newestSeen && <> · last activity {summary.newestSeen}</>}
          </div>
        </Panel>

        <Panel title="Operating Systems" icon={<Monitor size={13} />} accent="#2563EB">
          <DistTable rows={summary.osDistribution.map((r) => ({ label: r.label, count: r.count, pct: r.pct }))} />
        </Panel>

        <Panel title="Domain Distribution" icon={<Globe size={13} />} accent="#7C3AED">
          <DistTable rows={summary.domainDistribution.map((r) => ({ label: r.label, count: r.count, pct: r.pct }))} mono />
        </Panel>
      </div>

      {summary.staleCount > 0 && (
        <Panel title="Stale Hosts (> 30 days since last seen)" icon={<Clock size={13} />} accent="#EA580C">
          <div className="mb-2" style={{ fontSize: '11.5px', color: '#64748B' }}>
            Showing {summary.staleSample.length} of {summary.staleCount.toLocaleString()} stale host{summary.staleCount === 1 ? '' : 's'} (most stale first).
          </div>
          <div className="grid grid-cols-2 gap-1.5" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {summary.staleSample.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ background: '#FFF7ED', border: '1px solid rgba(234,88,12,0.15)' }}>
                <Monitor size={11} style={{ color: '#EA580C', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#0F172A', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.hostname}</span>
                <span style={{ fontSize: '10px', color: '#EA580C', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{e.daysOld}d</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Hosts" icon={<Monitor size={13} />} accent={ACCENT}>
        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
          <table className="w-full" style={{ fontSize: '11.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EEF0F5', color: '#94A3B8' }}>
                {['HOST', 'OS', 'VERSION', 'STATUS', 'LAST SEEN', 'IP'].map((h) => (
                  <th key={h} className="text-left py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.hostsSample.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F4F6FA' }}>
                  <td className="py-1.5 px-2 font-mono" style={{ color: '#0F172A', fontWeight: 500 }}>{r.hostname}</td>
                  <td className="py-1.5 px-2" style={{ color: '#475569' }}>{r.os}</td>
                  <td className="py-1.5 px-2 font-mono" style={{ color: '#334155' }}>{r.version}</td>
                  <td className="py-1.5 px-2">
                    <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: r.online ? '#16A34A' : '#DC2626', background: r.online ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)' }}>
                      {r.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 font-mono" style={{ color: r.daysSinceLastSeen != null && r.daysSinceLastSeen > 30 ? '#EA580C' : '#64748B' }}>
                    {r.lastSeen}{r.daysSinceLastSeen != null && <span style={{ color: '#94A3B8' }}> ({r.daysSinceLastSeen}d)</span>}
                  </td>
                  <td className="py-1.5 px-2 font-mono" style={{ color: '#64748B' }}>{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ── sub components ── */
function Header({ summary, onReimport, onClear, isParsing }: { summary: FdcAgentSummary | null; onReimport?: () => void; onClear?: () => void; isParsing?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_22px]">
      <div className="flex items-center gap-3">
        <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(22,163,74,0.12)' }}>
          <Tag size={15} style={{ color: ACCENT }} />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>DSPM + FDC Agent Analysis</div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
            {summary
              ? <><span style={{ fontFamily: 'monospace', color: '#0F172A' }}>{summary.fileName}</span>{' · '}{summary.totalRecords.toLocaleString()} records · {summary.uniqueHosts.toLocaleString()} hosts · imported {new Date(summary.importedAt).toLocaleString()}</>
              : 'Parses the Data Classification Agent Management export to surface agent versions, online/offline status, OS spread and stale hosts.'}
          </div>
        </div>
        {summary && (
          <div className="flex items-center gap-2">
            <button onClick={onReimport} disabled={isParsing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold" style={{ fontSize: '11px', background: 'rgba(22,163,74,0.1)', color: '#15803D', border: '1px solid rgba(22,163,74,0.25)' }}>
              <RefreshCw size={11} /> Reimport
            </button>
            <button onClick={onClear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold" style={{ fontSize: '11px', background: 'rgba(220,38,38,0.05)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)' }}>
              <Trash2 size={11} /> Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCards({ s }: { s: FdcAgentSummary }) {
  const cards = [
    { label: 'TOTAL RECORDS', value: s.totalRecords.toLocaleString(), tone: 'neutral' as const },
    { label: 'UNIQUE HOSTS', value: s.uniqueHosts.toLocaleString(), tone: 'neutral' as const },
    { label: 'ONLINE', value: s.onlineCount.toLocaleString(), sub: `${s.onlinePct}%`, tone: 'ok' as const },
    { label: 'OFFLINE', value: s.offlineCount.toLocaleString(), sub: `${s.offlinePct}%`, tone: s.offlinePct >= 50 ? 'critical' as const : s.offlineCount > 0 ? 'warning' as const : 'ok' as const },
    { label: 'STALE (>30 DAYS)', value: s.staleCount.toLocaleString(), sub: `${s.stalePct}% of hosts`, tone: s.staleCount > 0 ? 'warning' as const : 'ok' as const },
    { label: 'LATEST VERSION', value: s.latestVersion || '—', tone: 'neutral' as const },
  ];
  const toneColors = {
    neutral: { val: '#0F172A' }, ok: { val: '#16A34A' }, warning: { val: '#D97706' }, critical: { val: '#DC2626' },
  };
  return (
    <div className="grid grid-cols-6 gap-[13px]">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[14px_16px]">
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em' }}>{c.label}</div>
          <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1.1, color: toneColors[c.tone].val, marginTop: '5px', fontFamily: c.label === 'LATEST VERSION' ? "'JetBrains Mono', monospace" : 'inherit' }}>{c.value}</div>
          {c.sub && <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function RiskFindings({ s }: { s: FdcAgentSummary }) {
  const hasRisk = s.topFindings.length > 1 || !/no material/i.test(s.topFindings[0] ?? '');
  return (
    <div className="rounded-xl p-[16px_22px]" style={{ background: hasRisk ? 'rgba(220,38,38,0.04)' : 'rgba(22,163,74,0.05)', border: `1.5px solid ${hasRisk ? 'rgba(220,38,38,0.2)' : 'rgba(22,163,74,0.2)'}` }}>
      <div className="flex items-center gap-2 mb-2.5">
        {hasRisk ? <AlertTriangle size={14} style={{ color: '#DC2626' }} /> : <FileText size={14} style={{ color: '#16A34A' }} />}
        <div style={{ fontSize: '12px', fontWeight: 700, color: hasRisk ? '#7F1D1D' : '#14532D' }}>Key Risk Summary</div>
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

function Panel({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
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

function DistTable({ rows, mono }: { rows: { label: string; count: number; pct: number; badge?: { text: string; color: string; bg: string } }[]; mono?: boolean }) {
  if (rows.length === 0) return <div style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic' }}>No data.</div>;
  return (
    <table className="w-full" style={{ fontSize: '11.5px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #EEF0F5', color: '#94A3B8' }}>
          <th className="text-left py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>VALUE</th>
          <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>COUNT</th>
          <th className="text-right py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>%</th>
          {rows.some((r) => r.badge) && <th className="text-center py-1.5 px-2 font-semibold" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>STATUS</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} style={{ borderBottom: '1px solid #F4F6FA' }}>
            <td className="py-1.5 px-2" style={{ color: '#0F172A', fontWeight: 500, fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit' }}>{r.label}</td>
            <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#334155' }}>{r.count.toLocaleString()}</td>
            <td className="py-1.5 px-2 text-right font-mono" style={{ color: '#64748B' }}>{r.pct}%</td>
            {rows.some((x) => x.badge) && (
              <td className="py-1.5 px-2 text-center">
                {r.badge && <span className="px-1.5 py-0.5 rounded font-mono" style={{ fontSize: '9px', fontWeight: 700, color: r.badge.color, background: r.badge.bg, letterSpacing: '0.05em' }}>{r.badge.text}</span>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

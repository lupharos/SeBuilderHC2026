import { useState } from 'react';
import { Monitor, Tag } from 'lucide-react';
import { StepEndpointAgentAnalysis } from './StepEndpointAgentAnalysis';
import { StepFdcAgentAnalysis } from './StepFdcAgentAnalysis';
import type { EndpointAgentSummary } from './endpointAgentParser';
import type { FdcAgentSummary } from './fdcAgentParser';

/* Step 6 wrapper. Two endpoint agents are analysed here, each with its own
   CSV import: the F1E agent (DLP / Web — Endpoint Status Log) and the
   DSPM + FDC agent (Data Classification — Agent Management export). Which
   tab(s) appear is driven by the Step-2 product scope. */
interface Props {
  summary: EndpointAgentSummary | null;
  setSummary: (s: EndpointAgentSummary | null) => void;
  fdcSummary: FdcAgentSummary | null;
  setFdcSummary: (s: FdcAgentSummary | null) => void;
  selectedProducts: Record<string, boolean>;
}

type AgentTab = 'f1e' | 'fdc';

export function StepEndpointAgents({ summary, setSummary, fdcSummary, setFdcSummary, selectedProducts }: Props) {
  const f1eInScope = !!selectedProducts.data;
  const fdcInScope = !!selectedProducts.dspm || !!selectedProducts.cls;
  const [tab, setTab] = useState<AgentTab>(f1eInScope ? 'f1e' : 'fdc');

  /* Single-agent scope → render that panel directly, no tab chrome. */
  if (f1eInScope && !fdcInScope) return <StepEndpointAgentAnalysis summary={summary} setSummary={setSummary} />;
  if (fdcInScope && !f1eInScope) return <StepFdcAgentAnalysis summary={fdcSummary} setSummary={setFdcSummary} />;

  const active: AgentTab = tab === 'fdc' && fdcInScope ? 'fdc' : tab === 'f1e' && f1eInScope ? 'f1e' : (f1eInScope ? 'f1e' : 'fdc');

  const TABS: { key: AgentTab; label: string; sub: string; icon: React.ReactNode; count: number | null }[] = [
    { key: 'f1e', label: 'F1E Agent', sub: 'DLP / Web — Endpoint Status Log', icon: <Monitor size={13} />, count: summary?.totalRecords ?? null },
    { key: 'fdc', label: 'DSPM + FDC Agent', sub: 'Data Classification — Agent Management', icon: <Tag size={13} />, count: fdcSummary?.totalRecords ?? null },
  ];

  return (
    <div className="space-y-[13px]">
      <div className="flex items-center gap-2">
        {TABS.map((t) => {
          const on = active === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                background: on ? (t.key === 'fdc' ? '#16A34A' : '#06B6D4') : '#FFFFFF',
                color: on ? '#fff' : '#0F172A',
                border: `1.5px solid ${on ? (t.key === 'fdc' ? '#15803D' : '#0891B2') : '#E2E8F0'}`,
                transition: 'all 0.15s',
              }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: '12.5px', fontWeight: 700 }}>
                <span style={{ color: on ? '#fff' : (t.key === 'fdc' ? '#16A34A' : '#06B6D4') }}>{t.icon}</span>
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span style={{ fontFamily: 'monospace', fontSize: '10px', background: on ? 'rgba(255,255,255,0.22)' : '#E2E8F0', color: on ? '#fff' : '#475569', padding: '1px 6px', borderRadius: 8 }}>{t.count}</span>
                )}
              </span>
              <span style={{ fontSize: '10px', color: on ? 'rgba(255,255,255,0.85)' : '#94A3B8' }}>{t.sub}</span>
            </button>
          );
        })}
      </div>

      {active === 'f1e'
        ? <StepEndpointAgentAnalysis summary={summary} setSummary={setSummary} />
        : <StepFdcAgentAnalysis summary={fdcSummary} setSummary={setFdcSummary} />}
    </div>
  );
}

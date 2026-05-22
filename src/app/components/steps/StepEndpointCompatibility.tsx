import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, ArrowUpCircle,
  CheckCircle2, XCircle, Info, MonitorSmartphone, Globe, ServerCog, Cpu,
  Layers, Smartphone, Lock, Pencil, Plus, Trash2, RotateCcw,
} from 'lucide-react';
import {
  type EndpointSupportMatrix,
  type EndpointCoverage,
  COVERAGE_FULL_NAMES,
  COVERAGE_COLORS,
  isMatrixEmpty,
} from '../../constants/endpointSupportMatrix';
import {
  type EndpointCompatibilityInput,
  type EndpointCompatibilityAssessment,
  type CompatibilityStatus,
  type Severity,
  type Urgency,
  type CompatibilityFinding,
  type OSCompatibilityRow,
  type BrowserCompatibilityRow,
  type CriticalNoteRow,
  runCompatibilityAssessment,
  EMPTY_COMPAT_INPUT,
} from '../../utils/endpointCompatibilityEngine';
import type { EndpointAgentSummary } from './endpointAgentParser';
import type { VersionEntry } from './Step4VersionCheck';

/* Where the displayed agent version originated. step4Mode tracks which
   F1E module the Step 4 fallback is representing — drives the label
   ("DLP", "Hybrid Web", or the combined "DLP + Hybrid Web"). */
type AgentSource =
  | { kind: 'step6' }
  | { kind: 'step4'; mode: 'dlp' | 'web' | 'both' }
  | null;

interface Props {
  input: EndpointCompatibilityInput;
  setInput: React.Dispatch<React.SetStateAction<EndpointCompatibilityInput>>;
  assessment: EndpointCompatibilityAssessment | null;
  setAssessment: React.Dispatch<React.SetStateAction<EndpointCompatibilityAssessment | null>>;
  matrix: EndpointSupportMatrix;
  endpointAgentSummary: EndpointAgentSummary | null;
  /* Step 6 CSV is preferred; when it's absent, we fall back to Step 4's
     Endpoint Agent installed version. With both DLP + Web in scope the
     DLP entry is dominant — the F1E agent is the same binary on the box
     regardless of which Forcepoint modules use it. */
  versionEntries?: Record<string, VersionEntry>;
  /* Product scope from Step 2 — selects which Step 4 entry is used and
     how the AgentContextCard labels the agent (DLP / Hybrid Web / both). */
  selectedProducts?: Record<string, boolean>;
}

const STATUS_CFG: Record<CompatibilityStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; subtitle: string }> = {
  SUPPORTED: { label: 'Supported', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: <ShieldCheck size={24} />, subtitle: "Customer fleet meets the certified baseline for the selected solutions." },
  AT_RISK:   { label: 'At Risk',   color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', icon: <ShieldAlert size={24} />, subtitle: 'Coverage degraded — upgrade required to close at least one gap.' },
  CRITICAL:  { label: 'Critical',  color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', icon: <ShieldX size={24} />, subtitle: 'DLP coverage is breaking on at least one channel — immediate action required.' },
};

const SEV_CFG: Record<Severity, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' },
  HIGH:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  MEDIUM:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' },
  LOW:      { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
};

const URGENCY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  IMMEDIATE:  { label: 'Immediate',  color: '#A30080', bg: '#FDF2F8' },
  SHORT_TERM: { label: 'Short Term', color: '#DC2626', bg: '#FEF2F2' },
  PLANNED:    { label: 'Planned',    color: '#0284C7', bg: '#F0F9FF' },
};

const SOLUTION_META: Record<EndpointCoverage, { icon: React.ReactNode; subtitle: string }> = {
  dlp:    { icon: <Lock size={16} />,              subtitle: 'Data Loss Prevention — file, channel, and clipboard inspection.' },
  direct: { icon: <Globe size={16} />,             subtitle: 'Direct Connect — agent steers browser traffic to cloud SWG.' },
  proxy:  { icon: <ServerCog size={16} />,         subtitle: 'Proxy Connect — agent uses on-prem proxy / content gateway.' },
};

export function StepEndpointCompatibility({
  input, setInput, assessment, setAssessment, matrix, endpointAgentSummary, versionEntries, selectedProducts,
}: Props) {
  const matrixEmpty = isMatrixEmpty(matrix);
  /* When edit mode is on the engine stops overwriting the assessment so the
     operator can freely customize titles, descriptions, severities, etc.
     Toggle off (or click Re-run) to recompute from scratch. */
  const [editMode, setEditMode] = useState(false);

  /* ── Agent version source resolution ──────────────────────────────
       Priority order:
         1. Step 6 CSV summary (dominant — the operator imported real
            endpoint telemetry, that always wins).
         2. Step 4 "Endpoint Agent (DLP)" installedVersion (dominant over
            Web when DLP is in scope — same agent binary on the box).
         3. Step 4 "Endpoint Agent (Hybrid Web)" installedVersion (used
            in Web-only scope or when the DLP entry is empty).
       The label on the AgentContextCard reflects which scope the fallback
       is representing — DLP, Hybrid Web, or both combined. ── */
  const dlpInScope = !!selectedProducts?.data;
  const webInScope = !!selectedProducts?.web;
  const dlpEntryVersion = (() => {
    const e = versionEntries?.dlp_endpoint;
    if (!e || e.removed) return '';
    return (e.installedVersion ?? '').trim();
  })();
  const webEntryVersion = (() => {
    const e = versionEntries?.web_endpoint;
    if (!e || e.removed) return '';
    return (e.installedVersion ?? '').trim();
  })();

  /* Pick the fallback version + label mode. With DLP in scope the DLP
     entry wins; the label switches to "both" when Web is also in scope
     even if the displayed number came from DLP, because the agent on
     the box is servicing both modules. */
  const step4Fallback: { version: string; mode: 'dlp' | 'web' | 'both' } | null = (() => {
    if (dlpInScope && dlpEntryVersion) {
      return { version: dlpEntryVersion, mode: webInScope ? 'both' : 'dlp' };
    }
    if (webInScope && webEntryVersion) {
      return { version: webEntryVersion, mode: 'web' };
    }
    if (dlpInScope && webEntryVersion) {
      /* DLP scope but DLP entry empty — fall back to Web's value rather
         than nothing. Label as 'web' so the user knows it isn't the DLP
         module they expected. */
      return { version: webEntryVersion, mode: 'web' };
    }
    return null;
  })();

  /* Operator-selected active version on Step 5 wins over the auto-detected
     "latest seen" version. Falls back to latestVersion when nothing was
     explicitly picked. */
  const step6Version = endpointAgentSummary?.activeVersion ?? endpointAgentSummary?.latestVersion ?? null;
  const step6IsOperatorPicked = !!endpointAgentSummary?.activeVersion;

  const agentSource: AgentSource =
    step6Version                        ? { kind: 'step6' }
    : step4Fallback                     ? { kind: 'step4', mode: step4Fallback.mode }
    : null;

  useEffect(() => {
    const wantAgentVersion = step6Version ?? step4Fallback?.version ?? '';
    const wantTotalEndpoints = endpointAgentSummary?.totalRecords ?? 0;
    setInput((prev) => {
      /* Defensive guard — only commit a new input object when at least
         one of the agent fields actually changed. Without this, the
         functional update returned a fresh object on every render of
         this effect's deps, which (in combination with the fact that
         `endpointAgentSummary` can be a new reference even when its
         contents are unchanged after a sibling step re-renders) cascaded
         into a setInput → input change → liveAssessment recompute →
         setAssessment → re-render loop. */
      if (prev.agentVersion === wantAgentVersion && prev.totalEndpoints === wantTotalEndpoints) {
        return prev;
      }
      return { ...prev, agentVersion: wantAgentVersion, totalEndpoints: wantTotalEndpoints };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointAgentSummary, step4Fallback?.version, step6Version]);

  /* ── Live assessment ── */
  const liveAssessment = useMemo(
    () => (matrixEmpty ? null : runCompatibilityAssessment(input, matrix)),
    [input, matrix, matrixEmpty],
  );

  /* Persist into session state. In edit mode the engine is paused — the
     operator owns the assessment. Outside edit mode we always reset to the
     freshly computed assessment, preserving per-note include-in-report
     toggles (those are valid operator decisions worth keeping across
     recomputes). */
  useEffect(() => {
    if (editMode) return;
    if (!liveAssessment) { setAssessment(null); return; }
    setAssessment((prev) => {
      if (!prev) return liveAssessment;
      const overrideMap = new Map(prev.criticalNotes.map((n) => [n.title, n.includeInReport]));
      return {
        ...liveAssessment,
        criticalNotes: liveAssessment.criticalNotes.map((n) =>
          overrideMap.has(n.title) ? { ...n, includeInReport: overrideMap.get(n.title)! } : n,
        ),
      };
    });
  }, [liveAssessment, setAssessment, editMode]);

  function rerunFromEnvironment() {
    if (liveAssessment) setAssessment(liveAssessment);
    setEditMode(false);
  }

  /* ── Derive option lists from the imported matrix ── */
  const osOptions = useMemo(() => {
    const all = [
      ...matrix.windows.filter((r) => !/server/i.test(r.platform)).map((r) => r.platform),
      ...matrix.macos.map((r) => r.platform),
    ];
    return Array.from(new Set(all));
  }, [matrix]);

  const serverOSOptions = useMemo(
    () => Array.from(new Set(matrix.windows.filter((r) => /server/i.test(r.platform)).map((r) => r.platform))),
    [matrix],
  );

  const vdiOptions = useMemo(
    () => Array.from(new Set(matrix.vdi.map((r) => r.platform))),
    [matrix],
  );

  const browserOptions = useMemo(
    () => Array.from(new Set(matrix.browsers.map((r) => r.browser))),
    [matrix],
  );

  /* ── Field accessors (plural; fall back to legacy singletons) ── */
  const solutions  = input.solutions ?? [];
  const osEnv      = input.osEnvironment ?? [];
  const serverOSes = input.serverOSes ?? (input.serverOS ? [input.serverOS] : []);
  const vdiPlats   = input.vdiPlatforms ?? (input.vdiPlatform ? [input.vdiPlatform] : []);
  const browsers   = input.browsers ?? (input.primaryBrowser ? [input.primaryBrowser] : []);

  function toggleArrField<T extends string>(field: keyof EndpointCompatibilityInput, value: T) {
    setInput((prev) => {
      const cur = ((prev[field] as string[] | undefined) ?? []).slice();
      const i = cur.indexOf(value);
      if (i >= 0) cur.splice(i, 1); else cur.push(value);
      return { ...prev, [field]: cur };
    });
  }

  function toggleSolution(s: EndpointCoverage) {
    setInput((prev) => {
      const cur = (prev.solutions ?? []).slice();
      const i = cur.indexOf(s);
      if (i >= 0) cur.splice(i, 1); else cur.push(s);
      return { ...prev, solutions: cur };
    });
  }

  function setCriticalNoteInclude(title: string, include: boolean) {
    setAssessment((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        criticalNotes: prev.criticalNotes.map((n) => (n.title === title ? { ...n, includeInReport: include } : n)),
      };
    });
  }

  /* ── Edit-mode mutators — applied directly to the assessment so the
       operator can shape every field that ships into the report. ── */
  function patchAssessment(p: Partial<EndpointCompatibilityAssessment>) {
    setAssessment((prev) => prev ? { ...prev, ...p } : prev);
  }
  function patchFinding(id: string, p: Partial<CompatibilityFinding>) {
    setAssessment((prev) => prev ? { ...prev, findings: prev.findings.map((f) => f.id === id ? { ...f, ...p } : f) } : prev);
  }
  function deleteFinding(id: string) {
    setAssessment((prev) => prev ? { ...prev, findings: prev.findings.filter((f) => f.id !== id) } : prev);
  }
  function addFinding() {
    setAssessment((prev) => prev ? {
      ...prev,
      findings: [...prev.findings, {
        id: `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        severity: 'MEDIUM',
        title: 'New custom finding',
        description: 'Describe the issue in business terms here.',
        affectedComponents: [],
        affectedEndpoints: input.totalEndpoints,
        affectedPct: '100%',
        recommendation: 'Recommended next step.',
      }],
    } : prev);
  }
  function patchOSRow(idx: number, p: Partial<OSCompatibilityRow>) {
    setAssessment((prev) => prev ? { ...prev, osCompatibility: prev.osCompatibility.map((r, i) => i === idx ? { ...r, ...p } : r) } : prev);
  }
  function deleteOSRow(idx: number) {
    setAssessment((prev) => prev ? { ...prev, osCompatibility: prev.osCompatibility.filter((_, i) => i !== idx) } : prev);
  }
  function addOSRow() {
    setAssessment((prev) => prev ? {
      ...prev,
      osCompatibility: [...prev.osCompatibility, { os: 'New OS', minAgentRequired: '—', customerAgentCompatible: true, status: 'SUPPORTED', note: '' }],
    } : prev);
  }
  function patchBrowserRow(idx: number, p: Partial<BrowserCompatibilityRow>) {
    setAssessment((prev) => prev ? { ...prev, browserCompatibility: prev.browserCompatibility.map((r, i) => i === idx ? { ...r, ...p } : r) } : prev);
  }
  function deleteBrowserRow(idx: number) {
    setAssessment((prev) => prev ? { ...prev, browserCompatibility: prev.browserCompatibility.filter((_, i) => i !== idx) } : prev);
  }
  function addBrowserRow() {
    setAssessment((prev) => prev ? {
      ...prev,
      browserCompatibility: [...prev.browserCompatibility, { browser: 'New browser', platform: 'Windows', minAgentRequired: '—', mv3Required: false, customerAgentCompatible: true, status: 'SUPPORTED', note: '' }],
    } : prev);
  }
  function patchCritNote(idx: number, p: Partial<CriticalNoteRow>) {
    setAssessment((prev) => prev ? { ...prev, criticalNotes: prev.criticalNotes.map((n, i) => i === idx ? { ...n, ...p } : n) } : prev);
  }
  function deleteCritNote(idx: number) {
    setAssessment((prev) => prev ? { ...prev, criticalNotes: prev.criticalNotes.filter((_, i) => i !== idx) } : prev);
  }
  function addCritNote() {
    setAssessment((prev) => prev ? {
      ...prev,
      criticalNotes: [...prev.criticalNotes, { severity: 'MEDIUM', title: 'New compatibility note', description: '', includeInReport: true }],
    } : prev);
  }
  function setUpgradeRec(rec: EndpointCompatibilityAssessment['upgradeRecommendation']) {
    setAssessment((prev) => prev ? { ...prev, upgradeRecommendation: rec } : prev);
  }

  function clearAll() {
    setInput({ ...EMPTY_COMPAT_INPUT, agentVersion: input.agentVersion, totalEndpoints: input.totalEndpoints });
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <Header editMode={editMode} onToggleEdit={() => setEditMode((v) => !v)} onReset={clearAll} onRerun={rerunFromEnvironment} hasAssessment={!!assessment} />

      {matrixEmpty && <MatrixMissingBanner />}
      {agentSource === null && <AgentMissingBanner />}

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 420px) 1fr' }}>
        {/* ─────────────  LEFT: Customer Environment  ───────────── */}
        <div className="flex flex-col gap-4">
          {/* Agent context — Step 6 CSV when present, otherwise Step 4's
              "Endpoint Agent (Hybrid Web)" installed version. */}
          <AgentContextCard summary={endpointAgentSummary} agentVersion={input.agentVersion} totalEndpoints={input.totalEndpoints} source={agentSource} operatorPicked={step6IsOperatorPicked} />

          {/* Forcepoint solutions in use */}
          <FieldCard title="Forcepoint Solutions in Use" subtitle="Which F1E products the customer's agent is deployed for. Filters the matrix accordingly.">
            <div className="flex flex-col gap-2">
              {(['dlp','direct','proxy'] as const).map((k) => {
                const on = solutions.includes(k);
                const color = COVERAGE_COLORS[k];
                const meta = SOLUTION_META[k];
                return (
                  <button key={k} onClick={() => toggleSolution(k)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 11, textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: on ? `${color}0E` : '#FFFFFF',
                      border: `1.5px solid ${on ? color : '#E2E8F0'}`,
                      cursor: 'pointer',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = '#CBD5E1'; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                  >
                    <div className="rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ width: 28, height: 28, background: on ? color : `${color}14`, color: on ? '#fff' : color, marginTop: 1 }}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: on ? color : '#1D252C', letterSpacing: '-0.005em' }}>
                        {COVERAGE_FULL_NAMES[k]}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.5, marginTop: 2 }}>{meta.subtitle}</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? color : '#F8FAFC', border: `1.5px solid ${on ? color : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 3, flexShrink: 0 }}>
                      {on && <CheckCircle2 size={11} color="#fff" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </FieldCard>

          {/* Operating Systems */}
          <FieldCard title="Operating Systems" subtitle="Workstation OS versions the agent is deployed on.">
            {osOptions.length > 0 ? (
              <ChipMultiSelect options={osOptions} value={osEnv} onToggle={(v) => toggleArrField('osEnvironment', v)} accent="#0EA5E9" />
            ) : <EmptyChipHint label="No OS rows in matrix" />}
          </FieldCard>

          {/* Server OSes */}
          <FieldCard title="Server Operating Systems" subtitle="Windows Server hosts running F1E management or content-gateway roles.">
            {serverOSOptions.length > 0 ? (
              <ChipMultiSelect options={serverOSOptions} value={serverOSes} onToggle={(v) => toggleArrField('serverOSes', v)} accent="#0F2952" />
            ) : <EmptyChipHint label="No server-OS rows in matrix" />}
          </FieldCard>

          {/* VDI Platforms */}
          <FieldCard title="VDI Platforms" subtitle="Virtual-desktop infrastructure the agent runs on, if any.">
            {vdiOptions.length > 0 ? (
              <ChipMultiSelect options={vdiOptions} value={vdiPlats} onToggle={(v) => toggleArrField('vdiPlatforms', v)} accent="#B58800" />
            ) : <EmptyChipHint label="No VDI rows in matrix" />}
          </FieldCard>

          {/* Browsers */}
          <FieldCard title="Browsers" subtitle="Browsers the user fleet uses day-to-day.">
            {browserOptions.length > 0 ? (
              <ChipMultiSelect options={browserOptions} value={browsers} onToggle={(v) => toggleArrField('browsers', v)} accent="#7C3AED" />
            ) : <EmptyChipHint label="No browser rows in matrix" />}
          </FieldCard>
        </div>

        {/* ─────────────  RIGHT: Compatibility Analysis  ───────────── */}
        <div className="flex flex-col gap-4">
          {assessment ? (
            <>
              <StatusBanner assessment={assessment} editMode={editMode} onPatch={patchAssessment} />
              {/* Solution-coverage strip */}
              {solutions.length > 0 && (
                <SolutionsStrip solutions={solutions} />
              )}
              <FindingsList assessment={assessment} editMode={editMode} onPatch={patchFinding} onDelete={deleteFinding} onAdd={addFinding} />
              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <OSCompatibilityCard assessment={assessment} editMode={editMode} onPatch={patchOSRow} onDelete={deleteOSRow} onAdd={addOSRow} />
                <BrowserCompatibilityCard assessment={assessment} editMode={editMode} onPatch={patchBrowserRow} onDelete={deleteBrowserRow} onAdd={addBrowserRow} />
              </div>
              <CriticalNotesCard assessment={assessment} editMode={editMode} onToggleInclude={setCriticalNoteInclude} onPatch={patchCritNote} onDelete={deleteCritNote} onAdd={addCritNote} />
              {(assessment.upgradeRecommendation || editMode) && (
                <UpgradeRecommendationCard assessment={assessment} editMode={editMode} onChange={setUpgradeRec} />
              )}
            </>
          ) : (
            <div className="rounded-xl flex flex-col items-center justify-center text-center px-6 py-12"
              style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1' }}>
              <Info size={28} color="#94A3B8" />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginTop: 10 }}>
                {matrixEmpty
                  ? 'Import the OS / Browser Support Matrix to enable this assessment.'
                  : 'Pick the customer environment on the left to run the assessment.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════════════════ */

function Header({ editMode, onToggleEdit, onReset, onRerun, hasAssessment }: { editMode: boolean; onToggleEdit: () => void; onReset: () => void; onRerun: () => void; hasAssessment: boolean }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#0EA5E9,#0284C7)' }}>
          <MonitorSmartphone size={20} color="#fff" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F2952', letterSpacing: '-0.01em' }}>
              Agent Compatibility
            </div>
            {editMode && (
              <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.06em' }}>
                ✎ EDITING — ENGINE PAUSED
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
            {editMode
              ? 'Every field is editable. Add, remove, or rephrase findings, OS / browser rows, critical notes, and the upgrade recommendation. Click Re-run to discard edits and regenerate from the environment.'
              : "Choose the Forcepoint solutions in use and the customer's OS / browser / VDI fleet. The right-hand panel shows the resulting compatibility posture from the imported support matrix."}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasAssessment && (
          <button onClick={onRerun}
            title="Discard manual edits and recompute the assessment from the customer environment"
            style={{ fontSize: '11px', padding: '6px 12px', background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RotateCcw size={11} /> Re-run
          </button>
        )}
        <button onClick={onToggleEdit}
          title={editMode ? 'Lock the assessment back to engine-driven' : 'Switch to full edit mode — every field becomes editable'}
          style={{
            fontSize: '11px', padding: '6px 12px',
            background: editMode ? '#7C3AED' : '#FFFFFF',
            color: editMode ? '#fff' : '#0F2952',
            border: `1px solid ${editMode ? '#5B21B6' : '#CBD5E1'}`,
            borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
          }}>
          <Pencil size={11} /> {editMode ? 'Done editing' : 'Edit'}
        </button>
        <button onClick={onReset}
          style={{ fontSize: '11px', padding: '6px 12px', background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 8, cursor: 'pointer' }}>
          Reset selections
        </button>
      </div>
    </div>
  );
}

function MatrixMissingBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B' }}>
      <AlertTriangle size={16} style={{ color: '#B58800', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: '12.5px', color: '#92400E', lineHeight: 1.55 }}>
        <strong>OS / Browser Support Matrix is empty.</strong> Import the Forcepoint F1E support matrix HTML from the
        left-rail "OS / Browser Support Matrix" page first — without it, this assessment has no compatibility floor to
        compare against.
      </div>
    </div>
  );
}

function AgentMissingBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderLeft: '3px solid #0EA5E9' }}>
      <Info size={16} style={{ color: '#0284C7', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: '12.5px', color: '#0C4A6E', lineHeight: 1.55 }}>
        <strong>No endpoint-agent version detected.</strong> Upload the agent CSV in
        Step 6 — Endpoint Agent Analysis (DLP scope), or record the "Endpoint Agent (Hybrid Web)"
        installed version in Step 4 — Version &amp; EoS Analysis (Web scope). This page will pick it up automatically.
      </div>
    </div>
  );
}

function AgentContextCard({ summary, agentVersion, totalEndpoints, source, operatorPicked }: { summary: EndpointAgentSummary | null; agentVersion: string; totalEndpoints: number; source: AgentSource; operatorPicked: boolean }) {
  const fromCsv  = source?.kind === 'step6';
  const fromV4   = source?.kind === 'step4';
  const hasData  = source !== null && !!agentVersion;
  const v4Mode   = source?.kind === 'step4' ? source.mode : null;
  const sourceLabel = (() => {
    if (fromCsv && operatorPicked) return 'AGENT CONTEXT — STEP 6 · OPERATOR-PICKED';
    if (fromCsv) return 'AGENT CONTEXT — STEP 6';
    if (v4Mode === 'both') return 'AGENT CONTEXT — STEP 4 · DLP + HYBRID WEB';
    if (v4Mode === 'dlp')  return 'AGENT CONTEXT — STEP 4 · DLP ENDPOINT';
    if (v4Mode === 'web')  return 'AGENT CONTEXT — STEP 4 · HYBRID WEB';
    return 'AGENT CONTEXT';
  })();
  const installedSubtitle = (() => {
    if (!hasData)                      return 'no version detected';
    if (fromCsv && operatorPicked)     return 'marked active on Step 5';
    if (fromCsv)                       return 'latest deployed';
    if (v4Mode === 'both') return 'installed (DLP + Hybrid Web)';
    if (v4Mode === 'dlp')  return 'installed (DLP)';
    if (v4Mode === 'web')  return 'installed (Hybrid Web)';
    return 'installed';
  })();
  return (
    <div className="rounded-xl text-white overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#023E8A 0%,#0F2952 70%)', boxShadow: '0 4px 16px rgba(15,41,82,0.18)' }}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', opacity: 0.55 }}>
            {sourceLabel}
          </div>
          {hasData && (
            <span className="flex items-center gap-1.5"
              style={{ fontSize: '9px', fontWeight: 700, color: '#A7F3D0', background: 'rgba(167,243,208,0.12)', border: '1px solid rgba(167,243,208,0.3)', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.06em' }}>
              <Cpu size={9} /> {fromCsv && operatorPicked ? 'OPERATOR-PICKED' : fromCsv ? 'AUTO-DETECTED' : 'FROM VERSION CHECK'}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', fontFamily: "'JetBrains Mono', monospace" }}>
            {hasData ? agentVersion : '—'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.55 }}>
            {installedSubtitle}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3">
          {fromCsv && totalEndpoints > 0 && (
            <Mini label="Endpoints" value={totalEndpoints.toLocaleString()} />
          )}
          {fromCsv && summary && summary.outdatedCount > 0 && (
            <Mini label="Outdated" value={`${summary.outdatedPct}%`} tone="warn" />
          )}
          {fromV4 && <span style={{ visibility: 'hidden' }}>·</span>}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <div style={{ fontSize: '8.5px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: tone === 'warn' ? '#FDE68A' : '#fff', fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
        {value}
      </div>
    </div>
  );
}

function FieldCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952', letterSpacing: '-0.005em' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: 2, lineHeight: 1.5 }}>{subtitle}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function ChipMultiSelect({ options, value, onToggle, accent }: { options: string[]; value: string[]; onToggle: (v: string) => void; accent: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button key={opt} onClick={() => onToggle(opt)}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: 999,
              background: on ? `${accent}14` : '#F8FAFC',
              color: on ? accent : '#475569',
              border: `1px solid ${on ? accent : '#E2E8F0'}`,
              fontWeight: on ? 700 : 500,
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s, border-color 0.12s',
            }}>
            {on ? '✓ ' : ''}{opt}
          </button>
        );
      })}
    </div>
  );
}

function EmptyChipHint({ label }: { label: string }) {
  return <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>{label} — populate via the OS / Browser Support Matrix page.</div>;
}

function SolutionsStrip({ solutions }: { solutions: EndpointCoverage[] }) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3 flex-wrap"
      style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Assessing for
      </span>
      {solutions.map((s) => (
        <span key={s} className="flex items-center gap-1.5"
          style={{ fontSize: '11.5px', fontWeight: 600, color: COVERAGE_COLORS[s], background: `${COVERAGE_COLORS[s]}14`, border: `1px solid ${COVERAGE_COLORS[s]}33`, borderRadius: 6, padding: '3px 9px' }}>
          {SOLUTION_META[s].icon} {COVERAGE_FULL_NAMES[s]}
        </span>
      ))}
    </div>
  );
}

function StatusBanner({ assessment, editMode, onPatch }: { assessment: EndpointCompatibilityAssessment; editMode: boolean; onPatch: (p: Partial<EndpointCompatibilityAssessment>) => void }) {
  const cfg = STATUS_CFG[assessment.compatibilityStatus];
  return (
    <div className="rounded-xl p-5 flex items-start gap-4"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderLeft: `4px solid ${cfg.color}` }}>
      <div style={{ color: cfg.color, flexShrink: 0 }}>{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        {editMode ? (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <select value={assessment.compatibilityStatus}
              onChange={(e) => onPatch({ compatibilityStatus: e.target.value as CompatibilityStatus })}
              style={{ fontSize: '14px', fontWeight: 700, color: cfg.color, padding: '4px 8px', background: '#fff', border: `1px solid ${cfg.border}`, borderRadius: 6 }}>
              <option value="SUPPORTED">SUPPORTED</option>
              <option value="AT_RISK">AT_RISK</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <label style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={assessment.upgradeRequired} onChange={(e) => onPatch({ upgradeRequired: e.target.checked })} />
              Upgrade required
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-1">
            <div style={{ fontSize: '20px', fontWeight: 800, color: cfg.color, letterSpacing: '-0.01em' }}>{cfg.label}</div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: cfg.color, background: '#fff', border: `1px solid ${cfg.border}`, padding: '2px 8px', borderRadius: 5, letterSpacing: '0.06em' }}>
              {assessment.compatibilityStatus}
            </span>
          </div>
        )}
        <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>{cfg.subtitle}</div>
        <div className="flex items-center gap-5 mt-3 flex-wrap">
          <Kpi label="Customer Agent" value={assessment.customerAgentVersion || '—'} />
          {editMode ? (
            <div>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Minimum Required</div>
              <input value={assessment.minimumRequiredAgent} onChange={(e) => onPatch({ minimumRequiredAgent: e.target.value })}
                style={{ fontSize: '13px', fontWeight: 700, color: '#0F2952', fontFamily: "'JetBrains Mono', monospace", marginTop: 2, padding: '2px 6px', border: '1px solid #CBD5E1', borderRadius: 4, width: 90, background: '#fff' }} />
            </div>
          ) : (
            <Kpi label="Minimum Required" value={`v${assessment.minimumRequiredAgent}`} />
          )}
          <Kpi label="Findings" value={`${assessment.findings.length}`} />
          {assessment.upgradeRequired && <Kpi label="Upgrade Required" value="Yes" tone="warn" />}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  const color = tone === 'warn' ? '#B58800' : '#0F2952';
  return (
    <div>
      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function FindingsList({ assessment, editMode, onPatch, onDelete, onAdd }: {
  assessment: EndpointCompatibilityAssessment;
  editMode: boolean;
  onPatch: (id: string, p: Partial<CompatibilityFinding>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  if (assessment.findings.length === 0 && !editMode) {
    return (
      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
        <CheckCircle2 size={18} color="#16A34A" />
        <div style={{ fontSize: '12.5px', color: '#15803D', fontWeight: 600 }}>
          No compatibility findings — the customer's environment is fully aligned with the imported support matrix.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952' }}>
          Findings ({assessment.findings.length})
        </div>
        {editMode && (
          <button onClick={onAdd}
            style={{ fontSize: '11px', padding: '4px 10px', background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <Plus size={11} /> Add finding
          </button>
        )}
      </div>
      {assessment.findings.length === 0 && editMode && (
        <div style={{ fontSize: '11.5px', color: '#94A3B8', textAlign: 'center', padding: '14px 0', fontStyle: 'italic' }}>
          No findings yet. Click "Add finding" to insert a custom row.
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {assessment.findings.map((f) => {
          const sc = SEV_CFG[f.severity];
          if (!editMode) {
            return (
              <div key={f.id}
                style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderLeft: `3px solid ${sc.color}`, borderRadius: 6, padding: '10px 12px' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ fontSize: '9px', fontWeight: 800, color: sc.color, background: '#fff', border: `1px solid ${sc.border}`, padding: '1px 6px', borderRadius: 4, letterSpacing: '0.06em' }}>
                    {f.severity}
                  </span>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1D252C', lineHeight: 1.35 }}>{f.title}</div>
                </div>
                <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.6 }}>{f.description}</div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {f.affectedComponents.map((c, i) => (
                    <span key={i} style={{ fontSize: '10px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', padding: '1px 7px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{c}</span>
                  ))}
                  <span style={{ fontSize: '10.5px', color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>
                    {f.affectedEndpoints.toLocaleString()} endpoints ({f.affectedPct})
                  </span>
                </div>
                <div className="flex items-start gap-2 mt-2" style={{ fontSize: '11.5px', color: sc.color }}>
                  <ArrowUpCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Recommended action:</strong> {f.recommendation}</span>
                </div>
              </div>
            );
          }
          /* Edit mode form */
          return (
            <div key={f.id}
              style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderLeft: `3px solid ${sc.color}`, borderRadius: 6, padding: '10px 12px' }}>
              <div className="flex items-center gap-2 mb-2">
                <select value={f.severity} onChange={(e) => onPatch(f.id, { severity: e.target.value as Severity })}
                  style={{ fontSize: '10px', fontWeight: 800, color: sc.color, background: '#fff', border: `1px solid ${sc.border}`, padding: '2px 6px', borderRadius: 4 }}>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
                <input value={f.title} onChange={(e) => onPatch(f.id, { title: e.target.value })}
                  style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#1D252C', padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: '#fff' }} />
                <button onClick={() => onDelete(f.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea value={f.description} onChange={(e) => onPatch(f.id, { description: e.target.value })}
                rows={2}
                style={{ width: '100%', fontSize: '11px', color: '#475569', padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: '#fff', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' }} />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <input value={f.affectedComponents.join(', ')}
                  onChange={(e) => onPatch(f.id, { affectedComponents: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="comma-separated components"
                  style={{ fontSize: '10.5px', color: '#475569', padding: '4px 7px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }} />
                <input type="number" value={f.affectedEndpoints} onChange={(e) => onPatch(f.id, { affectedEndpoints: parseInt(e.target.value, 10) || 0 })}
                  placeholder="endpoints"
                  style={{ fontSize: '10.5px', color: '#475569', padding: '4px 7px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }} />
                <input value={f.affectedPct} onChange={(e) => onPatch(f.id, { affectedPct: e.target.value })}
                  placeholder="e.g. 100%"
                  style={{ fontSize: '10.5px', color: '#475569', padding: '4px 7px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }} />
              </div>
              <textarea value={f.recommendation} onChange={(e) => onPatch(f.id, { recommendation: e.target.value })}
                rows={2}
                placeholder="Recommended action"
                style={{ width: '100%', fontSize: '11px', color: sc.color, padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: '#fff', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical', marginTop: 6 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OSCompatibilityCard({ assessment, editMode, onPatch, onDelete, onAdd }: {
  assessment: EndpointCompatibilityAssessment;
  editMode: boolean;
  onPatch: (idx: number, p: Partial<OSCompatibilityRow>) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} color="#0284C7" />
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952' }}>OS Compatibility</div>
        </div>
        {editMode && (
          <button onClick={onAdd}
            style={{ fontSize: '10px', padding: '3px 8px', background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Plus size={10} /> Add row
          </button>
        )}
      </div>
      {assessment.osCompatibility.length === 0 ? (
        <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>{editMode ? 'No rows yet — click "Add row" to insert one.' : 'No OS rows resolved for the selected solutions.'}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assessment.osCompatibility.map((r, i) => (
            editMode
              ? <CompatRowEdit key={i} kind="os" row={r} onChange={(p) => onPatch(i, p)} onDelete={() => onDelete(i)} />
              : <CompatRow
                  key={i}
                  label={r.os}
                  meta={r.minAgentRequired}
                  compatible={r.customerAgentCompatible}
                  status={r.status}
                  note={r.note}
                />
          ))}
        </div>
      )}
    </div>
  );
}

function BrowserCompatibilityCard({ assessment, editMode, onPatch, onDelete, onAdd }: {
  assessment: EndpointCompatibilityAssessment;
  editMode: boolean;
  onPatch: (idx: number, p: Partial<BrowserCompatibilityRow>) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Smartphone size={14} color="#0284C7" />
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952' }}>Browser Compatibility</div>
        </div>
        {editMode && (
          <button onClick={onAdd}
            style={{ fontSize: '10px', padding: '3px 8px', background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Plus size={10} /> Add row
          </button>
        )}
      </div>
      {assessment.browserCompatibility.length === 0 ? (
        <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>{editMode ? 'No rows yet — click "Add row" to insert one.' : 'No browser rows resolved for the selected solutions.'}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assessment.browserCompatibility.map((r, i) => (
            editMode
              ? <CompatRowEdit key={i} kind="browser" row={r} onChange={(p) => onPatch(i, p)} onDelete={() => onDelete(i)} />
              : <CompatRow
                  key={i}
                  label={`${r.browser} · ${r.platform}`}
                  meta={r.minAgentRequired}
                  compatible={r.customerAgentCompatible}
                  status={r.status}
                  note={r.note}
                  badge={r.mv3Required ? 'MV3' : null}
                />
          ))}
        </div>
      )}
    </div>
  );
}

/* Edit form for either OS or Browser compat rows. `kind` switches between
   the OS shape (single os string + status enum) and the Browser shape
   (browser + platform + mv3Required + status enum). */
function CompatRowEdit({ kind, row, onChange, onDelete }: {
  kind: 'os' | 'browser';
  row: OSCompatibilityRow | BrowserCompatibilityRow;
  onChange: (p: Partial<OSCompatibilityRow & BrowserCompatibilityRow>) => void;
  onDelete: () => void;
}) {
  const isOS = kind === 'os';
  const osRow = row as OSCompatibilityRow;
  const brRow = row as BrowserCompatibilityRow;
  const bad = !row.customerAgentCompatible;
  return (
    <div style={{ background: bad ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${bad ? '#FECACA' : '#BBF7D0'}`, borderRadius: 5, padding: '8px 10px' }}>
      <div className="flex items-center gap-2 mb-1.5">
        {isOS ? (
          <input value={osRow.os} onChange={(e) => onChange({ os: e.target.value } as Partial<OSCompatibilityRow & BrowserCompatibilityRow>)}
            style={{ flex: 1, fontSize: '11.5px', fontWeight: 600, color: '#1D252C', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff' }} />
        ) : (
          <>
            <input value={brRow.browser} onChange={(e) => onChange({ browser: e.target.value } as Partial<OSCompatibilityRow & BrowserCompatibilityRow>)}
              style={{ flex: 1, fontSize: '11.5px', fontWeight: 600, color: '#1D252C', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff' }} />
            <select value={brRow.platform} onChange={(e) => onChange({ platform: e.target.value as 'Windows' | 'macOS' } as Partial<OSCompatibilityRow & BrowserCompatibilityRow>)}
              style={{ fontSize: '10.5px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff' }}>
              <option>Windows</option>
              <option>macOS</option>
            </select>
          </>
        )}
        <select value={row.status as string} onChange={(e) => onChange({ status: e.target.value as OSCompatibilityRow['status'] & BrowserCompatibilityRow['status'] })}
          style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff' }}>
          <option>SUPPORTED</option>
          <option>AT_RISK</option>
          {isOS ? <option>EOS</option> : <option>CRITICAL</option>}
        </select>
        <label style={{ fontSize: '9.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={row.customerAgentCompatible} onChange={(e) => onChange({ customerAgentCompatible: e.target.checked })} />
          Compatible
        </label>
        <button onClick={onDelete}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
          <Trash2 size={11} />
        </button>
      </div>
      <input value={row.minAgentRequired} onChange={(e) => onChange({ minAgentRequired: e.target.value })}
        placeholder="min agent"
        style={{ width: '100%', fontSize: '10.5px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: "'JetBrains Mono', monospace", color: '#64748B', marginBottom: 4 }} />
      <textarea value={row.note} onChange={(e) => onChange({ note: e.target.value })}
        placeholder="note"
        rows={1}
        style={{ width: '100%', fontSize: '10.5px', padding: '4px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', color: '#475569', fontFamily: 'inherit', lineHeight: 1.45, resize: 'vertical' }} />
      {!isOS && (
        <label style={{ fontSize: '9.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <input type="checkbox" checked={brRow.mv3Required} onChange={(e) => onChange({ mv3Required: e.target.checked } as Partial<OSCompatibilityRow & BrowserCompatibilityRow>)} />
          MV3 required
        </label>
      )}
    </div>
  );
}

function CompatRow({
  label, meta, compatible, status, note, badge,
}: { label: string; meta: string; compatible: boolean; status: string; note: string; badge?: string | null }) {
  const bad = !compatible;
  return (
    <div style={{ background: bad ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${bad ? '#FECACA' : '#BBF7D0'}`, borderRadius: 5, padding: '7px 10px' }}>
      <div className="flex items-center gap-2 mb-0.5">
        {bad ? <XCircle size={13} color="#A30080" /> : <CheckCircle2 size={13} color="#16A34A" />}
        <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#1D252C', flex: 1 }}>{label}</div>
        {badge && <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>{badge}</span>}
        <span style={{ fontSize: '9px', fontWeight: 700, color: bad ? '#A30080' : '#16A34A', letterSpacing: '0.05em' }}>{status}</span>
      </div>
      <div style={{ fontSize: '10.5px', color: '#64748B', fontFamily: "'JetBrains Mono', monospace", marginLeft: 20 }}>min: {meta}</div>
      {note && <div style={{ fontSize: '10.5px', color: '#64748B', marginLeft: 20, marginTop: 2, lineHeight: 1.45 }}>{note}</div>}
    </div>
  );
}

function CriticalNotesCard({ assessment, editMode, onToggleInclude, onPatch, onDelete, onAdd }: {
  assessment: EndpointCompatibilityAssessment;
  editMode: boolean;
  onToggleInclude: (title: string, include: boolean) => void;
  onPatch: (idx: number, p: Partial<CriticalNoteRow>) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  if (assessment.criticalNotes.length === 0 && !editMode) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2952' }}>Critical Compatibility Notes</div>
        <div className="flex items-center gap-2">
          <div style={{ fontSize: '10.5px', color: '#64748B' }}>
            {assessment.criticalNotes.filter((n) => n.includeInReport).length} of {assessment.criticalNotes.length} included
          </div>
          {editMode && (
            <button onClick={onAdd}
              style={{ fontSize: '10px', padding: '3px 8px', background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
              <Plus size={10} /> Add note
            </button>
          )}
        </div>
      </div>
      {assessment.criticalNotes.length === 0 && editMode && (
        <div style={{ fontSize: '11.5px', color: '#94A3B8', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
          No notes yet. Click "Add note" to insert one.
        </div>
      )}
      <div className="flex flex-col gap-2">
        {assessment.criticalNotes.map((n, i) => {
          const sev = n.severity === 'CRITICAL' ? SEV_CFG.CRITICAL : n.severity === 'HIGH' ? SEV_CFG.HIGH : SEV_CFG.MEDIUM;
          if (!editMode) {
            return (
              <div key={i}
                style={{ background: n.includeInReport ? sev.bg : '#F8FAFC', border: `1px solid ${n.includeInReport ? sev.border : '#E2E8F0'}`, borderLeft: `3px solid ${sev.color}`, borderRadius: 5, padding: '8px 11px', opacity: n.includeInReport ? 1 : 0.7 }}>
                <div className="flex items-start gap-2">
                  <span style={{ fontSize: '9px', fontWeight: 800, color: sev.color, background: '#fff', border: `1px solid ${sev.border}`, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em', flexShrink: 0, marginTop: 1 }}>
                    {n.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1D252C', marginBottom: 1 }}>{n.title}</div>
                    <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.55 }}>{n.description}</div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0" style={{ fontSize: '10px', color: '#475569' }}>
                    <input type="checkbox" checked={n.includeInReport} onChange={(e) => onToggleInclude(n.title, e.target.checked)} />
                    In report
                  </label>
                </div>
              </div>
            );
          }
          /* Edit form */
          return (
            <div key={i}
              style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderLeft: `3px solid ${sev.color}`, borderRadius: 5, padding: '8px 11px' }}>
              <div className="flex items-center gap-2 mb-2">
                <select value={n.severity} onChange={(e) => onPatch(i, { severity: e.target.value as CriticalNoteRow['severity'] })}
                  style={{ fontSize: '9.5px', fontWeight: 800, color: sev.color, background: '#fff', border: `1px solid ${sev.border}`, padding: '2px 5px', borderRadius: 3 }}>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                </select>
                <input value={n.title} onChange={(e) => onPatch(i, { title: e.target.value })}
                  style={{ flex: 1, fontSize: '11px', fontWeight: 700, color: '#1D252C', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff' }} />
                <label style={{ fontSize: '9.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={n.includeInReport} onChange={(e) => onPatch(i, { includeInReport: e.target.checked })} />
                  In report
                </label>
                <button onClick={() => onDelete(i)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                  <Trash2 size={11} />
                </button>
              </div>
              <textarea value={n.description} onChange={(e) => onPatch(i, { description: e.target.value })}
                rows={2}
                placeholder="Note body"
                style={{ width: '100%', fontSize: '10.5px', color: '#475569', padding: '5px 7px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpgradeRecommendationCard({ assessment, editMode, onChange }: {
  assessment: EndpointCompatibilityAssessment;
  editMode: boolean;
  onChange: (rec: EndpointCompatibilityAssessment['upgradeRecommendation']) => void;
}) {
  const rec = assessment.upgradeRecommendation;
  /* Edit mode + no rec yet → render the form pre-populated with empty
     defaults so the operator can add a recommendation from scratch. */
  if (!rec && editMode) {
    return (
      <div className="rounded-xl p-5 flex flex-col items-center text-center gap-3"
        style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1' }}>
        <ArrowUpCircle size={20} color="#94A3B8" />
        <div style={{ fontSize: '12px', color: '#64748B' }}>No upgrade recommendation. Click below to add one.</div>
        <button onClick={() => onChange({ targetVersion: '26.02', urgency: 'PLANNED', rationale: '', deploymentNote: '' })}
          style={{ fontSize: '11px', padding: '5px 12px', background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
          <Plus size={11} /> Add upgrade recommendation
        </button>
      </div>
    );
  }
  if (!rec) return null;
  const u = URGENCY_CFG[rec.urgency] ?? URGENCY_CFG.PLANNED;

  if (!editMode) {
    return (
      <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5', borderTop: `3px solid ${u.color}` }}>
        <div className="flex items-center gap-3 mb-3">
          <ArrowUpCircle size={20} color={u.color} />
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F2952' }}>Upgrade Recommendation</div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: u.color, background: u.bg, border: `1px solid ${u.color}33`, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>
            {u.label.toUpperCase()}
          </span>
          <span style={{ fontSize: '11px', color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>Target: <strong>v{rec.targetVersion}</strong></span>
        </div>
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.65, marginBottom: 10 }}>{rec.rationale}</div>
        <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.6, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 5, padding: '8px 10px' }}>
          <strong style={{ color: '#0F2952' }}>Deployment note:</strong> {rec.deploymentNote}
        </div>
      </div>
    );
  }
  /* Edit mode form */
  return (
    <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5', borderTop: `3px solid ${u.color}` }}>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <ArrowUpCircle size={20} color={u.color} />
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F2952' }}>Upgrade Recommendation</div>
        <select value={rec.urgency} onChange={(e) => onChange({ ...rec, urgency: e.target.value as Urgency })}
          style={{ fontSize: '10px', fontWeight: 700, color: u.color, background: u.bg, border: `1px solid ${u.color}33`, padding: '2px 6px', borderRadius: 4 }}>
          <option value="IMMEDIATE">IMMEDIATE</option>
          <option value="SHORT_TERM">SHORT TERM</option>
          <option value="PLANNED">PLANNED</option>
        </select>
        <label style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
          Target&nbsp;v
          <input value={rec.targetVersion} onChange={(e) => onChange({ ...rec, targetVersion: e.target.value })}
            style={{ width: 70, fontSize: '11px', padding: '2px 6px', border: '1px solid #E2E8F0', borderRadius: 4, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }} />
        </label>
        <button onClick={() => onChange(null)}
          title="Remove the upgrade recommendation"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4, marginLeft: 'auto' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
          <Trash2 size={13} />
        </button>
      </div>
      <textarea value={rec.rationale} onChange={(e) => onChange({ ...rec, rationale: e.target.value })}
        rows={3}
        placeholder="Rationale — why an upgrade is recommended"
        style={{ width: '100%', fontSize: '12px', color: '#475569', padding: '7px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: '#fff', fontFamily: 'inherit', lineHeight: 1.65, resize: 'vertical', marginBottom: 8 }} />
      <textarea value={rec.deploymentNote} onChange={(e) => onChange({ ...rec, deploymentNote: e.target.value })}
        rows={2}
        placeholder="Deployment note — phased rollout guidance, restart requirements, etc."
        style={{ width: '100%', fontSize: '11.5px', color: '#475569', padding: '7px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: '#F8FAFC', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
    </div>
  );
}

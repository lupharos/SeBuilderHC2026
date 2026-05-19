import { useMemo } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, Activity, ServerCog, FileWarning,
  ListChecks, MessageSquare, Sparkles, ArrowUpCircle, Wallet, Cpu,
  AlertTriangle, ChevronUp,
} from 'lucide-react';
import type { Template, QuestionSeverity } from '../types/templates';
import type { TemplateAnswers } from '../rules/ruleEngine';
import type { SessionData, LicenseGapItem } from '../Dashboard';
import type { VersionEntry } from './Step4VersionCheck';
import type { Recommendation } from './Step8Recommendations';
import type { ActionItem } from './Step9NextSteps';
import type { FeatureRequest } from './Step10FeatureRequests';
import type { ServerEntry } from './StepServerDetails';
import type { ParsedCertificate } from './certificateParser';
import type { EndpointAgentSummary } from './endpointAgentParser';
import type { DlpServerBundle } from './dlpServerInfoParser';
import type { VersionUpgradeProposal } from './StepVersionUpgrades';
import type { EndpointCompatibilityAssessment } from '../../utils/endpointCompatibilityEngine';
import { PRODUCT_ID_MAP } from './report/constants';
import { computeHealthScore } from './report/healthScore';

interface Step10Props {
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  sessionData: SessionData;
  checklistAnswers: TemplateAnswers;
  versionEntries: Record<string, VersionEntry>;
  recommendations: Recommendation[];
  actionItems: ActionItem[];
  featureRequests: FeatureRequest[];
  serverDetails: ServerEntry[];
  certificates: ParsedCertificate[];
  selectedEnhancements: string[];
  licenseGaps: LicenseGapItem[];
  versionUpgrades: VersionUpgradeProposal[];
  endpointAgentSummary: EndpointAgentSummary | null;
  dlpBundles: DlpServerBundle[];
  endpointCompatAssessment: EndpointCompatibilityAssessment | null;
}

const SEV_CFG: Record<QuestionSeverity, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', label: 'CRITICAL' },
  HIGH:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'HIGH' },
  MEDIUM:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', label: 'MEDIUM' },
  LOW:      { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', label: 'LOW' },
};

function pct(used: number, total: number): number {
  return total ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

function scoreColor(s: number | null): string {
  if (s === null) return '#94A3B8';
  return s >= 80 ? '#16A34A' : s >= 60 ? '#B58800' : '#A30080';
}

function getProductStats(template: Template, answers: TemplateAnswers) {
  let answered = 0;
  const bySev: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const q of template.questions) {
    const key = `${template.id}__${q.id}`;
    const ans = answers[key];
    if (ans?.value != null) answered++;
    if (q.severity && ans?.value === (q.triggerOn ?? 'no'))
      bySev[q.severity] = (bySev[q.severity] ?? 0) + 1;
  }
  const totalFindings = Object.values(bySev).reduce((a, b) => a + b, 0);
  const score = answered === 0 ? null
    : Math.round(Math.max(0, (answered - totalFindings) / answered * 100));
  return { answered, total: template.questions.length, bySev, totalFindings, score };
}

export function Step10Summary({
  templates, selectedProducts, sessionData, checklistAnswers, versionEntries,
  recommendations, actionItems, featureRequests, serverDetails, certificates,
  selectedEnhancements, licenseGaps, versionUpgrades, endpointAgentSummary,
  dlpBundles, endpointCompatAssessment,
}: Step10Props) {
  /* Selected templates (mirrors Step11Summary so health scores match). */
  const selectedTemplates = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(selectedProducts).forEach(([pid, sel]) => {
      if (sel && PRODUCT_ID_MAP[pid]) ids.add(PRODUCT_ID_MAP[pid]);
    });
    return templates.filter((t) => ids.has(t.id));
  }, [templates, selectedProducts]);

  const { allFindings, totalAnswered, totalQuestions, healthScore, healthBreakdown } = useMemo(
    () => computeHealthScore(selectedTemplates, checklistAnswers, versionEntries, serverDetails),
    [selectedTemplates, checklistAnswers, versionEntries, serverDetails],
  );

  /* Severity counts. */
  const sevCounts = useMemo(() => ({
    CRITICAL: allFindings.filter((f) => f.severity === 'CRITICAL').length,
    HIGH:     allFindings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM:   allFindings.filter((f) => f.severity === 'MEDIUM').length,
    LOW:      allFindings.filter((f) => f.severity === 'LOW').length,
  }), [allFindings]);

  /* Risk Category Matrix — same dimensions used by the report Part 0. */
  const versionList = Object.values(versionEntries).filter((e) => e?.installedVersion);
  const eosCount     = versionList.filter((e) => ['eos', 'eol', 'critical'].includes(e.statusOverride ?? e.status)).length;
  const warnVerCount = versionList.filter((e) => (e.statusOverride ?? e.status) === 'warning').length;

  const infraStats = useMemo(() => {
    let crit = 0, high = 0;
    for (const s of serverDetails) {
      if (!s.applicable) continue;
      for (const d of s.drives) {
        if (!d.totalGB) continue;
        const p = pct(d.usedGB, d.totalGB);
        if (p >= 85) crit++; else if (p >= 70) high++;
      }
      if (s.ramTotalGB > 0) {
        const p = pct(s.ramUsedGB, s.ramTotalGB);
        if (p >= 85) crit++; else if (p >= 70) high++;
      }
      if (s.cpuUsagePercent >= 85) crit++;
      else if (s.cpuUsagePercent >= 70) high++;
    }
    return { crit, high };
  }, [serverDetails]);

  const certStats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let expired = 0, expiring = 0;
    for (const c of certificates) {
      const exp = new Date(c.validTo).getTime();
      if (Number.isNaN(exp)) continue;
      if (exp < now) expired++;
      else if (exp - now < 90 * day) expiring++;
    }
    return { expired, expiring };
  }, [certificates]);

  const riskMatrix = [
    { label: 'Version / Lifecycle', icon: '📦', critical: eosCount,            high: 0,                medium: warnVerCount,    low: 0 },
    { label: 'Infrastructure',      icon: '🖥', critical: infraStats.crit,     high: infraStats.high,  medium: 0,               low: 0 },
    { label: 'Checklist',           icon: '📋', critical: sevCounts.CRITICAL,  high: sevCounts.HIGH,   medium: sevCounts.MEDIUM, low: sevCounts.LOW },
    { label: 'Configuration / Trust', icon: '🔐', critical: certStats.expired, high: certStats.expiring, medium: 0,             low: 0 },
  ];

  const productStats = useMemo(
    () => selectedTemplates.map((t) => ({ template: t, ...getProductStats(t, checklistAnswers) })),
    [selectedTemplates, checklistAnswers],
  );

  /* Activity Pulse counts. */
  const openActions = actionItems.filter((i) => i.status !== 'done').length;
  const doneActions = actionItems.filter((i) => i.status === 'done').length;

  /* Top concerns chips — capped to 6, mix of all risk dimensions. */
  const topConcerns: Array<{ icon: React.ReactNode; text: string; color: string; bg: string; border: string }> = [];
  if (eosCount > 0) topConcerns.push({ icon: <FileWarning size={11} />, text: `${eosCount} component${eosCount === 1 ? '' : 's'} past EoS`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (infraStats.crit > 0) topConcerns.push({ icon: <ServerCog size={11} />, text: `${infraStats.crit} server metric${infraStats.crit === 1 ? '' : 's'} ≥ 85%`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (certStats.expired > 0) topConcerns.push({ icon: <ShieldX size={11} />, text: `${certStats.expired} expired cert${certStats.expired === 1 ? '' : 's'}`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (endpointAgentSummary && endpointAgentSummary.outdatedCount > 0) {
    topConcerns.push({ icon: <Cpu size={11} />, text: `${endpointAgentSummary.outdatedPct}% endpoints outdated`, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' });
  }
  if (endpointCompatAssessment && endpointCompatAssessment.compatibilityStatus === 'CRITICAL') {
    topConcerns.push({ icon: <ShieldAlert size={11} />, text: `Compatibility CRITICAL`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  }
  if (sevCounts.HIGH > 0 && topConcerns.length < 6) topConcerns.push({ icon: <AlertTriangle size={11} />, text: `${sevCounts.HIGH} HIGH finding${sevCounts.HIGH === 1 ? '' : 's'}`, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' });
  if (warnVerCount > 0 && topConcerns.length < 6) topConcerns.push({ icon: <ChevronUp size={11} />, text: `${warnVerCount} update${warnVerCount === 1 ? '' : 's'} available`, color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' });
  if (certStats.expiring > 0 && topConcerns.length < 6) topConcerns.push({ icon: <FileWarning size={11} />, text: `${certStats.expiring} cert${certStats.expiring === 1 ? '' : 's'} expiring < 90d`, color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' });

  /* Verdict */
  let verdictLabel = 'Good Health';
  let verdictColor = '#16A34A';
  let verdictBg = '#F0FDF4';
  let verdictBorder = '#BBF7D0';
  let verdictIcon: React.ReactNode = <ShieldCheck size={24} />;
  if (sevCounts.CRITICAL > 0 || eosCount > 0 || infraStats.crit > 0 || certStats.expired > 0) {
    verdictLabel = 'Critical Attention Required';
    verdictColor = '#A30080';
    verdictBg = '#FDF2F8';
    verdictBorder = '#FBCFE8';
    verdictIcon = <ShieldX size={24} />;
  } else if (sevCounts.HIGH > 0 || infraStats.high > 0 || certStats.expiring > 0 || warnVerCount > 0) {
    verdictLabel = 'Action Required';
    verdictColor = '#B58800';
    verdictBg = '#FFFBEB';
    verdictBorder = '#FDE68A';
    verdictIcon = <ShieldAlert size={24} />;
  }

  if (selectedTemplates.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-10 text-center" style={{ borderColor: 'rgba(15,41,82,0.08)' }}>
        <Activity size={42} style={{ color: '#94A3B8', margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>Dashboard awaiting input</div>
        <div style={{ fontSize: '12.5px', color: '#64748B' }}>
          Select products in <strong>Step 2 — Product Scope</strong> to populate the CISO dashboard.
        </div>
      </div>
    );
  }

  const hsc = scoreColor(healthScore);
  const composite = healthScore ?? 0;
  /* Donut conic-gradient: filled arc + grey remainder. */
  const donutBg = `conic-gradient(${hsc} 0deg ${composite * 3.6}deg, #EEF2F8 ${composite * 3.6}deg 360deg)`;

  /* Health deduction breakdown — three component bars. */
  const dedQ  = healthBreakdown.questionPenalty;
  const dedV  = healthBreakdown.versionPenalty;
  const dedI  = healthBreakdown.infraPenalty;
  const dedTotal = Math.max(1, dedQ + dedV + dedI);

  return (
    <div className="flex flex-col gap-3">

      {/* ── HEADER STRIP ───────────────────────────────────────── */}
      <div className="rounded-xl text-white"
        style={{ background: 'linear-gradient(135deg,#023E8A 0%,#0F2952 70%)', boxShadow: '0 4px 16px rgba(15,41,82,0.18)' }}>
        <div className="flex items-center justify-between px-7 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Activity size={20} />
            </div>
            <div className="min-w-0">
              <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', opacity: 0.55 }}>
                CISO DASHBOARD · HEALTH CHECK SUMMARY
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', marginTop: '2px' }} className="truncate">
                {sessionData.customerName || 'Customer Not Set'}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '2px' }}>
                {[sessionData.forcepointId, sessionData.industry, sessionData.country].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedTemplates.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: 600 }}>
                <span style={{ fontSize: '13px' }}>{t.icon}</span>
                <span>{t.name.replace(' HC', '')}</span>
              </div>
            ))}
            <div style={{ fontSize: '10.5px', opacity: 0.5, marginLeft: '8px' }}>
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 1: HEALTH GAUGE + VERDICT ──────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '360px 1fr' }}>
        {/* Health gauge */}
        <div className="rounded-xl bg-white p-5 flex items-center gap-5"
          style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
          <div className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{ width: 116, height: 116, background: donutBg }}>
            <div className="rounded-full bg-white flex flex-col items-center justify-center"
              style={{ width: 92, height: 92 }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: hsc, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {healthScore === null ? '—' : `${healthScore}`}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', marginTop: '2px', letterSpacing: '0.08em' }}>HEALTH</div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', marginBottom: 6 }}>
              SCORE BREAKDOWN
            </div>
            <DedBar label="Questions"      pct={dedQ / dedTotal * 100} value={dedQ} color="#0EA5E9" />
            <DedBar label="Version EoS"    pct={dedV / dedTotal * 100} value={dedV} color="#B58800" />
            <DedBar label="Infrastructure" pct={dedI / dedTotal * 100} value={dedI} color="#A30080" />
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: 6, fontFamily: 'monospace' }}>
              {totalAnswered}/{totalQuestions} questions answered
            </div>
          </div>
        </div>

        {/* Verdict banner + 3 metrics */}
        <div className="rounded-xl flex items-center gap-5 px-6 py-5"
          style={{ background: verdictBg, border: `1px solid ${verdictBorder}`, borderLeft: `4px solid ${verdictColor}` }}>
          <div style={{ color: verdictColor, flexShrink: 0 }}>{verdictIcon}</div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: '17px', fontWeight: 800, color: verdictColor, letterSpacing: '-0.01em' }}>{verdictLabel}</div>
            <div style={{ fontSize: '11.5px', color: '#475569', marginTop: 2 }}>
              {allFindings.length} finding{allFindings.length === 1 ? '' : 's'} · {eosCount} EoS · {infraStats.crit + infraStats.high} infra alerts
            </div>
          </div>
          <div className="flex items-center gap-5 flex-shrink-0">
            <Stat label="Crit + High" value={sevCounts.CRITICAL + sevCounts.HIGH} tone="urgent" />
            <Stat label="EoS"          value={eosCount} tone={eosCount > 0 ? 'urgent' : 'ok'} />
            <Stat label="Infra alerts" value={infraStats.crit + infraStats.high} tone={infraStats.crit > 0 ? 'urgent' : infraStats.high > 0 ? 'warn' : 'ok'} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: SEVERITY HEAT TILES ─────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {(['CRITICAL','HIGH','MEDIUM','LOW'] as QuestionSeverity[]).map((sev) => {
          const cfg = SEV_CFG[sev];
          const count = sevCounts[sev];
          return (
            <div key={sev} className="rounded-xl p-4"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderTop: `3px solid ${cfg.color}` }}>
              <div style={{ fontSize: '9.5px', fontWeight: 800, color: cfg.color, letterSpacing: '0.1em' }}>{cfg.label}</div>
              <div style={{ fontSize: '34px', fontWeight: 800, color: cfg.color, lineHeight: 1, marginTop: 4, letterSpacing: '-0.02em' }}>
                {count}
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: 5 }}>
                checklist findings
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ROW 3: RISK CATEGORY MATRIX + HEALTH BREAKDOWN ─────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        {/* Risk matrix heat grid */}
        <div className="rounded-xl bg-white p-5"
          style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952' }}>Risk Posture by Category</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Severity × source</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(4, 1fr)', gap: 6, alignItems: 'center' }}>
            <div></div>
            <HeatHeader label="Crit" color="#A30080" />
            <HeatHeader label="High" color="#DC2626" />
            <HeatHeader label="Med"  color="#B58800" />
            <HeatHeader label="Low"  color="#0284C7" />
            {riskMatrix.map((r) => (
              <RiskRow key={r.label} icon={r.icon} label={r.label} c={r.critical} h={r.high} m={r.medium} l={r.low} />
            ))}
          </div>
        </div>

        {/* Quick stats column */}
        <div className="rounded-xl bg-white p-5"
          style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952', marginBottom: 12 }}>Coverage Stats</div>
          <CoverageBar label="Servers reviewed"  value={serverDetails.filter((s) => s.applicable).length} max={serverDetails.length || 1} color="#0EA5E9" />
          <CoverageBar label="Version entries"   value={versionList.length} max={Math.max(versionList.length, 10)} color="#A30080" />
          <CoverageBar label="DLP Telemetry Files" value={dlpBundles.reduce((sum, b) => sum + (b.parsedFiles?.length ?? 0), 0)} max={Math.max(dlpBundles.reduce((sum, b) => sum + (b.parsedFiles?.length ?? 0), 0), 20)} color="#B58800" />
          <CoverageBar label="Certificates"      value={certificates.length} max={Math.max(certificates.length, 5)} color="#7C3AED" />
          {endpointAgentSummary && (
            <CoverageBar label="Endpoints (current)" value={endpointAgentSummary.totalRecords - endpointAgentSummary.outdatedCount} max={endpointAgentSummary.totalRecords || 1} color="#16A34A" />
          )}
        </div>
      </div>

      {/* ── ROW 4: PER-PRODUCT SCORECARDS ──────────────────────── */}
      <div className="rounded-xl bg-white p-5"
        style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952' }}>Per-Product Posture</div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Score derives from severity-weighted checklist completion</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(productStats.length, 4)}, minmax(0, 1fr))` }}>
          {productStats.map(({ template, score, totalFindings, answered, total, bySev }) => {
            const sc = scoreColor(score);
            const pctScore = score ?? 0;
            const pBg = `conic-gradient(${sc} 0deg ${pctScore * 3.6}deg, #EEF2F8 ${pctScore * 3.6}deg 360deg)`;
            return (
              <div key={template.id} className="rounded-lg p-3"
                style={{ background: '#FAFCFF', border: `1px solid ${template.color}26` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 56, height: 56, background: pBg }}>
                    <div className="rounded-full bg-white flex items-center justify-center"
                      style={{ width: 44, height: 44 }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: sc, letterSpacing: '-0.01em' }}>
                        {score === null ? '—' : `${score}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: '16px' }}>{template.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }} className="truncate">
                        {template.name.replace(' HC', '')}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace', marginTop: 2 }}>
                      {answered}/{total} answered · {totalFindings} finding{totalFindings === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                {/* Severity mini chips */}
                <div className="flex gap-1 flex-wrap">
                  {(['CRITICAL','HIGH','MEDIUM','LOW'] as QuestionSeverity[]).map((sv) => {
                    const cfg = SEV_CFG[sv];
                    const cnt = bySev[sv] ?? 0;
                    return (
                      <span key={sv}
                        style={{
                          fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                          background: cnt > 0 ? cfg.bg : '#F8FAFC',
                          color: cnt > 0 ? cfg.color : '#CBD5E1',
                          border: `1px solid ${cnt > 0 ? cfg.border : '#E2E8F0'}`,
                          fontFamily: 'monospace',
                        }}>
                        {cfg.label.charAt(0)}:{cnt}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROW 5: ACTIVITY PULSE STRIP ────────────────────────── */}
      <div className="rounded-xl bg-white p-4"
        style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952' }}>Activity Pulse</div>
          <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Roadmap items captured so far</div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          <PulseTile icon={<ListChecks size={13} />}     label="Recommendations"    value={recommendations.length} accent="#0EA5E9" />
          <PulseTile icon={<Activity size={13} />}       label="Action Items"       value={openActions} sub={`${doneActions} done`} accent="#16A34A" />
          <PulseTile icon={<MessageSquare size={13} />}  label="Customer FRs"       value={featureRequests.length} accent="#7C3AED" />
          <PulseTile icon={<Wallet size={13} />}         label="License Gap"        value={licenseGaps.length} accent="#B58800" />
          <PulseTile icon={<Sparkles size={13} />}       label="Enhancements"       value={selectedEnhancements.length} accent="#0284C7" />
          <PulseTile icon={<ArrowUpCircle size={13} />}  label="Version Upgrades"   value={versionUpgrades.length} accent="#A30080" />
        </div>
      </div>

      {/* ── ROW 6: TOP CONCERNS CHIPS ──────────────────────────── */}
      {topConcerns.length > 0 && (
        <div className="rounded-xl bg-white p-4"
          style={{ border: '1px solid rgba(15,41,82,0.08)', boxShadow: '0 1px 4px rgba(15,41,82,0.04)' }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} style={{ color: '#A30080' }} />
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F2952' }}>Top Concerns</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {topConcerns.slice(0, 6).map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px', fontWeight: 600 }}>
                {c.icon} {c.text}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════════════════════════════ */

function DedBar({ label, pct, value, color }: { label: string; pct: number; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span style={{ fontSize: '10.5px', color: '#64748B', width: 90, flexShrink: 0 }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF2F8' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', fontFamily: 'monospace', width: 28, textAlign: 'right' }}>
        −{value}
      </span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'urgent' | 'warn' | 'ok' }) {
  const colors = { urgent: '#A30080', warn: '#B58800', ok: '#16A34A' }[tone];
  return (
    <div className="text-center">
      <div style={{ fontSize: '22px', fontWeight: 800, color: colors, lineHeight: 1, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', marginTop: 4, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}

function HeatHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ fontSize: '9.5px', fontWeight: 800, color, textAlign: 'center', letterSpacing: '0.07em' }}>
      {label.toUpperCase()}
    </div>
  );
}

function HeatCell({ count, color }: { count: number; color: string }) {
  const bg = count === 0 ? '#F8FAFC'
    : count >= 5 ? color
    : count >= 3 ? `${color}80`
    : `${color}33`;
  const textColor = count === 0 ? '#CBD5E1' : count >= 5 ? '#fff' : color;
  return (
    <div className="flex items-center justify-center rounded-md"
      style={{ height: 32, background: bg, border: `1px solid ${count === 0 ? '#E2E8F0' : color + '40'}`, fontSize: '13px', fontWeight: 800, color: textColor, fontFamily: 'Inter, sans-serif' }}>
      {count}
    </div>
  );
}

function RiskRow({ icon, label, c, h, m, l }: { icon: string; label: string; c: number; h: number; m: number; l: number }) {
  return (
    <>
      <div className="flex items-center gap-2" style={{ fontSize: '11.5px', color: '#1D252C', fontWeight: 600 }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        {label}
      </div>
      <HeatCell count={c} color="#A30080" />
      <HeatCell count={h} color="#DC2626" />
      <HeatCell count={m} color="#B58800" />
      <HeatCell count={l} color="#0284C7" />
    </>
  );
}

function CoverageBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#0F2952', fontFamily: 'monospace' }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF2F8' }}>
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}

function PulseTile({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: number; sub?: string; accent: string }) {
  return (
    <div className="rounded-lg p-3"
      style={{ background: `${accent}08`, border: `1px solid ${accent}26`, borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: accent }}>
        {icon}
        <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F2952', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: 2, fontFamily: 'monospace' }}>{sub}</div>}
    </div>
  );
}

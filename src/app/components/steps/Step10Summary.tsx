import { useMemo } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, ShieldAlert, Server, HardDrive, Cpu } from 'lucide-react';
import type { Template, QuestionSeverity } from '../types/templates';
import type { TemplateAnswers } from '../rules/ruleEngine';
import type { SessionData } from '../Dashboard';
import type { VersionEntry } from './Step4VersionCheck';
import type { Recommendation } from './Step8Recommendations';
import type { ActionItem } from './Step9NextSteps';
import type { ServerEntry } from './StepServerDetails';

interface Step10Props {
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  sessionData: SessionData;
  checklistAnswers: TemplateAnswers;
  versionEntries: Record<string, VersionEntry>;
  recommendations: Recommendation[];
  actionItems: ActionItem[];
  serverDetails: ServerEntry[];
}

const PRODUCT_ID_MAP: Record<string, string> = {
  web: 'web', email: 'email', data: 'dlp', ngfw: 'ngfw',
  dspm: 'dspm', cls: 'classification', appl: 'appl', vappl: 'appl',
};

const SEV_ORDER: QuestionSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SEV_CFG: Record<QuestionSeverity, { text: string; bg: string; border: string; bar: string; label: string }> = {
  CRITICAL: { text: '#DC2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)',  bar: '#DC2626', label: 'C' },
  HIGH:     { text: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.2)',  bar: '#D97706', label: 'H' },
  MEDIUM:   { text: '#2563EB', bg: 'rgba(37,99,235,0.08)',  border: 'rgba(37,99,235,0.2)',  bar: '#3B82F6', label: 'M' },
  LOW:      { text: '#059669', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', bar: '#10B981', label: 'L' },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ok:      { label: 'Current',        color: '#16A34A', bg: 'rgba(22,163,74,0.1)'   },
  warning: { label: 'Outdated',       color: '#D97706', bg: 'rgba(217,119,6,0.1)'   },
  eos:     { label: 'End of Support', color: '#DC2626', bg: 'rgba(220,38,38,0.1)'   },
  unknown: { label: 'Unknown',        color: '#94A3B8', bg: '#F1F5F9'               },
};

const SRV_LABELS: Record<string, string> = {
  fsm: 'FSM Server', sql: 'SQL Server', protector: 'Protector',
  supplemental: 'Supplemental DLP', content_gateway: 'Content Gateway',
  email_gateway: 'Email Gateway', ngfw: 'NGFW Mgmt',
};


function pct(used: number, total: number) {
  return total ? Math.min(100, Math.round((used / total) * 100)) : 0;
}
function scoreColor(s: number | null) {
  if (s === null) return '#94A3B8';
  return s >= 80 ? '#16A34A' : s >= 60 ? '#D97706' : '#DC2626';
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

export function Step10Summary({ templates, selectedProducts, sessionData, checklistAnswers, versionEntries, recommendations, actionItems, serverDetails }: Step10Props) {

  const selectedTemplates = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(selectedProducts).forEach(([pid, sel]) => {
      if (sel && PRODUCT_ID_MAP[pid]) ids.add(PRODUCT_ID_MAP[pid]);
    });
    return templates.filter((t) => ids.has(t.id));
  }, [templates, selectedProducts]);

  const productStats = useMemo(
    () => selectedTemplates.map((t) => ({ template: t, ...getProductStats(t, checklistAnswers) })),
    [selectedTemplates, checklistAnswers],
  );

  const allFindings = useMemo(() => {
    const result: Array<{
      key: string; text: string; severity: QuestionSeverity;
      section: string; note?: string; templateName: string;
      templateColor: string; templateIcon: string;
    }> = [];
    for (const t of selectedTemplates) {
      for (const q of t.questions) {
        if (!q.severity) continue;
        const key = `${t.id}__${q.id}`;
        const ans = checklistAnswers[key];
        if (ans?.value === (q.triggerOn ?? 'no')) {
          result.push({
            key, text: q.text, severity: q.severity as QuestionSeverity,
            section: q.section, note: ans.note,
            templateName: t.name, templateColor: t.color, templateIcon: t.icon,
          });
        }
      }
    }
    return result.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  }, [selectedTemplates, checklistAnswers]);

  const infraAlerts = useMemo(() => {
    const alerts: Array<{ label: string; metric: string; pct: number; level: 'critical' | 'warning'; icon: string }> = [];
    for (const s of serverDetails) {
      if (!s.applicable) continue;
      const name = s.hostname || SRV_LABELS[s.type] || s.type;
      for (const d of s.drives) {
        if (!d.totalGB) continue;
        const p = pct(d.usedGB, d.totalGB);
        if (p >= 70) alerts.push({ label: name, metric: `${d.label || 'Drive'} Disk ${p}%`, pct: p, level: p >= 85 ? 'critical' : 'warning', icon: '💾' });
      }
      if (s.ramTotalGB > 0) {
        const p = pct(s.ramUsedGB, s.ramTotalGB);
        if (p >= 70) alerts.push({ label: name, metric: `RAM ${p}%`, pct: p, level: p >= 85 ? 'critical' : 'warning', icon: '🧠' });
      }
      if (s.cpuUsagePercent >= 70)
        alerts.push({ label: name, metric: `CPU ${s.cpuUsagePercent}%`, pct: s.cpuUsagePercent, level: s.cpuUsagePercent >= 85 ? 'critical' : 'warning', icon: '⚡' });
    }
    return alerts.sort((a, b) => b.pct - a.pct);
  }, [serverDetails]);

  const totalAnswered  = productStats.reduce((s, p) => s + p.answered, 0);
  const totalQuestions = productStats.reduce((s, p) => s + p.total, 0);
  const criticalCount  = allFindings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount      = allFindings.filter((f) => f.severity === 'HIGH').length;
  const healthScore    = totalAnswered === 0 ? null
    : Math.round(Math.max(0, (totalAnswered - allFindings.length) / totalAnswered * 100));

  const versionList     = Object.entries(versionEntries).filter(([, e]) => e.installedVersion);
  const eosComponents   = versionList.filter(([, e]) => e.status === 'eos');
  const warnComponents  = versionList.filter(([, e]) => e.status === 'warning');
  const openActionItems = actionItems.filter((i) => i.status !== 'done');

  if (selectedTemplates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] p-[20px_22px] text-center py-16">
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No Products Selected</div>
        <div style={{ fontSize: '12.5px', color: '#64748B' }}>
          Go back to <strong>Step 2 — Product Scope</strong> and select the products in scope.
        </div>
      </div>
    );
  }

  const hsc = scoreColor(healthScore);

  return (
    <div className="space-y-[13px]">

      {/* ── CUSTOMER HEADER ── */}
      <div className="rounded-xl text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F2952 0%, #1D4ED8 55%, #2563EB 100%)', boxShadow: '0 4px 16px rgba(15,41,82,0.2)' }}>
        <div className="p-[22px_26px]">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0 pr-4">
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', opacity: 0.55, marginBottom: '5px' }}>
                FORCEPOINT INTELLIGENCE PLATFORM — HEALTH CHECK SUMMARY
              </div>
              <div style={{ fontSize: '21px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {sessionData.customerName || 'Customer Not Set'}
              </div>
              <div style={{ fontSize: '11.5px', opacity: 0.65, marginTop: '4px' }}>
                {[
                  sessionData.forcepointId && `ID: ${sessionData.forcepointId}`,
                  sessionData.industry, sessionData.country,
                ].filter(Boolean).join(' · ')}
              </div>
              {sessionData.csm && (
                <div style={{ fontSize: '10.5px', opacity: 0.5, marginTop: '3px' }}>
                  CSM: {sessionData.csm}{sessionData.salesEngineer ? ` · SE: ${sessionData.salesEngineer}` : ''}
                </div>
              )}
            </div>
            {/* Health score badge */}
            <div className="flex flex-col items-center justify-center rounded-2xl p-4 flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.15)', minWidth: '82px' }}>
              <div style={{
                fontSize: '30px', fontWeight: 800, lineHeight: 1,
                color: healthScore === null ? 'rgba(255,255,255,0.4)'
                  : healthScore >= 80 ? '#6EE7B7'
                  : healthScore >= 60 ? '#FCD34D' : '#FCA5A5',
              }}>
                {healthScore === null ? '—' : `${healthScore}%`}
              </div>
              <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.06em', opacity: 0.55, marginTop: '4px', textAlign: 'center' }}>
                HEALTH
              </div>
            </div>
          </div>

          {/* Product chips */}
          <div className="flex gap-2 flex-wrap items-center">
            {selectedTemplates.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', fontSize: '11px', fontWeight: 600 }}>
                <span>{t.icon}</span>
                <span>{t.name.replace(' HC', '')}</span>
              </div>
            ))}
            <div className="ml-auto" style={{ fontSize: '10px', opacity: 0.5 }}>
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* ── CRITICAL ALERT BANNER ── */}
      {(criticalCount > 0 || eosComponents.length > 0) && (
        <div className="rounded-xl p-[14px_18px]"
          style={{ background: 'rgba(220,38,38,0.05)', border: '1.5px solid rgba(220,38,38,0.25)' }}>
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} style={{ color: '#DC2626', flexShrink: 0 }} />
            <div className="flex-1">
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#DC2626' }}>
                Immediate Attention Required
              </span>
              <span style={{ fontSize: '11.5px', color: '#7F1D1D', marginLeft: '8px' }}>
                {[
                  criticalCount > 0 && `${criticalCount} CRITICAL finding${criticalCount > 1 ? 's' : ''}`,
                  eosComponents.length > 0 && `${eosComponents.length} component${eosComponents.length > 1 ? 's' : ''} past End of Support`,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-4 gap-[13px]">

        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[16px_20px]">
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: '6px' }}>HEALTH SCORE</div>
          <div style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1, color: hsc }}>{healthScore === null ? '—' : `${healthScore}%`}</div>
          {healthScore !== null && (
            <div className="mt-2.5 h-1.5 bg-[#EEF2F8] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${healthScore}%`, background: hsc }} />
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '5px' }}>{totalAnswered} of {totalQuestions} answered</div>
        </div>

        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[16px_20px]">
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: '6px' }}>TOTAL FINDINGS</div>
          <div style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1, color: allFindings.length > 0 ? '#DC2626' : '#16A34A' }}>
            {allFindings.length}
          </div>
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {SEV_ORDER.map((sev) => {
              const count = allFindings.filter((f) => f.severity === sev).length;
              const cfg = SEV_CFG[sev];
              return (
                <span key={sev} className="px-1.5 py-0.5 rounded font-mono"
                  style={{ fontSize: '9px', fontWeight: 700, background: count > 0 ? cfg.bg : '#F1F5F9', color: count > 0 ? cfg.text : '#CBD5E1', border: `1px solid ${count > 0 ? cfg.border : '#E2E8F0'}` }}>
                  {cfg.label}:{count}
                </span>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl p-[16px_20px] shadow-[0_1px_3px_rgba(15,41,82,0.06)]"
          style={{
            background: criticalCount + highCount > 0 ? 'rgba(220,38,38,0.04)' : '#fff',
            border: `1px solid ${criticalCount + highCount > 0 ? 'rgba(220,38,38,0.22)' : 'rgba(15,41,82,0.08)'}`,
          }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: '6px' }}>CRITICAL + HIGH</div>
          <div style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1, color: criticalCount + highCount > 0 ? '#DC2626' : '#16A34A' }}>
            {criticalCount + highCount}
          </div>
          <div style={{ fontSize: '10px', color: criticalCount + highCount > 0 ? '#DC2626' : '#16A34A', marginTop: '5px', fontWeight: 500 }}>
            {criticalCount + highCount === 0 ? '✓ No high-priority issues' : 'Need immediate action'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[16px_20px]">
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: '6px' }}>OPEN ACTIONS</div>
          <div style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1, color: openActionItems.length > 0 ? '#D97706' : '#16A34A' }}>
            {openActionItems.length}
          </div>
          {actionItems.length > 0 && (
            <>
              <div className="mt-2.5 h-1.5 bg-[#EEF2F8] rounded-full overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.round((actionItems.filter(i => i.status === 'done').length / actionItems.length) * 100)}%`,
                    background: 'linear-gradient(90deg,#2563EB,#7C3AED)',
                  }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '5px' }}>
                {actionItems.filter(i => i.status === 'done').length}/{actionItems.length} completed
              </div>
            </>
          )}
          {actionItems.length === 0 && (
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '5px' }}>No action items defined</div>
          )}
        </div>
      </div>

      {/* ── PER-PRODUCT POSTURE ── */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] overflow-hidden">
        <div className="px-[20px] py-[14px]" style={{ borderBottom: '1px solid rgba(15,41,82,0.07)' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>Per-Product Security Posture</div>
        </div>
        <div>
          {productStats.map(({ template, answered, total, bySev, totalFindings, score }, idx) => {
            const sc = scoreColor(score);
            const barPct = score ?? 0;
            return (
              <div key={template.id}
                style={{ borderBottom: idx < productStats.length - 1 ? '1px solid rgba(15,41,82,0.05)' : 'none' }}>
                <div className="flex items-center gap-4 px-[20px] py-[14px]">
                  {/* Icon + name */}
                  <div className="flex items-center gap-3 flex-shrink-0" style={{ minWidth: '200px' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[18px]"
                      style={{ background: `${template.color}14` }}>
                      {template.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                        {template.name.replace(' HC', '')}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
                        {answered}/{total} answered
                      </div>
                    </div>
                  </div>

                  {/* Severity chips */}
                  <div className="flex items-center gap-1.5 flex-1">
                    {SEV_ORDER.map((sev) => {
                      const count = bySev[sev] ?? 0;
                      const cfg = SEV_CFG[sev];
                      return (
                        <span key={sev} className="px-2 py-0.5 rounded font-mono"
                          style={{
                            fontSize: '9.5px', fontWeight: 700,
                            background: count > 0 ? cfg.bg : '#F8FAFC',
                            color: count > 0 ? cfg.text : '#CBD5E1',
                            border: `1px solid ${count > 0 ? cfg.border : '#E2E8F0'}`,
                          }}>
                          {sev[0]}: {count}
                        </span>
                      );
                    })}
                  </div>

                  {/* Health bar */}
                  <div className="flex items-center gap-3" style={{ minWidth: '160px' }}>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF2F8' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: sc }} />
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: sc, minWidth: '42px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {score === null ? '—' : `${score}%`}
                    </div>
                  </div>
                </div>

                {/* findings detail — only if there are findings */}
                {totalFindings > 0 && (
                  <div className="px-[20px] pb-[10px] flex gap-2">
                    {allFindings.filter(f => f.templateName === template.name).slice(0, 4).map((f) => {
                      const cfg = SEV_CFG[f.severity];
                      return (
                        <div key={f.key} className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg flex-1"
                          style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, minWidth: 0 }}>
                          <div style={{ width: 3, height: '100%', minHeight: 28, background: cfg.bar, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                          <div className="min-w-0">
                            <div style={{ fontSize: '10.5px', color: '#0F172A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.text}
                            </div>
                            <div style={{ fontSize: '9px', color: cfg.text, fontWeight: 700, marginTop: '1px' }}>
                              {f.severity} · {f.section}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {allFindings.filter(f => f.templateName === template.name).length > 4 && (
                      <div className="flex items-center px-2.5 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>
                        +{allFindings.filter(f => f.templateName === template.name).length - 4} more
                      </div>
                    )}
                  </div>
                )}

                {answered === 0 && (
                  <div className="px-[20px] pb-[10px]">
                    <span style={{ fontSize: '10.5px', color: '#CBD5E1', fontStyle: 'italic' }}>
                      Checklist not completed for this product
                    </span>
                  </div>
                )}
                {answered > 0 && totalFindings === 0 && (
                  <div className="px-[20px] pb-[10px] flex items-center gap-1.5">
                    <CheckCircle2 size={12} style={{ color: '#16A34A' }} />
                    <span style={{ fontSize: '10.5px', color: '#16A34A', fontWeight: 600 }}>All checks passed</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── VERSION STATUS + INFRA ALERTS (two columns) ── */}
      <div className="grid grid-cols-2 gap-[13px]">

        {/* Version Status */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Version & EoS Status</div>
            {versionList.length > 0 && (
              <div className="flex items-center gap-1.5">
                {eosComponents.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
                    EoS: {eosComponents.length}
                  </span>
                )}
                {warnComponents.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706' }}>
                    Outdated: {warnComponents.length}
                  </span>
                )}
              </div>
            )}
          </div>

          {versionList.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
              No version data recorded — complete Step 4.
            </div>
          ) : (
            <div className="space-y-1.5">
              {versionList.map(([key, entry]) => {
                const cfg = STATUS_CFG[entry.status] ?? STATUS_CFG.unknown;
                return (
                  <div key={key} className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg"
                    style={{ background: '#F8FAFC', border: '1px solid rgba(15,41,82,0.06)' }}>
                    <span style={{ fontSize: '11px', color: '#334155', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748B' }}>
                      {entry.installedVersion}
                    </span>
                    {entry.eoSupport && (
                      <span style={{ fontSize: '9px', color: entry.status === 'eos' ? '#DC2626' : '#94A3B8', fontFamily: 'monospace' }}>
                        EoS {entry.eoSupport}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold font-mono flex-shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Infrastructure Alerts */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div className="flex items-center gap-2 mb-3">
            <Server size={13} style={{ color: '#F97316' }} />
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Infrastructure Alerts</div>
          </div>

          {serverDetails.filter(s => s.applicable).length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
              No server data — complete Step 5 (Server Details).
            </div>
          ) : infraAlerts.length === 0 ? (
            <div className="flex items-center gap-2" style={{ color: '#16A34A' }}>
              <CheckCircle2 size={13} />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>All servers within healthy thresholds</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {infraAlerts.map((alert, i) => {
                const isCrit = alert.level === 'critical';
                const color = isCrit ? '#DC2626' : '#D97706';
                const bg = isCrit ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)';
                const border = isCrit ? 'rgba(220,38,38,0.18)' : 'rgba(217,119,6,0.18)';
                return (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    <span style={{ fontSize: '12px' }}>{alert.icon}</span>
                    <span style={{ fontSize: '11px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.label}
                    </span>
                    <span style={{ fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 700, color, flexShrink: 0 }}>
                      {alert.metric}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono flex-shrink-0"
                      style={{ background: bg, color, border: `1px solid ${border}` }}>
                      {isCrit ? 'CRITICAL' : 'WARN'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ALL FINDINGS (critical + high in detail, medium/low summarized) ── */}
      {allFindings.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-[20px] py-[14px]"
            style={{ borderBottom: '1px solid rgba(15,41,82,0.07)' }}>
            <div className="flex items-center gap-2">
              <AlertCircle size={14} style={{ color: '#DC2626' }} />
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                All Findings ({allFindings.length})
              </div>
            </div>
            <div className="flex gap-1.5">
              {SEV_ORDER.map((sev) => {
                const count = allFindings.filter(f => f.severity === sev).length;
                if (!count) return null;
                const cfg = SEV_CFG[sev];
                return (
                  <span key={sev} className="px-2 py-0.5 rounded-full text-[9.5px] font-bold font-mono"
                    style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                    {sev}: {count}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-[rgba(15,41,82,0.05)]">
            {allFindings.map((f) => {
              const cfg = SEV_CFG[f.severity];
              return (
                <div key={f.key} className="flex items-start gap-3 px-[20px] py-[11px]"
                  style={{ boxShadow: `inset 3px 0 0 ${cfg.bar}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>{f.text}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded font-mono"
                        style={{ fontSize: '8.5px', fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                        {f.severity}
                      </span>
                      <span className="px-1.5 py-0.5 rounded font-mono"
                        style={{ fontSize: '8.5px', fontWeight: 700, background: `${f.templateColor}12`, color: f.templateColor, border: `1px solid ${f.templateColor}25` }}>
                        {f.templateIcon} {f.templateName.replace(' HC', '')}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>{f.section}</span>
                    </div>
                    {f.note && (
                      <div className="mt-1.5 px-2.5 py-1.5 rounded-md"
                        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '11px', color: '#1E40AF' }}>
                        <strong>Note:</strong> {f.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RECOMMENDATIONS + ACTIONS ── */}
      <div className="grid grid-cols-2 gap-[13px]">

        {/* Recommendations */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
            💡 Recommendations
            <span className="ml-2 px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(217,119,6,0.1)', color: '#D97706' }}>
              {recommendations.length}
            </span>
          </div>
          {recommendations.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No recommendations added yet</div>
          ) : (
            <div className="space-y-2">
              {recommendations.slice(0, 7).map((rec) => {
                const pColors: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' };
                const c = pColors[rec.priority] ?? '#94A3B8';
                return (
                  <div key={rec.id} className="flex items-center gap-2 py-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                    <span style={{ fontSize: '11.5px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rec.title}
                    </span>
                    <span className="px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                      style={{ fontSize: '8px', fontWeight: 700, background: `${c}12`, color: c }}>
                      {rec.priority.toUpperCase()}
                    </span>
                  </div>
                );
              })}
              {recommendations.length > 7 && (
                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>+{recommendations.length - 7} more recommendations</div>
              )}
            </div>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
            📋 Action Items
            <span className="ml-2 px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>
              {actionItems.length}
            </span>
          </div>
          {actionItems.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No action items defined yet</div>
          ) : (
            <>
              {/* Status summary */}
              <div className="flex gap-4 mb-3">
                {[
                  { key: 'done',        label: 'Done',     color: '#16A34A' },
                  { key: 'in_progress', label: 'In Prog.', color: '#2563EB' },
                  { key: 'not_started', label: 'Pending',  color: '#94A3B8' },
                ].map(({ key, label, color }) => {
                  const count = actionItems.filter(i => i.status === key).length;
                  return (
                    <div key={key} className="text-center">
                      <div style={{ fontSize: '20px', fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
                      <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '2px' }}>{label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: '#F1F5F9' }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.round((actionItems.filter(i => i.status === 'done').length / actionItems.length) * 100)}%`,
                    background: 'linear-gradient(90deg, #2563EB, #7C3AED)',
                  }} />
              </div>

              {/* Open items */}
              <div className="space-y-1.5 mt-3">
                {actionItems.filter(i => i.status !== 'done').slice(0, 5).map((item) => {
                  const pColors: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' };
                  const c = pColors[item.priority] ?? '#94A3B8';
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
                      <span style={{ fontSize: '11.5px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.task}
                      </span>
                      <span style={{ fontSize: '8.5px', fontFamily: 'monospace', fontWeight: 700, color: item.status === 'in_progress' ? '#2563EB' : '#94A3B8' }}>
                        {item.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}
                      </span>
                    </div>
                  );
                })}
                {actionItems.filter(i => i.status !== 'done').length > 5 && (
                  <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                    +{actionItems.filter(i => i.status !== 'done').length - 5} more open actions
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

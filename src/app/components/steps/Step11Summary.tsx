import { useState, useMemo, useRef } from 'react';
import { CheckCircle2, Circle, Download, Loader, AlertCircle, FileText, Shield, Image as ImageIcon, X, Upload, Flag } from 'lucide-react';
import type { Template } from '../types/templates';
import type { TemplateAnswers } from '../rules/ruleEngine';
import type { SessionData, LicenseGapItem } from '../Dashboard';
import { CATALOG, GROUP_CONFIG, resolveLatest, resolveInstalledDates, STATUS_CFG, type VersionEntry } from './Step4VersionCheck';
import { WEB_REPORTS, DLP_REPORTS, EMAIL_REPORTS, type ReportRunResult } from '../../constants/reportDefinitions';
import type { VersionDataStore } from '../../constants/versionData';
import type { Recommendation as StoredRec } from './Step8Recommendations';
import type { ActionItem as StoredAction } from './Step9NextSteps';
import type { FeatureRequest as StoredFR } from './Step10FeatureRequests';
import type { ServerEntry as StoredServer } from './StepServerDetails';
import { formatMemoryGB, memoryUsagePct, statusColor as statusColorDlp, type DlpServerBundle } from './dlpServerInfoParser';
import { formatRemaining, certStatusColor, certStatusIcon, type ParsedCertificate } from './certificateParser';
import type { EndpointAgentSummary } from './endpointAgentParser';
import type { DlpDashboardSummary } from './dlpDashboardParser';
import type { DlpAllLogReport } from './dlpAllLogParser';
import type { AuditSystemLogsReport } from './auditSystemLogsParser';
import type { ServiceLogsReport } from './dlpServiceLogsParser';
import { type DlpPostureSummary, type DlpPostureBlockId, DEFAULT_POSTURE_SECTIONS, formatBytes } from './dlpPosture';
import type { ComplianceFrameworkItem, EnhancementOverride } from '../Dashboard';
import type { VersionUpgradeProposal } from './StepVersionUpgrades';
import { mergeEnhancement } from './StepRecommendedEnhancements';
import { suggestComplianceFrameworks } from '../../utils/complianceSuggest';
import { type EndpointSupportMatrix, isMatrixEmpty, isFdcMatrixEmpty } from '../../constants/endpointSupportMatrix';
import type { EndpointCompatibilityAssessment, EndpointCompatibilityInput } from '../../utils/endpointCompatibilityEngine';
import { computeFdcAnalysis } from '../../utils/endpointCompatibilityEngine';
import { ENHANCEMENTS } from '../../constants/enhancements';
import { lookupHardwareLifecycle, lifecycleStatus, lifecycleStatusColor } from '../../utils/hardwareLifecycle';
import type { CheckData } from './report/types';
import { PRODUCT_ID_MAP, SEV_ORDER, SRV_LABELS, COMPLETION_STEPS } from './report/constants';
import { esc, sevStyle, stStyle, pct, dateBadgeHtml, scoreColor } from './report/helpers';
import { computeHealthScore } from './report/healthScore';

interface Step11Props {
  sessionData: SessionData;
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  checklistAnswers: TemplateAnswers;
  versionEntries: Record<string, VersionEntry>;
  versionData: VersionDataStore;
  recommendations: StoredRec[];
  actionItems: StoredAction[];
  featureRequests: StoredFR[];
  serverDetails: StoredServer[];
  selectedReports: string[];
  dlpBundles: DlpServerBundle[];
  certificates: ParsedCertificate[];
  selectedEnhancements: string[];
  licenseGaps: LicenseGapItem[];
  endpointAgentSummary: EndpointAgentSummary | null;
  dlpDashboardSummary: DlpDashboardSummary | null;
  /* Optional Tomcat application log analysis (dlp-all.log). Renders as an
     evidence block in Part II if present. */
  dlpAllLogReport: DlpAllLogReport | null;
  /* Optional DLP audit-system CSV analysis (AUDIT_SYSTEM_LOGS.csv). */
  auditLogReport: AuditSystemLogsReport | null;
  /* Optional cross-correlated analyzer for `\Data Security\Logs\` —
     8 service log files folded into one issue list. */
  serviceLogsReport: ServiceLogsReport | null;
  /* Star/dismiss state for log findings — only STARRED issues flow
     into the report's "DLP Log Evidence" section. Dismissed entries
     are honored in Step 3 only; they're not relevant to the report. */
  starredLogIssues: Record<string, true>;
  dlpPostureSummary: DlpPostureSummary | null;
  dlpPostureSections: Record<DlpPostureBlockId, boolean>;
  customerLogo: string | null;
  setCustomerLogo: React.Dispatch<React.SetStateAction<string | null>>;
  complianceFrameworks: ComplianceFrameworkItem[];
  enhancementOverrides: Record<string, EnhancementOverride>;
  versionUpgrades: VersionUpgradeProposal[];
  endpointMatrix: EndpointSupportMatrix;
  endpointCompatAssessment: EndpointCompatibilityAssessment | null;
  endpointCompatInput: EndpointCompatibilityInput;
  /* Runtime SQL report results keyed by ReportDef.id — produced by clicking
     Run on a row in Step 3. Not persisted; survives only the wizard session. */
  reportRuns: Record<string, ReportRunResult>;
  onComplete: () => void;
  isComplete: boolean;
}

function buildReportHTML(p: {
  sessionData: SessionData; selectedTemplates: Template[];
  selectedProducts: Record<string, boolean>;
  checklistAnswers: TemplateAnswers;
  allFindings: Array<{ text: string; severity: string; section: string; note?: string; templateName: string; answer: string; description?: string; remediation?: string; }>;
  versionEntries: Record<string, VersionEntry>;
  versionData: VersionDataStore;
  serverDetails: StoredServer[];
  recommendations: StoredRec[]; actionItems: StoredAction[]; featureRequests: StoredFR[];
  totalAnswered: number; totalQuestions: number; healthScore: number | null; date: string;
  selectedReports: string[];
  dlpBundles: DlpServerBundle[];
  certificates: ParsedCertificate[];
  selectedEnhancements: string[];
  licenseGaps: LicenseGapItem[];
  endpointAgentSummary: EndpointAgentSummary | null;
  dlpDashboardSummary: DlpDashboardSummary | null;
  dlpAllLogReport: DlpAllLogReport | null;
  auditLogReport: AuditSystemLogsReport | null;
  serviceLogsReport: ServiceLogsReport | null;
  starredLogIssues: Record<string, true>;
  dlpPostureSummary: DlpPostureSummary | null;
  dlpPostureSections: Record<DlpPostureBlockId, boolean>;
  customerLogo: string | null;
  complianceFrameworks: ComplianceFrameworkItem[];
  enhancementOverrides: Record<string, EnhancementOverride>;
  versionUpgrades: VersionUpgradeProposal[];
  endpointMatrix: EndpointSupportMatrix;
  endpointCompatAssessment: EndpointCompatibilityAssessment | null;
  endpointCompatInput: EndpointCompatibilityInput;
  reportRuns: Record<string, ReportRunResult>;
  healthBreakdown: {
    questionPenalty: number;
    eosCount: number;
    warnVersionCount: number;
    infraCritical: number;
    infraWarn: number;
    versionPenalty: number;
    infraPenalty: number;
  };
  /* Selects which of the two report formats to produce:
       - 'healthcheck' (default): full technical Health Check & Maturity Assessment for
         Security/SOC/Infra/Ops teams. Includes every Part except Part 0 (CISO briefing).
       - 'executive': condensed Executive Risk Briefing for CISO/CIO/Director. Keeps the
         Part 0 CISO dashboard + compliance lens, the Executive Overview, and only the
         License Extension + Recommended Enhancements from the roadmap. Skips Parts II
         and IV entirely. */
  variant?: 'executive' | 'healthcheck';
}) {
  const variant = p.variant ?? 'healthcheck';
  const isExec = variant === 'executive';
  const isTech = variant === 'healthcheck';
  /* Checklist-only counts (kept for legacy callsites in this file). For the
     cover/Part 0 "Critical Findings" headline we use the aggregate below. */
  const checklistCritical = p.allFindings.filter(f => f.severity === 'CRITICAL').length;
  const checklistHigh     = p.allFindings.filter(f => f.severity === 'HIGH').length;
  const checklistMedium   = p.allFindings.filter(f => f.severity === 'MEDIUM').length;
  const checklistLow      = p.allFindings.filter(f => f.severity === 'LOW').length;

  const hasWeb   = p.selectedTemplates.some(t => t.id === 'web');
  const hasDLP   = p.selectedTemplates.some(t => t.id === 'dlp');
  const hasEmail = p.selectedTemplates.some(t => t.id === 'email');

  /* Usage-report descriptors — combine the static report definition with
     whatever runtime SQL result the operator has produced via Step 3's Run
     button. `run` is undefined when the report is selected but hasn't been
     executed yet; the render path shows a PENDING placeholder in that case. */
  const enrichUsage = (defs: typeof WEB_REPORTS) =>
    defs.filter((r) => p.selectedReports.includes(r.id))
        .map((r) => ({ ...r, run: p.reportRuns?.[r.id] }));
  const webUsageReports   = enrichUsage(WEB_REPORTS);
  const dataUsageReports  = enrichUsage(DLP_REPORTS);
  const emailUsageReports = enrichUsage(EMAIL_REPORTS);

  const effectiveStatus = (e: VersionEntry) => e.statusOverride ?? e.status;
  const customEntriesByGroup = Object.values(p.versionEntries).filter(
    (e): e is VersionEntry => !!e?.isCustom,
  );
  /* Must mirror Step 4's rendering rules so the report and the wizard agree on
     which components are "in" the assessment:
       - Skip groups whose product isn't selected ([Step4VersionCheck.tsx:678](src/app/components/steps/Step4VersionCheck.tsx#L678)).
       - Drop tombstoned entries (`removed:true`) — Step 4 hides these via the Restore banner.
       - For catalog rows the user flipped to "overridden" (isCustom + catalog id),
         render once under catalogEntries; exclude them from customEntries to
         avoid the duplicate that was showing as inflated component counts. */
  const versionGroups = Object.entries(GROUP_CONFIG).map(([groupKey, grp]) => {
    if (!p.selectedProducts[grp.productId]) return { grp, entries: [] };
    const catalogEntries = grp.componentIds
      .map(id => ({ id, entry: p.versionEntries[id] }))
      .filter((x): x is { id: string; entry: VersionEntry } =>
        !!(x.entry?.installedVersion) && !x.entry.removed);
    const customEntries = customEntriesByGroup
      .filter(e => e.groupId === groupKey
        && !!e.installedVersion
        && !e.removed
        && !grp.componentIds.includes(e.id))
      .map(e => ({ id: e.id, entry: e }));
    return { grp, entries: [...catalogEntries, ...customEntries] };
  }).filter(({ entries }) => entries.length > 0);

  /* Flat list of every entry actually rendered above — used for the four
     summary pills so they stay consistent with the tables. Iterating
     `p.versionEntries` directly would re-include tombstoned and deselected-
     product entries. */
  const allVEntries = versionGroups.flatMap(({ entries }) => entries.map(({ entry }) => entry));
  const vCounts = {
    ok:       allVEntries.filter(e => effectiveStatus(e) === 'ok').length,
    warning:  allVEntries.filter(e => effectiveStatus(e) === 'warning').length,
    critical: allVEntries.filter(e => ['critical','eos','eol'].includes(effectiveStatus(e))).length,
    unknown:  allVEntries.filter(e => effectiveStatus(e) === 'unknown').length,
  };
  const activeServers = p.serverDetails.filter(s => s.applicable);

  const infraAlerts: string[] = [];
  /* Critical = ≥85% utilisation, High = 70–85%. Tracked separately so we
     can roll them into the Part 0 Finding Breakdown by category. */
  let infraCritCount = 0;
  let infraHighCount = 0;
  for (const s of activeServers) {
    const name = s.hostname || SRV_LABELS[s.type] || s.type;
    for (const d of s.drives) {
      const dp = pct(d.usedGB, d.totalGB);
      if (dp >= 85) { infraCritCount++; infraAlerts.push(`${name} — ${d.label || 'Drive'}: ${dp}% disk used`); }
      else if (dp >= 70) { infraHighCount++; infraAlerts.push(`${name} — ${d.label || 'Drive'}: ${dp}% disk used`); }
    }
    if (s.ramTotalGB > 0) {
      const rp = pct(s.ramUsedGB, s.ramTotalGB);
      if (rp >= 85) { infraCritCount++; infraAlerts.push(`${name}: ${rp}% RAM used`); }
      else if (rp >= 70) { infraHighCount++; infraAlerts.push(`${name}: ${rp}% RAM used`); }
    }
    if (s.cpuUsagePercent >= 85) { infraCritCount++; infraAlerts.push(`${name}: ${s.cpuUsagePercent}% CPU`); }
    else if (s.cpuUsagePercent >= 70) { infraHighCount++; infraAlerts.push(`${name}: ${s.cpuUsagePercent}% CPU`); }
  }

  /* Per-product widget data — separated from the legacy `productRows` HTML
     stringification so the new Part 0 CISO dashboard can reuse the same
     numbers without re-iterating templates. */
  const productCards = p.selectedTemplates.map(t => {
    let answered = 0;
    const bySev: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const q of t.questions) {
      const key = `${t.id}__${q.id}`;
      const ans = p.checklistAnswers[key];
      if (ans?.value != null) answered++;
      if (q.severity && ans?.value === (q.triggerOn ?? 'no')) bySev[q.severity] = (bySev[q.severity] ?? 0) + 1;
    }
    const totalF = Object.values(bySev).reduce((a, b) => a + b, 0);
    const score = answered === 0 ? null : Math.round(Math.max(0, (answered - totalF) / answered * 100));
    const sc = score === null ? '#64748b' : score >= 80 ? '#69BC00' : score >= 60 ? '#B58800' : '#A30080';
    return { template: t, answered, total: t.questions.length, bySev, totalF, score, sc };
  });

  const productRows = productCards.map(({ template: t, answered, bySev, score, sc }) => {
    return `<tr>
      <td style="font-weight:600;color:#023E8A;">${esc(t.icon)} ${esc(t.name.replace(' HC', ''))}</td>
      <td style="text-align:center;font-family:monospace;">${answered}/${t.questions.length}</td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('CRITICAL')}">${bySev.CRITICAL}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('HIGH')}">${bySev.HIGH}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('MEDIUM')}">${bySev.MEDIUM}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('LOW')}">${bySev.LOW}</span></td>
      <td style="font-weight:800;color:${sc};font-family:monospace;text-align:right;">${score === null ? '—' : score + '%'}</td>
    </tr>`;
  }).join('');

  // Build executive summary key observations
  const eosEntries  = allVEntries.filter(e => ['eos','eol','critical'].includes(effectiveStatus(e)));
  const warnEntries = allVEntries.filter(e => effectiveStatus(e) === 'warning');
  const obsColor: Record<string, string> = { CRITICAL:'#A30080', HIGH:'#DA1B2E', WARNING:'#B58800', MEDIUM:'#023E8A', LOW:'#69BC00' };
  const obsBg:    Record<string, string> = { CRITICAL:'#fef2f2', HIGH:'#fff7ed', WARNING:'#fffbeb', MEDIUM:'#eff6ff', LOW:'#f0fdf4' };
  const obsBorder:Record<string, string> = { CRITICAL:'#A30080', HIGH:'#DA1B2E', WARNING:'#B58800', MEDIUM:'#023E8A', LOW:'#69BC00' };

  const expiredCerts = p.certificates.filter(c => c.status === 'EXPIRED');
  const expiringCerts = p.certificates.filter(c => c.status === 'EXPIRING_SOON');

  // Surface support-level upgrade as a HIGH executive observation when the recommended tier differs.
  const supportUpgradeNeeded =
    !!p.sessionData.supportLevel
    && !!p.sessionData.recommendedSupportLevel
    && p.sessionData.supportLevel.trim().toLowerCase() !== p.sessionData.recommendedSupportLevel.trim().toLowerCase();

  /* ─────────────────────────────────────────────────────────────────────
     PART 0 · Aggregate Finding Breakdown
     Rolls every risk source (version lifecycle, infrastructure, checklist,
     and configuration/cert/support) into a single category × severity matrix.
     This is the source of truth for the cover "Critical Findings" headline
     and the Part 0 breakdown table — replaces the previous behaviour where
     only checklist findings counted, hiding 80% of real critical issues.
     ───────────────────────────────────────────────────────────────────── */
  const findingBreakdown = {
    versionLifecycle: {
      label: 'Version / Lifecycle',
      critical: eosEntries.length,
      high: 0,
      medium: warnEntries.length,
      low: 0,
    },
    infrastructure: {
      label: 'Infrastructure',
      critical: infraCritCount,
      high: infraHighCount,
      medium: 0,
      low: 0,
    },
    checklist: {
      label: 'Per-Product Checklist',
      critical: checklistCritical,
      high: checklistHigh,
      medium: checklistMedium,
      low: checklistLow,
    },
    configuration: {
      label: 'Configuration / Trust',
      critical: expiredCerts.length,
      high: expiringCerts.length + (supportUpgradeNeeded ? 1 : 0),
      medium: 0,
      low: 0,
    },
  };
  const breakdownTotals = {
    critical: findingBreakdown.versionLifecycle.critical + findingBreakdown.infrastructure.critical + findingBreakdown.checklist.critical + findingBreakdown.configuration.critical,
    high:     findingBreakdown.versionLifecycle.high     + findingBreakdown.infrastructure.high     + findingBreakdown.checklist.high     + findingBreakdown.configuration.high,
    medium:   findingBreakdown.versionLifecycle.medium   + findingBreakdown.infrastructure.medium   + findingBreakdown.checklist.medium   + findingBreakdown.configuration.medium,
    low:      findingBreakdown.versionLifecycle.low      + findingBreakdown.infrastructure.low      + findingBreakdown.checklist.low      + findingBreakdown.configuration.low,
  };
  /* These are the AGGREGATE numbers shown on the cover and in the Executive
     Summary verdict. They replace the prior "Critical = checklist criticals"
     behaviour which produced the "cover says 3, body shows 15" inconsistency. */
  const criticalCount = breakdownTotals.critical;
  const highCount = breakdownTotals.high;

  /* Broader aggregate that also rolls in analyst-curated work — recommendations
     and action items by priority. Used by the Executive Details severity tiles
     and the Part 0 CISO Dashboard severity heat tiles so those numbers reflect
     "everything we'd raise to leadership", not just the checklist findings. */
  const recBySev = {
    CRITICAL: p.recommendations.filter((r) => r.priority === 'critical').length,
    HIGH:     p.recommendations.filter((r) => r.priority === 'high').length,
    MEDIUM:   p.recommendations.filter((r) => r.priority === 'medium').length,
    LOW:      p.recommendations.filter((r) => r.priority === 'low').length,
  };
  const actBySev = {
    CRITICAL: p.actionItems.filter((a) => a.priority === 'critical').length,
    HIGH:     p.actionItems.filter((a) => a.priority === 'high').length,
    MEDIUM:   p.actionItems.filter((a) => a.priority === 'medium').length,
    LOW:      p.actionItems.filter((a) => a.priority === 'low').length,
  };
  const aggregateSev = {
    CRITICAL: breakdownTotals.critical + recBySev.CRITICAL + actBySev.CRITICAL,
    HIGH:     breakdownTotals.high     + recBySev.HIGH     + actBySev.HIGH,
    MEDIUM:   breakdownTotals.medium   + recBySev.MEDIUM   + actBySev.MEDIUM,
    LOW:      breakdownTotals.low      + recBySev.LOW      + actBySev.LOW,
  };
  const aggregateTotal = aggregateSev.CRITICAL + aggregateSev.HIGH + aggregateSev.MEDIUM + aggregateSev.LOW;

  type Obs = { level: string; text: string; source?: 'finding' | 'recommendation' | 'action' };

  /* User-curated entries via the ★ Feature toggles in Step 9 / Step 10.
     When the user has flagged anything as featured, those drive the executive
     summary instead of the auto-derived high/critical alerts. */
  const featuredRecs = p.recommendations.filter((r) => r.featured);
  const featuredActions = p.actionItems.filter((a) => a.featured);
  const sevLevel = (priority: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' =>
    /critical/i.test(priority) ? 'CRITICAL'
    : /high/i.test(priority) ? 'HIGH'
    : /medium/i.test(priority) ? 'MEDIUM' : 'LOW';

  const keyObs: Obs[] = [
    ...eosEntries.map(e => ({ level: 'CRITICAL', text: `${e.component} (v${e.installedVersion}) — ${e.notes || 'End of Support reached'}`, source: 'finding' as const })),
    ...infraAlerts.map(a => ({ level: 'CRITICAL', text: a, source: 'finding' as const })),
    ...expiredCerts.map(c => ({ level: 'CRITICAL', text: `Certificate EXPIRED: ${c.subjectCN} (${c.fileName}) — expired ${Math.abs(c.daysRemaining)} days ago`, source: 'finding' as const })),
    ...p.allFindings.filter(f => f.severity === 'CRITICAL').slice(0, 6).map(f => ({ level: 'CRITICAL', text: f.text, source: 'finding' as const })),
    ...(supportUpgradeNeeded ? [{ level: 'HIGH', text: `Support level upgrade recommended: ${p.sessionData.supportLevel} → ${p.sessionData.recommendedSupportLevel} — review entitlement tier with the customer to align with their growing footprint and risk profile.`, source: 'finding' as const }] : []),
    ...expiringCerts.map(c => ({ level: 'HIGH', text: `Certificate expiring soon: ${c.subjectCN} (${c.fileName}) — ${c.daysRemaining} days remaining (${c.validToRaw})`, source: 'finding' as const })),
    ...p.allFindings.filter(f => f.severity === 'HIGH').slice(0, 5).map(f => ({ level: 'HIGH', text: f.text, source: 'finding' as const })),
    /* Curated entries from the recommendation + action toggles. They appear after
       infra/cert/finding alerts so the auto-derived risk picture comes first, then
       the analyst-curated picture follows. */
    ...featuredRecs.map(r => ({ level: sevLevel(r.priority), text: `Recommendation: ${r.title}${r.detail ? ` — ${r.detail}` : ''}`, source: 'recommendation' as const })),
    ...featuredActions.map(a => ({ level: sevLevel(a.priority), text: `Action: ${a.task}${a.owner ? ` (owner: ${a.owner})` : ''}${a.dueDate ? ` · due ${a.dueDate}` : ''}`, source: 'action' as const })),
    ...warnEntries.map(e => ({ level: 'WARNING', text: `${e.component} (v${e.installedVersion}) — ${e.notes || 'Update available'}`, source: 'finding' as const })),
    ...p.allFindings.filter(f => f.severity === 'MEDIUM').slice(0, 3).map(f => ({ level: 'MEDIUM', text: f.text, source: 'finding' as const })),
  ];

  const productsInScope = p.selectedTemplates.map(t => t.name.replace(' HC', '')).join(', ') || '—';
  const openActions = p.actionItems.filter(a => a.status !== 'done').length;

  const sd = p.sessionData;
  const hasAccountSection =
    !!(sd.city || sd.theatre || sd.region || sd.supportLevel || sd.arr || sd.channelAccountManager || sd.distributor)
    || (sd.licenses?.length ?? 0) > 0
    || (sd.entitlements?.length ?? 0) > 0
    || (sd.hardware?.length ?? 0) > 0
    || (sd.cases?.length ?? 0) > 0
    || (sd.featureRequests?.length ?? 0) > 0
    || (p.licenseGaps?.length ?? 0) > 0;

  /* ─── Compliance frameworks (Part 0) ────────────────────────────────
     User-curated selection from Step 1 wins. If the user hasn't run
     Auto-suggest yet, we fall back to the jurisdictional defaults so the
     report still renders something sensible (the customer's report must
     never be empty just because they skipped that section). */
  type ComplianceFw = { code: string; name: string; relevance: string; pillar: string; complianceStatus?: 'compliant' | 'partial' | 'non_compliant' | 'unassessed' };
  const userFrameworks = (p.complianceFrameworks ?? []).filter((f) => f.enabled && f.code.trim());
  const complianceFrameworks: ComplianceFw[] = userFrameworks.length > 0
    ? userFrameworks.map((f) => ({ code: f.code, name: f.name, relevance: f.relevance, pillar: f.pillar, complianceStatus: f.complianceStatus }))
    : suggestComplianceFrameworks({
        country:  p.sessionData.country,
        region:   p.sessionData.region,
        industry: p.sessionData.industry,
      }).map((f) => ({ code: f.code, name: f.name, relevance: f.relevance, pillar: f.pillar }));

  /* Top critical risks — business-language framing for Part 0 CISO briefing.
     Aggregates from the same sources as the Finding Breakdown but rephrases each
     into an executive-readable risk statement. Capped to 6 cards. */
  type TopRisk = { icon: string; severity: 'CRITICAL' | 'HIGH'; title: string; impact: string; component: string };
  const topRisks: TopRisk[] = [];
  for (const e of eosEntries.slice(0, 4)) {
    topRisks.push({
      icon: '⚠',
      severity: 'CRITICAL',
      title: 'Unsupported software in production',
      impact: 'No patches, no vendor accountability, no zero-day mitigations. Audit and regulatory exposure on a Tier-1 control.',
      component: `${e.component} v${e.installedVersion}`,
    });
  }
  if (infraCritCount > 0) {
    topRisks.push({
      icon: '🖥',
      severity: 'CRITICAL',
      title: 'Infrastructure capacity past safe threshold',
      impact: `${infraCritCount} server metric${infraCritCount === 1 ? '' : 's'} above 85% utilisation — risk of enforcement degradation and unplanned outage.`,
      component: `${infraCritCount} server metric${infraCritCount === 1 ? '' : 's'}`,
    });
  }
  for (const c of expiredCerts.slice(0, 2)) {
    topRisks.push({
      icon: '🔐',
      severity: 'CRITICAL',
      title: 'Trust chain broken — expired certificate',
      impact: 'Encrypted services may fail; users see browser warnings; integrations may silently break. Immediate rotation required.',
      component: `${c.subjectCN} (${c.fileName})`,
    });
  }
  for (const f of p.allFindings.filter(f => f.severity === 'CRITICAL').slice(0, 3)) {
    topRisks.push({
      icon: '📋',
      severity: 'CRITICAL',
      title: f.text.length > 80 ? f.text.slice(0, 78) + '…' : f.text,
      impact: f.description ? (f.description.length > 140 ? f.description.slice(0, 138) + '…' : f.description) : 'Critical-severity checklist gap identified during the assessment.',
      component: f.templateName.replace(' HC', ''),
    });
  }
  if (supportUpgradeNeeded) {
    topRisks.push({
      icon: '🎯',
      severity: 'HIGH',
      title: `Support tier upgrade recommended: ${p.sessionData.supportLevel} → ${p.sessionData.recommendedSupportLevel}`,
      impact: 'Current entitlement level no longer aligned with deployment footprint and risk profile — affects incident response SLAs.',
      component: 'Forcepoint Support Contract',
    });
  }
  const topRisksCapped = topRisks.slice(0, 6);

  /* ─── Part 0 · CISO Dashboard widgets ────────────────────────────────
     Mirrors Step 17 Summary & Review — verdict banner, severity heat tiles,
     coverage stats, activity pulse, and top-concern chips. All numbers
     come from the same aggregates used elsewhere in the report so the
     dashboard never contradicts the technical body. */
  type ConcernChip = { icon: string; text: string; color: string; bg: string; border: string };
  const topConcerns: ConcernChip[] = [];
  if (eosEntries.length > 0) topConcerns.push({ icon: '⚠', text: `${eosEntries.length} component${eosEntries.length === 1 ? '' : 's'} past EoS`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (infraCritCount > 0) topConcerns.push({ icon: '🖥', text: `${infraCritCount} server metric${infraCritCount === 1 ? '' : 's'} ≥ 85%`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (expiredCerts.length > 0) topConcerns.push({ icon: '🔐', text: `${expiredCerts.length} expired cert${expiredCerts.length === 1 ? '' : 's'}`, color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  if (p.endpointAgentSummary && p.endpointAgentSummary.outdatedCount > 0) {
    topConcerns.push({ icon: '💻', text: `${p.endpointAgentSummary.outdatedPct}% endpoints outdated`, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' });
  }
  if (p.endpointCompatAssessment && p.endpointCompatAssessment.compatibilityStatus === 'CRITICAL') {
    topConcerns.push({ icon: '🛡', text: 'Agent compatibility CRITICAL', color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' });
  }
  if (checklistHigh > 0 && topConcerns.length < 6) topConcerns.push({ icon: '⚠', text: `${checklistHigh} HIGH finding${checklistHigh === 1 ? '' : 's'}`, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' });
  if (warnEntries.length > 0 && topConcerns.length < 6) topConcerns.push({ icon: '↑', text: `${warnEntries.length} update${warnEntries.length === 1 ? '' : 's'} available`, color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' });
  if (expiringCerts.length > 0 && topConcerns.length < 6) topConcerns.push({ icon: '⏳', text: `${expiringCerts.length} cert${expiringCerts.length === 1 ? '' : 's'} expiring < 90d`, color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' });

  /* Verdict — driven by aggregate severity totals. */
  let verdictLabel = 'Good Health';
  let verdictColor = '#16A34A';
  let verdictBg = '#F0FDF4';
  let verdictBorder = '#BBF7D0';
  let verdictIcon = '✓';
  if (breakdownTotals.critical > 0) {
    verdictLabel = 'Critical Attention Required';
    verdictColor = '#A30080';
    verdictBg = '#FDF2F8';
    verdictBorder = '#FBCFE8';
    verdictIcon = '⨯';
  } else if (breakdownTotals.high > 0) {
    verdictLabel = 'Action Required';
    verdictColor = '#B58800';
    verdictBg = '#FFFBEB';
    verdictBorder = '#FDE68A';
    verdictIcon = '⚠';
  }

  /* Health gauge — composite score drives a CSS conic-gradient donut. */
  const hsc = p.healthScore === null ? '#94A3B8' : p.healthScore >= 80 ? '#16A34A' : p.healthScore >= 60 ? '#B58800' : '#A30080';
  const gaugeArc = (p.healthScore ?? 0) * 3.6;
  const dedQ = p.healthBreakdown.questionPenalty;
  const dedV = p.healthBreakdown.versionPenalty;
  const dedI = p.healthBreakdown.infraPenalty;
  const dedR = (p.recommendations.filter(r => r.priority === 'critical').length * 5) +
               (p.recommendations.filter(r => r.priority === 'high').length * 3) +
               (p.recommendations.filter(r => r.priority === 'medium').length * 1);
  const dedTotal = Math.max(1, dedQ + dedV + dedI + dedR);

  /* Risk × source heatmap data (4 rows × 4 severity columns). */
  const riskMatrixRows = [
    { label: 'Version / Lifecycle',     icon: '📦', critical: findingBreakdown.versionLifecycle.critical, high: findingBreakdown.versionLifecycle.high, medium: findingBreakdown.versionLifecycle.medium, low: findingBreakdown.versionLifecycle.low },
    { label: 'Infrastructure',          icon: '🖥', critical: findingBreakdown.infrastructure.critical,   high: findingBreakdown.infrastructure.high,   medium: findingBreakdown.infrastructure.medium,   low: findingBreakdown.infrastructure.low },
    { label: 'Checklist',               icon: '📋', critical: findingBreakdown.checklist.critical,        high: findingBreakdown.checklist.high,        medium: findingBreakdown.checklist.medium,        low: findingBreakdown.checklist.low },
    { label: 'Configuration / Trust',   icon: '🔐', critical: findingBreakdown.configuration.critical,    high: findingBreakdown.configuration.high,    medium: findingBreakdown.configuration.medium,    low: findingBreakdown.configuration.low },
  ];

  /* DLP data-source precedence: when the operator has pulled posture data
     via the DLP REST API AND at least one posture block is selected, the
     API result is authoritative. The SQL-driven "Data Security Usage"
     section gets suppressed in the report to avoid duplicate / conflicting
     numbers — the API call hits the same source-of-truth (FSM /incidents)
     and emits richer cross-sections. Web Security usage is independent
     and continues to render from its own SQL pipeline. */
  const apiPostureActive = !!p.dlpPostureSummary && Object.values(p.dlpPostureSections).some(Boolean);
  const dlpSqlSuppressed = hasDLP && apiPostureActive;

  /* Grouped TOC by Part — each part renders as a sub-header in the TOC list.
     Executive variant strips Part II + IV and keeps only Licensing + Enhancements
     from the roadmap; HealthCheck variant strips Part 0. */
  type TocEntry = { kind: 'part'; label: string } | { kind: 'item'; label: string };
  const roadmapPartLabel = isExec ? 'Part 3 · Roadmap &amp; Strategy' : 'Part III · Roadmap &amp; Strategy';
  const tocEntries: TocEntry[] = [
    { kind: 'part', label: 'Foreword' },
    { kind: 'item', label: 'Purpose of This Report' },

    ...(isExec ? [
      /* Executive Risk Briefing TOC — mirrors what the EXEC_ONLY
         blocks actually render. The TECH-only Part I (Customer
         Account, Introduction, Board Briefing) is intentionally
         absent here; surfacing those rows in the TOC would imply
         clickable content the exec render never produces. */
      { kind: 'part' as const, label: 'Part 1 · Executive Briefing' },
      { kind: 'item' as const, label: 'Risk Posture &amp; Executive Summary' },
      { kind: 'item' as const, label: 'Compliance Exposure' },
      ...((p.sessionData.licenses && p.sessionData.licenses.length > 0) || p.sessionData.supportLevel
        ? [{ kind: 'item' as const, label: 'Current Licensing Posture' }] : []),
    ] : [
      { kind: 'part' as const, label: 'Part I · Executive Overview' },
      { kind: 'item' as const, label: 'Introduction' },
      ...(hasAccountSection ? [{ kind: 'item' as const, label: 'Customer Account &amp; Licensing' }] : []),
      { kind: 'item' as const, label: 'Executive Details' },
    ]),

    ...(isTech ? [
      { kind: 'part' as const, label: 'Part II · Technical Assessment' },
      { kind: 'item' as const, label: 'Infrastructure &amp; Version Review' },
      ...(activeServers.length > 0 ? [{ kind: 'item' as const, label: 'Server Infrastructure' }] : []),
      ...(p.dlpBundles.length > 0 ? [{ kind: 'item' as const, label: 'DLP Telemetry File Analysis' }] : []),
      ...(((p.dlpAllLogReport && p.dlpAllLogReport.issues.some((i) => (p.starredLogIssues ?? {})[`dlp:${i.id}`])) ||
           (p.auditLogReport  && p.auditLogReport.issues.some((i)  => (p.starredLogIssues ?? {})[`audit:${i.id}`])) ||
           (p.serviceLogsReport && p.serviceLogsReport.issues.some((i) => (p.starredLogIssues ?? {})[`services:${i.id}`])))
        ? [{ kind: 'item' as const, label: 'DLP Log &amp; Audit Findings' }] : []),
      ...(p.endpointAgentSummary && p.endpointAgentSummary.totalRecords > 0 ? [{ kind: 'item' as const, label: 'Endpoint Agent Analysis' }] : []),
      ...((p.selectedProducts.data || p.selectedProducts.web) && p.endpointCompatAssessment ? [{ kind: 'item' as const, label: 'Agent Compatibility' }] : []),
      ...((p.dlpPostureSummary && Object.values(p.dlpPostureSections).some(Boolean)) ? [{ kind: 'item' as const, label: 'Information Security Posture Dashboard' }] : []),
      ...(p.certificates.length > 0 ? [{ kind: 'item' as const, label: 'Certificate Analysis' }] : []),
      ...(p.selectedTemplates.length > 0 ? [{ kind: 'item' as const, label: 'Per-Product Security Assessment' }] : []),
      ...(p.allFindings.length > 0 ? [{ kind: 'item' as const, label: 'Feature Posture Control' }] : []),
      ...(hasWeb                    ? [{ kind: 'item' as const, label: 'Web Security Usage' }] : []),
      ...(hasDLP && !dlpSqlSuppressed ? [{ kind: 'item' as const, label: 'Data Security Usage' }] : []),
      ...(hasEmail                  ? [{ kind: 'item' as const, label: 'Email Security Usage' }] : []),
    ] : []),

    /* Executive Posture chapter — only shown when there's actual
       posture data to render. Mirrors the EXEC_ONLY Part 2 block in
       the HTML output. Without this entry, TOC jumps directly from
       Part 1 to Part 3 even though Part 2 renders. */
    ...((isExec && p.dlpPostureSummary && Object.values(p.dlpPostureSections).some(Boolean)) ? [
      { kind: 'part' as const, label: 'Part 2 · Security Posture' },
      { kind: 'item' as const, label: 'Information Security Posture Dashboard' },
    ] : []),

    { kind: 'part', label: roadmapPartLabel },
    ...(isTech && p.recommendations.length > 0 ? [{ kind: 'item' as const, label: 'Recommendations' }] : []),
    ...(isTech && p.versionUpgrades.length > 0 ? [{ kind: 'item' as const, label: 'Version Upgrade Proposals' }] : []),
    /* Agent Compatibility moved into Part II (under Endpoint Agents) —
       Part III TOC entry retained only for the legacy raw-matrix
       fallback, which fires when DLP/Web is in scope and the matrix is
       imported but no customer assessment exists yet. */
    ...(isTech && (p.selectedProducts.data || p.selectedProducts.web) && !p.endpointCompatAssessment && !isMatrixEmpty(p.endpointMatrix)
      ? [{ kind: 'item' as const, label: 'OS &amp; Browser Support Matrix' }] : []),
    ...(isTech && p.actionItems.length > 0 ? [{ kind: 'item' as const, label: 'Action Items &amp; Next Steps' }] : []),
    ...(isTech && p.featureRequests.length > 0 ? [{ kind: 'item' as const, label: 'Customer Feature Requests' }] : []),
    ...((p.licenseGaps?.length ?? 0) > 0 ? [{ kind: 'item' as const, label: 'Recommended License Extension' }] : []),
    ...(p.selectedEnhancements.length > 0 ? [{ kind: 'item' as const, label: 'Recommended Enhancements' }] : []),

    ...(isTech ? [
      { kind: 'part' as const, label: 'Part IV · Reference' },
      { kind: 'item' as const, label: 'Appendix — Effort Score Card' },
    ] : []),

    { kind: 'part', label: 'Closing' },
    { kind: 'item', label: "Forcepoint's Commitment" },
  ];
  /* Backward-compat: keep the old flat list reachable for any downstream code that scans it */
  const tocItems = tocEntries.filter((e): e is { kind: 'item'; label: string } => e.kind === 'item').map(e => e.label);
  void tocItems;

  /* Renders one Web/DLP/Email usage-report card. Three terminal states:
       - run.state === 'ok'         → small data table (first 12 rows)
       - run.state === 'error'      → red error pill
       - undefined / idle / running → PENDING placeholder
     Closure so it captures `esc` from buildReportHTML scope. */
  const renderUsageReportCard = (
    r: { id: string; title: string; sqlKey: string; run?: ReportRunResult },
    i: number,
    theme: { accent: string; border: string; bg: string },
  ): string => {
    const num = String(i + 1).padStart(2, '0');
    const titleBar = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:26px;height:26px;border-radius:5px;background:${theme.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;font-family:'JetBrains Mono',monospace;">${num}</div>
        <div style="font-weight:700;color:#0f2952;font-size:12.5px;">${esc(r.title)}</div>
      </div>`;

    const run = r.run;

    // Success — render a compact preview table.
    if (run && run.state === 'ok' && Array.isArray(run.rows) && run.rows.length > 0) {
      const columns = Object.keys(run.rows[0] as Record<string, unknown>);
      const preview = run.rows.slice(0, 12);
      const remainder = (run.rowCount ?? run.rows.length) - preview.length;
      const fmtCell = (v: unknown): string => {
        if (v === null || v === undefined) return '<span style="color:#94a3b8;">—</span>';
        if (v instanceof Date) return esc(v.toISOString().replace('T', ' ').slice(0, 19));
        if (typeof v === 'number') return esc(String(v));
        if (typeof v === 'string') {
          // ISO timestamp prettifier
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return esc(v.replace('T', ' ').slice(0, 19));
          return esc(v.length > 80 ? v.slice(0, 77) + '…' : v);
        }
        try { return esc(JSON.stringify(v)); } catch { return '—'; }
      };
      const meta = `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px 0;font-size:10px;">
          <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:4px;padding:2px 7px;font-weight:700;letter-spacing:0.3px;">OK</span>
          <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">${run.rowCount ?? run.rows.length} row${(run.rowCount ?? run.rows.length) === 1 ? '' : 's'}</span>
          ${run.windowDays ? `<span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">window: ${run.windowDays}d</span>` : ''}
          ${run.latencyMs !== undefined ? `<span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">${run.latencyMs} ms</span>` : ''}
          ${run.ranAt ? `<span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">ran: ${esc(run.ranAt.replace('T', ' ').slice(0, 19))}</span>` : ''}
        </div>`;
      const head = columns.map(c => `<th style="text-align:left;padding:6px 9px;background:#0f2952;color:#fff;font-weight:700;font-size:9.5px;letter-spacing:0.4px;border-left:1px solid rgba(255,255,255,0.12);">${esc(c)}</th>`).join('');
      const body = preview.map((row, rowIdx) => {
        const stripe = rowIdx % 2 === 0 ? '#ffffff' : '#fafbfd';
        return `<tr>${columns.map(c => `<td style="padding:6px 9px;border-top:1px solid #e2e8f0;background:${stripe};font-size:10px;color:#1e293b;font-family:'JetBrains Mono',monospace;">${fmtCell((row as Record<string, unknown>)[c])}</td>`).join('')}</tr>`;
      }).join('');
      const tail = remainder > 0
        ? `<div style="margin-top:6px;font-size:9.5px;color:#64748b;font-style:italic;">+ ${remainder} more row${remainder === 1 ? '' : 's'} not shown — full result available via Step 3 preview.</div>`
        : '';
      return `
      <div style="background:${theme.bg};border:1px solid ${theme.border};border-left:4px solid ${theme.accent};border-radius:6px;padding:12px 14px;">
        ${titleBar}
        ${meta}
        <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:5px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${tail}
      </div>`;
    }

    // Successful run that returned zero rows.
    if (run && run.state === 'ok') {
      return `
      <div style="background:${theme.bg};border:1px solid ${theme.border};border-left:4px solid ${theme.accent};border-radius:6px;padding:12px 14px;">
        ${titleBar}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:10px;">
          <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:4px;padding:2px 7px;font-weight:700;">OK</span>
          <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">0 rows</span>
          ${run.windowDays ? `<span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">window: ${run.windowDays}d</span>` : ''}
        </div>
        <div style="font-size:10.5px;color:#475569;font-style:italic;">Query executed successfully but returned no rows for the selected window — no qualifying activity in the customer's dataset.</div>
      </div>`;
    }

    // Errored run.
    if (run && run.state === 'error') {
      return `
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-left:4px solid #e11d48;border-radius:6px;padding:12px 14px;">
        ${titleBar}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:10px;">
          <span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:4px;padding:2px 7px;font-weight:700;letter-spacing:0.3px;">ERROR</span>
          ${run.windowDays ? `<span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">window: ${run.windowDays}d</span>` : ''}
        </div>
        <div style="font-size:10.5px;color:#7f1d1d;font-family:'JetBrains Mono',monospace;white-space:pre-wrap;">${esc(run.error || 'Unknown error')}</div>
      </div>`;
    }

    // Not run yet (idle / running / undefined).
    const pendingLabel = run?.state === 'running' ? 'RUNNING' : 'PENDING';
    const pendingHint = run?.state === 'running'
      ? 'Query is currently executing against the customer SQL connection — re-export once it completes.'
      : 'Selected by the analyst but the SQL query has not been executed. Open Step 3 → Data Collectors → press Run on this report to populate it.';
    return `
    <div style="background:${theme.bg};border:1px solid ${theme.border};border-left:4px solid ${theme.accent};border-radius:6px;padding:12px 14px;">
      ${titleBar}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:10px;">
        <span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:4px;padding:2px 7px;font-weight:700;letter-spacing:0.3px;">${pendingLabel}</span>
        <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;font-family:'JetBrains Mono',monospace;">sqlKey: ${esc(r.sqlKey)}</span>
      </div>
      <div style="font-size:10.5px;color:#475569;font-style:italic;">${pendingHint}</div>
    </div>`;
  };

  /* Post-render variant stripper. Each variant block is bracketed by
     paired HTML comments:
       <!--VARIANT:EXEC_ONLY:START--> … <!--VARIANT:EXEC_ONLY:END-->
       <!--VARIANT:TECH_ONLY:START--> … <!--VARIANT:TECH_ONLY:END-->
     The opposite variant strips the irrelevant blocks here at the
     boundary, rather than via inline ${'$'}{cond ? ... : ''} wrappers
     which the existing template literal can't host because it contains
     nested template literals throughout. */
  const stripVariantBlocks = (html: string): string => {
    const dropOpposite = isExec ? 'TECH_ONLY' : 'EXEC_ONLY';
    const dropRe = new RegExp(
      `<!--VARIANT:${dropOpposite}:START-->[\\s\\S]*?<!--VARIANT:${dropOpposite}:END-->`,
      'g',
    );
    const markerRe = /<!--VARIANT:(EXEC_ONLY|TECH_ONLY):(START|END)-->/g;
    return html.replace(dropRe, '').replace(markerRe, '');
  };

  /* Posture Telemetry section, hoisted to a const so it can be
     referenced from both Part II variants:
       • Executive Risk Briefing  → inside an EXEC_ONLY block,
         standalone as the only Part II content.
       • Health Check (technical) → inside the TECH_ONLY Part III
         block, alongside the other roadmap/posture material.
     One template, two placement points — keeps the section's
     content + styling in lockstep across variants. */
  const postureSection: string = (p.dlpPostureSummary && Object.values(p.dlpPostureSections).some(Boolean)) ? (() => {
    const ps = p.dlpPostureSummary!;
    const sec = p.dlpPostureSections;
    const total = Math.max(1, ps.totalIncidents);
    const sevHigh = ps.bySeverity.HIGH, sevMed = ps.bySeverity.MEDIUM, sevLow = ps.bySeverity.LOW;
    const sevHighPct = Math.round((sevHigh / total) * 1000) / 10;
    const sevMedPct  = Math.round((sevMed  / total) * 1000) / 10;
    const sevLowPct  = Math.round((sevLow  / total) * 1000) / 10;
  
    /* Severity donut (mirrors the DLP Activity Snapshot styling) */
    const sevSegs: { color: string; from: number; to: number }[] = [];
    let ang = 0;
    if (sevHigh > 0) { const slice = (sevHigh / total) * 360; sevSegs.push({ color: 'var(--fp-violette)', from: ang, to: ang + slice }); ang += slice; }
    if (sevMed  > 0) { const slice = (sevMed  / total) * 360; sevSegs.push({ color: 'var(--fp-yellow)',   from: ang, to: ang + slice }); ang += slice; }
    if (sevLow  > 0) { const slice = (sevLow  / total) * 360; sevSegs.push({ color: 'var(--fp-green)',    from: ang, to: ang + slice }); ang += slice; }
    const sevDonut = sevSegs.length === 0
      ? `conic-gradient(#E2E8F0 0deg 360deg)`
      : `conic-gradient(${sevSegs.map(s => `${s.color} ${s.from}deg ${s.to}deg`).join(', ')})`;
  
    /* Action color helper — reuses the palette tuned for the PDF snapshot. */
    const actionColor = (act: string) => /BLOCKED/i.test(act) ? 'var(--fp-violette)'
      : /QUARANTIN/i.test(act) ? 'var(--fp-red)'
      : /RELEASED/i.test(act) ? 'var(--fp-yellow)'
      : /ENCRYPTED/i.test(act) ? 'var(--fp-cyan)'
      : /AUDITED|PERMITTED/i.test(act) ? 'var(--fp-green)'
      : /UNSHARE/i.test(act) ? 'var(--fp-navy)'
      : 'var(--fp-ink-muted)';
    const channelColor = (ch: string) => /ENDPOINT/i.test(ch) ? 'var(--fp-cyan)'
      : /EMAIL/i.test(ch) ? 'var(--fp-navy)'
      : /CASB/i.test(ch) ? 'var(--fp-violette)'
      : /HTTPS|HTTP/i.test(ch) ? 'var(--fp-green)'
      : 'var(--fp-ink-muted)';
  
    /* Render a horizontal bar list from a label→count map, top N. */
    const renderBars = (map: Record<string, number>, n: number, color: (k: string) => string) => {
      const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
      const max = Math.max(1, ...entries.map(([, v]) => v));
      if (entries.length === 0) {
        return `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No data in window.</div>`;
      }
      return entries.map(([label, count]) => {
        const w = Math.max(1, Math.round((count / max) * 100));
        const pctLbl = Math.round((count / total) * 1000) / 10;
        return `<div style="display:grid;grid-template-columns:170px 1fr 70px 50px;gap:10px;align-items:center;font-size:11px;margin-bottom:6px;">
          <div style="font-weight:600;color:var(--fp-ink);font-size:10.5px;word-break:break-word;">${esc(label.replace(/_/g, ' '))}</div>
          <div style="height:13px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;"><div style="width:${w}%;height:100%;background:${color(label)};border-radius:3px;"></div></div>
          <div class="mono" style="text-align:right;font-weight:700;color:var(--fp-ink);">${count.toLocaleString()}</div>
          <div class="mono" style="text-align:right;color:var(--fp-ink-faint);font-size:10.5px;">${pctLbl}%</div>
        </div>`;
      }).join('');
    };
  
    const deployCfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
      COMPLETED:           { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Completed' },
      IN_PROGRESS:         { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', label: 'In Progress' },
      PENDING_DEPLOYMENT:  { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', label: 'Pending Deployment' },
      FAILED:              { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Failed' },
      UNKNOWN:             { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', label: 'Unknown' },
    };
    const dCfg = deployCfg[ps.deploymentStatus] ?? deployCfg.UNKNOWN;
  
    const epTotal = ps.byEndpointType.LAPTOP + ps.byEndpointType.DESKTOP + ps.byEndpointType.NA;
    const epPct = (n: number) => epTotal > 0 ? Math.round((n / epTotal) * 1000) / 10 : 0;
  
    const fpRate  = total > 0 ? Math.round((ps.falsePositiveCount  / total) * 1000) / 10 : 0;
    const relRate = total > 0 ? Math.round((ps.releasedIncidentCount / total) * 1000) / 10 : 0;
    const ignRate = total > 0 ? Math.round((ps.ignoredCount        / total) * 1000) / 10 : 0;
  
    return `
  <div class="section">
    <div class="section-eyebrow">${isExec ? 'Section 4 · Part 2 · Posture Telemetry' : 'Section 13 · Part II · Posture Telemetry'}</div>
    <div class="section-title">Information Security Posture Dashboard</div>
    <p class="section-lead">
      Live posture snapshot pulled from the customer's Forcepoint DLP REST API over the last
      <strong>${ps.windowDays} days</strong>. CXO-grade categorical rollups plus the top-users
      offender leaderboard; AD domains, run-as identifiers, and host names remain redacted. Fetched
      <span class="mono" style="color:var(--fp-ink-muted);">${esc(new Date(ps.fetchedAt).toLocaleString())}</span>
      from <span class="mono" style="color:var(--fp-ink-muted);">${esc(ps.serverBaseUrl)}</span>.
      ${hasDLP ? `<br/><span style="color:var(--fp-ink-faint);font-size:11.5px;">The
        SQL-driven <em>Data Security Usage</em> section is intentionally omitted while REST API
        posture data is present — the API hits the same FSM source-of-truth and emits a richer
        cross-section, so DLP coverage runs through this single authoritative block to avoid
        duplicate numbers.</span>` : ''}
    </p>
  
    ${sec.overview ? `<!-- KPI strip: deploy status + headline counts -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-ink-faint);">DLP Version</div>
        <div class="mono" style="font-size:18px;font-weight:800;color:var(--fp-navy);margin-top:4px;">${esc(ps.dlpVersion || '—')}</div>
      </div>
      <div style="background:${dCfg.bg};border:1px solid ${dCfg.border};border-top:3px solid ${dCfg.color};border-radius:6px;padding:12px 14px;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-ink-faint);">Deployment Status</div>
        <div style="font-size:14px;font-weight:800;color:${dCfg.color};margin-top:4px;">${esc(dCfg.label)}</div>
      </div>
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-ink-faint);">Enabled Policies</div>
        <div class="mono" style="font-size:18px;font-weight:800;color:var(--fp-cyan-deep);margin-top:4px;">${ps.enabledDlpPolicies.toLocaleString()} <span style="font-size:10px;font-weight:600;color:var(--fp-ink-faint);">DLP</span> · ${ps.enabledDiscoveryPolicies.toLocaleString()} <span style="font-size:10px;font-weight:600;color:var(--fp-ink-faint);">Disc</span></div>
      </div>
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-violette);border-radius:6px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-ink-faint);">Incidents (${ps.windowDays}d)</div>
        <div class="mono" style="font-size:18px;font-weight:800;color:var(--fp-violette);margin-top:4px;">${ps.totalIncidents.toLocaleString()}</div>
      </div>
    </div>` : ''}
  
    ${(sec.severity || sec.action) ? `<!-- Severity donut + Action bars -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;page-break-inside:avoid;margin-bottom:14px;">
      ${sec.severity ? `<div style="flex:0 0 230px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Severity</div>
        <div style="width:150px;height:150px;border-radius:50%;background:${sevDonut};margin:0 auto;display:flex;align-items:center;justify-content:center;">
          <div style="width:96px;height:96px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="font-size:22px;font-weight:700;color:var(--fp-navy);line-height:1;letter-spacing:-0.02em;">${ps.totalIncidents.toLocaleString()}</div>
            <div style="font-size:8px;color:var(--fp-ink-faint);letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;font-weight:700;">Total</div>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:5px;font-size:10.5px;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-violette);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">High</span><span class="mono" style="font-weight:700;">${sevHigh.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevHighPct}%</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-yellow);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Medium</span><span class="mono" style="font-weight:700;">${sevMed.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevMedPct}%</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-green);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Low</span><span class="mono" style="font-weight:700;">${sevLow.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevLowPct}%</span></div>
        </div>
      </div>` : ''}
  
      ${sec.action ? `<div style="flex:1 1 280px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Action</div>
        ${renderBars(ps.byAction, 8, actionColor)}
      </div>` : ''}
    </div>` : ''}
  
    ${(sec.channel || sec.status) ? `<!-- Channel + Status side-by-side -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;page-break-inside:avoid;margin-bottom:14px;">
      ${sec.channel ? `<div style="flex:1 1 280px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan-deep);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top Channels</div>
        ${renderBars(ps.byChannel, 8, channelColor)}
      </div>` : ''}
      ${sec.status ? `<div style="flex:1 1 280px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Workflow Status</div>
        ${(() => {
          const entries = Object.entries(ps.byStatus).sort((a, b) => b[1] - a[1]);
          if (entries.length === 0) return `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No status telemetry in window.</div>`;
          return `<div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${entries.map(([s, c]) => {
              const norm = s.toUpperCase().replace(/\\s+/g, '_');
              const col = norm === 'NEW' ? 'var(--fp-cyan)'
                        : norm === 'IN_PROCESS' ? 'var(--fp-yellow)'
                        : norm === 'CLOSE' || norm === 'CLOSED' ? 'var(--fp-green)'
                        : norm === 'FALSE_POSITIVE' ? 'var(--fp-ink-faint)'
                        : norm === 'ESCALATED' ? 'var(--fp-violette)'
                        : 'var(--fp-navy)';
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:14px;background:${col}14;border:1px solid ${col}40;font-size:10.5px;color:${col};font-weight:700;">
                <span style="text-transform:uppercase;letter-spacing:0.04em;">${esc(s)}</span>
                <span class="mono" style="background:#fff;padding:1px 6px;border-radius:6px;color:var(--fp-ink);">${c.toLocaleString()}</span>
              </span>`;
            }).join('')}
          </div>`;
        })()}
      </div>` : ''}
    </div>` : ''}
  
    ${(sec.policies || sec.destinations) ? `<!-- Top policies + Top destinations -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;page-break-inside:avoid;margin-bottom:14px;">
      ${sec.policies ? `<div style="flex:1 1 280px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-red);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top Triggered Policies</div>
        ${ps.topPolicies.length === 0
          ? `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No policy hits in window.</div>`
          : `<table style="margin:0;box-shadow:none;border:1px solid var(--fp-rule);">
            <thead><tr><th style="padding:5px 8px;font-size:9px;">Policy</th><th style="padding:5px 8px;font-size:9px;width:70px;text-align:right;">Count</th></tr></thead>
            <tbody>${ps.topPolicies.map((r) => `<tr>
              <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;">${esc(r.label)}</td>
              <td class="mono" style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:700;text-align:right;">${r.count.toLocaleString()}</td>
            </tr>`).join('')}</tbody>
          </table>`}
      </div>` : ''}
      ${sec.destinations ? `<div style="flex:1 1 280px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan-deep);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top Destinations</div>
        ${ps.topDestinations.length === 0
          ? `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No destination data in window.</div>`
          : `<table style="margin:0;box-shadow:none;border:1px solid var(--fp-rule);">
            <thead><tr><th style="padding:5px 8px;font-size:9px;">Destination</th><th style="padding:5px 8px;font-size:9px;width:70px;text-align:right;">Count</th></tr></thead>
            <tbody>${ps.topDestinations.map((r) => `<tr>
              <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;word-break:break-all;">${esc(r.label)}</td>
              <td class="mono" style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:700;text-align:right;">${r.count.toLocaleString()}</td>
            </tr>`).join('')}</tbody>
          </table>`}
      </div>` : ''}
    </div>` : ''}
  
    ${sec.users ? (() => {
      const list = ps.topUsers ?? [];
      const maxCount = Math.max(1, ...list.map((u) => u.count));
      return `<!-- Top Users (Offenders) — CXO offender list -->
    <div style="margin-bottom:14px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-red);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);">Top Users — Offender Leaderboard</div>
          <div style="font-size:9.5px;color:var(--fp-ink-faint);">${list.length} of ${ps.totalIncidents.toLocaleString()} incident sources surfaced</div>
        </div>
        ${list.length === 0
          ? `<div style="font-size:11px;color:var(--fp-ink-faint);font-style:italic;">No user telemetry surfaced — incidents may have arrived without <code>source.login_name</code> populated.</div>`
          : `<table style="margin:0;box-shadow:none;border:1px solid var(--fp-rule);">
            <thead><tr>
              <th style="padding:6px 10px;font-size:9px;width:30px;text-align:center;">#</th>
              <th style="padding:6px 10px;font-size:9px;">User</th>
              <th style="padding:6px 10px;font-size:9px;">Distribution</th>
              <th style="padding:6px 10px;font-size:9px;width:90px;text-align:right;">Incidents</th>
              <th style="padding:6px 10px;font-size:9px;width:70px;text-align:right;">Share</th>
            </tr></thead>
            <tbody>${list.map((u, i) => {
              const w = Math.round((u.count / maxCount) * 100);
              const pctOfAll = ps.totalIncidents > 0 ? Math.round((u.count / ps.totalIncidents) * 1000) / 10 : 0;
              const rankColor = i === 0 ? 'var(--fp-violette)' : i < 3 ? 'var(--fp-red)' : 'var(--fp-ink-muted)';
              return `<tr>
                <td class="mono" style="padding:6px 10px;font-size:11px;text-align:center;font-weight:800;color:${rankColor};">${i + 1}</td>
                <td style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--fp-ink);">${esc(u.label)}</td>
                <td style="padding:6px 10px;"><div style="height:9px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${w}%;height:100%;background:${rankColor};"></div></div></td>
                <td class="mono" style="padding:6px 10px;font-size:11px;text-align:right;font-weight:700;color:var(--fp-ink);">${u.count.toLocaleString()}</td>
                <td class="mono" style="padding:6px 10px;font-size:10.5px;text-align:right;color:var(--fp-ink-faint);">${pctOfAll}%</td>
              </tr>`;
            }).join('')}</tbody>
          </table>`}
      </div>
    </div>`;
    })() : ''}
  
    ${(sec.genai_apps || sec.saas_apps || sec.webmail) ? (() => {
      /* CXO Exfil-Vector exposure strip — three side-by-side cards each
         showing a pattern-classified destination bucket. Headline number
         per bucket is the incident count; the table below lists the top
         hits within that bucket. */
      const renderBucket = (
        title, accent, hits, list, emptyMsg,
      ) => {
        const maxC = Math.max(1, ...list.map((r) => r.count));
        const pct = ps.totalIncidents > 0 ? Math.round((hits / ps.totalIncidents) * 1000) / 10 : 0;
        return `<div style="flex:1 1 300px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid ${accent};border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);">${title}</div>
            <div style="font-size:9.5px;color:var(--fp-ink-faint);">${pct}% of incidents</div>
          </div>
          <div class="mono" style="font-size:22px;font-weight:800;color:${accent};line-height:1.1;margin-bottom:10px;">${hits.toLocaleString()} <span style="font-size:10px;font-weight:600;color:var(--fp-ink-faint);">incidents</span></div>
          ${list.length === 0
            ? `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">${esc(emptyMsg)}</div>`
            : `<table style="margin:0;box-shadow:none;border:1px solid var(--fp-rule);">
              <thead><tr><th style="padding:5px 8px;font-size:9px;">Destination</th><th style="padding:5px 8px;font-size:9px;width:60px;text-align:right;">Hits</th></tr></thead>
              <tbody>${list.map((r) => {
                const w = Math.round((r.count / maxC) * 100);
                return `<tr>
                  <td style="padding:4px 8px;font-size:10px;color:var(--fp-ink);font-weight:500;word-break:break-all;">
                    <div>${esc(r.label)}</div>
                    <div style="height:5px;background:var(--fp-rule-soft);border-radius:2px;margin-top:3px;overflow:hidden;"><div style="width:${w}%;height:100%;background:${accent};"></div></div>
                  </td>
                  <td class="mono" style="padding:4px 8px;font-size:10px;font-weight:700;color:var(--fp-ink);text-align:right;">${r.count.toLocaleString()}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>`}
        </div>`;
      };
      return `<!-- Exfil-vector exposure: GenAI / SaaS / Webmail -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;page-break-inside:avoid;margin-bottom:14px;">
      ${sec.genai_apps ? renderBucket('GenAI Applications',     'var(--fp-violette)',  ps.genAiIncidentCount ?? 0,   ps.topGenAiApps ?? [],   'No incidents matched the GenAI pattern catalogue in this window.') : ''}
      ${sec.saas_apps  ? renderBucket('SaaS & Cloud Storage',   'var(--fp-cyan-deep)', ps.saasIncidentCount ?? 0,    ps.topSaasApps ?? [],    'No incidents matched the SaaS / cloud-storage catalogue in this window.') : ''}
      ${sec.webmail    ? renderBucket('Personal Webmail',       'var(--fp-yellow)',    ps.webmailIncidentCount ?? 0, ps.topWebmail ?? [],     'No incidents matched the webmail catalogue in this window.') : ''}
    </div>`;
    })() : ''}
  
    ${sec.data_exposure ? (() => {
      /* CXO headline block — total bytes that crossed a policy boundary
         in the window, with a severity-coloured stacked bar. */
      const fb = ps.forensicBytesBySeverity ?? { HIGH: 0, MEDIUM: 0, LOW: 0 };
      const totalBytes = Math.max(0, ps.totalForensicBytes ?? 0);
      const pctH = totalBytes > 0 ? (fb.HIGH   / totalBytes) * 100 : 0;
      const pctM = totalBytes > 0 ? (fb.MEDIUM / totalBytes) * 100 : 0;
      const pctL = totalBytes > 0 ? (fb.LOW    / totalBytes) * 100 : 0;
      return `<!-- Forensic Data Exposure -->
    <div style="margin-bottom:14px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-red);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);">Forensic Data Exposure (${ps.windowDays}d)</div>
          <div style="font-size:9.5px;color:var(--fp-ink-faint);">Sum of <code>transaction_size</code> across all incidents</div>
        </div>
        <div class="mono" style="font-size:32px;font-weight:800;color:var(--fp-red);letter-spacing:-0.02em;line-height:1.1;">
          ${esc(formatBytes(totalBytes))}
          <span style="font-size:11px;color:var(--fp-ink-faint);font-weight:600;letter-spacing:0;margin-left:8px;">crossed a policy boundary</span>
        </div>
        ${totalBytes > 0 ? `
        <div style="margin-top:14px;">
          <div style="height:18px;border-radius:3px;overflow:hidden;display:flex;background:var(--fp-rule-soft);">
            ${pctH > 0 ? `<div style="width:${pctH}%;background:var(--fp-violette);" title="HIGH"></div>` : ''}
            ${pctM > 0 ? `<div style="width:${pctM}%;background:var(--fp-yellow);"  title="MEDIUM"></div>` : ''}
            ${pctL > 0 ? `<div style="width:${pctL}%;background:var(--fp-green);"   title="LOW"></div>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--fp-ink-muted);">
            <span><span style="display:inline-block;width:8px;height:8px;background:var(--fp-violette);border-radius:2px;margin-right:5px;"></span>High&nbsp;<strong style="color:var(--fp-ink);">${esc(formatBytes(fb.HIGH))}</strong></span>
            <span><span style="display:inline-block;width:8px;height:8px;background:var(--fp-yellow);border-radius:2px;margin-right:5px;"></span>Medium&nbsp;<strong style="color:var(--fp-ink);">${esc(formatBytes(fb.MEDIUM))}</strong></span>
            <span><span style="display:inline-block;width:8px;height:8px;background:var(--fp-green);border-radius:2px;margin-right:5px;"></span>Low&nbsp;<strong style="color:var(--fp-ink);">${esc(formatBytes(fb.LOW))}</strong></span>
          </div>
        </div>` : `<div style="margin-top:10px;font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No <code>transaction_size</code> data available — the FSM list endpoint omits this on lighter incidents. Fetch by-ID for richer forensics.</div>`}
      </div>
    </div>`;
    })() : ''}
  
    ${(sec.endpoint_type || sec.detection_sources || sec.workflow_rates || sec.risk_sla) ? `<!-- Endpoint type + Detection sources + Workflow rates + Risk/SLA -->
    <div style="display:flex;flex-wrap:wrap;gap:14px;page-break-inside:avoid;">
      ${sec.endpoint_type ? `<div style="flex:1 1 220px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Endpoint Type</div>
        <div style="display:flex;flex-direction:column;gap:7px;font-size:10.5px;">
          <div style="display:grid;grid-template-columns:80px 1fr 60px 45px;gap:8px;align-items:center;">
            <span style="font-weight:600;color:var(--fp-ink);">Laptop</span>
            <div style="height:10px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${epPct(ps.byEndpointType.LAPTOP)}%;height:100%;background:var(--fp-cyan);"></div></div>
            <span class="mono" style="text-align:right;font-weight:700;">${ps.byEndpointType.LAPTOP.toLocaleString()}</span>
            <span class="mono" style="text-align:right;color:var(--fp-ink-faint);">${epPct(ps.byEndpointType.LAPTOP)}%</span>
          </div>
          <div style="display:grid;grid-template-columns:80px 1fr 60px 45px;gap:8px;align-items:center;">
            <span style="font-weight:600;color:var(--fp-ink);">Desktop</span>
            <div style="height:10px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${epPct(ps.byEndpointType.DESKTOP)}%;height:100%;background:var(--fp-navy);"></div></div>
            <span class="mono" style="text-align:right;font-weight:700;">${ps.byEndpointType.DESKTOP.toLocaleString()}</span>
            <span class="mono" style="text-align:right;color:var(--fp-ink-faint);">${epPct(ps.byEndpointType.DESKTOP)}%</span>
          </div>
          <div style="display:grid;grid-template-columns:80px 1fr 60px 45px;gap:8px;align-items:center;">
            <span style="font-weight:600;color:var(--fp-ink);">Network</span>
            <div style="height:10px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${epPct(ps.byEndpointType.NA)}%;height:100%;background:var(--fp-ink-faint);"></div></div>
            <span class="mono" style="text-align:right;font-weight:700;">${ps.byEndpointType.NA.toLocaleString()}</span>
            <span class="mono" style="text-align:right;color:var(--fp-ink-faint);">${epPct(ps.byEndpointType.NA)}%</span>
          </div>
        </div>
      </div>` : ''}
  
      ${sec.detection_sources ? `<div style="flex:1 1 220px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-violette);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Detection Sources</div>
        ${Object.keys(ps.byDetectedBy).length === 0
          ? `<div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No detection telemetry.</div>`
          : renderBars(ps.byDetectedBy, 5, () => 'var(--fp-violette)')}
      </div>` : ''}
  
      ${sec.workflow_rates ? `<div style="flex:1 1 220px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-yellow);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Workflow Rates</div>
        <div style="display:flex;flex-direction:column;gap:9px;font-size:10.5px;">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:600;color:var(--fp-ink);">False Positive</span><span class="mono" style="font-weight:700;">${ps.falsePositiveCount.toLocaleString()} <span style="color:var(--fp-ink-faint);">(${fpRate}%)</span></span></div>
            <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${fpRate}%;height:100%;background:var(--fp-ink-faint);"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:600;color:var(--fp-ink);">Released</span><span class="mono" style="font-weight:700;">${ps.releasedIncidentCount.toLocaleString()} <span style="color:var(--fp-ink-faint);">(${relRate}%)</span></span></div>
            <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${relRate}%;height:100%;background:var(--fp-yellow);"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:600;color:var(--fp-ink);">Ignored</span><span class="mono" style="font-weight:700;">${ps.ignoredCount.toLocaleString()} <span style="color:var(--fp-ink-faint);">(${ignRate}%)</span></span></div>
            <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${ignRate}%;height:100%;background:var(--fp-cyan);"></div></div>
          </div>
        </div>
      </div>` : ''}
  
      ${sec.risk_sla ? (() => {
        const riskCount = ps.riskLevelPositiveCount ?? 0;
        const slaCount  = ps.slaBreachCount ?? 0;
        const riskPct = total > 0 ? Math.round((riskCount / total) * 1000) / 10 : 0;
        const slaPct  = total > 0 ? Math.round((slaCount  / total) * 1000) / 10 : 0;
        return `<div style="flex:1 1 220px;background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-red);border-radius:6px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Risk Adaptive &amp; SLA</div>
          <div style="display:flex;flex-direction:column;gap:9px;font-size:10.5px;">
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:600;color:var(--fp-ink);">Risk-Adaptive Coverage</span><span class="mono" style="font-weight:700;">${riskCount.toLocaleString()} <span style="color:var(--fp-ink-faint);">(${riskPct}%)</span></span></div>
              <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${riskPct}%;height:100%;background:var(--fp-violette);"></div></div>
              <div style="font-size:9.5px;color:var(--fp-ink-faint);margin-top:3px;line-height:1.4;">Incidents carrying a positive <code>risk_level</code> — Risk-Adaptive Protection touched these.</div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:600;color:var(--fp-ink);">SLA Breach (&gt;24h)</span><span class="mono" style="font-weight:700;">${slaCount.toLocaleString()} <span style="color:var(--fp-ink-faint);">(${slaPct}%)</span></span></div>
              <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${slaPct}%;height:100%;background:var(--fp-red);"></div></div>
              <div style="font-size:9.5px;color:var(--fp-ink-faint);margin-top:3px;line-height:1.4;">NEW or IN_PROCESS incidents older than 24h — analyst workflow backlog.</div>
            </div>
          </div>
        </div>`;
      })() : ''}
    </div>` : ''}
  </div>`;
  })() : '';

  /* Security Posture supplemental subsections — only rendered into the
     Executive Risk Briefing variant under PART 2 · Security Posture, sitting
     directly under the Posture Telemetry dashboard. The tech-variant copies
     of these subsections live in their original Sections (Section 03 Board
     Briefing, Section 07 Endpoint Agents); this hoisted const produces a
     parallel CxO-facing rollup so the executive report doesn't need to bounce
     across PARTs to see headline observations + the recommended actions. */
  const securityPostureExtras: string = isExec ? (() => {
    const today = Date.now();
    const day = 24 * 60 * 60 * 1000;

    /* Re-derive the metrics the Quick-Look cards need. infraCritCount /
       infraHighCount / eosEntries / warnEntries / openActions /
       supportUpgradeNeeded are already at function scope (see top of
       buildReportHTML), so we just compute the few licence/hardware
       counters that previously lived inside the Section 03 IIFE. */
    const licenseExpiringSoon = (p.sessionData.licenses ?? []).filter((l) => {
      if (!l.expiry || l.expiry === '—') return false;
      const d = new Date(l.expiry).getTime();
      return !Number.isNaN(d) && d > today && d - today < 180 * day;
    }).length;
    const licenseExpired = (p.sessionData.licenses ?? []).filter((l) => {
      if (!l.expiry || l.expiry === '—') return false;
      const d = new Date(l.expiry).getTime();
      return !Number.isNaN(d) && d <= today;
    }).length;
    const hardwareIssues = (p.sessionData.hardware ?? []).filter((h) => {
      const ws = (h.warrantyStatus || '').toLowerCase();
      return ws && ws !== 'active';
    }).length;
    const criticalUpgrades = p.versionUpgrades.filter((v) => v.priority === 'critical').length;

    type CheckItem = {
      icon: string; question: string; count: number;
      severity: 'critical' | 'warn' | 'ok' | 'neutral'; evidence: string;
      verdictOverride?: string;
    };
    const items: CheckItem[] = [
      {
        icon: '🖥', question: 'Server resource issues?',
        count: infraCritCount + infraHighCount,
        severity: infraCritCount > 0 ? 'critical' : infraHighCount > 0 ? 'warn' : 'ok',
        evidence: infraCritCount + infraHighCount === 0
          ? 'All monitored servers below 70% CPU / RAM / disk thresholds.'
          : `${infraCritCount} metric${infraCritCount === 1 ? '' : 's'} ≥ 85% · ${infraHighCount} between 70–85%.`,
      },
      {
        icon: '📦', question: 'End-of-Support products in production?',
        count: eosEntries.length,
        severity: eosEntries.length > 0 ? 'critical' : 'ok',
        evidence: eosEntries.length === 0
          ? 'All components on supported, vendor-maintained releases.'
          : `${eosEntries.length} component${eosEntries.length === 1 ? '' : 's'} past EoS — no patches, no vendor accountability.`,
      },
      {
        icon: '⬆', question: 'Critical upgrades required?',
        count: criticalUpgrades,
        severity: criticalUpgrades > 0 ? 'critical' : warnEntries.length > 0 ? 'warn' : 'ok',
        evidence: criticalUpgrades > 0
          ? `${criticalUpgrades} upgrade${criticalUpgrades === 1 ? '' : 's'} flagged CRITICAL by analyst.`
          : warnEntries.length > 0
            ? `${warnEntries.length} component${warnEntries.length === 1 ? '' : 's'} have updates available — none flagged critical.`
            : 'Estate is on current GA releases.',
      },
      {
        icon: '⏳', question: 'License expiry approaching?',
        count: licenseExpiringSoon + licenseExpired,
        severity: licenseExpired > 0 ? 'critical' : licenseExpiringSoon > 0 ? 'warn' : 'ok',
        evidence: licenseExpired > 0
          ? `${licenseExpired} license${licenseExpired === 1 ? '' : 's'} already expired · ${licenseExpiringSoon} expiring within 6 months.`
          : licenseExpiringSoon > 0
            ? `${licenseExpiringSoon} license${licenseExpiringSoon === 1 ? '' : 's'} expiring within 6 months — renewal cycle ahead.`
            : 'All licenses active beyond the 6-month renewal horizon.',
      },
      {
        icon: '🛠', question: 'Hardware warranty expired or expiring?',
        count: hardwareIssues,
        severity: hardwareIssues > 0 ? 'warn' : 'ok',
        evidence: hardwareIssues > 0
          ? `${hardwareIssues} appliance${hardwareIssues === 1 ? '' : 's'} with warranty status other than ACTIVE — extension or refresh required.`
          : 'All Forcepoint appliances under active warranty.',
      },
      {
        icon: '📜', question: 'License extension / gap recommendation?',
        count: p.licenseGaps?.length ?? 0,
        severity: (p.licenseGaps?.length ?? 0) > 0 ? 'warn' : 'ok',
        evidence: (p.licenseGaps?.length ?? 0) > 0
          ? `${p.licenseGaps!.length} license-gap item${p.licenseGaps!.length === 1 ? '' : 's'} identified — see Recommended License Extension.`
          : 'No gap between current entitlement and observed deployment scope.',
      },
    ];
    if ((p.selectedProducts.data || p.selectedProducts.web) && p.endpointCompatAssessment) {
      const cs = p.endpointCompatAssessment.compatibilityStatus;
      const coverageNarrative =
        p.selectedProducts.data && p.selectedProducts.web ? 'DLP and Hybrid Web coverage'
        : p.selectedProducts.data ? 'DLP coverage'
        : 'Hybrid Web coverage';
      items.push({
        icon: '💻', question: 'F1E agent fleet healthy?',
        count: cs === 'SUPPORTED' ? 0 : 1,
        severity: cs === 'SUPPORTED' ? 'ok' : cs === 'AT_RISK' ? 'warn' : 'critical',
        evidence: cs === 'SUPPORTED'
          ? `Fleet aligned with supported baseline (v${p.endpointCompatAssessment.minimumRequiredAgent}+).`
          : cs === 'AT_RISK'
            ? `Some endpoints below v${p.endpointCompatAssessment.minimumRequiredAgent} — see Agent Compatibility.`
            : `Compatibility gap detected — ${coverageNarrative} at risk on browser channel.`,
        verdictOverride: cs === 'SUPPORTED' ? 'HEALTHY' : cs === 'AT_RISK' ? 'AT RISK' : 'CRITICAL',
      });
    }
    const tone = (sev: 'critical' | 'warn' | 'ok' | 'neutral') => sev === 'critical'
      ? { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', pillBg: '#A30080', pillTxt: '#fff', verdict: 'YES' }
      : sev === 'warn'
        ? { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', pillBg: '#FBBF24', pillTxt: '#7C2D12', verdict: 'WATCH' }
        : sev === 'ok'
          ? { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', pillBg: '#16A34A', pillTxt: '#fff', verdict: 'NO' }
          : { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', pillBg: '#CBD5E1', pillTxt: '#334155', verdict: 'NO' };

    const keyObservations = `
  <div class="subsection-title" style="margin-top:26px;">Key Observations · Executive Quick-Look</div>
  <p style="font-size:10.5px;color:var(--fp-ink-faint);margin:-4px 0 10px;font-style:italic;line-height:1.55;">
    Six yes/no questions answered in one glance — the headline picture across resource health, lifecycle, licensing, and agent fleet.
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;page-break-inside:avoid;">
    ${items.map((it) => {
      const t = tone(it.severity);
      const pillText = it.verdictOverride ?? `${t.verdict}${it.count > 0 ? ` · ${it.count}` : ''}`;
      return `<div style="background:${t.bg};border:1px solid ${t.border};border-left:3px solid ${t.color};border-radius:6px;padding:10px 13px;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;">${it.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
            <span style="font-size:11.5px;font-weight:700;color:var(--fp-ink);line-height:1.3;flex:1;">${esc(it.question)}</span>
            <span style="font-size:9px;font-weight:800;letter-spacing:0.08em;color:${t.pillTxt};background:${t.pillBg};border-radius:3px;padding:2px 7px;flex-shrink:0;white-space:nowrap;">${esc(pillText)}</span>
          </div>
          <div style="font-size:10.5px;color:#475569;line-height:1.55;">${esc(it.evidence)}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

    /* High-Level Recommendations — same featured/curated logic as the
       tech variant's Section 03 block, just rendered in the exec stream. */
    const highLevelRecs = (() => {
      if (p.recommendations.length === 0) return '';
      const featured = p.recommendations.filter((r) => r.featured);
      const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const list = (featured.length > 0
        ? [...featured]
        : [...p.recommendations]
      ).sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)).slice(0, 6);
      const curatedNote = featured.length > 0
        ? '<span style="font-size:10px;color:var(--fp-cyan-deep);font-weight:600;margin-left:8px;letter-spacing:0.04em;">★ ANALYST-CURATED</span>'
        : '';
      return `
  <div class="subsection-title" style="margin-top:26px;">High-Level Recommendations${curatedNote}</div>
  <div class="rec-card-grid">
    ${list.map(r => `
      <div class="rec-mini-card rec-mini-card-${r.priority}">
        <div class="rec-mini-head">
          <span class="badge badge-${r.priority === 'critical' ? 'critical' : r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'medium' : 'low'}">${esc(r.priority.toUpperCase())}</span>
          <span class="rec-mini-title">${esc(r.title)}</span>
        </div>
        ${r.detail ? `<div class="rec-mini-detail">${esc(r.detail)}</div>` : ''}
        <div class="rec-mini-foot">
          ${r.product ? `<span style="color:var(--fp-navy);font-weight:700;">${esc(r.product)}</span>` : ''}
          ${r.effort ? `<span>· effort ${esc(r.effort)}</span>` : ''}
          <span style="margin-left:auto;color:var(--fp-cyan-deep);font-weight:700;">${esc(r.category.replace(/_/g, ' '))}</span>
        </div>
      </div>`).join('')}
  </div>
  <p style="font-size:10px;color:var(--fp-ink-faint);font-style:italic;margin:-2px 0 14px;">
    Full detail with descriptions, target versions, and release notes is in <em>Part III · Roadmap &amp; Strategy</em>.
  </p>`;
    })();

    /* Top Priority Actions — top 3 by priority, or all featured if any. */
    const topPriorityActions = (() => {
      if (p.actionItems.length === 0) return '';
      const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const featured = p.actionItems.filter((a) => a.featured);
      const top = featured.length > 0
        ? [...featured].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9))
        : [...p.actionItems].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)).slice(0, 3);
      const remaining = p.actionItems.length - top.length;
      const curatedNote = featured.length > 0
        ? '<span style="font-size:10px;color:var(--fp-cyan-deep);font-weight:600;margin-left:8px;letter-spacing:0.04em;">★ ANALYST-CURATED</span>'
        : '';
      return `
  <div class="subsection-title" style="margin-top:26px;">Top Priority Actions${curatedNote}</div>
  <ul style="list-style:none;padding:0;margin:0 0 10px;">
    ${top.map((a, i) => `<li style="display:flex;gap:12px;align-items:flex-start;padding:9px 12px;background:var(--fp-surface-alt);border:1px solid var(--fp-rule);border-radius:8px;margin-bottom:6px;">
      <span style="font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-weight:700;color:var(--fp-cyan-deep);font-size:13px;min-width:18px;">${i + 1}</span>
      <span style="flex:1;font-size:12px;color:var(--fp-ink);font-weight:500;line-height:1.5;">${esc(a.task)}</span>
      <span class="badge" style="${sevStyle(a.priority.toUpperCase())};flex-shrink:0;">${esc(a.priority.toUpperCase())}</span>
      ${a.dueDate ? `<span style="font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-size:10.5px;color:var(--fp-ink-muted);flex-shrink:0;">${esc(a.dueDate)}</span>` : ''}
    </li>`).join('')}
  </ul>
  <p style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;margin-bottom:0;">
    ${remaining > 0 ? `+${remaining} additional action${remaining === 1 ? '' : 's'} · ` : ''}Full execution plan with owners, target dates, and status is in <em>Part III · Roadmap &amp; Strategy</em>.
  </p>`;
    })();

    /* DLP Activity Snapshot — donut + Incidents by Severity + Actions, the
       same opening block as Section 03's tech-variant snapshot but trimmed
       to the headline two cards so the executive page count stays tight. */
    const dlpActivitySnapshot = (p.dlpDashboardSummary && p.dlpDashboardSummary.totalIncidents > 0) ? (() => {
      const d = p.dlpDashboardSummary!;
      const total = d.totalIncidents || 1;
      const sev = d.severity;
      const sevHighPct = Math.round((sev.high   / total) * 1000) / 10;
      const sevMedPct  = Math.round((sev.medium / total) * 1000) / 10;
      const sevLowPct  = Math.round((sev.low    / total) * 1000) / 10;
      const segs: { color: string; from: number; to: number }[] = [];
      let ang = 0;
      if (sev.high   > 0) { const slice = (sev.high   / total) * 360; segs.push({ color: 'var(--fp-violette)', from: ang, to: ang + slice }); ang += slice; }
      if (sev.medium > 0) { const slice = (sev.medium / total) * 360; segs.push({ color: 'var(--fp-yellow)',   from: ang, to: ang + slice }); ang += slice; }
      if (sev.low    > 0) { const slice = (sev.low    / total) * 360; segs.push({ color: 'var(--fp-green)',    from: ang, to: ang + slice }); ang += slice; }
      const donutGrad = segs.length === 0
        ? `conic-gradient(#E2E8F0 0deg 360deg)`
        : `conic-gradient(${segs.map(s => `${s.color} ${s.from}deg ${s.to}deg`).join(', ')})`;
      const actionColor = (act: string) => /blocked/i.test(act) ? 'var(--fp-violette)'
        : /quarantin/i.test(act) ? 'var(--fp-red)'
        : /released/i.test(act) ? 'var(--fp-yellow)'
        : /encrypted/i.test(act) ? 'var(--fp-cyan)'
        : /permitted/i.test(act) ? 'var(--fp-green)'
        : 'var(--fp-ink-muted)';
      const maxAction = Math.max(...d.actions.map(a => a.count), 1);
      return `
  <div class="subsection-title" style="margin-top:26px;">DLP Activity Snapshot · ${esc(d.dateRange)}</div>
  <div style="font-size:11px;color:var(--fp-ink-muted);margin:-4px 0 12px;line-height:1.55;">
    Source: <span class="mono" style="color:var(--fp-navy);">${esc(d.fileName)}</span>
    · Report generated ${esc(d.reportCreatedAt)}
    · Filter: ${esc(d.ignoredFilter)}
    · Individual user identifiers from the DLP Manager export have been aggregated to department level.
  </div>
  <div style="display:grid;grid-template-columns:230px 1fr;gap:16px;page-break-inside:avoid;">
    <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Severity</div>
      <div style="width:150px;height:150px;border-radius:50%;background:${donutGrad};margin:0 auto;display:flex;align-items:center;justify-content:center;">
        <div style="width:96px;height:96px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="font-size:22px;font-weight:700;color:var(--fp-navy);font-family:'Inter',sans-serif;line-height:1;letter-spacing:-0.02em;">${total.toLocaleString()}</div>
          <div style="font-size:8px;color:var(--fp-ink-faint);letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;font-weight:700;">Total</div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:5px;font-size:10.5px;">
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-violette);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">High</span><span class="mono" style="font-weight:700;">${sev.high.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevHighPct}%</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-yellow);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Medium</span><span class="mono" style="font-weight:700;">${sev.medium.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevMedPct}%</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-green);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Low</span><span class="mono" style="font-weight:700;">${sev.low.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevLowPct}%</span></div>
      </div>
    </div>
    <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Action</div>
      <div style="display:flex;flex-direction:column;gap:7px;">
        ${d.actions.map(a => {
          const w = Math.max(1, Math.round((a.count / maxAction) * 100));
          const col = actionColor(a.action);
          return `<div style="display:grid;grid-template-columns:150px 1fr 75px 50px;gap:10px;align-items:center;font-size:11px;">
            <div style="font-weight:600;color:var(--fp-ink);font-size:10.5px;">${esc(a.action)}</div>
            <div style="height:14px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;"><div style="width:${w}%;height:100%;background:${col};border-radius:3px;"></div></div>
            <div class="mono" style="text-align:right;font-weight:700;color:var(--fp-ink);">${a.count.toLocaleString()}</div>
            <div class="mono" style="text-align:right;color:var(--fp-ink-faint);font-size:10.5px;">${a.pct}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>
  ${d.topRiskFindings.length > 0 ? `
  <div style="background:var(--fp-cyan-soft);border:1px solid #BFE3EC;border-left:4px solid var(--fp-cyan);border-radius:6px;padding:12px 16px;margin-top:14px;">
    <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-cyan-deep);margin-bottom:6px;">DLP Activity Observations</div>
    <ul style="margin:0;padding-left:18px;">
      ${d.topRiskFindings.map(f => `<li style="font-size:11px;color:var(--fp-ink);line-height:1.6;margin-bottom:3px;">${esc(f)}</li>`).join('')}
    </ul>
  </div>` : ''}
  `;
    })() : '';

    /* Endpoint Key Risk Summary — just the topFindings list card from the
       Endpoint Agent Analysis tech section, hoisted here so executives see
       the headline endpoint risks without paging into the technical part. */
    const endpointKeyRisk = (p.endpointAgentSummary && p.endpointAgentSummary.totalRecords > 0 && p.endpointAgentSummary.topFindings.length > 0) ? (() => {
      const ea = p.endpointAgentSummary!;
      const riskIcon = (text: string): string => {
        if (/critical|legacy|outdated|disabled|inactive|imbalance/i.test(text)) return '🔴';
        if (/stale|sync|rms/i.test(text)) return '🟡';
        return '🟠';
      };
      return `
  <div class="subsection-title" style="margin-top:26px;">Endpoint Key Risk Summary</div>
  <p style="font-size:10.5px;color:var(--fp-ink-faint);margin:-4px 0 10px;font-style:italic;line-height:1.55;">
    Headline risks surfaced from <span class="mono" style="color:var(--fp-navy);">${esc(ea.fileName)}</span> — full version distribution, staleness buckets and client-status breakdown are in <em>Part II · Endpoint Agent Analysis</em>.
  </p>
  <div class="ea-risk-card">
    <div class="ea-risk-title">Key Risk Summary</div>
    <ul class="ea-risk-list">
      ${ea.topFindings.map(f => `<li class="ea-risk-item">
        <span class="ea-risk-item-icon">${riskIcon(f)}</span>
        <span>${esc(f)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
    })() : '';

    return [dlpActivitySnapshot, keyObservations, endpointKeyRisk, highLevelRecs, topPriorityActions]
      .filter(Boolean)
      .join('\n');
  })() : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${isExec ? 'Executive Risk Briefing' : 'HC Report'} — ${esc(p.sessionData.customerName || 'Customer')}</title>
<style>
/* ═══════════════════════════════════════════════════════════════
   FORCEPOINT HEALTH CHECK REPORT — BRAND-ALIGNED EDITION
   Brand palette: Teal #36B0C9 · Navy #023E8A · Violette #A30080
                  Red #DA1B2E · Green #69BC00 · Yellow #FDCE12
═══════════════════════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

*{margin:0;padding:0;box-sizing:border-box;}
:root{
  /* Forcepoint brand palette */
  --fp-navy:#023E8A;
  --fp-navy-deep:#012566;
  --fp-navy-soft:#E8EDF7;
  --fp-cyan:#36B0C9;            /* aliased to brand Teal */
  --fp-cyan-deep:#228BA0;
  --fp-cyan-soft:#E5F4F8;
  --fp-violette:#A30080;
  --fp-violette-soft:#F9F0F6;
  --fp-red:#DA1B2E;
  --fp-red-soft:#FEF2F2;
  --fp-yellow:#FDCE12;
  --fp-yellow-soft:#FFFBEB;
  --fp-green:#69BC00;
  --fp-green-soft:#F4FBE9;
  /* Semantic aliases (severity tokens map onto brand colors) */
  --fp-critical:var(--fp-violette);
  --fp-high:var(--fp-red);
  --fp-warn:#B58800;            /* darker yellow for legible text */
  --fp-ok:var(--fp-green);
  --fp-info:var(--fp-navy);
  /* Ink + surface scale */
  --fp-ink:#1D252C;
  --fp-ink-muted:#475569;
  --fp-ink-faint:#94A3B8;
  --fp-rule:#E2E8F0;
  --fp-rule-soft:#F1F5F9;
  --fp-surface:#FFFFFF;
  --fp-surface-alt:#F7F9FC;
}

html,body{background:#F4F6FA;}
body{
  font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
  font-size:12px;
  color:var(--fp-ink);
  line-height:1.6;
  font-feature-settings:'kern' 1,'liga' 1,'calt' 1,'cv11' 1;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
.num{font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;}
.mono{font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-variant-numeric:tabular-nums;}

/* Print button (screen only) */
.print-btn{
  position:fixed;top:18px;right:18px;
  background:var(--fp-teal,var(--fp-cyan));
  color:#fff;border:none;padding:10px 22px;border-radius:6px;cursor:pointer;
  font-weight:700;font-size:12px;z-index:999;
  box-shadow:0 4px 14px rgba(54,176,201,0.32);
  letter-spacing:0.01em;transition:transform 0.15s,box-shadow 0.15s;
  font-family:inherit;
}
.print-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(54,176,201,0.42);}

/* ───── COVER ───── */
.cover{
  position:relative;padding:0;min-height:297mm;background:#fff;display:flex;flex-direction:column;
  overflow:hidden;
}
.cover-hero{
  position:relative;padding:54px 60px 46px;
  background:linear-gradient(135deg,var(--fp-navy-deep) 0%,var(--fp-navy) 60%,#0356BC 100%);
  color:#fff;overflow:hidden;
}
.cover-hero::after{
  content:'';position:absolute;right:-80px;top:-80px;width:340px;height:340px;
  background:radial-gradient(circle,rgba(54,176,201,0.28) 0%,rgba(54,176,201,0) 70%);
  pointer-events:none;
}
.cover-hero::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--fp-cyan);
}
.cover-brand-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:50px;position:relative;z-index:2;}
.cover-brand{font-weight:800;font-size:18px;letter-spacing:-0.02em;color:#fff;}
.cover-brand .accent{color:var(--fp-cyan);}
.cover-classification{
  font-size:9px;font-weight:700;letter-spacing:0.16em;
  background:rgba(54,176,201,0.18);border:1px solid rgba(54,176,201,0.4);
  padding:5px 12px;border-radius:3px;color:var(--fp-cyan);
}
.cover-eyebrow{
  font-size:10px;font-weight:700;letter-spacing:0.2em;
  color:var(--fp-cyan);margin-bottom:12px;position:relative;z-index:2;
}
.cover-h1{
  font-size:38px;font-weight:800;line-height:1.1;color:#fff;
  letter-spacing:-0.03em;margin-bottom:14px;position:relative;z-index:2;
  max-width:560px;
}
.cover-sub{
  font-size:14.5px;color:#cbd5e1;font-weight:400;line-height:1.55;
  max-width:520px;position:relative;z-index:2;
}

/* Customer card on cover */
.cover-body{padding:42px 60px 0;flex:1;display:flex;flex-direction:column;}
.cover-customer-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;
  padding:20px 24px;display:flex;align-items:center;gap:20px;
  box-shadow:0 12px 32px rgba(2,62,138,0.1),0 2px 8px rgba(0,0,0,0.05);
  margin-top:-44px;position:relative;z-index:3;
  border-left:4px solid var(--fp-cyan);
  flex-wrap:wrap;
}
.cover-customer-logo{
  flex-shrink:0;width:88px;height:54px;
  display:flex;align-items:center;justify-content:center;
  background:#fff;border-right:1px solid var(--fp-rule);padding-right:16px;
}
.cover-customer-logo img{
  max-width:100%;max-height:100%;object-fit:contain;
}
.cover-customer-meta{flex:1 1 260px;min-width:0;}
.cover-customer-label{
  font-size:9.5px;font-weight:700;color:var(--fp-ink-faint);
  letter-spacing:0.16em;margin-bottom:5px;
}
.cover-customer-name{
  font-size:22px;font-weight:800;color:var(--fp-navy);
  letter-spacing:-0.02em;line-height:1.2;
  overflow-wrap:break-word;word-break:break-word;
}
.cover-customer-meta-row{
  display:flex;flex-wrap:wrap;row-gap:6px;column-gap:14px;
  margin-top:9px;font-size:10.5px;color:var(--fp-ink-muted);
}
.cover-customer-meta-row span{display:inline-flex;gap:5px;align-items:center;white-space:nowrap;}
.cover-customer-meta-row b{color:var(--fp-navy);font-weight:600;}
.cover-customer-date{
  text-align:right;padding-left:18px;border-left:1.5px solid var(--fp-rule-soft);
  flex-shrink:0;
}
.cover-customer-date-label{
  font-size:9.5px;font-weight:700;color:var(--fp-ink-faint);letter-spacing:0.16em;margin-bottom:5px;
}
.cover-customer-date-val{font-size:13px;font-weight:700;color:var(--fp-navy);white-space:nowrap;}

.cover-summary{margin-top:32px;}
.cover-summary-title{
  font-size:9.5px;font-weight:700;color:var(--fp-ink-faint);
  letter-spacing:0.16em;margin-bottom:14px;
}
.cover-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.cover-summary-cell{
  background:var(--fp-surface-alt);border:1px solid var(--fp-rule);border-radius:6px;
  padding:14px 16px;position:relative;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.cover-summary-cell::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--fp-cyan);
}
.cover-summary-cell-val{font-size:24px;font-weight:800;line-height:1;letter-spacing:-0.02em;}
.cover-summary-cell-label{font-size:9.5px;color:var(--fp-ink-faint);font-weight:600;margin-top:5px;}

.cover-spacer{flex:1;min-height:18px;}

.cover-footer{
  padding:18px 60px 28px;border-top:1px solid var(--fp-rule-soft);
  display:flex;justify-content:space-between;align-items:center;
}
.cover-footer-brand{font-weight:700;color:var(--fp-navy);font-size:11.5px;}
.cover-footer-meta{font-size:10px;color:var(--fp-ink-faint);}

/* ───── CHAPTER DIVIDER (Part I / II / III) ───── */
.chapter{
  page-break-before:always;padding:64px 60px 48px;
  background:linear-gradient(135deg,var(--fp-navy-deep) 0%,var(--fp-navy) 60%,#0356BC 100%);
  color:#fff;min-height:170mm;display:flex;flex-direction:column;justify-content:center;
  position:relative;overflow:hidden;
}
.chapter::after{
  content:'';position:absolute;right:-100px;bottom:-100px;width:420px;height:420px;
  background:radial-gradient(circle,rgba(54,176,201,0.22) 0%,rgba(54,176,201,0) 70%);
  pointer-events:none;
}
.chapter::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--fp-cyan);
}
.chapter-part{
  font-size:11px;font-weight:700;letter-spacing:0.24em;color:var(--fp-cyan);
  margin-bottom:14px;position:relative;z-index:2;
}
.chapter-title{
  font-size:34px;font-weight:800;line-height:1.15;letter-spacing:-0.03em;
  color:#fff;margin-bottom:14px;max-width:580px;position:relative;z-index:2;
}
.chapter-sub{font-size:13.5px;color:#cbd5e1;line-height:1.6;max-width:520px;position:relative;z-index:2;}

/* ───── CONTENT WRAPPER ───── */
.content{padding:42px 60px 56px;max-width:1020px;margin:0 auto;background:#fff;}

/* ───── SECTION ───── */
.section{margin-bottom:40px;page-break-inside:avoid;}
.section-eyebrow{
  font-size:9.5px;font-weight:700;letter-spacing:0.18em;
  color:var(--fp-cyan-deep);margin-bottom:8px;text-transform:uppercase;
}
.section-title{
  font-size:22px;font-weight:700;color:var(--fp-navy);
  padding-bottom:12px;margin-bottom:22px;letter-spacing:-0.022em;
  border-bottom:none;position:relative;font-family:'Inter',sans-serif;
}
.section-title::after{
  content:'';position:absolute;left:0;bottom:0;width:54px;height:3px;
  background:var(--fp-cyan);border-radius:2px;
}
.subsection-title{
  font-size:13px;font-weight:700;color:var(--fp-navy);
  margin:24px 0 12px;letter-spacing:0.02em;text-transform:uppercase;
  display:flex;align-items:center;gap:9px;
}
.subsection-title::before{
  content:'';display:inline-block;width:3px;height:12px;
  background:var(--fp-cyan);border-radius:2px;
}
.section-lead{
  font-size:12.5px;color:var(--fp-ink-muted);line-height:1.75;
  margin-bottom:18px;
}

/* ───── TOC ───── */
.toc{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:0;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);overflow:hidden;
  border-left:4px solid var(--fp-cyan);
}
.toc-item{
  display:flex;align-items:center;padding:11px 22px;
  border-bottom:1px solid var(--fp-rule-soft);
}
.toc-item:last-child{border-bottom:none;}
.toc-num{
  width:32px;font-size:11px;color:var(--fp-cyan-deep);font-weight:700;
  flex-shrink:0;font-variant-numeric:tabular-nums;
  font-family:'JetBrains Mono',monospace;
}
.toc-label{font-size:12.5px;color:var(--fp-ink);flex:1;font-weight:500;}
.toc-part-header{
  background:var(--fp-navy);color:#fff;padding:11px 22px;
  font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;
  border-bottom:none;
}

/* ───── TABLES ───── */
table{
  width:100%;border-collapse:collapse;font-size:11.5px;
  margin-bottom:10px;border-radius:6px;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.06);
  border:1px solid var(--fp-rule);
}
th{
  background:var(--fp-navy);color:#fff;padding:10px 13px;text-align:left;
  font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
  white-space:nowrap;border-bottom:none;
}
td{
  padding:10px 13px;border-bottom:1px solid var(--fp-rule-soft);vertical-align:top;
  color:var(--fp-ink);background:#fff;
}
tr:nth-child(even) td{background:#F7F9FC;}
tr:last-child td{border-bottom:none;}
.info-label{
  font-weight:700;color:var(--fp-navy);background:var(--fp-navy-soft)!important;
  width:200px;white-space:nowrap;font-size:10.5px;letter-spacing:0.02em;
}
/* Compact variant for the dense Version & EoL table */
.vg-table th{padding:7px 6px;font-size:9px;letter-spacing:0.06em;}
.vg-table td{padding:7px 6px;font-size:10px;line-height:1.4;}

/* Recommendations table: 2-row layout — summary row + full-width detail row */
.rec-table{border-collapse:separate;border-spacing:0 0;}
.rec-table tbody.rec-pair{margin:0;}
.rec-table tbody.rec-pair tr td{background:#fff;}
.rec-table tbody.rec-pair tr.rec-summary td{
  padding:11px 14px;border-bottom:1px solid var(--fp-rule-soft);
}
.rec-table tbody.rec-pair tr.rec-detail td{
  padding:0;background:#F7F9FC;border-bottom:none;
}
.rec-table tbody.rec-pair:not(:last-child) tr.rec-detail td,
.rec-table tbody.rec-pair:last-child tr.rec-summary:last-child td{
  border-bottom:1px solid var(--fp-rule);
}
.rec-table tbody.rec-pair + tbody.rec-pair tr.rec-summary td{
  border-top:0;
}
.rec-detail-inner{
  padding:14px 18px 16px;
  border-left:3px solid var(--fp-cyan);
  margin:0 0 0 0;
}
.rec-detail-tag{
  display:inline-block;font-size:9px;font-weight:800;letter-spacing:0.14em;
  text-transform:uppercase;color:var(--fp-cyan-deep);
  background:var(--fp-cyan-soft);border:1px solid #BFE3EC;
  padding:2px 8px;border-radius:3px;margin-bottom:8px;
}
.rec-detail-text{
  font-size:12px;color:#1D252C;line-height:1.7;width:100%;
}

/* ───── VERDICT CARD (executive opener) ───── */
.verdict{
  background:#fff;
  border:1px solid var(--fp-rule);border-radius:6px;
  padding:24px 28px;margin-bottom:24px;position:relative;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.06);
  border-left:6px solid var(--fp-navy);
}
.verdict-label{
  font-size:9.5px;font-weight:700;color:var(--fp-cyan-deep);
  letter-spacing:0.18em;margin-bottom:8px;text-transform:uppercase;
}
.verdict-text{
  font-size:15px;font-weight:500;color:var(--fp-ink);
  line-height:1.6;letter-spacing:-0.005em;
}
.verdict-text strong{color:var(--fp-navy);font-weight:700;}

/* ───── KPI GRID ───── */
.kpi-grid{
  display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:0 0 26px;
}
.kpi{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;
  padding:18px 16px;text-align:left;position:relative;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.kpi-accent{
  position:absolute;left:0;top:0;bottom:0;width:3px;
}
.kpi-label{
  font-size:9px;font-weight:700;color:var(--fp-ink-faint);
  letter-spacing:0.13em;text-transform:uppercase;margin-bottom:8px;
}
.kpi-val{
  font-size:30px;font-weight:700;line-height:1;margin-bottom:4px;
  letter-spacing:-0.025em;font-variant-numeric:tabular-nums;
  font-family:'Inter',sans-serif;
}
.kpi-foot{font-size:9.5px;color:var(--fp-ink-faint);font-weight:500;margin-top:4px;}

/* ───── OBSERVATIONS / KEY FINDINGS ───── */
.obs-group{display:flex;flex-direction:column;gap:7px;margin-bottom:8px;}
.obs{
  padding:12px 16px 12px 18px;border-radius:6px;border:1px solid var(--fp-rule);
  display:flex;gap:12px;align-items:flex-start;background:#fff;
  position:relative;overflow:hidden;
}
.obs::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;}
.obs-CRITICAL::before{background:var(--fp-violette);} .obs-CRITICAL{background:var(--fp-violette-soft);border-color:#E9CCDF;}
.obs-HIGH::before{background:var(--fp-red);}          .obs-HIGH{background:var(--fp-red-soft);border-color:#FECACA;}
.obs-WARNING::before{background:var(--fp-yellow);}    .obs-WARNING{background:var(--fp-yellow-soft);border-color:#FDE68A;}
.obs-MEDIUM::before{background:var(--fp-yellow);}     .obs-MEDIUM{background:var(--fp-yellow-soft);border-color:#FDE68A;}
.obs-LOW::before{background:var(--fp-green);}         .obs-LOW{background:var(--fp-green-soft);border-color:#D4EBA8;}
.obs-label{
  font-size:9px;font-weight:700;letter-spacing:0.12em;flex-shrink:0;padding-top:3px;
  font-family:'JetBrains Mono',monospace;width:64px;
}
.obs-text{font-size:12px;color:var(--fp-ink);line-height:1.6;}

/* ───── VERSION GROUPS ───── */
.vg{margin-bottom:14px;border-radius:6px;overflow:hidden;border:1px solid;background:#fff;
   box-shadow:0 2px 8px rgba(0,0,0,0.05);}
.vg-hdr{padding:12px 16px;display:flex;align-items:center;gap:9px;font-weight:700;font-size:12px;}
.vg-tag{
  font-size:9px;font-weight:700;padding:3px 9px;border-radius:3px;
  letter-spacing:0.06em;text-transform:uppercase;
}

/* ───── SERVER CARDS ───── */
.srv{
  border:1px solid var(--fp-rule);border-radius:6px;margin-bottom:12px;
  overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.srv-hdr{
  background:var(--fp-navy-soft);
  padding:12px 16px;display:flex;align-items:center;gap:12px;
  border-bottom:1px solid var(--fp-rule);
  border-left:4px solid var(--fp-navy);
}
.srv-metrics{padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;}
.chip{
  font-family:'JetBrains Mono',monospace;
  font-size:10.5px;font-weight:600;padding:5px 11px;border-radius:3px;
  font-variant-numeric:tabular-nums;
}

/* ───── ENDPOINT VISUALIZATIONS ───── */
.ea-bar-chart{display:flex;flex-direction:column;gap:6px;margin:10px 0 14px;}
.ea-bar-row{display:grid;grid-template-columns:120px 1fr 70px 50px;gap:10px;align-items:center;font-size:11px;}
.ea-bar-label{font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--fp-ink);font-size:10.5px;}
.ea-bar-track{height:18px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;position:relative;}
.ea-bar-fill{height:100%;border-radius:3px;min-width:2px;}
.ea-bar-fill-green{background:var(--fp-green);}
.ea-bar-fill-teal{background:var(--fp-cyan);}
.ea-bar-fill-yellow{background:var(--fp-yellow);}
.ea-bar-fill-red{background:var(--fp-red);}
.ea-bar-fill-violette{background:var(--fp-violette);}
.ea-bar-count{font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--fp-ink);font-size:10.5px;text-align:right;}
.ea-bar-pct{font-family:'JetBrains Mono',monospace;color:var(--fp-ink-faint);font-size:10.5px;text-align:right;}

.ea-pill-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.ea-pill{padding:5px 12px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;}
.ea-pill-green{background:var(--fp-green);color:#fff;}
.ea-pill-yellow{background:var(--fp-yellow);color:#5C4A00;}
.ea-pill-red{background:var(--fp-red);color:#fff;}
.ea-pill-violette{background:var(--fp-violette);color:#fff;}
.ea-pill-navy{background:var(--fp-navy);color:#fff;}

.ea-tile-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0;}
.ea-tile{padding:14px 16px;border-radius:6px;border:1px solid;box-shadow:0 2px 8px rgba(0,0,0,0.05);}
.ea-tile-yellow{background:var(--fp-yellow-soft);border-color:#FDE68A;}
.ea-tile-red{background:var(--fp-red-soft);border-color:#FECACA;}
.ea-tile-violette{background:var(--fp-violette-soft);border-color:#E9CCDF;}
.ea-tile-green{background:var(--fp-green-soft);border-color:#D4EBA8;}
.ea-tile-navy{background:var(--fp-navy-soft);border-color:#C7D6F0;}
.ea-tile-label{font-size:9.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--fp-ink-muted);}
.ea-tile-val{font-size:24px;font-weight:700;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;margin-top:4px;line-height:1;}
.ea-tile-sub{font-size:10px;color:var(--fp-ink-muted);margin-top:6px;line-height:1.4;}

.ea-sync-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0;}
.ea-sync-tile{padding:18px 22px;border-radius:6px;border:1px solid;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);}
.ea-sync-synced{background:var(--fp-green-soft);border-color:#D4EBA8;}
.ea-sync-unsynced{background:var(--fp-red-soft);border-color:#FECACA;}
.ea-sync-icon{font-size:24px;line-height:1;flex-shrink:0;}
.ea-sync-label{font-size:9.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--fp-ink-muted);}
.ea-sync-val{font-size:28px;font-weight:700;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;line-height:1;margin-top:2px;}
.ea-sync-val-green{color:var(--fp-green);}
.ea-sync-val-red{color:var(--fp-red);}

.ea-donut{display:flex;align-items:center;gap:18px;margin:10px 0;}
.ea-donut-svg{width:130px;height:130px;flex-shrink:0;}
.ea-donut-legend{display:flex;flex-direction:column;gap:6px;flex:1;}
.ea-donut-row{display:flex;align-items:center;gap:8px;font-size:11px;}
.ea-donut-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
.ea-donut-name{flex:1;color:var(--fp-ink);font-weight:500;}
.ea-donut-count{font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--fp-ink);}
.ea-donut-pct{font-family:'JetBrains Mono',monospace;color:var(--fp-ink-faint);font-size:10.5px;}

.ea-risk-card{
  background:var(--fp-cyan-soft);border:1px solid #BFE3EC;border-left:4px solid var(--fp-cyan);
  border-radius:6px;padding:14px 18px;margin-top:14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.ea-risk-title{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-cyan-deep);margin-bottom:8px;}
.ea-risk-list{list-style:none;padding:0;margin:0;}
.ea-risk-item{padding:5px 0;font-size:11.5px;color:var(--fp-ink);line-height:1.55;display:flex;gap:8px;}
.ea-risk-item-icon{flex-shrink:0;width:18px;}

/* ───── EXECUTIVE SUMMARY VISUALIZATIONS ───── */
.exec-viz-grid{
  display:grid;grid-template-columns:280px 1fr;gap:16px;margin:18px 0 20px;
  page-break-inside:avoid;
}
.exec-gauge-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:18px 20px;
  text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);
  border-top:4px solid var(--fp-cyan);
}
.exec-gauge-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;}
.exec-gauge-ring{
  width:170px;height:170px;border-radius:50%;margin:0 auto;
  display:flex;align-items:center;justify-content:center;position:relative;
}
.exec-gauge-inner{
  width:120px;height:120px;border-radius:50%;background:#fff;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
}
.exec-gauge-score{font-size:38px;font-weight:800;line-height:1;font-family:'Inter',sans-serif;letter-spacing:-0.03em;}
.exec-gauge-label{font-size:9px;color:var(--fp-ink-faint);letter-spacing:0.16em;text-transform:uppercase;margin-top:5px;font-weight:700;}
.exec-gauge-band{
  display:inline-block;margin-top:12px;padding:4px 12px;border-radius:3px;
  font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
}
.exec-sev-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:18px 22px;
  box-shadow:0 2px 8px rgba(0,0,0,0.06);
  display:flex;flex-direction:column;gap:10px;
}
.exec-sev-title{font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);}
.exec-sev-row{display:grid;grid-template-columns:80px 1fr 56px;gap:12px;align-items:center;font-size:11px;}
.exec-sev-label{font-weight:700;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;}
.exec-sev-track{height:14px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;}
.exec-sev-fill{height:100%;border-radius:3px;min-width:2px;}
.exec-sev-count{font-family:'JetBrains Mono',monospace;font-weight:700;text-align:right;font-size:11.5px;}

.exec-kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px;}
.exec-kpi{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:14px 16px;
  position:relative;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.exec-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
.exec-kpi-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--fp-ink-faint);}
.exec-kpi-val{font-size:26px;font-weight:700;line-height:1;font-family:'Inter',sans-serif;margin-top:5px;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;}
.exec-kpi-sub{font-size:9.5px;color:var(--fp-ink-faint);margin-top:3px;}

.exec-breakdown{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:14px 18px;
  margin-top:14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.exec-breakdown-title{font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;}
.exec-deduct-row{display:flex;gap:10px;flex-wrap:wrap;}
.exec-deduct-pill{
  display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:5px;
  background:var(--fp-surface-alt);border:1px solid var(--fp-rule);font-size:11px;
}
.exec-deduct-pill-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0;}
.exec-deduct-pill-num{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--fp-red);}

/* ───── PART 0 · EXECUTIVE BRIEFING ───── */
.brief-intro{
  background:#fff;border:1px solid var(--fp-rule);border-left:4px solid var(--fp-violette);
  border-radius:6px;padding:18px 22px;margin-bottom:18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.brief-intro-label{font-size:9.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--fp-violette);margin-bottom:6px;}
.brief-intro-text{font-size:13.5px;font-weight:500;color:var(--fp-ink);line-height:1.6;}

/* Finding breakdown matrix */
.brief-bd-table{width:100%;border-collapse:collapse;font-size:11px;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid var(--fp-rule);margin-bottom:6px;}
.brief-bd-table th{background:var(--fp-navy);color:#fff;padding:10px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;}
.brief-bd-table td{padding:10px 14px;border-bottom:1px solid var(--fp-rule-soft);background:#fff;}
.brief-bd-table tr:nth-child(even) td{background:#F7F9FC;}
.brief-bd-table tr.brief-bd-total td{background:var(--fp-navy-soft)!important;font-weight:700;border-top:2px solid var(--fp-navy);}
.brief-bd-num{font-family:'JetBrains Mono',monospace;text-align:center;font-weight:700;font-size:12px;}
.brief-bd-num-crit{color:var(--fp-violette);}
.brief-bd-num-high{color:var(--fp-red);}
.brief-bd-num-med{color:var(--fp-warn);}
.brief-bd-num-zero{color:var(--fp-ink-faint);font-weight:400;}

/* Risk Heat Map — 2×2 Impact × Likelihood quadrants */
.heat-wrap{display:grid;grid-template-columns:36px 1fr;gap:8px;margin-top:8px;}
.heat-ylabel{
  display:flex;align-items:center;justify-content:center;
  writing-mode:vertical-rl;transform:rotate(180deg);
  font-size:9.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--fp-ink-muted);
}
.heat-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6px;height:280px;}
.heat-cell{border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;border:1px solid;position:relative;}
.heat-cell-label{font-size:8.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
.heat-cell-count{font-family:'Inter',sans-serif;font-size:22px;font-weight:800;line-height:1;letter-spacing:-0.02em;}
.heat-cell-list{display:flex;flex-direction:column;gap:3px;margin-top:8px;font-size:10px;line-height:1.4;overflow:hidden;}
.heat-cell-item{padding:3px 7px;background:rgba(255,255,255,0.6);border-radius:3px;border:1px solid currentColor;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.heat-q-tr{background:var(--fp-violette-soft);border-color:#E9CCDF;color:var(--fp-violette);}     /* high impact + high likelihood = CRITICAL */
.heat-q-tl{background:var(--fp-red-soft);border-color:#FECACA;color:var(--fp-red);}            /* high impact + low likelihood = HIGH */
.heat-q-br{background:var(--fp-yellow-soft);border-color:#FDE68A;color:var(--fp-warn);}         /* low impact + high likelihood = MEDIUM */
.heat-q-bl{background:var(--fp-green-soft);border-color:#D4EBA8;color:var(--fp-green);}         /* low impact + low likelihood = LOW */
.heat-xlabel-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:9.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--fp-ink-muted);text-align:center;padding-left:44px;}

/* Top Critical Risks — business-language card grid */
.top-risk-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:6px;}
.top-risk-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:14px 16px;
  display:flex;flex-direction:column;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.05);
  border-left:4px solid var(--fp-violette);page-break-inside:avoid;
}
.top-risk-card-high{border-left-color:var(--fp-red);}
.top-risk-head{display:flex;align-items:center;gap:8px;}
.top-risk-icon{font-size:16px;line-height:1;flex-shrink:0;}
.top-risk-title{flex:1;font-size:12.5px;font-weight:700;color:var(--fp-ink);line-height:1.35;}
.top-risk-impact{font-size:11px;color:var(--fp-ink-muted);line-height:1.6;}
.top-risk-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:6px;border-top:1px solid var(--fp-rule-soft);font-size:10px;}
.top-risk-component{font-family:'JetBrains Mono',monospace;color:var(--fp-navy);font-weight:600;}

/* Compliance Exposure */
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;}
.comp-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:12px 16px;
  display:flex;flex-direction:column;gap:5px;box-shadow:0 2px 8px rgba(0,0,0,0.05);
  border-top:3px solid var(--fp-cyan);page-break-inside:avoid;
}
.comp-card-head{display:flex;align-items:center;gap:10px;}
.comp-code{
  font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:var(--fp-navy);
  background:var(--fp-navy-soft);padding:3px 9px;border-radius:3px;letter-spacing:0.04em;flex-shrink:0;
}
.comp-pillar{font-size:8.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-cyan-deep);margin-left:auto;}
.comp-name{font-size:11.5px;font-weight:600;color:var(--fp-ink);}
.comp-relevance{font-size:10.5px;color:var(--fp-ink-muted);line-height:1.5;}

/* Key Observations — card grid (replaces vertical bullet list) */
.kobs-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:6px;}
.kobs-card{
  display:flex;gap:10px;align-items:flex-start;padding:11px 14px;border-radius:6px;
  border:1px solid var(--fp-rule);background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.04);
  position:relative;overflow:hidden;page-break-inside:avoid;
}
.kobs-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
.kobs-card-CRITICAL::before{background:var(--fp-violette);} .kobs-card-CRITICAL{background:var(--fp-violette-soft);border-color:#E9CCDF;}
.kobs-card-HIGH::before{background:var(--fp-red);}          .kobs-card-HIGH{background:var(--fp-red-soft);border-color:#FECACA;}
.kobs-card-WARNING::before{background:var(--fp-yellow);}    .kobs-card-WARNING{background:var(--fp-yellow-soft);border-color:#FDE68A;}
.kobs-card-MEDIUM::before{background:var(--fp-yellow);}     .kobs-card-MEDIUM{background:var(--fp-yellow-soft);border-color:#FDE68A;}
.kobs-card-LOW::before{background:var(--fp-green);}         .kobs-card-LOW{background:var(--fp-green-soft);border-color:#D4EBA8;}
.kobs-icon{font-size:14px;line-height:1.1;flex-shrink:0;padding-top:1px;}
.kobs-body{flex:1;min-width:0;}
.kobs-sev{font-size:8.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;display:inline-block;margin-bottom:3px;}
.kobs-text{font-size:11px;color:var(--fp-ink);line-height:1.5;}

/* High-Level Recommendations — card grid (replaces long paragraph list) */
.rec-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 10px;}
.rec-mini-card{
  background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:11px 14px;
  display:flex;flex-direction:column;gap:5px;box-shadow:0 1px 4px rgba(0,0,0,0.04);
  border-left:3px solid var(--fp-cyan);page-break-inside:avoid;
}
.rec-mini-card-critical{border-left-color:var(--fp-violette);}
.rec-mini-card-high{border-left-color:var(--fp-red);}
.rec-mini-card-medium{border-left-color:var(--fp-yellow);}
.rec-mini-head{display:flex;align-items:center;gap:8px;}
.rec-mini-title{flex:1;font-size:11.5px;font-weight:600;color:var(--fp-ink);line-height:1.4;}
.rec-mini-detail{font-size:10.5px;color:var(--fp-ink-muted);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.rec-mini-foot{display:flex;align-items:center;gap:8px;padding-top:5px;border-top:1px solid var(--fp-rule-soft);font-size:9.5px;color:var(--fp-ink-faint);font-family:'JetBrains Mono',monospace;}

/* ───── FINDINGS ───── */
.finding{
  padding:14px 18px 14px 22px;border-radius:6px;
  margin-bottom:10px;border:1px solid var(--fp-rule);background:#fff;
  position:relative;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.04);
}
.finding::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;}
.finding-CRITICAL::before{background:var(--fp-violette);} .finding-CRITICAL{background:var(--fp-violette-soft);}
.finding-HIGH::before{background:var(--fp-red);}          .finding-HIGH{background:var(--fp-red-soft);}
.finding-MEDIUM::before{background:var(--fp-yellow);}     .finding-MEDIUM{background:var(--fp-yellow-soft);}
.finding-LOW::before{background:var(--fp-green);}         .finding-LOW{background:var(--fp-green-soft);}
.finding-text{font-weight:600;font-size:13px;color:var(--fp-ink);margin-bottom:6px;line-height:1.5;}
.finding-meta{
  font-size:10px;color:var(--fp-ink-faint);
  font-family:'JetBrains Mono',monospace;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:2px;
}
/* Full-width annotation blocks under each finding — description, remediation, analyst note */
.finding-block{
  display:block;width:100%;
  margin-top:10px;padding:12px 16px;border-radius:5px;
  font-size:12px;line-height:1.65;
}
.finding-block-label{
  display:block;font-size:9.5px;font-weight:800;letter-spacing:0.12em;
  text-transform:uppercase;margin-bottom:5px;
}
.finding-block-desc{
  background:#fff;border:1px solid var(--fp-rule);border-left:3px solid #94A3B8;
  color:var(--fp-ink);
}
.finding-block-desc .finding-block-label{color:#475569;}
.finding-block-rem{
  background:var(--fp-cyan-soft);border:1px solid #BFE3EC;border-left:3px solid var(--fp-cyan);
  color:var(--fp-ink);
}
.finding-block-rem .finding-block-label{color:var(--fp-cyan-deep);}
.finding-block-note{
  background:#F0F4FA;border:1px solid #C7D6F0;border-left:3px solid var(--fp-navy);
  color:var(--fp-navy-deep);
}
.finding-block-note .finding-block-label{color:var(--fp-navy);}
/* Legacy aliases kept for back-compat */
.finding-note{margin-top:10px;padding:12px 16px;background:#F0F4FA;border:1px solid #C7D6F0;border-left:3px solid var(--fp-navy);border-radius:5px;font-size:12px;color:var(--fp-navy-deep);line-height:1.65;}
.finding-note strong{color:var(--fp-navy);display:block;margin-bottom:4px;font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;}
.remediation{margin-top:10px;padding:12px 16px;background:var(--fp-cyan-soft);border:1px solid #BFE3EC;border-left:3px solid var(--fp-cyan);border-radius:5px;font-size:12px;color:var(--fp-ink);line-height:1.65;}

/* ───── BADGE ───── */
.badge{
  display:inline-block;padding:3px 9px;border-radius:3px;
  font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
  font-variant-numeric:tabular-nums;
  font-family:'Inter',sans-serif;
}
.badge-critical{background:var(--fp-violette-soft);color:var(--fp-violette);border:1px solid #E9CCDF;}
.badge-high{background:var(--fp-red-soft);color:var(--fp-red);border:1px solid #FECACA;}
.badge-medium{background:var(--fp-yellow-soft);color:var(--fp-warn);border:1px solid #FDE68A;}
.badge-low,.badge-ok,.badge-green{background:var(--fp-green-soft);color:var(--fp-green);border:1px solid #D4EBA8;}
.badge-navy{background:var(--fp-navy-soft);color:var(--fp-navy);border:1px solid #C7D6F0;}
.badge-teal{background:var(--fp-cyan-soft);color:var(--fp-cyan-deep);border:1px solid #BFE3EC;}
.badge-grey{background:var(--fp-rule-soft);color:var(--fp-ink-muted);border:1px solid var(--fp-rule);}

/* ───── VERSION SUMMARY BAR ───── */
.vsb{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:20px;}
.vsb-card{
  border-radius:6px;padding:14px 16px;text-align:left;border:1px solid;
  background:#fff;position:relative;overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
}
.vsb-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
.vsb-val{font-size:24px;font-weight:700;line-height:1;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;font-family:'Inter',sans-serif;}
.vsb-label{font-size:10px;font-weight:600;color:var(--fp-ink-muted);margin-top:5px;}

/* ───── FOOTER ───── */
.rpt-footer{
  margin-top:56px;padding-top:18px;border-top:1px solid var(--fp-rule);
  display:flex;justify-content:space-between;align-items:center;
  font-size:10px;color:var(--fp-ink-faint);
}
.rpt-footer-brand{color:var(--fp-cyan-deep);font-weight:800;font-size:11.5px;letter-spacing:-0.01em;}

/* ───── PAGE BREAKS ───── */
.pb{page-break-after:always;}

/* ───── PRINT OVERRIDES ───── */
@media print{
  html,body{background:#fff;}
  .print-btn{display:none;}
  .cover{page-break-after:always;min-height:auto;}
  .chapter{page-break-before:always;min-height:auto;padding:32mm 22mm;}
  .pb{page-break-after:always;}
  .section{page-break-inside:avoid;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-size:10.5px;}
  .content{padding:18px 0 24px;max-width:none;margin:0;}
  .cover-hero{padding:38px 26px 34px;}
  .cover-body{padding:34px 26px 0;}
  .cover-footer{padding:14px 26px 18px;}
  table{font-size:9.5px;}
  th{padding:6px 8px;font-size:8px;letter-spacing:0.04em;}
  td{padding:6px 8px;}
  .vg-hdr{padding:8px 12px;}
  .kpi-val{font-size:26px;}
  .cover-h1{font-size:30px;}
  .chapter-title{font-size:28px;}
  .section-title{font-size:18px;}
}
@page{margin:14mm 10mm;size:A4;}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>

<!-- ══════════════════════════════════════
     COVER PAGE — premium hero with customer card + headline KPIs
══════════════════════════════════════ -->
<div class="cover">
  <div class="cover-hero">
    <div class="cover-brand-row">
      <div class="cover-brand">Force<span class="accent">point</span></div>
      <div class="cover-classification">CONFIDENTIAL · CUSTOMER</div>
    </div>
    <div class="cover-eyebrow">FORCEPOINT INTELLIGENCE PLATFORM</div>
    <div class="cover-h1">${isExec ? 'Executive Risk Briefing' : 'Health Check &amp; Maturity Assessment'}</div>
    <div class="cover-sub">${isExec
      ? `A decision-ready briefing for the CISO, CIO and security leadership — risk posture at a glance, the compliance exposure created by today's deployment, and the licensing &amp; enhancement decisions that translate the technical assessment into a forward roadmap.`
      : `A comprehensive review of the customer's Forcepoint infrastructure — infrastructure posture, version &amp; lifecycle risk, licensing alignment, and a prioritized roadmap of remediation actions.`}</div>
  </div>

  <div class="cover-body">
    <div class="cover-customer-card">
      ${p.customerLogo ? `
      <div class="cover-customer-logo">
        <img src="${esc(p.customerLogo)}" alt="${esc(p.sessionData.customerName || 'Customer')} logo">
      </div>` : ''}
      <div class="cover-customer-meta">
        <div class="cover-customer-label">PREPARED FOR</div>
        <div class="cover-customer-name">${esc(p.sessionData.customerName || 'Customer')}</div>
        <div class="cover-customer-meta-row">
          ${p.sessionData.forcepointId ? `<span><b>FP ID</b> <span class="mono">${esc(p.sessionData.forcepointId)}</span></span>` : ''}
          ${p.sessionData.industry ? `<span><b>Industry</b> ${esc(p.sessionData.industry)}</span>` : ''}
          ${p.sessionData.country ? `<span><b>Region</b> ${esc(p.sessionData.country)}</span>` : ''}
          ${p.sessionData.salesEngineer ? `<span><b>Prepared by</b> ${esc(p.sessionData.salesEngineer)}</span>` : ''}
        </div>
      </div>
      <div class="cover-customer-date">
        <div class="cover-customer-date-label">REPORT DATE</div>
        <div class="cover-customer-date-val">${esc(p.date)}</div>
      </div>
    </div>

    <div class="cover-summary">
      <div class="cover-summary-title">ASSESSMENT AT A GLANCE</div>
      <div style="display:flex;flex-direction:column;gap:18px;">
        <!-- Health Score -->
        <div style="text-align:center;">
          <div style="font-size:48px;font-weight:800;color:${p.healthScore === null ? '#94a3b8' : p.healthScore >= 80 ? 'var(--fp-ok)' : p.healthScore >= 60 ? 'var(--fp-warn)' : 'var(--fp-critical)'};">${p.healthScore === null ? '—' : p.healthScore + '%'}</div>
          <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:0.08em;margin-top:4px;">HEALTH SCORE</div>
        </div>
        <!-- Products Assessed -->
        <div>
          <div style="font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:0.08em;margin-bottom:8px;">PRODUCTS ASSESSED</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${(() => {
              const productMap: Record<string, { emoji: string; label: string }> = {
                web: { emoji: '🌐', label: 'Web Security' },
                email: { emoji: '✉️', label: 'Email Security' },
                data: { emoji: '🔒', label: 'Data Security (DLP)' },
                ngfw: { emoji: '🛡️', label: 'Next Gen Firewall' },
                dspm: { emoji: '☁️', label: 'DSPM' },
                cls: { emoji: '🏷️', label: 'Data Classification' },
              };
              return Object.entries(p.selectedProducts)
                .filter(([_, selected]) => selected)
                .map(([key, _]) => productMap[key])
                .filter(Boolean)
                .map(prod => `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;font-size:11px;color:#475569;"><span style="font-size:14px;">${prod.emoji}</span> ${prod.label}</span>`)
                .join('');
            })()}
          </div>
        </div>
      </div>
    </div>

    <div class="cover-spacer"></div>
  </div>

  <div class="cover-footer">
    <div class="cover-footer-brand">Forcepoint Intelligence Platform</div>
    <div class="cover-footer-meta">forcepoint.com · © ${new Date().getFullYear()} Forcepoint LLC</div>
  </div>
</div>

<!-- ══════════════════════════════════════
     TABLE OF CONTENTS — grouped by Part
══════════════════════════════════════ -->
<div class="content pb">
  <div class="section">
    <div class="section-eyebrow">Navigation</div>
    <div class="section-title">Contents</div>
    <div class="toc">
      ${(() => {
        let itemNum = 0;
        return tocEntries.map(e => {
          if (e.kind === 'part') {
            return `<div class="toc-part-header">${e.label}</div>`;
          }
          itemNum++;
          return `<div class="toc-item"><span class="toc-num">${String(itemNum).padStart(2,'0')}</span><span class="toc-label">${e.label}</span></div>`;
        }).join('');
      })()}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════
     OPENING NOTE — Purpose of this report
     Sits between the TOC and Part 0 so the CISO sees framing context
     before the risk numbers. Customer name interpolated everywhere
     [CUSTOMER_NAME] appeared in the source template.
══════════════════════════════════════ -->
<div class="content">
<div class="section" style="page-break-after:always;">
  <div class="section-eyebrow">Foreword · Forcepoint Customer Success</div>
  <div class="section-title">Purpose of This Report</div>
  <p style="font-size:12.5px;line-height:1.7;color:var(--fp-ink);margin:14px 0 12px;">
    This document presents the findings of the Forcepoint Health Check conducted for <strong>${esc(p.sessionData.customerName || 'the customer')}</strong>. The Health Check is a structured technical and operational review performed by Forcepoint to evaluate the current state of the customer's Forcepoint deployment across all active product lines.
  </p>
  <p style="font-size:12.5px;line-height:1.7;color:var(--fp-ink);margin:0 0 10px;">
    The objective of this review is threefold:
  </p>
  <ul style="font-size:12px;line-height:1.7;color:var(--fp-ink);margin:0 0 14px 22px;padding:0;">
    <li style="margin-bottom:6px;"><strong style="color:var(--fp-navy);">Validate</strong> that deployed solutions are configured in alignment with Forcepoint best practices and the customer's stated security objectives.</li>
    <li style="margin-bottom:6px;"><strong style="color:var(--fp-navy);">Identify</strong> configuration gaps, operational risks, and areas where the deployment may not be delivering its full intended value.</li>
    <li style="margin-bottom:6px;"><strong style="color:var(--fp-navy);">Recommend</strong> prioritized corrective actions and improvement opportunities to maximize security posture and return on investment.</li>
  </ul>
  <p style="font-size:11.5px;line-height:1.65;color:var(--fp-ink-muted);font-style:italic;margin:0;">
    The chapters that follow open with an executive briefing for security leadership, then progress through the technical evidence supporting each conclusion, and close with a prioritized roadmap.
  </p>
</div>
</div>

<!-- ══════════════════════════════════════
     PART 0 — EXECUTIVE BRIEFING (CISO, ≤3 pages)
     Bracketed with VARIANT EXEC_ONLY markers so the HealthCheck variant
     can strip the entire block via the post-render regex in
     stripVariantBlocks(). Inline conditional wrapping isn't usable here
     because Part 0's body contains nested template literals.
══════════════════════════════════════ -->
<!--VARIANT:EXEC_ONLY:START-->
<div class="chapter">
  <div class="chapter-part">PART 1</div>
  <div class="chapter-title">Executive Briefing</div>
  <div class="chapter-sub">A decision-ready three-page brief for the CISO and security leadership — the risk posture at a glance, the top critical risks framed in business terms, and the compliance exposure created by today's deployment.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     PART 0 · 01 RISK POSTURE & FINDING BREAKDOWN
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">Section 1 · Part 1 · Risk Posture</div>
  <div class="section-title">Risk Posture &amp; Executive Summary</div>

  <div class="brief-intro">
    <div class="brief-intro-label">Executive Position</div>
    <div class="brief-intro-text">
      ${(() => {
        const cust = esc(p.sessionData.customerName || 'The customer');
        if (breakdownTotals.critical === 0 && breakdownTotals.high === 0) {
          return `${cust}'s Forcepoint estate shows <strong>no critical or high-severity exposure</strong> across version, infrastructure, checklist, or configuration dimensions. The roadmap that follows is enhancement-focused rather than remediation-focused.`;
        }
        return `${cust}'s Forcepoint estate carries <strong style="color:var(--fp-violette);">${breakdownTotals.critical} critical</strong> and <strong style="color:var(--fp-red);">${breakdownTotals.high} high-severity</strong> exposures aggregated across version, infrastructure, checklist and configuration dimensions. The top six business-impact items are summarized below; supporting technical evidence is in Parts I–III.`;
      })()}
    </div>
  </div>

  <!-- ─── CISO Dashboard widget grid ───────────────────────────────
       Replaces the Finding Breakdown table — same numbers expressed as
       a glanceable widget layout (gauge + verdict + severity tiles +
       risk × source matrix + coverage + per-product + activity pulse +
       top-concerns chips). Mirrors Step 17 Summary & Review so the wizard
       preview and the printed report stay visually identical. -->

  <!-- Row 1: health gauge + verdict -->
  <div style="display:grid;grid-template-columns:340px 1fr;gap:12px;margin:6px 0 12px;page-break-inside:avoid;">
    <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:14px;">
      <div style="width:104px;height:104px;border-radius:50%;background:conic-gradient(${hsc} 0deg ${gaugeArc}deg, #EEF2F8 ${gaugeArc}deg 360deg);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <div style="width:82px;height:82px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="font-size:24px;font-weight:800;color:${hsc};line-height:1;letter-spacing:-0.02em;">${p.healthScore === null ? '—' : p.healthScore}</div>
          <div style="font-size:9px;font-weight:700;color:#94A3B8;letter-spacing:0.08em;margin-top:2px;">HEALTH</div>
        </div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:9.5px;font-weight:700;color:#94A3B8;letter-spacing:0.08em;margin-bottom:6px;">SCORE BREAKDOWN</div>
        ${[
          { label: 'Questions',      pct: Math.round(dedQ / dedTotal * 100), value: dedQ, color: '#0EA5E9' },
          { label: 'Version EoS',    pct: Math.round(dedV / dedTotal * 100), value: dedV, color: '#B58800' },
          { label: 'Infrastructure', pct: Math.round(dedI / dedTotal * 100), value: dedI, color: '#A30080' },
          { label: 'Recommendations', pct: dedR > 0 ? Math.round(dedR / dedTotal * 100) : 0, value: dedR, color: '#DC2626' },
        ].map((b) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <span style="font-size:10.5px;color:#64748B;width:80px;flex-shrink:0;">${b.label}</span>
          <div style="flex:1;height:5px;border-radius:3px;background:#EEF2F8;overflow:hidden;">
            <div style="height:100%;width:${Math.max(0, Math.min(100, b.pct))}%;background:${b.color};border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;font-weight:700;color:#475569;font-family:'JetBrains Mono',monospace;width:30px;text-align:right;">−${b.value}</span>
        </div>`).join('')}
        <div style="font-size:10px;color:#94A3B8;margin-top:6px;font-family:'JetBrains Mono',monospace;">${p.totalAnswered}/${p.totalQuestions} questions answered</div>
      </div>
    </div>
    <div style="background:${verdictBg};border:1px solid ${verdictBorder};border-left:4px solid ${verdictColor};border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:16px;">
      <div style="font-size:28px;color:${verdictColor};flex-shrink:0;line-height:1;">${verdictIcon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;font-weight:800;color:${verdictColor};letter-spacing:-0.01em;">${esc(verdictLabel)}</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">${p.allFindings.length} finding${p.allFindings.length === 1 ? '' : 's'} · ${eosEntries.length} EoS · ${infraCritCount + infraHighCount} infra alerts</div>
      </div>
      <div style="display:flex;gap:18px;flex-shrink:0;">
        ${[
          { label: 'CRIT + HIGH',  value: breakdownTotals.critical + breakdownTotals.high, color: breakdownTotals.critical + breakdownTotals.high > 0 ? '#A30080' : '#16A34A' },
          { label: 'EOS',          value: eosEntries.length, color: eosEntries.length > 0 ? '#A30080' : '#16A34A' },
          { label: 'INFRA ALERTS', value: infraCritCount + infraHighCount, color: infraCritCount > 0 ? '#A30080' : infraHighCount > 0 ? '#B58800' : '#16A34A' },
        ].map((s) => `
        <div style="text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${s.color};line-height:1;letter-spacing:-0.02em;font-family:'Inter',sans-serif;">${s.value}</div>
          <div style="font-size:9px;font-weight:700;color:#64748B;letter-spacing:0.06em;margin-top:4px;">${s.label}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Row 2: severity heat tiles -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;page-break-inside:avoid;">
    ${(['critical','high','medium','low'] as const).map((sev) => {
      const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
        critical: { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', label: 'CRITICAL' },
        high:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'HIGH' },
        medium:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', label: 'MEDIUM' },
        low:      { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', label: 'LOW' },
      };
      const c = cfg[sev];
      const count = sev === 'critical' ? aggregateSev.CRITICAL : sev === 'high' ? aggregateSev.HIGH : sev === 'medium' ? aggregateSev.MEDIUM : aggregateSev.LOW;
      return `<div style="background:${c.bg};border:1px solid ${c.border};border-top:3px solid ${c.color};border-radius:6px;padding:12px 14px;">
        <div style="font-size:9px;font-weight:800;color:${c.color};letter-spacing:0.1em;">${c.label}</div>
        <div style="font-size:28px;font-weight:800;color:${c.color};line-height:1;margin-top:4px;letter-spacing:-0.02em;font-family:'Inter',sans-serif;">${count}</div>
        <div style="font-size:10px;color:#64748B;margin-top:4px;">findings &amp; recommendations</div>
      </div>`;
    }).join('')}
  </div>

  <!-- Row 3: risk × source matrix + coverage stats -->
  <div style="display:grid;grid-template-columns:1.55fr 1fr;gap:12px;margin-bottom:12px;page-break-inside:avoid;">
    <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:14px 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);">Risk Posture by Category</div>
        <div style="font-size:10px;color:#94A3B8;">Severity × source</div>
      </div>
      <div style="display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:5px;align-items:center;">
        <div></div>
        ${[
          { label: 'CRIT', color: '#A30080' },
          { label: 'HIGH', color: '#DC2626' },
          { label: 'MED',  color: '#B58800' },
          { label: 'LOW',  color: '#0284C7' },
        ].map((h) => `<div style="font-size:9px;font-weight:800;color:${h.color};text-align:center;letter-spacing:0.07em;">${h.label}</div>`).join('')}
        ${riskMatrixRows.map((row) => {
          const cellHtml = (count: number, color: string) => {
            const bg = count === 0 ? '#F8FAFC' : count >= 5 ? color : count >= 3 ? `${color}80` : `${color}33`;
            const txt = count === 0 ? '#CBD5E1' : count >= 5 ? '#fff' : color;
            const brd = count === 0 ? '#E2E8F0' : `${color}40`;
            return `<div style="height:28px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:${bg};border:1px solid ${brd};font-size:12px;font-weight:800;color:${txt};font-family:'Inter',sans-serif;">${count}</div>`;
          };
          return `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--fp-ink);font-weight:600;">
              <span style="font-size:14px;">${row.icon}</span>${esc(row.label)}
            </div>
            ${cellHtml(row.critical, '#A30080')}
            ${cellHtml(row.high, '#DC2626')}
            ${cellHtml(row.medium, '#B58800')}
            ${cellHtml(row.low, '#0284C7')}
          `;
        }).join('')}
      </div>
    </div>
    <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:14px 16px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);margin-bottom:10px;">Coverage Stats</div>
      ${(() => {
        const bars: { label: string; value: number; max: number; color: string }[] = [];
        const activeSrvCount = activeServers.length;
        if (p.serverDetails.length > 0) bars.push({ label: 'Servers reviewed', value: activeSrvCount, max: p.serverDetails.length, color: '#0EA5E9' });
        const versionEntriesCount = allVEntries.length;
        if (versionEntriesCount > 0) bars.push({ label: 'Version entries', value: versionEntriesCount, max: Math.max(versionEntriesCount, 10), color: '#A30080' });
        if (p.dlpBundles.length > 0) {
          /* Count the actual files successfully parsed across every uploaded
             DLP Server Info folder — the figure executives care about ("how
             much raw telemetry did we consume?"), not how many top-level
             folders were uploaded. */
          const parsedFileTotal = p.dlpBundles.reduce((sum, b) => sum + (b.parsedFiles?.length ?? 0), 0);
          bars.push({ label: 'DLP Telemetry Files', value: parsedFileTotal, max: Math.max(parsedFileTotal, 20), color: '#B58800' });
        }
        /* SQL Reports — counted only if the operator picked some in
           Step 3. Same logic as the Step 10 preview: completed = how
           many `reportRuns[id].state === 'ok'`. */
        if (p.selectedReports.length > 0) {
          const completed = p.selectedReports.reduce(
            (sum, id) => sum + ((p.reportRuns?.[id]?.state === 'ok') ? 1 : 0),
            0,
          );
          bars.push({ label: 'SQL Reports run', value: completed, max: p.selectedReports.length, color: '#2563EB' });
        }
        /* DLP REST API posture — one binary bar. Only when DLP is in
           scope and at least one posture section is enabled (mirrors
           the Section 13 visibility rule so the coverage stat doesn't
           promise content that won't render). */
        if (hasDLP && (p.dlpPostureSummary && Object.values(p.dlpPostureSections).some(Boolean))) {
          bars.push({ label: 'DLP REST API posture', value: 1, max: 1, color: '#0D9488' });
        } else if (hasDLP) {
          bars.push({ label: 'DLP REST API posture', value: 0, max: 1, color: '#0D9488' });
        }
        if (p.certificates.length > 0) bars.push({ label: 'Certificates', value: p.certificates.length, max: Math.max(p.certificates.length, 5), color: '#7C3AED' });
        if (p.endpointAgentSummary) bars.push({ label: 'Endpoints (current)', value: p.endpointAgentSummary.totalRecords - p.endpointAgentSummary.outdatedCount, max: p.endpointAgentSummary.totalRecords || 1, color: '#16A34A' });
        return bars.map((b) => {
          const pctVal = b.max > 0 ? Math.min(100, Math.round((b.value / b.max) * 100)) : 0;
          return `
          <div style="margin-bottom:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:10.5px;color:#475569;font-weight:500;">${esc(b.label)}</span>
              <span style="font-size:10.5px;font-weight:700;color:var(--fp-navy);font-family:'JetBrains Mono',monospace;">${b.value.toLocaleString()}</span>
            </div>
            <div style="height:5px;border-radius:3px;background:#EEF2F8;overflow:hidden;">
              <div style="height:100%;width:${pctVal}%;background:${b.color};border-radius:3px;"></div>
            </div>
          </div>`;
        }).join('');
      })()}
    </div>
  </div>

  <!-- Row 4: per-product scorecards -->
  ${productCards.length > 0 ? `
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);">Per-Product Posture</div>
      <div style="font-size:10px;color:#94A3B8;">Severity-weighted checklist completion</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(${Math.min(productCards.length, 4)},minmax(0,1fr));gap:10px;">
      ${productCards.map(({ template, score, totalF, answered, total, bySev, sc }) => {
        const pctScore = score ?? 0;
        return `<div style="background:#FAFCFF;border:1px solid ${template.color}26;border-radius:6px;padding:10px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">
            <div style="width:52px;height:52px;border-radius:50%;background:conic-gradient(${sc} 0deg ${pctScore * 3.6}deg, #EEF2F8 ${pctScore * 3.6}deg 360deg);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <div style="width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:${sc};letter-spacing:-0.01em;">${score === null ? '—' : score}</div>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:14px;">${esc(template.icon)}</span>
                <span style="font-size:11.5px;font-weight:700;color:var(--fp-ink);">${esc(template.name.replace(' HC', ''))}</span>
              </div>
              <div style="font-size:9.5px;color:#64748B;font-family:'JetBrains Mono',monospace;margin-top:2px;">${answered}/${total} answered · ${totalF} finding${totalF === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${(['CRITICAL','HIGH','MEDIUM','LOW'] as const).map((sv) => {
              const sevColor: Record<string, { bg: string; border: string; color: string }> = {
                CRITICAL: { bg: '#FDF2F8', border: '#FBCFE8', color: '#A30080' },
                HIGH:     { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
                MEDIUM:   { bg: '#FFFBEB', border: '#FDE68A', color: '#B58800' },
                LOW:      { bg: '#F0F9FF', border: '#BAE6FD', color: '#0284C7' },
              };
              const cfg = sevColor[sv];
              const n = bySev[sv] ?? 0;
              const bg = n > 0 ? cfg.bg : '#F8FAFC';
              const co = n > 0 ? cfg.color : '#CBD5E1';
              const brd = n > 0 ? cfg.border : '#E2E8F0';
              return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${bg};color:${co};border:1px solid ${brd};font-family:'JetBrains Mono',monospace;">${sv.charAt(0)}:${n}</span>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- Row 5: activity pulse strip -->
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 16px;margin-bottom:12px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);">Activity Pulse</div>
      <div style="font-size:10px;color:#94A3B8;">Roadmap items captured so far</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;">
      ${[
        { label: 'Recommendations',   value: p.recommendations.length, accent: '#0EA5E9' },
        { label: 'Action Items',      value: p.actionItems.filter((i) => i.status !== 'done').length, sub: `${p.actionItems.filter((i) => i.status === 'done').length} done`, accent: '#16A34A' },
        { label: 'Customer FRs',      value: p.featureRequests.length, accent: '#7C3AED' },
        { label: 'License Gap',       value: p.licenseGaps?.length ?? 0, accent: '#B58800' },
        { label: 'Enhancements',      value: p.selectedEnhancements.length, accent: '#0284C7' },
        { label: 'Version Upgrades',  value: p.versionUpgrades.length, accent: '#A30080' },
      ].map((t) => `
      <div style="background:${t.accent}08;border:1px solid ${t.accent}26;border-left:3px solid ${t.accent};border-radius:5px;padding:9px 10px;">
        <div style="font-size:9px;font-weight:700;color:${t.accent};letter-spacing:0.06em;text-transform:uppercase;">${t.label}</div>
        <div style="font-size:20px;font-weight:800;color:var(--fp-navy);line-height:1;letter-spacing:-0.02em;margin-top:4px;font-family:'Inter',sans-serif;">${t.value}</div>
        ${t.sub ? `<div style="font-size:9.5px;color:#94A3B8;margin-top:2px;font-family:'JetBrains Mono',monospace;">${t.sub}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>

  <!-- Row 5b: DLP Estate Pulse — only when DLP is in scope AND we have at
       least one parsed bundle to draw telemetry from. Aggregates across all
       uploaded bundles so a multi-server estate folds into one set of KPIs. -->
  ${p.selectedProducts.data && p.dlpBundles.length > 0 ? (() => {
    let archivedEvents = 0, onlineEvents = 0, totalEvents = 0;
    let dataStart = '', dataEnd = '';
    let totalComponents = 0, totalSynced = 0;
    let totalRules = 0, totalPolicies = 0;
    let syncedEp = 0, unsyncedEp = 0;
    for (const bundle of p.dlpBundles) {
      const ep = bundle.eventPartitions?.summary;
      if (ep) {
        archivedEvents += ep.archivedEvents;
        onlineEvents   += ep.onlineEvents;
        totalEvents    += ep.totalEvents;
        if (ep.dataHistoryStart && (!dataStart || ep.dataHistoryStart < dataStart)) dataStart = ep.dataHistoryStart;
        if (ep.dataHistoryEnd && (!dataEnd || ep.dataHistoryEnd > dataEnd)) dataEnd = ep.dataHistoryEnd;
      }
      const se = bundle.siteElements;
      if (se) {
        totalComponents += se.syncStatus.total;
        totalSynced     += se.syncStatus.synchronized;
      }
      const ap = bundle.activePolicies;
      if (ap) {
        totalRules += ap.totalRules;
        totalPolicies += ap.policyNames.length;
      }
      const ec = bundle.endpointClients;
      if (ec) {
        syncedEp   += ec.syncedCount;
        unsyncedEp += ec.unsyncedCount;
      }
    }
    const syncPct = totalComponents > 0 ? Math.round((totalSynced / totalComponents) * 1000) / 10 : 0;
    const incidents = p.dlpDashboardSummary?.totalIncidents ?? 0;
    const fmt = (n: number): string => n.toLocaleString();
    /* Compact date — "Jan 2024" rather than "2024-01-15" so the date-range
       tile fits in one column without truncating. */
    const fmtMonth = (iso: string): string => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    };
    const range = dataStart && dataEnd ? `${fmtMonth(dataStart)} → ${fmtMonth(dataEnd)}` : '—';

    const tiles = [
      { label: 'Archived Events',  value: fmt(archivedEvents), accent: '#64748B' },
      { label: 'Online Events',    value: fmt(onlineEvents),   accent: '#0284C7' },
      { label: 'Total Events',     value: fmt(totalEvents),    accent: '#0F2952', big: true },
      { label: 'Incidents (PDF)',  value: fmt(incidents),      accent: incidents > 0 ? '#A30080' : '#16A34A', sub: incidents > 0 ? 'from DLP dashboard' : 'none reported' },
      { label: 'Components',       value: `${totalComponents}`, accent: syncPct < 70 ? '#A30080' : syncPct < 95 ? '#B58800' : '#16A34A', sub: totalComponents > 0 ? `${syncPct}% synced` : 'no inventory' },
      { label: 'Active Policies',  value: `${totalPolicies}`,   accent: '#7C3AED', sub: totalRules > 0 ? `${totalRules} rules` : '' },
    ];

    return `
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 16px;margin-bottom:12px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);">DLP Estate Pulse</div>
      <div style="font-size:10px;color:#94A3B8;">Telemetry aggregated from ${p.dlpBundles.length} DLP Telemetry export${p.dlpBundles.length === 1 ? '' : 's'}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;">
      ${tiles.map((t) => `
      <div style="background:${t.accent}08;border:1px solid ${t.accent}26;border-left:3px solid ${t.accent};border-radius:5px;padding:9px 10px;">
        <div style="font-size:9px;font-weight:700;color:${t.accent};letter-spacing:0.06em;text-transform:uppercase;">${t.label}</div>
        <div style="font-size:${t.big ? 22 : 19}px;font-weight:800;color:var(--fp-navy);line-height:1;letter-spacing:-0.02em;margin-top:4px;font-family:'Inter',sans-serif;">${esc(t.value)}</div>
        ${t.sub ? `<div style="font-size:9.5px;color:#94A3B8;margin-top:2px;font-family:'JetBrains Mono',monospace;">${esc(t.sub)}</div>` : ''}
      </div>`).join('')}
    </div>
    <!-- Second row: 2 wider tiles for date range + endpoint client split -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px;">
      <div style="background:#FAFCFF;border:1px solid #E2E8F0;border-left:3px solid #0F2952;border-radius:5px;padding:9px 10px;">
        <div style="font-size:9px;font-weight:700;color:#0F2952;letter-spacing:0.06em;text-transform:uppercase;">Data History</div>
        <div style="font-size:14px;font-weight:700;color:var(--fp-navy);line-height:1.15;margin-top:4px;font-family:'JetBrains Mono',monospace;">${esc(range)}</div>
      </div>
      <div style="background:#FAFCFF;border:1px solid #E2E8F0;border-left:3px solid #16A34A;border-radius:5px;padding:9px 10px;">
        <div style="font-size:9px;font-weight:700;color:#16A34A;letter-spacing:0.06em;text-transform:uppercase;">Endpoint Clients</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:4px;">
          <span style="font-size:18px;font-weight:800;color:#16A34A;line-height:1;font-family:'Inter',sans-serif;">${fmt(syncedEp)}</span>
          <span style="font-size:9.5px;color:#16A34A;font-weight:700;letter-spacing:0.05em;">SYNCED</span>
          <span style="color:#CBD5E1;">·</span>
          <span style="font-size:18px;font-weight:800;color:${unsyncedEp > 0 ? '#A30080' : '#94A3B8'};line-height:1;font-family:'Inter',sans-serif;">${fmt(unsyncedEp)}</span>
          <span style="font-size:9.5px;color:${unsyncedEp > 0 ? '#A30080' : '#94A3B8'};font-weight:700;letter-spacing:0.05em;">UNSYNCED</span>
        </div>
      </div>
    </div>
  </div>`;
  })() : ''}

  <!-- Top Concerns chip strip -->
  ${topConcerns.length > 0 ? `
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 16px;margin-bottom:14px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <span style="font-size:13px;color:#A30080;">⚠</span>
      <div style="font-size:11.5px;font-weight:700;color:var(--fp-navy);">Top Concerns</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${topConcerns.slice(0, 6).map((c) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;background:${c.bg};color:${c.color};border:1px solid ${c.border};font-size:10.5px;font-weight:600;">${c.icon} ${esc(c.text)}</span>`).join('')}
    </div>
  </div>` : ''}

  <!-- Risk Heat Map — pure 2×2 heatmap. No labels inside cells; axis labels
       sit outside the grid as a discrete 3×3 CSS grid layout (axis row +
       axis column + 2×2 cell block). Each cell shows only the count, big
       and centered; colour intensity scales with how full that quadrant is. -->
  <div class="subsection-title">Risk Heat Map</div>
  ${(() => {
    const critN = eosEntries.length + expiredCerts.length + p.allFindings.filter((f) => f.severity === 'CRITICAL').length;
    const highN = infraCritCount + expiringCerts.length + (supportUpgradeNeeded ? 1 : 0) + p.allFindings.filter((f) => f.severity === 'HIGH').length;
    const medN  = infraHighCount + warnEntries.length + p.allFindings.filter((f) => f.severity === 'MEDIUM').length;
    const lowN  = p.allFindings.filter((f) => f.severity === 'LOW').length;
    /* Cell colouring: filled cells use a solid saturated background with
       WHITE numerals for maximum contrast (standard heatmap convention).
       Empty cells use a near-transparent tint of the zone colour with a
       muted grey "0" — they should fade into the background, not compete
       with the populated zones. */
    const cell = (n: number, baseColor: string) => {
      const bg = n === 0 ? `${baseColor}14` : baseColor;
      const txt = n === 0 ? '#94A3B8' : '#FFFFFF';
      const borderC = n === 0 ? `${baseColor}40` : baseColor;
      const shadow = n === 0 ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.18)';
      return `
      <div style="background:${bg};border:1px solid ${borderC};border-radius:6px;display:flex;align-items:center;justify-content:center;height:110px;box-shadow:${shadow};">
        <span style="font-size:46px;font-weight:800;color:${txt};line-height:1;letter-spacing:-0.03em;font-family:'Inter',sans-serif;text-shadow:${n > 0 ? '0 1px 2px rgba(0,0,0,0.18)' : 'none'};">${n}</span>
      </div>`;
    };
    const axisLabel = (text: string) => `<div style="font-size:9.5px;font-weight:800;color:#64748B;letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;">${text}</div>`;
    return `
    <div style="display:grid;grid-template-columns:34px 50px 1fr 1fr;grid-template-rows:auto auto auto auto;gap:6px;page-break-inside:avoid;margin-bottom:10px;">
      <!-- Top axis title row -->
      <div></div>
      <div></div>
      <div style="grid-column:3 / 5;text-align:center;font-size:10px;font-weight:800;color:#0F2952;letter-spacing:0.12em;text-transform:uppercase;padding-bottom:2px;">Likelihood</div>
      <!-- Top axis tick row -->
      <div></div>
      <div></div>
      ${axisLabel('Low')}
      ${axisLabel('High')}
      <!-- Row 1: High impact -->
      <div style="grid-row:3 / 5;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#0F2952;letter-spacing:0.12em;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);">Impact</div>
      ${axisLabel('High')}
      ${cell(highN, '#B58800')}
      ${cell(critN, '#A30080')}
      <!-- Row 2: Low impact -->
      ${axisLabel('Low')}
      ${cell(lowN, '#16A34A')}
      ${cell(medN, '#B58800')}
    </div>
    <!-- Legend -->
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;font-size:10px;color:#64748B;margin-bottom:10px;">
      <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:10px;border-radius:3px;background:#A30080;border:1px solid #A30080;"></span> Critical zone</span>
      <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:10px;border-radius:3px;background:#B58800;border:1px solid #B58800;"></span> Watch zone</span>
      <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:10px;border-radius:3px;background:#16A34A;border:1px solid #16A34A;"></span> Safe zone</span>
    </div>

    <!-- Explanation block: what the heat map means and how to read it. -->
    <div style="background:#F8FAFC;border:1px solid var(--fp-rule);border-left:3px solid #023E8A;border-radius:6px;padding:10px 14px;font-size:10.5px;color:var(--fp-ink);line-height:1.65;page-break-inside:avoid;">
      <div style="font-size:10px;font-weight:800;color:#023E8A;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;">How to read this map</div>
      <div>
        Each item identified in this assessment is plotted by <strong>Impact</strong> (how serious the consequence is if the issue triggers) and <strong>Likelihood</strong> (how probable it is given the current deployment). The four cells are remediation zones rather than risk scores:
      </div>
      <ul style="margin:6px 0 0;padding-left:18px;">
        <li><strong style="color:#A30080;">Critical zone</strong> (top-right) — high impact &amp; high likelihood. Address first; these items justify immediate change-control bookings.</li>
        <li><strong style="color:#B58800;">Watch zones</strong> (top-left, bottom-right) — one dimension is elevated. Plan into the next maintenance window; trend the metric in the meantime.</li>
        <li><strong style="color:#16A34A;">Safe zone</strong> (bottom-left) — low impact &amp; low likelihood. No action required beyond the standard monitoring cadence.</li>
      </ul>
    </div>`;
  })()}
</div>

<!-- Top Critical Risks section removed — the CISO Dashboard widgets in
     Part 0 · Risk Posture and the technical evidence in Parts I–III now
     cover the same ground without the prose duplication. -->


<!-- ══════════════════════════════════════
     PART 0 · 03 COMPLIANCE EXPOSURE
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">Section 2 · Part 1 · Compliance Lens</div>
  <div class="section-title">Compliance Exposure</div>
  <p class="section-lead">
    The compliance frameworks below are relevant to this customer based on jurisdiction and industry. The findings in this report — particularly End-of-Support components, expired certificates, and DLP enforcement gaps — create direct audit and reporting exposure under each framework listed.
  </p>
  <div class="comp-grid">
    ${complianceFrameworks.map(fw => {
      const statusCfg: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
        compliant:     { label: 'Compliant',     bg: 'var(--fp-green-soft)',    color: 'var(--fp-green)',    border: '#D4EBA8', icon: '✓' },
        partial:       { label: 'Partial',       bg: 'var(--fp-yellow-soft)',   color: 'var(--fp-warn)',     border: '#FDE68A', icon: '◐' },
        non_compliant: { label: 'Non-Compliant', bg: 'var(--fp-red-soft)',      color: 'var(--fp-red)',      border: '#FECACA', icon: '✗' },
        unassessed:    { label: 'Not Assessed',  bg: 'var(--fp-rule-soft)',     color: 'var(--fp-ink-faint)', border: 'var(--fp-rule)', icon: '?' },
      };
      const s = statusCfg[fw.complianceStatus ?? 'unassessed'] ?? statusCfg.unassessed;
      return `
      <div class="comp-card">
        <div class="comp-card-head">
          <span class="comp-code">${esc(fw.code)}</span>
          <span class="comp-pillar">${esc(fw.pillar)}</span>
        </div>
        <div class="comp-name">${esc(fw.name)}</div>
        <div class="comp-relevance">${esc(fw.relevance)}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed ${s.border};display:flex;align-items:center;gap:6px;">
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:3px;background:${s.bg};color:${s.color};border:1px solid ${s.border};font-size:9.5px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
            <span style="font-size:11px;line-height:1;">${s.icon}</span>${s.label}
          </span>
          <span style="font-size:9.5px;color:var(--fp-ink-faint);letter-spacing:0.04em;">via Forcepoint DLP</span>
        </div>
      </div>
    `;
    }).join('')}
  </div>
  <p style="font-size:10.5px;color:var(--fp-ink-muted);margin-top:14px;line-height:1.65;font-style:italic;">
    Compliance frameworks above were inferred from customer country, region, and industry as captured in Step 1. They are a starting point for the legal/compliance discussion — not an exhaustive obligation register. The customer's own compliance team should validate the applicable framework list.
  </p>
</div>

<!-- ══════════════════════════════════════
     PART 1 · 03 CURRENT LICENSING POSTURE
     CxO-facing license inventory: how many licenses are active,
     how many are about to expire (≤90 days), and how many have
     already lapsed. Pairs the support-level summary so the
     executive sees both the entitlement strength AND the renewal
     risk on a single page. Forward-looking "what should we buy?"
     stays in Part 3 / Recommended License Extension — this section
     is intentionally backward-looking ("what do we own today?").
══════════════════════════════════════ -->
${(() => {
  const lics = p.sessionData.licenses ?? [];
  const hasSupportInfo = !!(p.sessionData.supportLevel || p.sessionData.recommendedSupportLevel);
  if (lics.length === 0 && !hasSupportInfo) return '';

  /* Bucket licenses by lifecycle state. EXPIRED takes precedence
     over ACTIVE when the date says so — the wizard's stored
     `status` field may lag the actual date, so we trust the date. */
  const now = new Date();
  const ninetyDays = 90 * 24 * 3600 * 1000;
  const parseDate = (s: string): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  type LicBucket = 'expired' | 'expiring' | 'active' | 'pending' | 'unknown';
  const bucketOf = (l: typeof lics[0]): LicBucket => {
    if ((l.status || '').toUpperCase() === 'PENDING') return 'pending';
    const exp = parseDate(l.expiry || '');
    if (!exp) return ((l.status || '').toUpperCase() === 'ACTIVE') ? 'active' : 'unknown';
    if (exp.getTime() < now.getTime()) return 'expired';
    if (exp.getTime() - now.getTime() <= ninetyDays) return 'expiring';
    return 'active';
  };
  let cActive = 0, cExpiring = 0, cExpired = 0, cPending = 0;
  for (const l of lics) {
    const b = bucketOf(l);
    if (b === 'active') cActive++;
    else if (b === 'expiring') cExpiring++;
    else if (b === 'expired') cExpired++;
    else if (b === 'pending') cPending++;
  }

  /* Sort for the table: expired first (operator needs to renew),
     expiring next (planning horizon), active last. */
  const bucketRank: Record<LicBucket, number> = { expired: 0, expiring: 1, pending: 2, active: 3, unknown: 4 };
  const sorted = [...lics].sort((a, b) => {
    const ra = bucketRank[bucketOf(a)];
    const rb = bucketRank[bucketOf(b)];
    if (ra !== rb) return ra - rb;
    const da = parseDate(a.expiry || '')?.getTime() ?? Number.POSITIVE_INFINITY;
    const db = parseDate(b.expiry || '')?.getTime() ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  const tile = (label: string, value: number, color: string, bg: string, border: string) => `
    <div style="background:${bg};border:1px solid ${border};border-left:3px solid ${color};border-radius:6px;padding:11px 14px;">
      <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${color};letter-spacing:-0.01em;margin-top:2px;">${value}</div>
    </div>`;

  const supportUpgradeNeeded = !!p.sessionData.supportLevel && !!p.sessionData.recommendedSupportLevel
    && p.sessionData.supportLevel.trim().toLowerCase() !== p.sessionData.recommendedSupportLevel.trim().toLowerCase();

  const bucketBadge = (b: LicBucket): string => {
    const cfg: Record<LicBucket, { label: string; bg: string; color: string }> = {
      expired:  { label: 'EXPIRED',  bg: '#FEE2E2', color: '#991B1B' },
      expiring: { label: 'EXPIRING', bg: '#FEF3C7', color: '#92400E' },
      active:   { label: 'ACTIVE',   bg: '#F0FDF4', color: '#15803D' },
      pending:  { label: 'PENDING',  bg: '#F1F5F9', color: '#475569' },
      unknown:  { label: '—',        bg: '#F1F5F9', color: '#94A3B8' },
    };
    const c = cfg[b];
    return `<span style="display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:0.08em;background:${c.bg};color:${c.color};padding:2px 7px;border-radius:3px;font-family:'JetBrains Mono',monospace;">${c.label}</span>`;
  };

  return `
<div class="section">
  <div class="section-eyebrow">Section 3 · Part 1 · Licensing</div>
  <div class="section-title">Current Licensing Posture</div>
  <p class="section-lead">
    Snapshot of the customer's current Forcepoint entitlements as captured during this engagement.
    The table below is sorted by renewal urgency — anything expired sits at the top, expiring-within-90-days next.
    Forward-looking license recommendations live in <em>Recommended License Extension</em> further down; this section
    is intentionally backward-looking, so the CxO sees exactly what they own today.
  </p>

  ${lics.length > 0 ? `
  <div style="display:grid;grid-template-columns:repeat(${cPending > 0 ? 4 : 3},1fr);gap:10px;margin-bottom:14px;page-break-inside:avoid;">
    ${tile('Active', cActive, '#15803D', '#F0FDF4', '#BBF7D0')}
    ${tile('Expiring ≤90d', cExpiring, '#92400E', '#FEF3C7', '#FDE68A')}
    ${tile('Expired', cExpired, '#991B1B', '#FEE2E2', '#FECACA')}
    ${cPending > 0 ? tile('Pending', cPending, '#475569', '#F1F5F9', '#E2E8F0') : ''}
  </div>` : ''}

  ${supportUpgradeNeeded ? `
  <div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:4px solid #D97706;border-radius:8px;padding:12px 16px;margin-bottom:14px;page-break-inside:avoid;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#92400E;margin-bottom:6px;">Support Level Recommendation</div>
    <div style="font-size:12px;color:#0F2952;line-height:1.6;">
      Current support: <strong>${esc(p.sessionData.supportLevel || '—')}</strong> → recommended:
      <strong style="color:#D97706;">${esc(p.sessionData.recommendedSupportLevel || '—')}</strong>.
      Forcepoint recommends this upgrade given the deployment scope; full rationale appears in the technical assessment (Part II of the full Health Check report).
    </div>
  </div>` : (p.sessionData.supportLevel ? `
  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:9px 14px;margin-bottom:14px;font-size:11px;color:#15803D;">
    <strong>Support level:</strong> ${esc(p.sessionData.supportLevel)} — aligned with deployment scope.
  </div>` : '')}

  ${lics.length > 0 ? `
  <table style="margin-bottom:0;">
    <thead>
      <tr>
        <th>Product</th>
        <th style="width:60px;text-align:right;">Qty</th>
        <th style="width:90px;">Deployment</th>
        <th style="width:80px;">Support</th>
        <th style="width:95px;">Expiry</th>
        <th style="width:80px;text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.slice(0, 12).map(l => {
        const b = bucketOf(l);
        const exp = parseDate(l.expiry || '');
        const expStr = exp ? exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (l.expiry || '—');
        const dStyle = b === 'expired' ? 'color:#991B1B;font-weight:700;'
                      : b === 'expiring' ? 'color:#92400E;font-weight:600;'
                      : 'color:var(--fp-ink-muted);';
        return `<tr>
          <td style="font-weight:600;color:#023E8A;font-size:11px;">${esc(l.product || '—')}${l.productCode ? `<div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#94A3B8;font-weight:400;">${esc(l.productCode)}</div>` : ''}</td>
          <td style="font-family:'JetBrains Mono',monospace;text-align:right;font-weight:600;">${esc(l.quantity || '—')}</td>
          <td style="font-size:10px;color:var(--fp-ink-muted);">${esc(l.deploymentType || '—')}</td>
          <td style="font-size:10px;color:var(--fp-ink-muted);">${esc(l.supportLevel || '—')}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:10px;${dStyle}">${esc(expStr)}</td>
          <td style="text-align:center;">${bucketBadge(b)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  ${sorted.length > 12 ? `<div style="margin-top:8px;font-size:10px;color:var(--fp-ink-faint);font-style:italic;">+${sorted.length - 12} additional license${sorted.length - 12 === 1 ? '' : 's'} not shown — full list is in the technical assessment.</div>` : ''}
  ` : `<p style="font-size:11px;color:var(--fp-ink-muted);font-style:italic;margin:0;">No licenses captured in this engagement.</p>`}
</div>`;
})()}

</div><!-- /content (Part 1 closes here) -->
<!--VARIANT:EXEC_ONLY:END-->

<!-- ══════════════════════════════════════
     PART I — EXECUTIVE OVERVIEW
     Tech-only — chapter header + customer profile tables + board
     briefing duplicate. The Executive Risk Briefing skips Part I
     entirely; CISO already has the verdict in Part 0 and customer
     identification on the cover page, so the back-of-the-book
     narrative + license tables + duplicate verdict don't earn page
     space at executive scale.
══════════════════════════════════════ -->
<!--VARIANT:TECH_ONLY:START-->
<div class="chapter">
  <div class="chapter-part">PART I</div>
  <div class="chapter-title">Executive Overview</div>
  <div class="chapter-sub">A board-level read of the customer's Forcepoint estate. Begin with the assessment scope and the customer's account &amp; licensing posture, then move to the verdict, key findings, and prioritized recommendations.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     INTRODUCTION
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">Section 01 · Part I · Background</div>
  <div class="section-title">Introduction</div>
  <p class="section-lead">
    The Forcepoint Health Check &amp; Maturity Assessment evaluates the current state of the deployed Forcepoint
    infrastructure and delivers a prioritized set of recommendations to maximize the value and security posture
    of the customer's Forcepoint investment. The assessment reviews configuration, identifies critical issues,
    evaluates end-of-life risk, and highlights optimization opportunities — grounded in environment data and
    Forcepoint best practices.
  </p>
  <p class="section-lead" style="margin-bottom:18px;">
    Findings are based on environment data collected at the time of the review. Recommendations are prioritized
    by risk and operational impact.
  </p>

  <div class="subsection-title">Scope</div>
  <p class="section-lead">
    This assessment focuses on infrastructure health, operational issues, version currency, End-of-Life /
    End-of-Maintenance timelines, licensing alignment, and a prioritized roadmap of remediation and optimization
    actions. Products reviewed: <strong>${esc(productsInScope)}</strong>.
  </p>

  ${hasAccountSection ? `
  <p style="margin-top:6px;font-size:10.5px;color:#64748b;line-height:1.65;font-style:italic;">
    Customer, Forcepoint ID, region, and report metadata appear on the cover page; full account, partner, and stakeholder details are in the next section (Customer Account &amp; Licensing). The Executive Summary thereafter consolidates the assessment's verdict and prioritized next steps.
  </p>` : `
  <p style="margin-top:6px;font-size:10.5px;color:#64748b;line-height:1.65;font-style:italic;">
    Customer, Forcepoint ID, region, and report metadata appear on the cover page. The Executive Summary that follows consolidates the assessment's verdict and prioritized next steps; supporting evidence is provided in the subsequent sections.
  </p>`}
</div>

<!-- ══════════════════════════════════════
     CUSTOMER ACCOUNT & LICENSING
══════════════════════════════════════ -->
${(() => {
  const sd = p.sessionData;
  const hasProfile = !!(sd.city || sd.theatre || sd.region || sd.supportLevel || sd.arr || sd.channelAccountManager || sd.distributor);
  const hasLicenses    = (sd.licenses?.length ?? 0) > 0;
  const hasEntitlements= (sd.entitlements?.length ?? 0) > 0;
  const hasHardware    = (sd.hardware?.length ?? 0) > 0;
  const hasCases       = (sd.cases?.length ?? 0) > 0;
  const hasCustFR      = (sd.featureRequests?.length ?? 0) > 0;
  const hasLicenseGaps = (p.licenseGaps?.length ?? 0) > 0;
  if (!hasProfile && !hasLicenses && !hasEntitlements && !hasHardware && !hasCases && !hasCustFR && !hasLicenseGaps) return '';

  // ── Account Snapshot ──
  const snapshotFields: Array<[string, string]> = hasProfile ? [
    ['Customer',          sd.customerName || ''],
    ['Forcepoint ID',     sd.forcepointId || ''],
    ['Industry',          sd.industry || ''],
    ['Country / Region',  sd.country || ''],
    ['City',              sd.city || ''],
    ['Theatre',           sd.theatre || ''],
    ['Region',            sd.region || ''],
    ['Reseller / Partner', sd.partner || ''],
    ['Distributor',        sd.distributor || ''],
    ['Account Owner',      sd.accountOwner || ''],
    ['Customer Success Manager', sd.csm || ''],
    ['Primary Sales Engineer',   sd.salesEngineer || ''],
    ['Channel Account Manager',  sd.channelAccountManager || ''],
  ] : [];

  const snapshotRows = snapshotFields
    .filter(([, v]) => v && v !== '—')
    .map(([k, v]) => `<tr><td style="font-weight:700;color:#475569;width:34%;font-size:10.5px;padding:5px 10px;background:#f8fafc;">${esc(k)}</td><td style="font-family:${k.includes('ID') ? 'monospace' : 'inherit'};font-size:10.5px;color:#1D252C;padding:5px 10px;">${esc(v)}</td></tr>`).join('');

  const upgradeNeeded = !!sd.supportLevel && !!sd.recommendedSupportLevel
    && sd.supportLevel.trim().toLowerCase() !== sd.recommendedSupportLevel.trim().toLowerCase();

  return `
<div class="section">
  <div class="section-eyebrow">Section 02 · Part I · Customer Profile</div>
  <div class="section-title">Customer Account &amp; Licensing</div>

  ${upgradeNeeded ? `
  <!-- Prominent Support Level Upgrade Recommendation banner -->
  <div style="background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:2px solid #DA1B2E;border-left:6px solid #DA1B2E;border-radius:10px;padding:16px 20px;margin-bottom:22px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="font-size:18px;line-height:1;">⚠</div>
      <div style="font-size:11px;font-weight:800;color:#9a3412;letter-spacing:0.1em;">SUPPORT LEVEL UPGRADE RECOMMENDATION</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="text-align:center;background:#fff;border:1.5px solid #fed7aa;border-radius:8px;padding:8px 14px;min-width:140px;">
        <div style="font-size:8.5px;font-weight:700;color:#9a3412;letter-spacing:0.08em;margin-bottom:3px;">CURRENT</div>
        <div style="font-size:16px;font-weight:800;color:#1f2937;letter-spacing:-0.01em;">${esc(sd.supportLevel || '—')}</div>
      </div>
      <div style="font-size:22px;color:#DA1B2E;font-weight:700;">→</div>
      <div style="text-align:center;background:#69BC00;border:1.5px solid #4A8500;border-radius:8px;padding:8px 14px;min-width:140px;box-shadow:0 4px 12px rgba(22,163,74,0.25);">
        <div style="font-size:8.5px;font-weight:700;color:#dcfce7;letter-spacing:0.08em;margin-bottom:3px;">RECOMMENDED</div>
        <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.01em;">${esc(sd.recommendedSupportLevel || '—')}</div>
      </div>
    </div>
    <div style="font-size:11px;color:#7c2d12;line-height:1.65;">
      Forcepoint recommends upgrading from <strong>${esc(sd.supportLevel)}</strong> to <strong>${esc(sd.recommendedSupportLevel)}</strong> to align the customer's support entitlement with the size of their deployment and the operational criticality of the platform. The upgrade unlocks faster SLA response targets, named TAM access, and proactive health monitoring — all of which materially reduce the mean time to recovery on production incidents.
    </div>
  </div>` : ''}

  ${hasProfile && snapshotRows ? `
  <div class="subsection-title" style="margin-top:0;">Account Snapshot</div>
  <table style="margin-bottom:18px;border:1.5px solid #e2e8f0;border-radius:6px;overflow:hidden;">
    <tbody>${snapshotRows}</tbody>
  </table>
  ` : ''}

  ${hasLicenses && !isExec ? `
  <div class="subsection-title">License Gap Analysis (${sd.licenses!.length})</div>
  <table style="margin-bottom:18px;">
    <thead>
      <tr>
        <th>Product</th>
        <th style="width:80px;">Code</th>
        <th style="width:65px;text-align:right;">Qty</th>
        <th style="width:80px;">Deployment</th>
        <th style="width:70px;">Support</th>
        <th style="width:75px;">Status</th>
        <th style="width:85px;">Start</th>
        <th style="width:85px;">Expiry</th>
      </tr>
    </thead>
    <tbody>
      ${sd.licenses!.map(l => `<tr>
        <td style="font-weight:600;color:#023E8A;">${esc(l.product || '—')}</td>
        <td style="font-family:monospace;font-size:9.5px;color:#475569;">${esc(l.productCode || '—')}</td>
        <td style="font-family:monospace;text-align:right;">${esc(l.quantity || '—')}</td>
        <td style="font-size:10px;">${esc(l.deploymentType || '—')}</td>
        <td style="font-size:10px;">${esc(l.supportLevel || '—')}</td>
        <td><span class="badge" style="${stStyle(l.status.toLowerCase())}">${esc(l.status)}</span></td>
        <td>${dateBadgeHtml(l.startDate || '—')}</td>
        <td>${dateBadgeHtml(l.expiry || '—')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${hasEntitlements && !isExec ? `
  <div class="subsection-title">Support Entitlements (${sd.entitlements!.length})</div>
  <table style="margin-bottom:18px;">
    <thead>
      <tr>
        <th>Name</th>
        <th style="width:160px;">Type</th>
        <th style="width:85px;">Status</th>
        <th style="width:100px;">Start Date</th>
        <th style="width:100px;">End Date</th>
      </tr>
    </thead>
    <tbody>
      ${sd.entitlements!.map(e => `<tr>
        <td style="font-weight:600;color:#023E8A;">${esc(e.name || '—')}</td>
        <td>${esc(e.type || '—')}</td>
        <td><span class="badge" style="${stStyle(e.status.toLowerCase())}">${esc(e.status)}</span></td>
        <td>${dateBadgeHtml(e.startDate || '—')}</td>
        <td>${dateBadgeHtml(e.endDate || '—')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${hasHardware && !isExec ? `
  <div class="subsection-title">Customer Hardware Inventory (${sd.hardware!.length})</div>
  <table style="margin-bottom:18px;">
    <thead>
      <tr>
        <th>Model</th>
        <th style="width:80px;">Code</th>
        <th style="width:50px;text-align:right;">Units</th>
        <th style="width:120px;">Warranty</th>
        <th style="width:75px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${sd.hardware!.map(h => {
        const lc = lookupHardwareLifecycle(p.versionData, h.model, h.productCode);
        const lcStatus = lc ? lifecycleStatus(lc) : null;
        const lcColor = lcStatus ? lifecycleStatusColor(lcStatus) : '#94a3b8';
        return `<tr>
          <td style="font-weight:600;color:#023E8A;">${esc(h.model || '—')}</td>
          <td style="font-family:monospace;font-size:9.5px;color:#475569;">${esc(h.productCode || '—')}</td>
          <td style="font-family:monospace;text-align:right;">${h.units}</td>
          <td style="font-size:10.5px;">
            ${esc(h.warranty || '—')}
            ${h.warrantyStatus ? `<div style="font-size:9px;color:${h.warrantyStatus.toLowerCase() === 'active' ? '#69BC00' : '#A30080'};font-weight:700;margin-top:1px;">${esc(h.warrantyStatus.toUpperCase())}</div>` : ''}
          </td>
          <td><span class="badge" style="${stStyle((h.status || '').toLowerCase())}">${esc(h.status || '—')}</span></td>
        </tr>${lc ? `
        <tr style="background:#fafcff;">
          <td colspan="5" style="padding:6px 10px;border-top:0;font-size:9.5px;">
            <span style="display:inline-block;font-family:monospace;font-size:8.5px;font-weight:700;background:${lcColor}15;color:${lcColor};border:1px solid ${lcColor}40;padding:1px 6px;border-radius:3px;letter-spacing:0.04em;margin-right:8px;">PRODUCT LIFECYCLE · ${lcStatus}</span>
            <span style="color:#94a3b8;">matched to <strong style="color:#023E8A;">${esc(lc['Model/Version'])}</strong></span>
            <table style="width:100%;border-collapse:collapse;margin-top:5px;">
              <tr>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">GA</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['General Availability'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">END OF SALE</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['End of Sale'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">LAST SUPP. REL.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['Last Supported Release'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">END OF MAINT.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['End Of Maintenance'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">WARRANTY EXT.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['Last Date for Warranty Extension'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid ${lcStatus === 'EOL' ? '#fca5a5' : '#e2e8f0'};font-size:8.5px;">
                  <div style="color:${lcStatus === 'EOL' ? '#A30080' : '#94a3b8'};font-weight:700;letter-spacing:0.04em;">END OF LIFE</div>
                  <div style="font-family:monospace;font-size:9.5px;color:${lcStatus === 'EOL' ? '#A30080' : '#1D252C'};font-weight:${lcStatus === 'EOL' ? 700 : 400};">${esc(String(lc['End of Life'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">MIGRATION</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#1D252C;">${esc(String(lc['Migration Path'] ?? '—'))}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}`;
      }).join('')}
    </tbody>
  </table>` : ''}

  ${hasCases && !isExec ? `
  <div class="subsection-title">Recent Customer Support Cases (${sd.cases!.length})</div>
  <table style="margin-bottom:18px;">
    <thead>
      <tr>
        <th style="width:95px;">Case #</th>
        <th style="width:55px;">Sev</th>
        <th>Subject</th>
        <th style="width:100px;">Opened By</th>
        <th style="width:100px;">Owner</th>
        <th style="width:80px;">Date</th>
        <th style="width:140px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${sd.cases!.map(c => `<tr>
        <td style="font-family:monospace;font-size:10px;color:#475569;">${esc(c.caseNumber || '—')}</td>
        <td><span class="badge" style="${sevStyle(c.severity)}">${esc(c.severity)}</span></td>
        <td style="font-size:10.5px;">
          <div style="font-weight:600;color:#023E8A;">${esc(c.title || '—')}</div>
          ${c.origin ? `<div style="font-size:9px;color:#94a3b8;margin-top:1px;">via ${esc(c.origin)}</div>` : ''}
        </td>
        <td style="font-size:10px;color:#475569;">${esc(c.openedBy || '—')}</td>
        <td style="font-size:10px;color:#475569;">${esc(c.caseOwner || '—')}</td>
        <td style="font-family:monospace;font-size:10px;">${esc(c.date || '—')}</td>
        <td style="font-size:10px;">${esc(c.statusLabel || '—')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${hasCustFR && !isExec ? `
  <div class="subsection-title">Customer Feature Requests (${sd.featureRequests!.length})</div>
  <table>
    <thead>
      <tr>
        <th style="width:80px;">Ref</th>
        <th>Title</th>
        <th style="width:120px;">Product Family</th>
        <th style="width:80px;">Status</th>
        <th style="width:130px;">Disposition</th>
        <th style="width:85px;">Created</th>
      </tr>
    </thead>
    <tbody>
      ${sd.featureRequests!.map(f => `<tr>
        <td style="font-family:monospace;font-size:10px;font-weight:700;color:#7c3aed;">${esc(f.reference || '—')}</td>
        <td style="font-size:10.5px;font-weight:600;color:#023E8A;">${esc(f.title || '—')}</td>
        <td style="font-size:10px;color:#475569;">${esc(f.productFamily || f.product || '—')}</td>
        <td><span class="badge" style="${stStyle((f.status || '').toLowerCase().replace(/\s+/g, '_'))}">${esc(f.status || '—')}</span></td>
        <td style="font-size:10px;color:#475569;">${esc(f.disposition || '—')}</td>
        <td>${f.createdDate ? dateBadgeHtml(f.createdDate) : '<span style="color:#cbd5e1;">—</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
</div>`;
})()}

<!-- ══════════════════════════════════════
     EXECUTIVE SUMMARY — verdict + KPIs + key findings + recs
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">${hasAccountSection ? 'Section 03' : 'Section 02'} · Part I · Board Briefing</div>
  <div class="section-title">Executive Details</div>

  ${(() => {
    const cust = esc(p.sessionData.customerName || 'The customer');
    const hs = p.healthScore;
    let verdict: string;
    if (hs === null) {
      verdict = `<strong>${cust}</strong>'s Forcepoint estate is under assessment — checklist coverage is incomplete, so a final health score has not been calculated. The findings collected so far appear below.`;
    } else if (criticalCount > 0) {
      verdict = `<strong>${cust}</strong>'s Forcepoint estate scores <strong>${hs}%</strong> with <strong>${criticalCount} critical</strong> and <strong>${highCount} high-severity</strong> finding${criticalCount + highCount === 1 ? '' : 's'} requiring immediate attention. The roadmap that follows prioritizes remediation by risk and operational impact.`;
    } else if (highCount > 0 || hs < 80) {
      verdict = `<strong>${cust}</strong>'s Forcepoint estate scores <strong>${hs}%</strong> with no critical findings, but <strong>${highCount} high-severity</strong> item${highCount === 1 ? '' : 's'} and ${p.allFindings.length - criticalCount - highCount} additional observation${p.allFindings.length - criticalCount - highCount === 1 ? '' : 's'} warrant a focused remediation cycle.`;
    } else {
      verdict = `<strong>${cust}</strong>'s Forcepoint estate scores <strong>${hs}%</strong> — the deployment is broadly healthy. The recommendations below outline targeted enhancements to sustain posture and unlock additional value.`;
    }
    const hb = p.healthBreakdown;
    const breakdownParts: string[] = [];
    if (hb.questionPenalty > 0) breakdownParts.push(`<strong>${hb.questionPenalty}</strong> checklist finding${hb.questionPenalty === 1 ? '' : 's'}`);
    if (hb.eosCount > 0) breakdownParts.push(`<strong>${hb.eosCount}</strong> EoS/EoL component${hb.eosCount === 1 ? '' : 's'} (−${hb.eosCount * 4} pts)`);
    if (hb.warnVersionCount > 0) breakdownParts.push(`<strong>${hb.warnVersionCount}</strong> outdated version${hb.warnVersionCount === 1 ? '' : 's'} (−${hb.warnVersionCount} pts)`);
    if (hb.infraCritical > 0) breakdownParts.push(`<strong>${hb.infraCritical}</strong> infra-critical metric${hb.infraCritical === 1 ? '' : 's'} (−${hb.infraCritical * 3} pts)`);
    if (hb.infraWarn > 0) breakdownParts.push(`<strong>${hb.infraWarn}</strong> infra-warning metric${hb.infraWarn === 1 ? '' : 's'} (−${hb.infraWarn} pts)`);
    const breakdownLine = breakdownParts.length === 0
      ? ''
      : `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--fp-rule-soft);font-size:10.5px;color:var(--fp-ink-muted);line-height:1.7;"><strong style="color:var(--fp-cyan-deep);letter-spacing:0.06em;font-size:9.5px;">SCORE BREAKDOWN ·</strong> ${breakdownParts.join(' · ')}</div>`;
    return `
    <div class="verdict">
      <div class="verdict-label">ASSESSMENT VERDICT</div>
      <div class="verdict-text">${verdict}</div>
      ${breakdownLine}
    </div>`;
  })()}

  ${(() => {
    /* Health gauge + severity bar chart */
    const hs = p.healthScore;
    const gaugeColor = hs === null ? '#94A3B8'
      : hs >= 80 ? 'var(--fp-green)'
      : hs >= 60 ? 'var(--fp-cyan)'
      : hs >= 40 ? 'var(--fp-yellow)'
      : 'var(--fp-red)';
    const gaugeBand = hs === null ? { label: 'NOT SCORED', bg: '#F1F5F9', color: '#64748B' }
      : hs >= 80 ? { label: 'HEALTHY',  bg: 'var(--fp-green-soft)',  color: 'var(--fp-green)' }
      : hs >= 60 ? { label: 'STABLE',   bg: 'var(--fp-cyan-soft)',   color: 'var(--fp-cyan-deep)' }
      : hs >= 40 ? { label: 'AT RISK',  bg: 'var(--fp-yellow-soft)', color: 'var(--fp-warn)' }
      : { label: 'CRITICAL', bg: 'var(--fp-violette-soft)', color: 'var(--fp-violette)' };
    const fillPct = hs === null ? 0 : hs;
    const trackColor = '#E2E8F0';
    const conic = hs === null
      ? `conic-gradient(${trackColor} 0deg 360deg)`
      : `conic-gradient(${typeof gaugeColor === 'string' && gaugeColor.startsWith('var(') ? gaugeColor : gaugeColor} 0deg ${fillPct * 3.6}deg, ${trackColor} ${fillPct * 3.6}deg 360deg)`;

    /* This severity bar chart shows CHECKLIST-only counts ("${p.allFindings.length} total"
       text matches `p.allFindings.length`). For aggregate cross-category counts (Critical
       Findings on the cover and Part 0 breakdown), see `criticalCount` / `highCount`. */
    const maxSev = Math.max(checklistCritical, checklistHigh, checklistMedium, checklistLow, 1);
    const sevRow = (label: string, count: number, color: string) => `
      <div class="exec-sev-row">
        <div class="exec-sev-label" style="color:${color};">${label}</div>
        <div class="exec-sev-track"><div class="exec-sev-fill" style="width:${Math.round((count / maxSev) * 100)}%;background:${color};"></div></div>
        <div class="exec-sev-count" style="color:${count > 0 ? color : 'var(--fp-ink-faint)'};">${count}</div>
      </div>`;

    return `
    <div class="exec-viz-grid">
      <div class="exec-gauge-card">
        <div class="exec-gauge-eyebrow">Overall Health Score</div>
        <div class="exec-gauge-ring" style="background:${conic};">
          <div class="exec-gauge-inner">
            <div class="exec-gauge-score" style="color:${gaugeColor};">${hs === null ? '—' : hs + '%'}</div>
            <div class="exec-gauge-label">Health</div>
          </div>
        </div>
        <div class="exec-gauge-band" style="background:${gaugeBand.bg};color:${gaugeBand.color};">${gaugeBand.label}</div>
      </div>
      <div class="exec-sev-card">
        <div class="exec-sev-title">Findings &amp; Recommendations by Severity (${aggregateTotal} total)</div>
        ${sevRow('CRITICAL', aggregateSev.CRITICAL, 'var(--fp-violette)')}
        ${sevRow('HIGH',     aggregateSev.HIGH,     'var(--fp-red)')}
        ${sevRow('MEDIUM',   aggregateSev.MEDIUM,   'var(--fp-yellow)')}
        ${sevRow('LOW',      aggregateSev.LOW,      'var(--fp-green)')}
      </div>
    </div>

    <div class="exec-kpi-row">
      <div class="exec-kpi" style="border-top:3px solid var(--fp-violette);">
        <div class="exec-kpi-label">Critical + High</div>
        <div class="exec-kpi-val" style="color:${criticalCount + highCount > 0 ? 'var(--fp-violette)' : 'var(--fp-green)'};">${criticalCount + highCount}</div>
        <div class="exec-kpi-sub">${criticalCount + highCount > 0 ? 'Immediate attention' : 'No high-priority gaps'}</div>
      </div>
      <div class="exec-kpi" style="border-top:3px solid var(--fp-cyan);">
        <div class="exec-kpi-label">Checks Done</div>
        <div class="exec-kpi-val" style="color:var(--fp-cyan-deep);">${p.totalAnswered}</div>
        <div class="exec-kpi-sub">of ${p.totalQuestions} (${p.totalQuestions > 0 ? Math.round((p.totalAnswered / p.totalQuestions) * 100) : 0}%)</div>
      </div>
      <div class="exec-kpi" style="border-top:3px solid var(--fp-navy);">
        <div class="exec-kpi-label">Recommendations</div>
        <div class="exec-kpi-val" style="color:var(--fp-navy);">${p.recommendations.length}</div>
        <div class="exec-kpi-sub">${p.recommendations.length > 0 ? 'In remediation plan' : 'None recorded'}</div>
      </div>
      <div class="exec-kpi" style="border-top:3px solid var(--fp-yellow);">
        <div class="exec-kpi-label">Open Actions</div>
        <div class="exec-kpi-val" style="color:${openActions > 0 ? 'var(--fp-warn)' : 'var(--fp-green)'};">${openActions}</div>
        <div class="exec-kpi-sub">of ${p.actionItems.length} total</div>
      </div>
      <div class="exec-kpi" style="border-top:3px solid var(--fp-green);">
        <div class="exec-kpi-label">Products in Scope</div>
        <div class="exec-kpi-val" style="color:var(--fp-green);">${p.selectedTemplates.length}</div>
        <div class="exec-kpi-sub">${p.selectedTemplates.length > 0 ? p.selectedTemplates.map(t => t.name.replace(' HC', '').split(' ')[1] || t.name.split(' ')[0]).slice(0, 3).join(' · ') : '—'}</div>
      </div>
    </div>

    ${(() => {
      const hb = p.healthBreakdown;
      const totalDeducted = hb.questionPenalty + hb.versionPenalty + hb.infraPenalty;
      if (totalDeducted === 0) return '';
      const pills: { label: string; count: number; pts: number; color: string }[] = [];
      if (hb.questionPenalty > 0) pills.push({ label: 'Feature Posture Control', count: hb.questionPenalty, pts: 0, color: 'var(--fp-violette)' });
      if (hb.eosCount > 0) pills.push({ label: 'EoS / EoL Versions', count: hb.eosCount, pts: hb.eosCount * 4, color: 'var(--fp-red)' });
      if (hb.warnVersionCount > 0) pills.push({ label: 'Outdated Versions', count: hb.warnVersionCount, pts: hb.warnVersionCount, color: 'var(--fp-yellow)' });
      if (hb.infraCritical > 0) pills.push({ label: 'Infra Critical (≥85%)', count: hb.infraCritical, pts: hb.infraCritical * 3, color: 'var(--fp-red)' });
      if (hb.infraWarn > 0) pills.push({ label: 'Infra Warning (70–85%)', count: hb.infraWarn, pts: hb.infraWarn, color: 'var(--fp-yellow)' });
      return `
    <div class="exec-breakdown">
      <div class="exec-breakdown-title">Score Deductions</div>
      <div class="exec-deduct-row">
        ${pills.map(pl => `
          <div class="exec-deduct-pill">
            <span class="exec-deduct-pill-dot" style="background:${pl.color};"></span>
            <span style="color:var(--fp-ink);font-weight:500;">${pl.label}</span>
            <span class="exec-deduct-pill-num">${pl.count}${pl.pts > 0 ? ` · −${pl.pts}pt` : ''}</span>
          </div>`).join('')}
      </div>
    </div>`;
    })()}
    `;
  })()}

  <p class="section-lead">
    ${hasAccountSection
      ? `Building on the account &amp; licensing context established in the preceding section, these Executive Details consolidate the headline metrics, the highest-priority findings, and the strategic recommendations into a single decision-ready view.`
      : `These Executive Details consolidate the headline metrics, the highest-priority findings, and the strategic recommendations into a single decision-ready view.`}
    Detailed evidence is presented in <em>Part II — Technical Assessment</em>, and the implementation plan in <em>Part III — Roadmap &amp; Strategy</em>.
  </p>

  ${(() => {
    /* ─── Executive Quick-Look Checklist ────────────────────────────
       Six yes/no questions an executive can scan in 5 seconds.
       Replaces the old long Key Observations card grid — detail lives
       in Parts II and III; this widget answers the "should I be
       worried?" question per dimension. */
    const today = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Q4: licenses with expiry within 6 months
    const licenseExpiringSoon = (p.sessionData.licenses ?? []).filter((l) => {
      if (!l.expiry || l.expiry === '—') return false;
      const d = new Date(l.expiry).getTime();
      return !Number.isNaN(d) && d > today && d - today < 180 * day;
    }).length;
    const licenseExpired = (p.sessionData.licenses ?? []).filter((l) => {
      if (!l.expiry || l.expiry === '—') return false;
      const d = new Date(l.expiry).getTime();
      return !Number.isNaN(d) && d <= today;
    }).length;

    // Q5: hardware warranty — expired or expiring (status != active OR
    //     last-warranty date in past / approaching)
    const hardwareIssues = (p.sessionData.hardware ?? []).filter((h) => {
      const ws = (h.warrantyStatus || '').toLowerCase();
      return ws && ws !== 'active';
    }).length;

    // Q3: critical-priority version upgrade proposals
    const criticalUpgrades = p.versionUpgrades.filter((v) => v.priority === 'critical').length;

    type CheckItem = {
      icon: string;
      question: string;
      count: number;
      severity: 'critical' | 'warn' | 'ok' | 'neutral';
      evidence: string;
      /* When a card asks a status question rather than a problem question,
         override the default YES/WATCH/NO verdict text (e.g. HEALTHY, AT RISK). */
      verdictOverride?: string;
    };
    const items: CheckItem[] = [
      {
        icon: '🖥',
        question: 'Server resource issues?',
        count: infraCritCount + infraHighCount,
        severity: infraCritCount > 0 ? 'critical' : infraHighCount > 0 ? 'warn' : 'ok',
        evidence: infraCritCount + infraHighCount === 0
          ? 'All monitored servers below 70% CPU / RAM / disk thresholds.'
          : `${infraCritCount} metric${infraCritCount === 1 ? '' : 's'} ≥ 85% · ${infraHighCount} between 70–85%.`,
      },
      {
        icon: '📦',
        question: 'End-of-Support products in production?',
        count: eosEntries.length,
        severity: eosEntries.length > 0 ? 'critical' : 'ok',
        evidence: eosEntries.length === 0
          ? 'All components on supported, vendor-maintained releases.'
          : `${eosEntries.length} component${eosEntries.length === 1 ? '' : 's'} past EoS — no patches, no vendor accountability.`,
      },
      {
        icon: '⬆',
        question: 'Critical upgrades required?',
        count: criticalUpgrades,
        severity: criticalUpgrades > 0 ? 'critical' : warnEntries.length > 0 ? 'warn' : 'ok',
        evidence: criticalUpgrades > 0
          ? `${criticalUpgrades} upgrade${criticalUpgrades === 1 ? '' : 's'} flagged CRITICAL by analyst.`
          : warnEntries.length > 0
            ? `${warnEntries.length} component${warnEntries.length === 1 ? '' : 's'} have updates available — none flagged critical.`
            : 'Estate is on current GA releases.',
      },
      {
        icon: '⏳',
        question: 'License expiry approaching?',
        count: licenseExpiringSoon + licenseExpired,
        severity: licenseExpired > 0 ? 'critical' : licenseExpiringSoon > 0 ? 'warn' : 'ok',
        evidence: licenseExpired > 0
          ? `${licenseExpired} license${licenseExpired === 1 ? '' : 's'} already expired · ${licenseExpiringSoon} expiring within 6 months.`
          : licenseExpiringSoon > 0
            ? `${licenseExpiringSoon} license${licenseExpiringSoon === 1 ? '' : 's'} expiring within 6 months — renewal cycle ahead.`
            : 'All licenses active beyond the 6-month renewal horizon.',
      },
      {
        icon: '🛠',
        question: 'Hardware warranty expired or expiring?',
        count: hardwareIssues,
        severity: hardwareIssues > 0 ? 'warn' : 'ok',
        evidence: hardwareIssues > 0
          ? `${hardwareIssues} appliance${hardwareIssues === 1 ? '' : 's'} with warranty status other than ACTIVE — extension or refresh required.`
          : 'All Forcepoint appliances under active warranty.',
      },
      {
        icon: '📜',
        question: 'License extension / gap recommendation?',
        count: p.licenseGaps?.length ?? 0,
        severity: (p.licenseGaps?.length ?? 0) > 0 ? 'warn' : 'ok',
        evidence: (p.licenseGaps?.length ?? 0) > 0
          ? `${p.licenseGaps!.length} license-gap item${p.licenseGaps!.length === 1 ? '' : 's'} identified — see Recommended License Extension.`
          : 'No gap between current entitlement and observed deployment scope.',
      },
    ];

    /* Status-style cards — what we're proposing to the customer. */
    items.push({
      icon: '💡',
      question: 'Recommendations defined?',
      count: p.recommendations.length,
      severity: p.recommendations.length > 0 ? 'ok' : 'warn',
      evidence: p.recommendations.length > 0
        ? `${p.recommendations.length} recommendation${p.recommendations.length === 1 ? '' : 's'} captured · prioritized in Part III.`
        : 'No recommendations captured — Part III roadmap will be empty.',
      verdictOverride: p.recommendations.length > 0 ? `${p.recommendations.length} REC` : 'NONE',
    });

    const doneActions = p.actionItems.filter((a) => a.status === 'done').length;
    items.push({
      icon: '🎯',
      question: 'Action plan items?',
      count: p.actionItems.length,
      severity: p.actionItems.length > 0 ? 'ok' : 'warn',
      evidence: p.actionItems.length > 0
        ? `${openActions} open · ${doneActions} done · execution plan in Part III.`
        : 'No action items defined — no execution plan captured.',
      verdictOverride: p.actionItems.length > 0 ? `${p.actionItems.length} ACTIONS` : 'NONE',
    });

    /* Agent health — meaningful when DLP or Web is in scope and the
       analyst generated an assessment in Step 7. Evidence text adapts to
       which coverage modules are present so the report stays honest in
       Web-only deployments (no "DLP coverage at risk" copy). */
    if ((p.selectedProducts.data || p.selectedProducts.web) && p.endpointCompatAssessment) {
      const cs = p.endpointCompatAssessment.compatibilityStatus;
      const coverageNarrative =
        p.selectedProducts.data && p.selectedProducts.web ? 'DLP and Hybrid Web coverage'
        : p.selectedProducts.data ? 'DLP coverage'
        : 'Hybrid Web coverage';
      items.push({
        icon: '💻',
        question: 'F1E agent fleet healthy?',
        count: cs === 'SUPPORTED' ? 0 : 1,
        severity: cs === 'SUPPORTED' ? 'ok' : cs === 'AT_RISK' ? 'warn' : 'critical',
        evidence: cs === 'SUPPORTED'
          ? `Fleet aligned with supported baseline (v${p.endpointCompatAssessment.minimumRequiredAgent}+).`
          : cs === 'AT_RISK'
            ? `Some endpoints below v${p.endpointCompatAssessment.minimumRequiredAgent} — see Agent Compatibility.`
            : `Compatibility gap detected — ${coverageNarrative} at risk on browser channel.`,
        verdictOverride: cs === 'SUPPORTED' ? 'HEALTHY' : cs === 'AT_RISK' ? 'AT RISK' : 'CRITICAL',
      });
    }

    /* Recommended Enhancements — pulls short names from the catalogue. */
    const enhSummary = p.selectedEnhancements.slice(0, 3).map((id) => {
      const e = ENHANCEMENTS.find((x) => x.id === id);
      return e?.shortName ?? id;
    }).join(', ');
    items.push({
      icon: '✨',
      question: 'Recommended enhancements?',
      count: p.selectedEnhancements.length,
      severity: p.selectedEnhancements.length > 0 ? 'ok' : 'neutral',
      evidence: p.selectedEnhancements.length > 0
        ? `${enhSummary}${p.selectedEnhancements.length > 3 ? ` +${p.selectedEnhancements.length - 3} more` : ''}.`
        : 'No specific enhancements proposed in this assessment.',
      verdictOverride: p.selectedEnhancements.length > 0 ? `${p.selectedEnhancements.length} ITEMS` : 'NONE',
    });

    const hasProSupport = p.selectedEnhancements.includes('professional-support');
    items.push({
      icon: '🤝',
      question: 'Forcepoint Professional Services suggested?',
      count: hasProSupport ? 1 : 0,
      severity: hasProSupport ? 'ok' : 'neutral',
      evidence: hasProSupport
        ? 'Forcepoint Professional Services recommended for upgrade / implementation execution.'
        : 'Not recommended in this assessment.',
      verdictOverride: hasProSupport ? 'YES' : 'NO',
    });

    const hasEnterpriseSup = p.selectedEnhancements.includes('enhanced-enterprise-support');
    items.push({
      icon: '🎖',
      question: 'Enhanced / Enterprise Support suggested?',
      count: hasEnterpriseSup || supportUpgradeNeeded ? 1 : 0,
      severity: hasEnterpriseSup || supportUpgradeNeeded ? 'ok' : 'neutral',
      evidence: supportUpgradeNeeded
        ? `Support tier upgrade flagged: ${esc(p.sessionData.supportLevel || '—')} → ${esc(p.sessionData.recommendedSupportLevel || '—')}.`
        : hasEnterpriseSup
          ? 'Enhanced / Enterprise Support tier recommended for this deployment.'
          : `Current tier (${p.sessionData.supportLevel || 'Standard'}) aligned with deployment scope.`,
      verdictOverride: hasEnterpriseSup || supportUpgradeNeeded ? 'YES' : 'NO',
    });

    const tone = (sev: 'critical' | 'warn' | 'ok' | 'neutral') => sev === 'critical'
      ? { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', pillBg: '#A30080', pillTxt: '#fff', verdict: 'YES' }
      : sev === 'warn'
        ? { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', pillBg: '#FBBF24', pillTxt: '#7C2D12', verdict: 'WATCH' }
        : sev === 'ok'
          ? { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', pillBg: '#16A34A', pillTxt: '#fff', verdict: 'NO' }
          : { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', pillBg: '#CBD5E1', pillTxt: '#334155', verdict: 'NO' };

    return `
  <div class="subsection-title">Key Observations · Executive Quick-Look</div>
  <p style="font-size:10.5px;color:var(--fp-ink-faint);margin:-4px 0 10px;font-style:italic;line-height:1.55;">
    Six yes/no questions answered in one glance. Detail lives in Parts II–III.
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;page-break-inside:avoid;">
    ${items.map((it) => {
      const t = tone(it.severity);
      /* Default verdict text follows the t.verdict + count pattern; cards
         that ask status questions (Healthy / At Risk / NONE / 5 RECS …)
         override the label via verdictOverride. */
      const pillText = it.verdictOverride ?? `${t.verdict}${it.count > 0 ? ` · ${it.count}` : ''}`;
      return `<div style="background:${t.bg};border:1px solid ${t.border};border-left:3px solid ${t.color};border-radius:6px;padding:10px 13px;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;">${it.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
            <span style="font-size:11.5px;font-weight:700;color:var(--fp-ink);line-height:1.3;flex:1;">${esc(it.question)}</span>
            <span style="font-size:9px;font-weight:800;letter-spacing:0.08em;color:${t.pillTxt};background:${t.pillBg};border-radius:3px;padding:2px 7px;flex-shrink:0;white-space:nowrap;">${esc(pillText)}</span>
          </div>
          <div style="font-size:10.5px;color:#475569;line-height:1.55;">${esc(it.evidence)}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
  })()}

  ${(() => {
    if (p.recommendations.length === 0) return '';
    /* If the analyst flagged any recommendations as ★ featured, use that selection.
       Otherwise fall back to the first 6 (was 12) for a scannable executive view. */
    const featured = p.recommendations.filter((r) => r.featured);
    const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const list = (featured.length > 0
      ? [...featured]
      : [...p.recommendations]
    ).sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)).slice(0, 6);
    const curatedNote = featured.length > 0
      ? '<span style="font-size:10px;color:var(--fp-cyan-deep);font-weight:600;margin-left:8px;letter-spacing:0.04em;">★ ANALYST-CURATED</span>'
      : '';
    return `
  <div class="subsection-title" style="margin-top:22px;">High-Level Recommendations${curatedNote}</div>
  <div class="rec-card-grid">
    ${list.map(r => `
      <div class="rec-mini-card rec-mini-card-${r.priority}">
        <div class="rec-mini-head">
          <span class="badge badge-${r.priority === 'critical' ? 'critical' : r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'medium' : 'low'}">${esc(r.priority.toUpperCase())}</span>
          <span class="rec-mini-title">${esc(r.title)}</span>
        </div>
        ${r.detail ? `<div class="rec-mini-detail">${esc(r.detail)}</div>` : ''}
        <div class="rec-mini-foot">
          ${r.product ? `<span style="color:var(--fp-navy);font-weight:700;">${esc(r.product)}</span>` : ''}
          ${r.effort ? `<span>· effort ${esc(r.effort)}</span>` : ''}
          <span style="margin-left:auto;color:var(--fp-cyan-deep);font-weight:700;">${esc(r.category.replace(/_/g, ' '))}</span>
        </div>
      </div>`).join('')}
  </div>
  <p style="font-size:10px;color:var(--fp-ink-faint);font-style:italic;margin:-2px 0 14px;">
    Full detail with descriptions, target versions, and release notes is in <em>Part III · Findings, Observations &amp; Recommendations</em>.
  </p>`;
  })()}

  ${(() => {
    if (p.actionItems.length === 0) return '';
    const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    /* ★ featured actions drive Top Priority Actions when set; otherwise fall back to
       the top 3 by priority, preserving behaviour for sessions that pre-date the feature flag. */
    const featured = p.actionItems.filter((a) => a.featured);
    const top = featured.length > 0
      ? [...featured].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9))
      : [...p.actionItems].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)).slice(0, 3);
    const remaining = p.actionItems.length - top.length;
    const curatedNote = featured.length > 0
      ? '<span style="font-size:10px;color:var(--fp-cyan-deep);font-weight:600;margin-left:8px;letter-spacing:0.04em;">★ ANALYST-CURATED</span>'
      : '';
    return `
  <div class="subsection-title" style="margin-top:22px;">Top Priority Actions${curatedNote}</div>
  <ul style="list-style:none;padding:0;margin:0 0 10px;">
    ${top.map((a, i) => `<li style="display:flex;gap:12px;align-items:flex-start;padding:9px 12px;background:var(--fp-surface-alt);border:1px solid var(--fp-rule);border-radius:8px;margin-bottom:6px;">
      <span style="font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-weight:700;color:var(--fp-cyan-deep);font-size:13px;min-width:18px;">${i + 1}</span>
      <span style="flex:1;font-size:12px;color:var(--fp-ink);font-weight:500;line-height:1.5;">${esc(a.task)}</span>
      <span class="badge" style="${sevStyle(a.priority.toUpperCase())};flex-shrink:0;">${esc(a.priority.toUpperCase())}</span>
      ${a.dueDate ? `<span style="font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-size:10.5px;color:var(--fp-ink-muted);flex-shrink:0;">${esc(a.dueDate)}</span>` : ''}
    </li>`).join('')}
  </ul>
  <p style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;margin-bottom:0;">
    ${remaining > 0 ? `+${remaining} additional action${remaining === 1 ? '' : 's'} · ` : ''}Full execution plan with owners, target dates, and status is in <em>Part III · Action Items &amp; Next Steps</em>.
  </p>`;
  })()}

  ${p.dlpDashboardSummary && p.dlpDashboardSummary.totalIncidents > 0 ? (() => {
    const d = p.dlpDashboardSummary!;
    const total = d.totalIncidents || 1;
    const sev = d.severity;
    const sevHighPct = Math.round((sev.high   / total) * 1000) / 10;
    const sevMedPct  = Math.round((sev.medium / total) * 1000) / 10;
    const sevLowPct  = Math.round((sev.low    / total) * 1000) / 10;

    /* Build a donut gradient for severity */
    const segs: { color: string; from: number; to: number }[] = [];
    let ang = 0;
    if (sev.high   > 0) { const slice = (sev.high   / total) * 360; segs.push({ color: 'var(--fp-violette)', from: ang, to: ang + slice }); ang += slice; }
    if (sev.medium > 0) { const slice = (sev.medium / total) * 360; segs.push({ color: 'var(--fp-yellow)',   from: ang, to: ang + slice }); ang += slice; }
    if (sev.low    > 0) { const slice = (sev.low    / total) * 360; segs.push({ color: 'var(--fp-green)',    from: ang, to: ang + slice }); ang += slice; }
    const donutGrad = segs.length === 0
      ? `conic-gradient(#E2E8F0 0deg 360deg)`
      : `conic-gradient(${segs.map(s => `${s.color} ${s.from}deg ${s.to}deg`).join(', ')})`;

    const actionColor = (act: string) => /blocked/i.test(act) ? 'var(--fp-violette)'
      : /quarantin/i.test(act) ? 'var(--fp-red)'
      : /released/i.test(act) ? 'var(--fp-yellow)'
      : /encrypted/i.test(act) ? 'var(--fp-cyan)'
      : /permitted/i.test(act) ? 'var(--fp-green)'
      : 'var(--fp-ink-muted)';
    const maxAction = Math.max(...d.actions.map(a => a.count), 1);
    const maxChannel = Math.max(...d.topChannels.map(c => c.count), 1);

    return `
    <div class="subsection-title" style="margin-top:26px;">DLP Activity Snapshot · ${esc(d.dateRange)}</div>
    <div style="font-size:11px;color:var(--fp-ink-muted);margin:-4px 0 12px;line-height:1.55;">
      Source: <span class="mono" style="color:var(--fp-navy);">${esc(d.fileName)}</span>
      · Report generated ${esc(d.reportCreatedAt)}
      · Filter: ${esc(d.ignoredFilter)}
      · Individual user identifiers from the DLP Manager export have been aggregated to department level.
    </div>

    <!-- Severity donut + Action breakdown -->
    <div style="display:grid;grid-template-columns:230px 1fr;gap:16px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Severity</div>
        <div style="width:150px;height:150px;border-radius:50%;background:${donutGrad};margin:0 auto;display:flex;align-items:center;justify-content:center;">
          <div style="width:96px;height:96px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="font-size:22px;font-weight:700;color:var(--fp-navy);font-family:'Inter',sans-serif;line-height:1;letter-spacing:-0.02em;">${total.toLocaleString()}</div>
            <div style="font-size:8px;color:var(--fp-ink-faint);letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;font-weight:700;">Total</div>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:5px;font-size:10.5px;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-violette);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">High</span><span class="mono" style="font-weight:700;">${sev.high.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevHighPct}%</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-yellow);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Medium</span><span class="mono" style="font-weight:700;">${sev.medium.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevMedPct}%</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;background:var(--fp-green);border-radius:2px;"></span><span style="flex:1;text-align:left;color:var(--fp-ink);font-weight:500;">Low</span><span class="mono" style="font-weight:700;">${sev.low.toLocaleString()}</span><span class="mono" style="color:var(--fp-ink-faint);">${sevLowPct}%</span></div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:16px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Incidents by Action</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${d.actions.map(a => {
            const w = Math.max(1, Math.round((a.count / maxAction) * 100));
            const col = actionColor(a.action);
            return `<div style="display:grid;grid-template-columns:150px 1fr 75px 50px;gap:10px;align-items:center;font-size:11px;">
              <div style="font-weight:600;color:var(--fp-ink);font-size:10.5px;">${esc(a.action)}</div>
              <div style="height:14px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;"><div style="width:${w}%;height:100%;background:${col};border-radius:3px;"></div></div>
              <div class="mono" style="text-align:right;font-weight:700;color:var(--fp-ink);">${a.count.toLocaleString()}</div>
              <div class="mono" style="text-align:right;color:var(--fp-ink-faint);font-size:10.5px;">${a.pct}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Top Channels + Top URL Categories -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top Channels</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${d.topChannels.map(c => {
            const w = Math.max(1, Math.round((c.count / maxChannel) * 100));
            return `<div style="display:grid;grid-template-columns:120px 1fr 70px;gap:8px;align-items:center;font-size:10.5px;">
              <div style="font-weight:500;color:var(--fp-ink);">${esc(c.channel)}</div>
              <div style="height:11px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;"><div style="width:${w}%;height:100%;background:var(--fp-navy);border-radius:3px;"></div></div>
              <div class="mono" style="text-align:right;font-weight:700;color:var(--fp-ink);">${c.count.toLocaleString()}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top URL Categories</div>
        <table style="margin-bottom:0;box-shadow:none;border:1px solid var(--fp-rule);">
          <thead>
            <tr>
              <th style="padding:6px 10px;font-size:9px;">URL Category</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:60px;">High</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:60px;">Med</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:60px;">Low</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:70px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${d.topUrlCategories.map(u => `<tr>
              <td style="padding:6px 10px;font-size:10.5px;color:var(--fp-ink);">${esc(u.category)}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:${u.high > 0 ? 'var(--fp-violette)' : 'var(--fp-ink-faint)'};font-weight:${u.high > 0 ? 700 : 400};">${u.high.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:${u.medium > 0 ? 'var(--fp-warn)' : 'var(--fp-ink-faint)'};font-weight:${u.medium > 0 ? 600 : 400};">${u.medium.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--fp-ink-muted);">${u.low.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--fp-ink);">${u.total.toLocaleString()}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top Policies + Department Activity -->
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:12px;page-break-inside:avoid;">
      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-violette);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:10px;">Top Policies Triggered</div>
        <table style="margin-bottom:0;box-shadow:none;border:1px solid var(--fp-rule);">
          <thead>
            <tr>
              <th style="padding:6px 10px;font-size:9px;">Policy</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:50px;">High</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:50px;">Med</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:55px;">Low</th>
              <th style="padding:6px 10px;font-size:9px;text-align:right;width:65px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${d.topPolicies.map(pl => `<tr>
              <td style="padding:6px 10px;font-size:10.5px;color:var(--fp-ink);font-weight:500;font-family:'JetBrains Mono',monospace;">${esc(pl.policy)}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:${pl.high > 0 ? 'var(--fp-violette)' : 'var(--fp-ink-faint)'};font-weight:${pl.high > 0 ? 700 : 400};">${pl.high.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:${pl.medium > 0 ? 'var(--fp-warn)' : 'var(--fp-ink-faint)'};">${pl.medium.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--fp-ink-muted);">${pl.low.toLocaleString()}</td>
              <td style="padding:6px 10px;font-size:10px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--fp-ink);">${pl.total.toLocaleString()}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-yellow);border-radius:6px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-ink-faint);margin-bottom:6px;">Activity by Department</div>
        <div style="font-size:9.5px;color:var(--fp-ink-faint);margin-bottom:10px;font-style:italic;">Anonymized roll-up — individual user identifiers redacted</div>
        ${d.topDepartments.length === 0 ? `
          <div style="font-size:10.5px;color:var(--fp-ink-faint);font-style:italic;">No department attribution available in the source report.</div>
        ` : (() => {
          const maxDept = Math.max(...d.topDepartments.map(x => x.total), 1);
          return `<div style="display:flex;flex-direction:column;gap:6px;">
            ${d.topDepartments.map(dept => {
              const w = Math.max(1, Math.round((dept.total / maxDept) * 100));
              return `<div style="display:grid;grid-template-columns:1fr 60px;gap:8px;align-items:center;font-size:10.5px;">
                <div>
                  <div style="font-weight:500;color:var(--fp-ink);margin-bottom:3px;">${esc(dept.department)}</div>
                  <div style="height:8px;background:var(--fp-rule-soft);border-radius:2px;overflow:hidden;"><div style="width:${w}%;height:100%;background:var(--fp-yellow);border-radius:2px;"></div></div>
                </div>
                <div class="mono" style="text-align:right;font-weight:700;color:var(--fp-ink);">${dept.total.toLocaleString()}</div>
              </div>`;
            }).join('')}
          </div>`;
        })()}
      </div>
    </div>

    <!-- Risk observations -->
    <div style="background:var(--fp-cyan-soft);border:1px solid #BFE3EC;border-left:4px solid var(--fp-cyan);border-radius:6px;padding:12px 16px;margin-top:14px;">
      <div style="font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-cyan-deep);margin-bottom:6px;">DLP Activity Observations</div>
      <ul style="margin:0;padding-left:18px;">
        ${d.topRiskFindings.map(f => `<li style="font-size:11px;color:var(--fp-ink);line-height:1.6;margin-bottom:3px;">${esc(f)}</li>`).join('')}
      </ul>
    </div>
    `;
  })() : ''}
</div>

</div><!-- /content (Part I closes here) -->
<!--VARIANT:TECH_ONLY:END-->
<!-- end of Part I (tech-only) -->

<!-- ══════════════════════════════════════
     PART II — TECHNICAL ASSESSMENT
     Stripped from the Executive Risk Briefing variant via VARIANT:TECH_ONLY
     markers (regex-stripped post-render). CISO briefing skips all the
     technical evidence and jumps from Part I to the roadmap.
══════════════════════════════════════ -->

<!-- ══════════════════════════════════════
     PART 2 — SECURITY POSTURE  (executive variant)
     Smooth Part 1 → Part 2 → Part 3 numbering for the briefing,
     and Section 13 (Posture Telemetry) under its own chapter so
     it doesn't look orphaned between Executive Briefing (Part 1)
     and Roadmap (Part 3). Shared postureSection const renders the
     dashboard; the eyebrow inside the const flips to "Section 3 ·
     Part 2 ·..." in executive mode (see exec-aware section eyebrow
     in the postureSection block).
══════════════════════════════════════ -->
<!--VARIANT:EXEC_ONLY:START-->
<div class="chapter">
  <div class="chapter-part">PART 2</div>
  <div class="chapter-title">Security Posture</div>
  <div class="chapter-sub">Live DLP telemetry pulled from the customer's Forcepoint REST API — categorical rollups only, no individual user names cross this boundary.</div>
</div>

<div class="content">
${postureSection}

<!-- ── Security Posture supplementals — hoisted out of Section 03 / Section 07 so
        the executive variant doesn't need to bounce across PARTs to surface the
        headline observations, recommendations, and endpoint risks. -->
${securityPostureExtras}
</div><!-- /content (executive Posture Telemetry closes here) -->
<!--VARIANT:EXEC_ONLY:END-->

<!--VARIANT:TECH_ONLY:START-->
<div class="chapter">
  <div class="chapter-part">PART II</div>
  <div class="chapter-title">Technical Assessment</div>
  <div class="chapter-sub">The supporting evidence behind the verdict — infrastructure inventory, software version &amp; end-of-life posture, server health, DLP Server Telemetry, certificate validity, and per-product checklist findings.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     INFRASTRUCTURE & VERSION REVIEW
══════════════════════════════════════ -->
${versionGroups.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 04 · Part II · Version Lifecycle</div>
  <div class="section-title">Infrastructure &amp; Version Review</div>
  <div class="subsection-title" style="margin-top:0;margin-bottom:14px;">Software Version &amp; End-of-Life Analysis</div>

  <!-- Summary bar -->
  <div class="vsb">
    <div class="vsb-card" style="background:rgba(22,163,74,0.08);">
      <div class="vsb-val" style="color:#69BC00;">${vCounts.ok}</div>
      <div class="vsb-label">Up to Date</div>
    </div>
    <div class="vsb-card" style="background:rgba(217,119,6,0.08);">
      <div class="vsb-val" style="color:#B58800;">${vCounts.warning}</div>
      <div class="vsb-label">Updates Available</div>
    </div>
    <div class="vsb-card" style="background:rgba(220,38,38,0.08);">
      <div class="vsb-val" style="color:#A30080;">${vCounts.critical}</div>
      <div class="vsb-label">Critical / EoS</div>
    </div>
    <div class="vsb-card" style="background:rgba(100,116,139,0.08);">
      <div class="vsb-val" style="color:#64748b;">${vCounts.unknown}</div>
      <div class="vsb-label">Not Entered</div>
    </div>
  </div>

  ${versionGroups.map(({ grp, entries }) => `
  <div class="vg" style="border-color:${grp.border};">
    <div class="vg-hdr" style="background:${grp.bg};border-bottom:1.5px solid ${grp.border};color:${grp.color};">
      <span style="font-size:15px;">${grp.emoji}</span>
      <span>${esc(grp.label)}</span>
      <span class="vg-tag" style="background:${grp.color}22;color:${grp.color};border:1px solid ${grp.color}33;">${entries.length} component${entries.length !== 1 ? 's' : ''}</span>
    </div>
    <table class="vg-table" style="margin-bottom:0;table-layout:fixed;font-size:10px;">
      <colgroup>
        <col style="width:18%;">  <!-- Component -->
        <col style="width:11%;">  <!-- Product -->
        <col style="width:9%;">   <!-- Installed -->
        <col style="width:10%;">  <!-- Latest GA -->
        <col style="width:9%;">   <!-- Release Date -->
        <col style="width:10%;">  <!-- EoSale -->
        <col style="width:10%;">  <!-- EoM -->
        <col style="width:10%;">  <!-- EoS -->
        <col style="width:13%;">  <!-- Status -->
      </colgroup>
      <thead>
        <tr>
          <th>Component</th>
          <th>Product</th>
          <th>Installed</th>
          <th>Latest GA</th>
          <th title="Release Date">Released</th>
          <th title="End of Sale">EoSale</th>
          <th title="End of Maintenance">EoM</th>
          <th title="End of Support">EoS</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(({ id, entry }) => {
          const def = CATALOG[id];
          const isCustomRow = !def || entry.isCustom;
          const latest = def
            ? resolveLatest(def, p.versionData)
            : { latestVersion: entry.customLatestVersion || '—', releaseDate: entry.customReleaseDate || '—' };
          const dates  = def
            ? resolveInstalledDates(entry.installedVersion, def, p.versionData)
            : {
                eoSale: entry.customEoSale || '—',
                eoMaintenance: entry.customEoMaintenance || '—',
                eoSupport: entry.customEoSupport || '—',
              };
          const effStatus = entry.statusOverride ?? entry.status;
          const sc     = STATUS_CFG[effStatus];
          const isFSM  = entry.component === 'FSM Server';
          const isSQL  = entry.component === 'SQL Server';
          return `<tr>
            <td style="word-break:break-word;">
              <div style="font-weight:600;font-size:10.5px;color:#1D252C;line-height:1.35;">
                ${esc(entry.component)}
                ${isFSM ? '<span style="font-size:7.5px;font-weight:700;background:#023E8A14;color:#023E8A;border:1px solid #023E8A26;padding:1px 4px;border-radius:3px;margin-left:3px;">FSM</span>' : ''}
                ${isSQL ? '<span style="font-size:7.5px;font-weight:700;background:#64748b14;color:#64748b;border:1px solid #64748b26;padding:1px 4px;border-radius:3px;margin-left:3px;">SQL</span>' : ''}
                ${isCustomRow ? '<span style="font-size:7.5px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:1px 4px;border-radius:3px;margin-left:3px;">CUSTOM</span>' : ''}
              </div>
            </td>
            <td style="font-size:9.5px;color:#94a3b8;word-break:break-word;line-height:1.35;">${esc(entry.productLabel)}</td>
            <td class="mono" style="font-weight:700;color:#1D252C;font-size:9.5px;word-break:break-word;">${esc(entry.installedVersion || '—')}</td>
            <td><span class="mono" style="font-size:9.5px;font-weight:600;background:#f0f9ff;border:1px solid #bae6fd;border-radius:3px;padding:2px 5px;display:inline-block;word-break:break-word;">${esc(latest.latestVersion)}</span></td>
            <td class="mono" style="font-size:9.5px;color:#475569;word-break:break-word;">${esc(latest.releaseDate)}</td>
            <td>${dateBadgeHtml(dates.eoSale)}</td>
            <td>${dateBadgeHtml(dates.eoMaintenance)}</td>
            <td>${dateBadgeHtml(dates.eoSupport)}</td>
            <td style="word-break:keep-all;">
              <span class="badge" style="background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};font-size:8.5px;">${esc(sc.label)}</span>
              ${entry.statusOverride ? '<div style="font-size:7px;font-weight:800;font-family:monospace;color:#92400e;margin-top:3px;letter-spacing:0.04em;">MANUAL</div>' : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`).join('')}
</div>` : ''}

<!-- ══════════════════════════════════════
     SERVER INFRASTRUCTURE
══════════════════════════════════════ -->
${activeServers.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 05 · Part II · Server Health</div>
  <div class="section-title">Server Infrastructure</div>
  ${activeServers.map(s => {
    const name = s.hostname || SRV_LABELS[s.type] || s.type;
    const driveChips = s.drives.map(d => {
      const dp = pct(d.usedGB, d.totalGB);
      const c = dp >= 85 ? '#A30080' : dp >= 70 ? '#B58800' : '#69BC00';
      return `<span class="chip" style="background:${c}15;color:${c};">${esc(d.label || 'Drive')} ${dp}% (${d.usedGB}/${d.totalGB} GB)</span>`;
    }).join('');
    let ramChip = '';
    if (s.ramTotalGB > 0) {
      const rp = pct(s.ramUsedGB, s.ramTotalGB);
      const rc = rp >= 85 ? '#A30080' : rp >= 70 ? '#B58800' : '#69BC00';
      ramChip = `<span class="chip" style="background:${rc}15;color:${rc};">RAM ${rp}% (${s.ramUsedGB}/${s.ramTotalGB} GB)</span>`;
    }
    let cpuChip = '';
    if (s.cpuUsagePercent > 0) {
      const cc = s.cpuUsagePercent >= 85 ? '#A30080' : s.cpuUsagePercent >= 70 ? '#B58800' : '#69BC00';
      cpuChip = `<span class="chip" style="background:${cc}15;color:${cc};">CPU ${s.cpuUsagePercent}%${s.cpuCores > 0 ? ` (${s.cpuCores} cores)` : ''}</span>`;
    }
    const osLine = s.osName
      ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">
           <strong style="color:#023E8A;font-weight:600;">OS:</strong> ${esc(s.osName)}${s.osVersion ? ` <span style="font-family:monospace;color:#94a3b8;">· ${esc(s.osVersion)}</span>` : ''}
         </div>`
      : '';
    return `<div class="srv">
      <div class="srv-hdr">
        <div style="min-width:200px;">
          <div style="font-weight:700;font-size:12.5px;color:#023E8A;">${esc(name)}</div>
          ${osLine}
        </div>
        <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;min-width:120px;">${esc(SRV_LABELS[s.type] || s.type)}</div>
        ${s.notes ? `<div style="font-size:10px;color:#64748b;font-style:italic;margin-left:auto;">${esc(s.notes)}</div>` : ''}
      </div>
      <div class="srv-metrics">${driveChips}${ramChip}${cpuChip}${(!driveChips && !ramChip && !cpuChip) ? '<span style="font-size:10.5px;color:#cbd5e1;">No metrics recorded</span>' : ''}</div>
    </div>`;
  }).join('')}
</div>` : ''}

<!-- ══════════════════════════════════════
     DLP SERVER BUNDLE ANALYSIS
══════════════════════════════════════ -->
${p.dlpBundles.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 06 · Part II · DLP Telemetry</div>
  <div class="section-title">DLP Telemetry File Analysis</div>

  ${p.dlpBundles.map(b => {
    const sys = b.systemInfo;
    const hw  = b.hardware;
    const hf  = b.osHotfixes;
    const svc = b.services;
    const sql = b.sqlServer;
    const db  = b.database;
    const fp  = b.forcepointProducts;
    const ep  = b.endpointClients;
    const pol = b.activePolicies;

    const memPct = sys ? memoryUsagePct(sys) : 0;
    const memColor = memPct >= 85 ? '#A30080' : memPct >= 70 ? '#B58800' : '#69BC00';
    const diskColor = hw && hw.diskCUsagePercent >= 85 ? '#A30080' : hw && hw.diskCUsagePercent >= 70 ? '#B58800' : '#69BC00';

    const headerHost = sys?.hostName || b.bundleName;
    const headerSub = [sys?.osName, fp?.dlpVersion && `DLP ${fp.dlpVersion}`].filter(Boolean).join(' · ');

    /* System Properties table dropped from the report — non-executive
       detail that bloats the page. Domain / Logon Server / Run-As were
       already redacted; the rest (Host / OS / BIOS / Boot time) is
       available in the wizard's DLP Server Info bundle card for analysts
       who need it. */

    // ── Network adapters ──
    const netRows = sys?.networkAdapters.map(n => `
      <tr>
        <td style="font-weight:600;color:#023E8A;width:35%;font-size:10px;">${esc(n.name)}${n.connectionName ? `<br><span style="font-weight:400;color:#94a3b8;font-size:9.5px;">${esc(n.connectionName)}</span>` : ''}</td>
        <td style="font-family:monospace;font-size:10px;color:#1D252C;">${n.ipAddresses.length > 0 ? n.ipAddresses.map(ip => esc(ip)).join('<br>') : '<span style="color:#cbd5e1;">No IP</span>'}${n.dhcp ? `<div style="font-family:'Segoe UI',sans-serif;font-size:9.5px;color:#64748b;margin-top:2px;">DHCP: ${esc(n.dhcp)}</div>` : ''}</td>
      </tr>`).join('') ?? '';

    return `
    <div style="border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:22px;overflow:hidden;page-break-inside:avoid;">

      <!-- Bundle header -->
      <div style="background:linear-gradient(135deg,#023E8A,#023E8A);padding:12px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <div style="background:rgba(255,255,255,0.15);padding:5px 10px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.08em;">DLP TELEMETRY FILE</div>
        <div style="flex:1;">
          <div style="font-size:13.5px;font-weight:700;">${esc(headerHost)}</div>
          <div style="font-size:10px;opacity:0.7;margin-top:1px;">${esc(headerSub)}</div>
        </div>
        <div style="font-family:monospace;font-size:9.5px;opacity:0.6;">${esc(b.bundleName)} · ${b.parsedFiles.length}/${b.fileCount} files</div>
      </div>

      <!-- KPI grid -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <div style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;">CPU CORES</div>
          <div style="font-size:18px;font-weight:800;color:#023E8A;font-family:monospace;margin-top:2px;">${hw ? hw.cpuCount : (sys?.processorCount || '—')}</div>
        </div>
        <div style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;">RAM</div>
          <div style="font-size:14px;font-weight:800;color:${memColor};font-family:monospace;margin-top:2px;">
            ${memPct}% <span style="font-size:9.5px;color:#64748b;font-weight:600;">(${esc(formatMemoryGB(sys?.totalPhysicalMemoryMB ?? 0))})</span>
          </div>
        </div>
        <div style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;">DISK C:</div>
          <div style="font-size:14px;font-weight:800;color:${diskColor};font-family:monospace;margin-top:2px;">
            ${hw ? `${hw.diskCUsagePercent}%` : '—'} <span style="font-size:9.5px;color:#64748b;font-weight:600;">${hw ? `(${hw.diskCFreeGB} / ${hw.diskCTotalGB} GB free)` : ''}</span>
          </div>
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;">PATCH STATUS</div>
          <div style="font-size:14px;font-weight:800;color:${hf ? statusColorDlp(hf.patchStatus) : '#64748b'};font-family:monospace;margin-top:2px;">
            ${hf ? hf.patchStatus : '—'} ${hf?.daysSinceLastPatch != null ? `<span style="font-size:9.5px;color:#64748b;font-weight:600;">(${hf.daysSinceLastPatch}d)</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Forcepoint products + SQL Server side-by-side -->
      ${(fp || sql || db) ? `
      <div style="display:grid;grid-template-columns:${(fp && (sql || db)) ? '1fr 1fr' : '1fr'};gap:0;border-bottom:1px solid #e2e8f0;">
        ${fp ? `
        <div style="padding:12px 16px;${(sql || db) ? 'border-right:1px solid #e2e8f0;' : ''}">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">FORCEPOINT PRODUCTS</div>
          <table style="width:100%;border-collapse:collapse;">
            ${fp.eipInfraInstalled ? `<tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">EIP Infrastructure</td><td style="font-family:monospace;font-size:10px;color:#1D252C;padding:3px 0;">${esc(fp.eipInfraVersion)}</td></tr>` : ''}
            ${fp.dlpInstalled ? `<tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">Data Security (DLP)</td><td style="font-family:monospace;font-size:10px;color:#1D252C;padding:3px 0;">${esc(fp.dlpVersion)}</td></tr>` : ''}
            <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Web Security</td><td style="font-size:10px;color:${fp.webSecurityInstalled ? '#69BC00' : '#94a3b8'};padding:3px 0;">${fp.webSecurityInstalled ? '✓ Installed' : '— Not installed'}</td></tr>
            <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Email Security</td><td style="font-size:10px;color:${fp.emailSecurityInstalled ? '#69BC00' : '#94a3b8'};padding:3px 0;">${fp.emailSecurityInstalled ? '✓ Installed' : '— Not installed'}</td></tr>
          </table>
        </div>` : ''}
        ${(sql || db) ? `
        <div style="padding:12px 16px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">SQL SERVER &amp; DATABASE</div>
          <table style="width:100%;border-collapse:collapse;">
            ${sql ? `
              <tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">Version</td><td style="font-family:monospace;font-size:10px;color:#1D252C;padding:3px 0;">${esc(sql.versionShort)} <span style="color:#94a3b8;">(${esc(sql.buildNumber)})</span></td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Build Date</td><td style="font-family:monospace;font-size:10px;color:${statusColorDlp(sql.patchStatus)};padding:3px 0;">${esc(sql.buildDate)} <span style="font-weight:700;">[${sql.patchStatus}]</span></td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Edition</td><td style="font-family:monospace;font-size:10px;color:${statusColorDlp(sql.editionStatus)};padding:3px 0;">${esc(sql.edition)} ${sql.editionStatus === 'WARNING' ? '<span style="font-weight:700;">[NOT FOR PROD]</span>' : ''}</td></tr>
            ` : ''}
            ${db ? `
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Database</td><td style="font-family:monospace;font-size:10px;color:#1D252C;padding:3px 0;">${esc(db.name)}</td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Size</td><td style="font-family:monospace;font-size:10px;color:#1D252C;padding:3px 0;">${db.totalSizeMB} MB (data ${db.dataFileSizeMB} · log ${db.logFileSizeMB})</td></tr>
            ` : ''}
          </table>
        </div>` : ''}
      </div>` : ''}

      <!-- System Properties panel removed — Host / OS / BIOS / Install Date
           are not executive-relevant; the KPI tiles + KPI grid above already
           carry the meaningful infrastructure metrics. -->

      <!-- Network adapters -->
      ${netRows ? `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">NETWORK ADAPTERS (${sys?.networkAdapters.length ?? 0})</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:5px;">${netRows}</table>
      </div>` : ''}

      <!-- Hotfixes -->
      ${hf ? `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">OS HOTFIXES (${hf.totalCount})</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:${statusColorDlp(hf.patchStatus)}15;color:${statusColorDlp(hf.patchStatus)};border:1px solid ${statusColorDlp(hf.patchStatus)}33;">${hf.patchStatus}</span>
          ${hf.latestHotfixId ? `<span style="font-size:10px;color:#64748b;">Latest: <strong style="color:#023E8A;font-family:monospace;">${esc(hf.latestHotfixId)}</strong> on ${esc(hf.latestHotfixDateRaw)} (${hf.daysSinceLastPatch ?? '—'} days ago)</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;">
          ${hf.hotfixes.map(h => `<span style="font-family:monospace;font-size:9px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:1px 5px;border-radius:3px;" title="${esc(h.installedOnRaw)}">${esc(h.id)}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Services — full per-row table so readers can audit each service independently -->
      ${svc ? (() => {
        const stateBadge = (state: string) => {
          const s = (state || '').toLowerCase();
          if (s === 'running')   return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#d1fae5;color:#69BC00;border:1px solid #6ee7b7;">RUNNING</span>';
          if (s === 'stopped')   return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fee2e2;color:#A30080;border:1px solid #fca5a5;">STOPPED</span>';
          if (s === 'paused')    return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;">PAUSED</span>';
          if (s.includes('pending')) return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef9c3;color:#a16207;border:1px solid #fde68a;">${esc(state.toUpperCase())}</span>`;
          if (!state)            return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;">UNKNOWN</span>';
          return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef2f2;color:#A30080;border:1px solid #fca5a5;">${esc(state.toUpperCase())}</span>`;
        };

        return `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;page-break-inside:auto;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">WEBSENSE / SQL SERVICES (${svc.totalWebsenseServices})</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:${svc.allRunning ? '#d1fae5' : '#fee2e2'};color:${svc.allRunning ? '#69BC00' : '#A30080'};border:1px solid ${svc.allRunning ? '#6ee7b7' : '#fca5a5'};">${svc.allRunning ? 'ALL RUNNING' : `${svc.notRunning.length} NOT RUNNING`}</span>
        </div>
        ${svc.notRunning.length > 0 ? `
          <div style="font-size:10.5px;color:#475569;margin-bottom:8px;padding:7px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;">
            <div style="font-weight:700;color:#A30080;margin-bottom:3px;">⚠ Services not running:</div>
            <ul style="margin-left:18px;list-style:disc;">${svc.notRunning.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
          </div>` : `<div style="font-size:10.5px;color:#69BC00;margin-bottom:8px;">✓ All ${svc.totalWebsenseServices} services parsed from the DLP Telemetry were reporting Running state.</div>`}

        <!-- Per-service detail table — Run-As account intentionally redacted (service-account secrets are sensitive) -->
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:5px;font-size:9.5px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;">SERVICE NAME</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:160px;">INTERNAL NAME</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:90px;">START MODE</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:90px;">STATE</th>
            </tr>
          </thead>
          <tbody>
            ${svc.services.map((s, i) => `
            <tr style="${i % 2 === 1 ? 'background:#fafbff;' : ''}">
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#1D252C;font-weight:500;">${esc(s.displayName || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#475569;font-family:monospace;font-size:9px;">${esc(s.name || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(s.startMode || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;">${stateBadge(s.state)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
      })() : ''}

      <!-- Endpoint clients -->
      ${ep ? `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">ENDPOINT CLIENTS</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="font-weight:700;color:#475569;width:35%;font-size:10.5px;padding:3px 0;">Synced</td><td style="font-family:monospace;font-size:10.5px;color:#1D252C;padding:3px 0;">${ep.syncedCount}</td></tr>
          <tr><td style="font-weight:700;color:#475569;font-size:10.5px;padding:3px 0;">Unsynced</td><td style="font-family:monospace;font-size:10.5px;color:${ep.unsyncedCount > 0 ? '#B58800' : '#1D252C'};padding:3px 0;">${ep.unsyncedCount}</td></tr>
          ${ep.profileName ? `<tr><td style="font-weight:700;color:#475569;font-size:10.5px;padding:3px 0;">Active Profile</td><td style="font-size:10.5px;color:#1D252C;padding:3px 0;">${esc(ep.profileName)} ${ep.profileEnabled ? '<span style="color:#69BC00;font-weight:700;">(enabled)</span>' : '<span style="color:#A30080;font-weight:700;">(disabled)</span>'}</td></tr>` : ''}
        </table>
      </div>` : ''}

      <!-- Active policies — policy NAMES are redacted from the customer-facing
           report (they can carry sensitive rule labels). Only counts are shown. -->
      ${pol ? `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">ACTIVE POLICIES &amp; RULES</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#dbeafe;color:#023E8A;border:1px solid #93c5fd;">${pol.policyNames.length} POLICIES · ${pol.totalRules} RULES</span>
          ${pol.rulesWithExceptions.length > 0 ? `<span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fff7ed;color:#B58800;border:1px solid #fdba74;">${pol.rulesWithExceptions.length} RULES WITH EXCEPTIONS</span>` : ''}
        </div>
      </div>` : ''}

      <!-- Event Partitions (PA_EVENT_PARTITION_CATALOG.csv) — partition split,
           event tallies, and the active partition window. Same data the wizard
           displays in Step 3; surfaced here so the report stands alone. -->
      ${b.eventPartitions?.summary ? (() => {
        const epx = b.eventPartitions!.summary!;
        const fmtN = (n: number) => n.toLocaleString();
        const cell = (label: string, value: string, accent = '#023E8A') => `
          <td style="padding:6px 10px;border:1px solid #e2e8f0;background:#fff;">
            <div style="font-size:8.5px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;text-transform:uppercase;">${esc(label)}</div>
            <div style="font-size:13px;font-weight:700;color:${accent};font-family:'JetBrains Mono',monospace;margin-top:2px;">${esc(value)}</div>
          </td>`;
        return `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#fafcff;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">EVENT PARTITIONS</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#dbeafe;color:#023E8A;border:1px solid #93c5fd;">${epx.archivedPartitionCount + epx.onlinePartitionCount} PARTITIONS</span>
        </div>
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          <tr>
            ${cell('Archived', `${epx.archivedPartitionCount}`)}
            ${cell('Online', `${epx.onlinePartitionCount}`, epx.onlinePartitionCount > 5 ? '#A30080' : '#023E8A')}
            ${cell('Archived events', fmtN(epx.archivedEvents), '#64748b')}
            ${cell('Online events', fmtN(epx.onlineEvents), '#0284C7')}
            ${cell('Total events', fmtN(epx.totalEvents), '#0F2952')}
          </tr>
          <tr>
            ${cell('Active partition from', epx.activePartitionFrom || '—')}
            ${cell('Active partition to', epx.activePartitionTo || '—')}
            <td colspan="3" style="padding:6px 10px;border:1px solid #e2e8f0;background:#fff;">
              <div style="font-size:8.5px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;text-transform:uppercase;">Data history</div>
              <div style="font-size:11.5px;font-weight:700;color:#023E8A;font-family:'JetBrains Mono',monospace;margin-top:2px;">${esc(epx.dataHistoryStart || '—')} → ${esc(epx.dataHistoryEnd || '—')}</div>
            </td>
          </tr>
        </table>
        ${epx.warnings.length > 0 ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">${epx.warnings.map(w => `<div style="font-size:10px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:4px;padding:4px 8px;">${esc(w)}</div>`).join('')}</div>` : ''}
      </div>`;
      })() : ''}

      <!-- DLP Config Properties (PA_CONFIG_PROPERTIES.csv) — feature flags,
           policy deploy statuses, traffic totals, backup + LDAP repo health. -->
      ${b.configProperties ? (() => {
        const c = b.configProperties!;
        const yn = (v: boolean) => v ? 'On' : 'Off';
        const ynColor = (v: boolean) => v ? '#16A34A' : '#94a3b8';
        const statusColor = (s: string) => s === 'UNSYNCHRONIZED_EDIT' ? '#A30080' : s ? '#16A34A' : '#94a3b8';
        const pill = (label: string, value: string, color: string) => `
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:4px;background:${color}14;color:${color};border:1px solid ${color}33;font-size:10px;font-weight:600;font-family:'JetBrains Mono',monospace;">
            <span style="color:#475569;font-weight:500;">${esc(label)}</span>
            <strong>${esc(value)}</strong>
          </span>`;
        const fmtSection = (label: string, body: string) => `
          <div style="margin-top:8px;">
            <div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:5px;">${esc(label)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">${body}</div>
          </div>`;
        return `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">DLP CONFIG PROPERTIES</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:${c.warnings.length > 0 ? '#FEF2F2' : '#F0FDF4'};color:${c.warnings.length > 0 ? '#A30080' : '#16A34A'};border:1px solid ${c.warnings.length > 0 ? '#FECACA' : '#BBF7D0'};">${c.warnings.length} WARN${c.warnings.length === 1 ? '' : 'S'}</span>
        </div>
        ${fmtSection('Event traffic totals', [
          c.webTransactionsTotal && pill('Web tx', c.webTransactionsTotal, '#0EA5E9'),
          c.emailTransactionsTotal && pill('Email tx', c.emailTransactionsTotal, '#7C3AED'),
          c.discoveryTransactionsTotal && pill('Discovery tx', c.discoveryTransactionsTotal, '#16A34A'),
          c.mobileTransactionsTotal && pill('Mobile tx', c.mobileTransactionsTotal, '#B58800'),
        ].filter(Boolean).join(''))}
        ${fmtSection('Policy deploy status', [
          pill('Policy Engine', c.policyEngineConfigStatus || '—', statusColor(c.policyEngineConfigStatus)),
          pill('Data-in-Motion', c.dimPolicyStatus || '—', statusColor(c.dimPolicyStatus)),
          pill('Data-at-Rest', c.darPolicyStatus || '—', statusColor(c.darPolicyStatus)),
        ].join(''))}
        ${fmtSection('Feature flags', [
          pill('Behavior Analytics', yn(c.behaviorAnalyticsEnabled), ynColor(c.behaviorAnalyticsEnabled)),
          pill('RAP', yn(c.rapEnabled), ynColor(c.rapEnabled)),
          pill('MIP', yn(c.mipEnabled), ynColor(c.mipEnabled)),
          pill('Linking Service', yn(c.linkingServiceEnabled), ynColor(c.linkingServiceEnabled)),
          pill('Backup forensics', yn(c.backupIncludesForensics), ynColor(c.backupIncludesForensics)),
        ].join(''))}
        ${c.ldapRepos.length > 0 ? fmtSection(`LDAP repositories (${c.ldapRepos.length})`, c.ldapRepos.map(r => {
          const okColor = r.lastSyncOk ? '#16A34A' : '#A30080';
          return `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:4px;background:${okColor}14;color:${okColor};border:1px solid ${okColor}33;font-size:10px;font-weight:600;">
            <strong style="color:#0F2952;font-family:'JetBrains Mono',monospace;">${esc(r.name)}</strong>
            <span style="color:${r.enabled ? '#16A34A' : '#94a3b8'};">${r.enabled ? 'enabled' : 'disabled'}</span>
            <span>·</span>
            <span>sync ${r.lastSyncOk ? 'OK' : 'FAIL'}</span>
          </span>`;
        }).join('')) : ''}
        ${fmtSection('Misc', [
          c.auditRetentionDays && pill('Audit retention', `${c.auditRetentionDays}d`, c.auditRetentionDays === '0' ? '#A30080' : '#475569'),
          c.partitionDurationDays && pill('Partition duration', `${c.partitionDurationDays}d`, '#475569'),
          c.siemSyslogHost && pill('SIEM host', c.siemSyslogHost, '#475569'),
          c.backupCopies && pill('Backup copies', c.backupCopies, '#475569'),
          c.policyConcurrencyLevel && pill('Policy concurrency', c.policyConcurrencyLevel, '#475569'),
          c.superAdminPasswordResetPending ? pill('Super-admin pwd reset', 'PENDING', '#A30080') : '',
        ].filter(Boolean).join(''))}
        ${c.warnings.length > 0 ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">${c.warnings.map(w => `<div style="font-size:10px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:4px;padding:4px 8px;">${esc(w)}</div>`).join('')}</div>` : ''}
      </div>`;
      })() : ''}

      <!-- Site Elements (WS_SM_SITE_ELEMENTS.csv) — component inventory,
           sync health, version mix, disabled components, failed deployments
           and the DLP application server hostname list. -->
      ${b.siteElements ? (() => {
        const se = b.siteElements!;
        const ss = se.syncStatus;
        const syncColor = ss.syncPercentage < 70 ? '#A30080' : ss.syncPercentage < 95 ? '#B58800' : '#16A34A';
        const versionCount = Object.keys(se.versionInventory).length;
        /* Component inventory tiles — each component type renders as its own
           card so long labels ("DLP Application Servers", "Web Content
           Gateway (WCG) Servers") have room to wrap without overlapping the
           count. Tiles are arranged in a fixed 3-column grid. */
        const compTiles = Object.entries(se.componentCounts).map(([name, n]) => `
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:5px;padding:8px 10px;display:flex;align-items:center;gap:10px;">
            <div style="font-size:18px;font-weight:800;color:#023E8A;font-family:'Inter',sans-serif;line-height:1;letter-spacing:-0.02em;min-width:28px;text-align:right;">${n}</div>
            <div style="flex:1;min-width:0;font-size:10px;font-weight:600;color:var(--fp-ink);line-height:1.35;">${esc(name)}</div>
          </div>`).join('');
        return `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#fafcff;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">SITE ELEMENTS</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#dbeafe;color:#023E8A;border:1px solid #93c5fd;">${ss.total} COMPONENTS</span>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:${syncColor}14;color:${syncColor};border:1px solid ${syncColor}33;">${ss.syncPercentage}% SYNCED</span>
        </div>
        ${Object.keys(se.componentCounts).length > 0 ? `
        <div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:6px;">Component inventory</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">
          ${compTiles}
        </div>` : ''}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="font-size:10px;color:#16A34A;font-weight:600;">✓ Synchronized: <span style="font-family:'JetBrains Mono',monospace;">${ss.synchronized}</span></div>
          <div style="font-size:10px;color:${ss.unsynchronizedEdit > 0 ? '#A30080' : '#94a3b8'};font-weight:600;">⚠ Unsync edit: <span style="font-family:'JetBrains Mono',monospace;">${ss.unsynchronizedEdit}</span></div>
          <div style="font-size:10px;color:${ss.markedUnsynchronizedEdit > 0 ? '#A30080' : '#94a3b8'};font-weight:600;">◆ Marked unsync: <span style="font-family:'JetBrains Mono',monospace;">${ss.markedUnsynchronizedEdit}</span></div>
        </div>
        ${versionCount > 0 ? `
        <div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:5px;">Version mix (${versionCount})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">
          ${Object.entries(se.versionInventory).map(([v, n]) => `<span style="font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:3px;background:#EFF6FF;color:#023E8A;border:1px solid #93c5fd;font-family:'JetBrains Mono',monospace;">${esc(v)}: ${n}</span>`).join('')}
        </div>` : ''}
        ${se.dlpServerHostnames.length > 0 ? `
        <div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:5px;">DLP application servers (${se.dlpServerHostnames.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          ${se.dlpServerHostnames.map(h => `<span style="font-size:9.5px;font-weight:600;padding:2px 7px;border-radius:3px;background:#F1F5F9;color:#0F2952;border:1px solid #E2E8F0;font-family:'JetBrains Mono',monospace;">${esc(h)}</span>`).join('')}
        </div>` : ''}
        ${se.disabledComponents.length > 0 ? `
        <div style="font-size:9px;font-weight:700;color:#A30080;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:5px;">Disabled components (${se.disabledComponents.length})</div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">
          ${se.disabledComponents.map(d => `<div style="font-size:10px;color:#A30080;background:#FDF2F8;border:1px solid #FBCFE8;border-radius:4px;padding:3px 8px;"><strong>${esc(d.name)}</strong> · <span style="font-family:'JetBrains Mono',monospace;color:#64748b;">${esc(d.type)}</span></div>`).join('')}
        </div>` : ''}
        ${se.failedDeployments.length > 0 ? `
        <div style="font-size:9px;font-weight:700;color:#A30080;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:5px;">Failed deployments (${se.failedDeployments.length})</div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">
          ${se.failedDeployments.map(f => `<div style="font-size:10px;color:#A30080;background:#FEF2F2;border:1px solid #FECACA;border-radius:4px;padding:4px 8px;"><strong>${esc(f.name)}</strong> · <span style="font-family:'JetBrains Mono',monospace;color:#64748b;">${esc(f.type)}</span>${f.reason ? `<div style="font-size:9.5px;color:#64748b;margin-top:2px;">${esc(f.reason)}</div>` : ''}</div>`).join('')}
        </div>` : ''}
        ${se.warnings.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;">${se.warnings.map(w => `<div style="font-size:10px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:4px;padding:4px 8px;">${esc(w)}</div>`).join('')}</div>` : ''}
      </div>`;
      })() : ''}

      <!-- Third-party installed products + DEP footer -->
      ${(b.installedProducts.length > 0 || b.depEnabled != null) ? `
      <div style="padding:12px 16px;">
        ${b.depEnabled != null ? `<div style="font-size:10.5px;color:#475569;margin-bottom:6px;"><strong>DEP (Data Execution Prevention):</strong> <span style="color:${b.depEnabled ? '#69BC00' : '#A30080'};font-weight:700;">${b.depEnabled ? 'Enabled' : 'Disabled'}</span></div>` : ''}
        ${b.installedProducts.length > 0 ? `
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">THIRD-PARTY INSTALLED APPS (${b.installedProducts.length})</div>
          <div style="font-size:10px;color:#475569;column-count:2;column-gap:16px;">
            ${b.installedProducts.map(prod => `<div style="margin-bottom:2px;">• <span style="color:#023E8A;font-weight:500;">${esc(prod.name)}</span> <span style="color:#94a3b8;font-family:monospace;">${esc(prod.vendor)} · ${esc(prod.version)}</span></div>`).join('')}
          </div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('')}
</div>` : ''}

<!-- ══════════════════════════════════════
     DLP LOG EVIDENCE (Part II — section 6.5)
     Deterministic root-cause analysis of two files extracted from the
     DLP Server Telemetry: the Tomcat application log (dlp-all.log),
     the AUDIT_SYSTEM_LOGS CSV, and the cross-correlated \Data Security\Logs\
     service logs. Operator-starred (★) findings only — clean logs never
     reach this section. Tech-only — not part of the CISO Executive Briefing.
══════════════════════════════════════ -->
${(() => {
  const dlpLog = p.dlpAllLogReport;
  const auditLog = p.auditLogReport;
  const serviceLog = p.serviceLogsReport;
  const starred = p.starredLogIssues ?? {};
  const dlpStarred     = dlpLog     ? dlpLog.issues.filter((i)     => starred[`dlp:${i.id}`])     : [];
  const auditStarred   = auditLog   ? auditLog.issues.filter((i)   => starred[`audit:${i.id}`])   : [];
  const serviceStarred = serviceLog ? serviceLog.issues.filter((i) => starred[`services:${i.id}`]) : [];
  const dlpHasIssues     = dlpStarred.length     > 0;
  const auditHasIssues   = auditStarred.length   > 0;
  const serviceHasIssues = serviceStarred.length > 0;
  if (!dlpHasIssues && !auditHasIssues && !serviceHasIssues) return '';

  const sevPill = (sev: string) => {
    const cfg: Record<string, { bg: string; color: string }> = {
      CRITICAL: { bg: '#FEE2E2', color: '#991B1B' },
      HIGH:     { bg: '#FEF3C7', color: '#92400E' },
      MEDIUM:   { bg: '#FEF9C3', color: '#854D0E' },
      LOW:      { bg: '#F1F5F9', color: '#475569' },
    };
    const c = cfg[sev] ?? cfg.LOW;
    return `<span style="font-size:9px;font-weight:800;letter-spacing:0.08em;background:${c.bg};color:${c.color};padding:2px 6px;border-radius:3px;font-family:'JetBrains Mono',monospace;">${esc(sev)}</span>`;
  };

  const renderIssue = (iss: { title: string; severity: string; component?: string; source?: string; description: string; occurrences: number; first_seen: string; last_seen: string; recommendation: string; log_sources?: string[] }) => {
    const tag = iss.component ?? iss.source ?? '';
    const sources = iss.log_sources && iss.log_sources.length > 0 ? iss.log_sources.join(', ') : '';
    return `
    <div style="background:#fff;border:1px solid var(--fp-rule);border-radius:6px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        ${sevPill(iss.severity)}
        <span style="font-weight:700;font-size:12px;color:var(--fp-navy);flex:1;">${esc(iss.title)}</span>
        <span class="mono" style="font-size:10px;color:var(--fp-ink-faint);">×${iss.occurrences.toLocaleString()}</span>
      </div>
      ${tag ? `<div class="mono" style="font-size:9.5px;color:var(--fp-ink-muted);margin-bottom:5px;">${esc(tag)}${sources ? ` · ${esc(sources)}` : ''}</div>` : ''}
      <div style="font-size:11px;color:var(--fp-ink);line-height:1.55;margin-bottom:6px;">${esc(iss.description)}</div>
      <div style="display:flex;gap:14px;font-size:10px;color:var(--fp-ink-faint);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">
        <span>First: <span style="color:var(--fp-ink-muted);">${esc(iss.first_seen)}</span></span>
        <span>Last: <span style="color:var(--fp-ink-muted);">${esc(iss.last_seen)}</span></span>
      </div>
      <div style="padding:7px 10px;background:var(--fp-surface-alt);border:1px solid var(--fp-rule);border-radius:4px;font-size:10.5px;color:var(--fp-ink);line-height:1.55;">
        <strong style="color:var(--fp-navy);">Recommendation:</strong> ${esc(iss.recommendation)}
      </div>
    </div>`;
  };

  return `
<div class="section">
  <div class="section-eyebrow">Section 6.5 · Part II · DLP Log Evidence</div>
  <div class="section-title">DLP Log &amp; Audit Findings</div>
  <p class="section-lead">
    Operator-selected findings (★) from the diagnostic exports inside the DLP Server Telemetry (<span class="mono" style="color:var(--fp-ink-faint);">DLPServerInfo_*</span>).
    Sources: <strong>dlp-all.log</strong> (Tomcat application log), <strong>AUDIT_SYSTEM_LOGS.csv</strong> (DLP audit
    queries), and the <strong>\\Data Security\\Logs\\</strong> service logs (FPR, EndPointServer,
    PolicyEngine[Client], mgmtd, HealthCheck, WorkScheduler, CleanupAndArchive). Cross-file
    correlation collapses the same root cause into one finding.
    <br/><span style="color:var(--fp-ink-faint);font-size:11px;">Inclusion criteria: pattern must
    have fired at least <strong>10 times</strong>, have a most-recent occurrence within the
    <strong>last 30 days</strong>, AND have been ★-starred by the analyst on Step 3. Stale and
    low-volume matches are counted but not detailed below.</span>
  </p>

  ${dlpHasIssues ? `
  <div class="subsection-title" style="margin-top:18px;">Tomcat Application Log · <span class="mono" style="font-weight:400;color:var(--fp-ink-faint);">${esc(dlpLog!.fileName)}</span></div>
  <div style="font-size:10.5px;color:var(--fp-ink-muted);margin:-4px 0 10px;line-height:1.55;">
    Parsed <strong>${dlpLog!.recordCount.toLocaleString()}</strong> logical records
    · <span style="color:#991B1B;font-weight:700;">${dlpLog!.errorCount}</span> ERROR
    · <span style="color:#92400E;font-weight:700;">${dlpLog!.warnCount}</span> WARN
    · Window <span class="mono">${esc(dlpLog!.spanFirst ?? '—')}</span> → <span class="mono">${esc(dlpLog!.spanLast ?? '—')}</span>
    ${(dlpLog!.staleDropped + dlpLog!.lowVolumeDropped) > 0 ? `<br/><span style="color:var(--fp-ink-faint);">Filtered: ${dlpLog!.staleDropped} stale (last seen >30 days ago) · ${dlpLog!.lowVolumeDropped} low-volume (&lt;10 occurrences).</span>` : ''}
    · <strong style="color:var(--fp-ink);">${dlpStarred.length}</strong> starred for report.
  </div>
  ${dlpStarred.map(renderIssue).join('')}
  ` : ''}

  ${auditHasIssues ? `
  <div class="subsection-title" style="margin-top:${dlpHasIssues ? '22px' : '18px'};">Audit System Logs · <span class="mono" style="font-weight:400;color:var(--fp-ink-faint);">${esc(auditLog!.fileName)}</span></div>
  <div style="font-size:10.5px;color:var(--fp-ink-muted);margin:-4px 0 10px;line-height:1.55;">
    Parsed <strong>${auditLog!.totalRows.toLocaleString()}</strong> audit rows
    · <span style="color:#991B1B;font-weight:700;">${auditLog!.errorRows}</span> ERROR
    · <span style="color:#92400E;font-weight:700;">${auditLog!.warningRows}</span> WARNING
    · <span style="color:#475569;font-weight:700;">${auditLog!.infoRows}</span> INFO
    · Window <span class="mono">${esc(auditLog!.spanFirst ?? '—')}</span> → <span class="mono">${esc(auditLog!.spanLast ?? '—')}</span>
    ${(auditLog!.staleDropped + auditLog!.lowVolumeDropped) > 0 ? `<br/><span style="color:var(--fp-ink-faint);">Filtered: ${auditLog!.staleDropped} stale (last seen >30 days ago) · ${auditLog!.lowVolumeDropped} low-volume (&lt;10 occurrences).</span>` : ''}
    · <strong style="color:var(--fp-ink);">${auditStarred.length}</strong> starred for report.
  </div>
  ${auditStarred.map((iss) => renderIssue({ ...iss, component: iss.source })).join('')}
  ` : ''}

  ${serviceHasIssues ? `
  <div class="subsection-title" style="margin-top:${(dlpHasIssues || auditHasIssues) ? '22px' : '18px'};">Service Logs · <span class="mono" style="font-weight:400;color:var(--fp-ink-faint);">\\Data Security\\Logs\\</span></div>
  <div style="font-size:10.5px;color:var(--fp-ink-muted);margin:-4px 0 10px;line-height:1.55;">
    ${serviceLog!.files.filter((f) => f.family !== 'unknown').length} files parsed
    · <strong>${serviceLog!.totalLines.toLocaleString()}</strong> lines
    · <span style="color:#991B1B;font-weight:700;">${serviceLog!.totalErrors}</span> ERROR
    · Window <span class="mono">${esc(serviceLog!.spanFirst ?? '—')}</span> → <span class="mono">${esc(serviceLog!.spanLast ?? '—')}</span>
    ${(serviceLog!.staleDropped + serviceLog!.lowVolumeDropped) > 0 ? `<br/><span style="color:var(--fp-ink-faint);">Filtered: ${serviceLog!.staleDropped} stale (last seen >30 days ago) · ${serviceLog!.lowVolumeDropped} low-volume (&lt;10 occurrences).</span>` : ''}
    · <strong style="color:var(--fp-ink);">${serviceStarred.length}</strong> starred for report.
  </div>
  ${serviceStarred.map(renderIssue).join('')}
  ` : ''}
</div>`;
})()}

<!-- ══════════════════════════════════════
     ENDPOINT AGENT ANALYSIS
══════════════════════════════════════ -->
${p.endpointAgentSummary && p.endpointAgentSummary.totalRecords > 0 ? (() => {
  const ea = p.endpointAgentSummary;
  const total = ea.totalRecords;

  /* Version distribution coloring per brand spec:
     latest = green, one-behind = teal, 24.x = yellow, ≤23.x = red, unknown = violette */
  const versionFill = (v: { version: string; isOutdated: boolean }) => {
    if (v.version === ea.latestVersion) return 'ea-bar-fill-green';
    if (/^unknown$|^—$|^$/i.test(v.version)) return 'ea-bar-fill-violette';
    const major = parseInt(v.version.split('.')[0], 10);
    if (!Number.isFinite(major)) return 'ea-bar-fill-violette';
    if (major >= 25) return 'ea-bar-fill-teal';
    if (major === 24) return 'ea-bar-fill-yellow';
    return 'ea-bar-fill-red';
  };
  /* Categorize for the summary pills */
  let curCount = 0, updRecCount = 0, criticalCount = 0, orphanCount = 0;
  for (const v of ea.versionDistribution) {
    const major = parseInt(v.version.split('.')[0], 10);
    if (v.version === ea.latestVersion) curCount += v.count;
    else if (/^unknown$|^—$|^$/i.test(v.version) || !Number.isFinite(major)) orphanCount += v.count;
    else if (major >= 25) curCount += v.count;
    else if (major === 24) updRecCount += v.count;
    else criticalCount += v.count;
  }
  const maxPct = Math.max(...ea.versionDistribution.map(v => v.pct), 1);

  /* Staleness buckets — re-derive from sample for granular tiles. The summary
     only stores the >30 day bucket so we approximate >90 from staleSample. */
  const over90 = ea.staleSample.filter(s => s.daysOld > 90).length;
  const over30 = ea.staleCount;
  const noUpdate = 0; // Parser doesn't currently flag "never updated" — placeholder

  /* Client status donut segments */
  const csTotal = ea.clientStatusBreakdown.reduce((s, r) => s + r.count, 0) || 1;
  let cumAngle = 0;
  const donutSegments: { color: string; from: number; to: number; status: string; count: number; pct: number }[] = [];
  for (const cs of ea.clientStatusBreakdown) {
    const isDisabled = /^(disabled|stopped|not[-_ ]?running|offline)$/i.test(cs.status);
    const color = /^enabled$|^running$|^active$|^online$/i.test(cs.status) ? '#69BC00' : isDisabled ? '#DA1B2E' : '#94A3B8';
    const slice = (cs.count / csTotal) * 360;
    donutSegments.push({ color, from: cumAngle, to: cumAngle + slice, status: cs.status, count: cs.count, pct: cs.pct });
    cumAngle += slice;
  }
  const donutGradient = donutSegments
    .map(s => `${s.color} ${s.from}deg ${s.to}deg`)
    .join(',');

  /* Risk icon for the summary card */
  const riskIcon = (text: string): string => {
    if (/critical|legacy|outdated|disabled|inactive|imbalance/i.test(text)) return '🔴';
    if (/stale|sync|rms/i.test(text)) return '🟡';
    return '🟠';
  };

  return `
<div class="section">
  <div class="section-eyebrow">Section 07 · Part II · Endpoint Agents</div>
  <div class="section-title">Endpoint Agent Analysis</div>
  <div style="font-size:11.5px;color:var(--fp-ink-muted);margin:-4px 0 18px;">
    Source: <span class="mono" style="color:var(--fp-navy);font-weight:600;">${esc(ea.fileName)}</span>
    · ${total.toLocaleString()} endpoints · imported ${esc(new Date(ea.importedAt).toLocaleString())}
  </div>

  <!-- ─── Agent Version Distribution ─── -->
  <div class="subsection-title">Agent Version Distribution</div>
  <div class="ea-bar-chart">
    ${ea.versionDistribution.map(v => {
      const widthPct = Math.max(1, Math.round((v.pct / maxPct) * 100));
      return `<div class="ea-bar-row">
        <div class="ea-bar-label">${esc(v.version)}</div>
        <div class="ea-bar-track"><div class="ea-bar-fill ${versionFill(v)}" style="width:${widthPct}%;"></div></div>
        <div class="ea-bar-count">${v.count.toLocaleString()}</div>
        <div class="ea-bar-pct">${v.pct}%</div>
      </div>`;
    }).join('')}
  </div>
  <div class="ea-pill-row">
    <span class="ea-pill ea-pill-green">Current: ${curCount.toLocaleString()}</span>
    ${updRecCount > 0 ? `<span class="ea-pill ea-pill-yellow">Update Recommended: ${updRecCount.toLocaleString()}</span>` : ''}
    ${criticalCount > 0 ? `<span class="ea-pill ea-pill-red">Critical / Legacy: ${criticalCount.toLocaleString()}</span>` : ''}
    ${orphanCount > 0 ? `<span class="ea-pill ea-pill-violette">Orphaned: ${orphanCount.toLocaleString()}</span>` : ''}
  </div>

  <!-- ─── Staleness Analysis ─── -->
  <div class="subsection-title">Staleness Analysis (Last Update)</div>
  <div class="ea-tile-row">
    <div class="ea-tile ea-tile-yellow">
      <div class="ea-tile-label">&gt; 30 Days Stale</div>
      <div class="ea-tile-val" style="color:var(--fp-warn);">${over30.toLocaleString()}</div>
      <div class="ea-tile-sub">${ea.stalePct}% of fleet · Potentially offline or policy-stale</div>
    </div>
    <div class="ea-tile ea-tile-red">
      <div class="ea-tile-label">&gt; 90 Days Stale</div>
      <div class="ea-tile-val" style="color:var(--fp-red);">${over90.toLocaleString()}</div>
      <div class="ea-tile-sub">${total > 0 ? Math.round((over90 / total) * 1000) / 10 : 0}% of fleet · High risk — likely abandoned or unmanaged</div>
    </div>
    <div class="ea-tile ea-tile-violette">
      <div class="ea-tile-label">Never Updated</div>
      <div class="ea-tile-val" style="color:var(--fp-violette);">${noUpdate.toLocaleString()}</div>
      <div class="ea-tile-sub">No update record — orphan candidate</div>
    </div>
  </div>

  <!-- ─── Sync Status ─── -->
  <div class="subsection-title">Sync Status</div>
  <div class="ea-sync-row">
    <div class="ea-sync-tile ea-sync-synced">
      <div class="ea-sync-icon" style="color:var(--fp-green);">✓</div>
      <div>
        <div class="ea-sync-label">Synced</div>
        <div class="ea-sync-val ea-sync-val-green">${(total - ea.unsyncedCount).toLocaleString()}</div>
      </div>
    </div>
    <div class="ea-sync-tile ea-sync-unsynced">
      <div class="ea-sync-icon" style="color:var(--fp-red);">⚠</div>
      <div>
        <div class="ea-sync-label">Unsynced</div>
        <div class="ea-sync-val ea-sync-val-red">${ea.unsyncedCount.toLocaleString()}</div>
      </div>
    </div>
  </div>
  <div style="height:6px;background:var(--fp-rule-soft);border-radius:3px;overflow:hidden;margin-top:8px;">
    <div style="width:${ea.unsyncedPct}%;height:100%;background:var(--fp-red);"></div>
  </div>
  <div style="font-size:10.5px;color:var(--fp-ink-muted);margin-top:6px;line-height:1.55;">
    Unsynced agents have stale policy versions applied and are not reporting incidents to the management server.
  </div>

  <!-- ─── Client Status + Microsoft RMS (side by side) ─── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;">
    <div>
      <div class="subsection-title" style="margin-top:0;">Client Status Breakdown</div>
      <div class="ea-donut">
        <svg class="ea-donut-svg" viewBox="0 0 130 130">
          <foreignObject x="0" y="0" width="130" height="130">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${donutGradient});display:flex;align-items:center;justify-content:center;">
              <div style="width:78px;height:78px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;">
                <div style="font-size:20px;font-weight:700;color:var(--fp-navy);font-family:'Inter',sans-serif;line-height:1;">${csTotal.toLocaleString()}</div>
                <div style="font-size:8px;color:var(--fp-ink-faint);letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;">Total</div>
              </div>
            </div>
          </foreignObject>
        </svg>
        <div class="ea-donut-legend">
          ${donutSegments.map(s => `<div class="ea-donut-row">
            <span class="ea-donut-dot" style="background:${s.color};"></span>
            <span class="ea-donut-name">${esc(s.status)}</span>
            <span class="ea-donut-count">${s.count.toLocaleString()}</span>
            <span class="ea-donut-pct">${s.pct}%</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div>
      <div class="subsection-title" style="margin-top:0;">Microsoft RMS Status</div>
      ${ea.rmsActiveCount + ea.rmsInactiveCount === 0 ? `
        <div style="font-size:11.5px;color:var(--fp-ink-faint);font-style:italic;">No RMS data reported by any endpoint.</div>
      ` : `
        <div style="display:flex;gap:10px;">
          <span class="ea-pill ea-pill-green">Active: ${ea.rmsActiveCount.toLocaleString()}</span>
          <span class="ea-pill ${ea.rmsInactivePct >= 10 ? 'ea-pill-violette' : 'ea-pill-yellow'}">Inactive: ${ea.rmsInactiveCount.toLocaleString()} (${ea.rmsInactivePct}%)</span>
        </div>
        ${ea.rmsInactivePct >= 10 ? `
          <div style="margin-top:10px;padding:9px 12px;background:var(--fp-violette-soft);border:1px solid #E9CCDF;border-left:3px solid var(--fp-violette);border-radius:4px;font-size:11px;color:var(--fp-ink);line-height:1.55;">
            A significant portion of endpoints have Microsoft RMS inactive. This may indicate that RMS-based classification labels are not being enforced on these endpoints.
          </div>` : ''}
      `}
    </div>
  </div>

  <!-- ─── Endpoint Server Distribution ─── -->
  <div class="subsection-title">Endpoint Server Distribution</div>
  ${ea.serverImbalance ? `
    <div style="background:var(--fp-yellow-soft);border:1px solid #FDE68A;border-left:3px solid var(--fp-yellow);border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:var(--fp-ink);">
      <span style="font-weight:700;color:var(--fp-warn);">⚠ Load Imbalance Risk:</span> ${esc(ea.serverImbalance.topServer)} (${ea.serverImbalance.topPct}%) vs ${esc(ea.serverImbalance.bottomServer)} (${ea.serverImbalance.bottomPct}%)
    </div>` : ''}
  <table>
    <thead>
      <tr>
        <th>Endpoint Server</th>
        <th style="text-align:right;width:110px;">Agent Count</th>
        <th style="text-align:right;width:90px;">% of Total</th>
        <th style="width:140px;">Flag</th>
      </tr>
    </thead>
    <tbody>
      ${ea.serverDistribution.map(s => {
        const isImbalanced = s.pct >= 30;
        return `<tr${isImbalanced ? ' style="background:var(--fp-navy-soft);"' : ''}>
          <td class="mono" style="font-size:11px;color:var(--fp-ink);">${esc(s.server)}</td>
          <td class="mono" style="text-align:right;font-weight:600;">${s.count.toLocaleString()}</td>
          <td class="mono" style="text-align:right;color:var(--fp-ink-muted);">${s.pct}%</td>
          <td>${isImbalanced ? '<span class="badge badge-medium">Load Imbalance Risk</span>' : '<span class="badge badge-grey">Balanced</span>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${ea.staleCount > 0 && ea.staleSample.length > 0 ? `
    <div class="subsection-title">Most Stale Endpoints (top ${Math.min(20, ea.staleSample.length)} of ${ea.staleCount.toLocaleString()})</div>
    <table>
      <thead>
        <tr>
          <th>Hostname</th>
          <th>Last Update</th>
          <th style="text-align:right;width:100px;">Days Stale</th>
        </tr>
      </thead>
      <tbody>
        ${ea.staleSample.slice(0, 20).map(e => `<tr>
          <td class="mono" style="font-size:10.5px;">${esc(e.hostname)}</td>
          <td class="mono" style="font-size:10.5px;color:var(--fp-ink-muted);">${esc(e.lastUpdate)}</td>
          <td class="mono" style="text-align:right;font-weight:700;color:${e.daysOld > 90 ? 'var(--fp-red)' : 'var(--fp-warn)'};">${e.daysOld}d</td>
        </tr>`).join('')}
      </tbody>
    </table>
  ` : ''}

  <!-- ─── Key Risk Summary card ─── -->
  <div class="ea-risk-card">
    <div class="ea-risk-title">Key Risk Summary</div>
    <ul class="ea-risk-list">
      ${ea.topFindings.map(f => `<li class="ea-risk-item">
        <span class="ea-risk-item-icon">${riskIcon(f)}</span>
        <span>${esc(f)}</span>
      </li>`).join('')}
    </ul>
  </div>
</div>`;
})() : ''}

<!-- ══════════════════════════════════════
     F1E ENDPOINT COMPATIBILITY ASSESSMENT
     Customer-specific assessment produced by Step 7 against the imported
     OS / Browser Support Matrix. Renders only what the operator generated —
     status banner, findings, OS/browser compatibility, opted-in critical
     notes, and the upgrade recommendation. Falls back silently when no
     assessment has been generated, so reports never ship with empty cards.
══════════════════════════════════════ -->
${(p.selectedProducts.data || p.selectedProducts.web) && p.endpointAgentSummary && p.endpointCompatAssessment ? (() => {
  const a = p.endpointCompatAssessment!;
  const STATUS_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
    SUPPORTED: { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Supported' },
    AT_RISK:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', label: 'At Risk' },
    CRITICAL:  { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8', label: 'Critical' },
  };
  const SEV_CFG: Record<string, { color: string; bg: string; border: string }> = {
    CRITICAL: { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' },
    HIGH:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    MEDIUM:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' },
    LOW:      { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
  };
  const URG_CFG: Record<string, { color: string; bg: string; label: string }> = {
    IMMEDIATE:  { color: '#A30080', bg: '#FDF2F8', label: 'Immediate' },
    SHORT_TERM: { color: '#DC2626', bg: '#FEF2F2', label: 'Short Term' },
    PLANNED:    { color: '#0284C7', bg: '#F0F9FF', label: 'Planned' },
  };
  /* Generic agent label — the F1E binary on the endpoint can service DLP,
     Hybrid Web, or both, so the report names whichever modules are in
     scope rather than hard-coding "DLP". */
  const epScopeLabel =
    p.selectedProducts.data && p.selectedProducts.web ? 'DLP + Hybrid Web'
    : p.selectedProducts.data ? 'DLP'
    : p.selectedProducts.web  ? 'Hybrid Web'
    : 'Endpoint';
  const epCoverageNarrative =
    p.selectedProducts.data && p.selectedProducts.web ? 'DLP and Hybrid Web coverage'
    : p.selectedProducts.data ? 'DLP coverage'
    : p.selectedProducts.web  ? 'Hybrid Web coverage'
    : 'endpoint coverage';
  const sc = STATUS_CFG[a.compatibilityStatus] ?? STATUS_CFG.SUPPORTED;
  const includedNotes = a.criticalNotes.filter((n) => n.includeInReport);
  return `
<div class="section">
  <div class="section-eyebrow">Section 7.5 · Part II · Agent Compatibility</div>
  <div class="section-title">Agent Compatibility</div>
  <p class="section-lead">
    Customer fleet measured against the imported Forcepoint endpoint support matrix. Identifies operating-system, browser, and agent-version gaps that affect ${esc(epCoverageNarrative)} on the endpoint.
  </p>

  <!-- Status banner -->
  <div style="background:${sc.bg};border:1px solid ${sc.border};border-left:4px solid ${sc.color};border-radius:8px;padding:14px 18px;margin-bottom:14px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="font-size:22px;font-weight:800;color:${sc.color};letter-spacing:-0.01em;">${esc(sc.label)}</div>
      <span style="font-size:9.5px;font-weight:700;color:${sc.color};background:#fff;border:1px solid ${sc.border};padding:2px 8px;border-radius:5px;letter-spacing:0.06em;">COMPATIBILITY · ${esc(a.compatibilityStatus)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:12px;">
      <div>
        <div style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Customer Agent (${esc(epScopeLabel)})</div>
        <div style="font-size:13px;font-weight:700;color:#0F2952;font-family:'JetBrains Mono',monospace;margin-top:2px;">${esc(a.customerAgentVersion || '—')}</div>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Minimum Required</div>
        <div style="font-size:13px;font-weight:700;color:#0F2952;font-family:'JetBrains Mono',monospace;margin-top:2px;">v${esc(a.minimumRequiredAgent)}</div>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Findings</div>
        <div style="font-size:13px;font-weight:700;color:#0F2952;font-family:'JetBrains Mono',monospace;margin-top:2px;">${a.findings.length}</div>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Upgrade Required</div>
        <div style="font-size:13px;font-weight:700;color:${a.upgradeRequired ? '#B58800' : '#16A34A'};font-family:'JetBrains Mono',monospace;margin-top:2px;">${a.upgradeRequired ? 'Yes' : 'No'}</div>
      </div>
    </div>
  </div>

  ${a.findings.length > 0 ? `
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:14px 18px;margin-bottom:14px;">
    <div style="font-size:11.5px;font-weight:800;color:#0F2952;letter-spacing:0.02em;margin-bottom:10px;text-transform:uppercase;">Findings (${a.findings.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${a.findings.map((f) => {
        const fc = SEV_CFG[f.severity] ?? SEV_CFG.MEDIUM;
        return `<div style="background:${fc.bg};border:1px solid ${fc.border};border-left:3px solid ${fc.color};border-radius:6px;padding:10px 12px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:8.5px;font-weight:800;color:${fc.color};background:#fff;border:1px solid ${fc.border};padding:1px 6px;border-radius:4px;letter-spacing:0.06em;">${esc(f.severity)}</span>
            <span style="font-size:11.5px;font-weight:700;color:#1D252C;">${esc(f.title)}</span>
          </div>
          <div style="font-size:10.5px;color:#475569;line-height:1.6;">${esc(f.description)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap;">
            ${f.affectedComponents.map((c) => `<span style="font-size:9px;font-weight:600;color:#475569;background:#fff;border:1px solid #E2E8F0;padding:1px 6px;border-radius:3px;font-family:monospace;">${esc(c)}</span>`).join('')}
            <span style="font-size:9.5px;color:#64748B;font-family:monospace;">${f.affectedEndpoints.toLocaleString()} endpoints (${esc(f.affectedPct)})</span>
          </div>
          <div style="font-size:10.5px;color:${fc.color};margin-top:5px;line-height:1.55;"><strong>Recommended action:</strong> ${esc(f.recommendation)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid;">
    ${a.osCompatibility.length > 0 ? `
    <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 14px;">
      <div style="font-size:10.5px;font-weight:800;color:#0F2952;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">OS Compatibility</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${a.osCompatibility.map((r) => {
          const bad = !r.customerAgentCompatible;
          const bg = bad ? '#FEF2F2' : '#F0FDF4';
          const bd = bad ? '#FECACA' : '#BBF7D0';
          const co = bad ? '#A30080' : '#16A34A';
          return `<div style="background:${bg};border:1px solid ${bd};border-radius:5px;padding:6px 9px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:11px;font-weight:700;color:${co};flex-shrink:0;">${bad ? '⨯' : '✓'}</span>
              <span style="font-size:10.5px;font-weight:600;color:#1D252C;flex:1;">${esc(r.os)}</span>
              <span style="font-size:8.5px;font-weight:700;color:${co};letter-spacing:0.05em;">${esc(r.status)}</span>
            </div>
            <div style="font-size:9.5px;color:#64748B;font-family:monospace;margin-left:17px;">min: ${esc(r.minAgentRequired)}</div>
            ${r.note ? `<div style="font-size:9.5px;color:#64748B;margin-left:17px;margin-top:2px;line-height:1.45;">${esc(r.note)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${a.browserCompatibility.length > 0 ? `
    <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 14px;">
      <div style="font-size:10.5px;font-weight:800;color:#0F2952;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Browser Compatibility</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${a.browserCompatibility.map((r) => {
          const bad = !r.customerAgentCompatible;
          const bg = bad ? '#FEF2F2' : '#F0FDF4';
          const bd = bad ? '#FECACA' : '#BBF7D0';
          const co = bad ? '#A30080' : '#16A34A';
          return `<div style="background:${bg};border:1px solid ${bd};border-radius:5px;padding:6px 9px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:11px;font-weight:700;color:${co};flex-shrink:0;">${bad ? '⨯' : '✓'}</span>
              <span style="font-size:10.5px;font-weight:600;color:#1D252C;flex:1;">${esc(r.browser)} · ${esc(r.platform)}</span>
              ${r.mv3Required ? '<span style="font-size:8px;font-weight:700;color:#7C3AED;background:#F5F3FF;border:1px solid #DDD6FE;padding:1px 5px;border-radius:3px;letter-spacing:0.04em;">MV3</span>' : ''}
              <span style="font-size:8.5px;font-weight:700;color:${co};letter-spacing:0.05em;">${esc(r.status)}</span>
            </div>
            <div style="font-size:9.5px;color:#64748B;font-family:monospace;margin-left:17px;">min: ${esc(r.minAgentRequired)}</div>
            ${r.note ? `<div style="font-size:9.5px;color:#64748B;margin-left:17px;margin-top:2px;line-height:1.45;">${esc(r.note)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  </div>

  ${includedNotes.length > 0 ? `
  <div style="margin-top:14px;page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:800;color:#0F2952;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Critical Compatibility Notes</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${includedNotes.map((n) => {
        const nc = SEV_CFG[n.severity] ?? SEV_CFG.MEDIUM;
        return `<div style="background:${nc.bg};border:1px solid ${nc.border};border-left:3px solid ${nc.color};border-radius:5px;padding:8px 11px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="font-size:8.5px;font-weight:800;color:${nc.color};background:#fff;border:1px solid ${nc.border};padding:1px 5px;border-radius:3px;letter-spacing:0.05em;">${esc(n.severity)}</span>
            <span style="font-size:11px;font-weight:700;color:#1D252C;">⚠ ${esc(n.title)}</span>
          </div>
          <div style="font-size:10.5px;color:#475569;line-height:1.55;">${esc(n.description)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  ${a.upgradeRecommendation ? (() => {
    const u = URG_CFG[a.upgradeRecommendation.urgency] ?? URG_CFG.PLANNED;
    return `
    <div style="margin-top:14px;background:#FFFFFF;border:1px solid var(--fp-rule);border-top:3px solid ${u.color};border-radius:8px;padding:14px 16px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:13px;font-weight:800;color:#0F2952;">Upgrade Recommendation</span>
        <span style="font-size:9px;font-weight:700;color:${u.color};background:${u.bg};border:1px solid ${u.color}33;padding:2px 8px;border-radius:4px;letter-spacing:0.06em;">${esc(u.label.toUpperCase())}</span>
        <span style="font-size:10.5px;color:#475569;font-family:monospace;">Target: <strong>v${esc(a.upgradeRecommendation.targetVersion)}</strong></span>
      </div>
      <div style="font-size:11px;color:#475569;line-height:1.65;margin-bottom:8px;">${esc(a.upgradeRecommendation.rationale)}</div>
      <div style="font-size:10.5px;color:#475569;line-height:1.55;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:5px;padding:7px 9px;">
        <strong style="color:#0F2952;">Deployment note:</strong> ${esc(a.upgradeRecommendation.deploymentNote)}
      </div>
    </div>`;
  })() : ''}
</div>`;
})() : ''}

<!-- ══════════════════════════════════════
     FDC (DATA CLASSIFICATION) AGENT COMPATIBILITY
     Shown when DSPM / Classification is in scope, the FDC matrix has data,
     and the analyst picked at least one OS on Step 7. Mirrors the inline
     wizard analysis via the shared computeFdcAnalysis helper.
══════════════════════════════════════ -->
${(p.selectedProducts.dspm || p.selectedProducts.cls) && !isFdcMatrixEmpty(p.endpointMatrix) && ((p.endpointCompatInput.fdcOSEnvironment ?? []).length > 0 || (p.endpointCompatInput.fdcOfficeVersions ?? []).length > 0) ? (() => {
  const selOS = p.endpointCompatInput.fdcOSEnvironment ?? [];
  const selOffice = p.endpointCompatInput.fdcOfficeVersions ?? [];
  const fdcAgentV = p.endpointCompatInput.fdcAgentVersion ?? '';
  const { osRows, officeRows, findings: computedFdcFindings } = computeFdcAnalysis(p.endpointMatrix, selOS, selOffice, fdcAgentV);
  /* Honour operator-edited findings from Step 7 edit mode. */
  const findings = p.endpointCompatInput.fdcFindings ?? computedFdcFindings;
  const SEV_CFG: Record<string, { color: string; bg: string; border: string }> = {
    CRITICAL: { color: '#A30080', bg: '#FDF2F8', border: '#FBCFE8' },
    HIGH:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    MEDIUM:   { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' },
  };
  const badge = (match: { status: 'current' | 'eos' } | undefined, sub?: string) =>
    !match
      ? `<span style="font-size:8.5px;font-weight:700;color:#A30080;background:#FDF2F8;border:1px solid #FBCFE8;padding:2px 7px;border-radius:4px;letter-spacing:0.05em;">NOT CERTIFIED</span>`
      : match.status === 'eos'
        ? `<span style="font-size:8.5px;font-weight:700;color:#A30080;background:#FDF2F8;border:1px solid #FBCFE8;padding:2px 7px;border-radius:4px;letter-spacing:0.05em;">EOS</span>`
        : `<span style="font-size:8.5px;font-weight:700;color:#16A34A;background:#F0FDF4;border:1px solid #BBF7D0;padding:2px 7px;border-radius:4px;letter-spacing:0.05em;">SUPPORTED${sub ? ' · ' + esc(sub) : ''}</span>`;
  const agentCell = (compatible: boolean | null, required: string) =>
    compatible === true
      ? `<span style="font-size:8.5px;font-weight:700;color:#16A34A;background:#F0FDF4;border:1px solid #BBF7D0;padding:2px 7px;border-radius:4px;">✓ AGENT OK</span>`
      : compatible === false
        ? `<span style="font-size:8.5px;font-weight:700;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;padding:2px 7px;border-radius:4px;">UPGRADE → min v${esc(required)}</span>`
        : `<span style="font-size:9px;color:#CBD5E1;">—</span>`;
  const supportTable = (title: string, rowsHtml: string) => `
  <div style="background:#FFFFFF;border:1px solid var(--fp-rule);border-radius:8px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid;">
    <div style="font-size:9.5px;font-weight:800;color:#0F2952;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${esc(title)}</div>
    <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
  </div>`;
  const osHtml = osRows.length > 0 ? supportTable('OS Support', osRows.map(({ os, match, agentCompatible, requiredVersion }) => `<tr>
    <td style="font-size:10.5px;font-weight:600;color:#1D252C;padding:6px 8px;border-bottom:1px solid #F1F4FA;">${esc(os)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #F1F4FA;text-align:center;">${badge(match, match?.supportedFrom)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #F1F4FA;text-align:right;">${agentCell(agentCompatible, requiredVersion)}</td>
  </tr>`).join('')) : '';
  const officeHtml = officeRows.length > 0 ? supportTable('Office Versions Support', officeRows.map(({ product, match, agentCompatible, requiredVersion }) => `<tr>
    <td style="font-size:10.5px;font-weight:600;color:#1D252C;padding:6px 8px;border-bottom:1px solid #F1F4FA;">${esc(product)}${match && match.versions ? ` <span style="color:#94A3B8;font-weight:400;font-family:monospace;">${esc(match.versions)}</span>` : ''}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #F1F4FA;text-align:center;">${badge(match, match?.minAgent)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #F1F4FA;text-align:right;">${agentCell(agentCompatible, requiredVersion)}</td>
  </tr>`).join('')) : '';
  return `
<div class="section">
  <div class="section-eyebrow">Section 7.6 · Part II · DSPM + FDC Agent Compatibility</div>
  <div class="section-title">DSPM + FDC Agent — Endpoint Compatibility</div>
  <p class="section-lead">
    Customer fleet measured against the Forcepoint Data Classification (DSPM + FDC) agent support matrix${fdcAgentV ? ` (detected agent v${esc(fdcAgentV)})` : ''}. Highlights which operating system is certified, which Microsoft Office version the classification add-in supports, and whether the deployed agent version meets each minimum.
  </p>

  ${osHtml}
  ${officeHtml}

  ${findings.length > 0 ? `
  <div style="display:flex;flex-direction:column;gap:8px;page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:800;color:#0F2952;text-transform:uppercase;letter-spacing:0.05em;">Findings (${findings.length})</div>
    ${findings.map((f) => {
      const fc = SEV_CFG[f.sev] ?? SEV_CFG.MEDIUM;
      return `<div style="background:${fc.bg};border:1px solid ${fc.border};border-left:3px solid ${fc.color};border-radius:6px;padding:8px 11px;">
        <span style="font-size:8.5px;font-weight:800;color:${fc.color};background:#fff;border:1px solid ${fc.border};padding:1px 6px;border-radius:4px;letter-spacing:0.05em;margin-right:7px;">${esc(f.sev)}</span>
        <span style="font-size:10.5px;color:#475569;line-height:1.55;">${esc(f.text)}</span>
      </div>`;
    }).join('')}
  </div>` : `
  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:9px 12px;font-size:10.5px;color:#15803D;font-weight:600;">✓ All selected OS and Office products are supported by the DSPM + FDC agent.</div>`}
</div>`;
})() : ''}

<!-- ══════════════════════════════════════
     PER-PRODUCT SECURITY ASSESSMENT
══════════════════════════════════════ -->
${p.selectedTemplates.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 09 · Part II · Product Scorecard</div>
  <div class="section-title">Per-Product Security Assessment</div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th style="text-align:center;width:80px;">Checked</th>
        <th style="text-align:center;width:70px;">Critical</th>
        <th style="text-align:center;width:60px;">High</th>
        <th style="text-align:center;width:70px;">Medium</th>
        <th style="text-align:center;width:55px;">Low</th>
        <th style="text-align:right;width:70px;">Health</th>
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>
</div>` : ''}

<!-- ══════════════════════════════════════
     CHECKLIST FINDINGS
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">Section 10 · Part II · Findings Detail</div>
  <div class="section-title">Feature Posture Control (${p.allFindings.length})</div>
  ${p.allFindings.length === 0
    ? '<p style="color:#69BC00;font-weight:600;padding:10px 0;">✓ No findings — all checklist items passed.</p>'
    : p.allFindings.map(f => `
      <div class="finding finding-${f.severity}">
        <div class="finding-text">${esc(f.text)}</div>
        <div class="finding-meta">
          <span class="badge" style="${sevStyle(f.severity)}">${esc(f.severity)}</span>
          <span>${esc(f.templateName.replace(' HC', ''))}</span>
          <span>${esc(f.section)}</span>
          <span class="badge" style="background:#f0f9ff;color:#228BA0;border:1px solid #bae6fd;">Answer: ${esc((f.answer || '—').toUpperCase())}</span>
        </div>
        ${f.description ? `<div class="finding-block finding-block-desc"><span class="finding-block-label">Description</span>${esc(f.description)}</div>` : ''}
        ${f.remediation ? `<div class="finding-block finding-block-rem"><span class="finding-block-label">Remediation</span>${esc(f.remediation)}</div>` : ''}
        ${f.note ? `<div class="finding-block finding-block-note"><span class="finding-block-label">Analyst Note</span>${esc(f.note)}</div>` : ''}
      </div>`).join('')}
</div>

${hasWeb ? `
<!-- ══════════════════════════════════════
     WEB SECURITY USAGE
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Web Security Usage</div>
  <p style="margin-bottom:20px;color:#334155;line-height:1.75;">
    Behavioural intelligence derived from Forcepoint Web Security telemetry. Each card below
    is populated from the live SQL query executed in Step 3; cards marked PENDING were selected
    by the analyst but not yet run.
  </p>
  <div style="display:flex;flex-direction:column;gap:12px;">
  ${webUsageReports.map((r, i) => renderUsageReportCard(r, i, { accent: '#36B0C9', border: '#bae6fd', bg: '#f0f9ff' })).join('')}
  </div>
</div>` : ''}

${(hasDLP && !dlpSqlSuppressed) ? `
<!-- ══════════════════════════════════════
     DATA SECURITY USAGE
     Suppressed when the DLP REST API posture data is present
     (dlpSqlSuppressed flag, set upstream). The Information Security
     Posture Dashboard section already covers this ground with richer
     cross-sections, so duplicating SQL output would just confuse the
     CXO reader.
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Data Security Usage</div>
  <p style="margin-bottom:20px;color:#334155;line-height:1.75;">
    Data loss prevention intelligence derived from Forcepoint DLP telemetry. Each card below
    is populated from the live SQL query executed in Step 3; cards marked PENDING were selected
    by the analyst but not yet run.
  </p>
  <div style="display:flex;flex-direction:column;gap:12px;">
  ${dataUsageReports.map((r, i) => renderUsageReportCard(r, i, { accent: '#69BC00', border: '#d9f99d', bg: '#f7fee7' })).join('')}
  </div>
</div>` : ''}

${hasEmail ? `
<!-- ══════════════════════════════════════
     EMAIL SECURITY USAGE
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Email Security Usage</div>
  <p style="margin-bottom:20px;color:#334155;line-height:1.75;">
    Threat intelligence derived from Forcepoint Email Security telemetry. Each card below
    is populated from the live SQL query executed in Step 3; cards marked PENDING were selected
    by the analyst but not yet run.
  </p>
  <div style="display:flex;flex-direction:column;gap:12px;">
  ${emailUsageReports.map((r, i) => renderUsageReportCard(r, i, { accent: '#e11d48', border: '#fecdd3', bg: '#fff1f2' })).join('')}
  </div>
</div>` : ''}

<!-- ══════════════════════════════════════
     CERTIFICATE ANALYSIS
══════════════════════════════════════ -->
${p.certificates.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 08 · Part II · Certificate Trust</div>
  <div class="section-title">Certificate Analysis</div>
  <p style="margin-bottom:14px;color:#475569;line-height:1.65;font-size:11px;">
    The following X.509 certificates were imported from the customer's environment (typically <span style="font-family:monospace;background:#f1f5f9;padding:1px 5px;border-radius:3px;">allcerts.cer</span> and <span style="font-family:monospace;background:#f1f5f9;padding:1px 5px;border-radius:3px;">ca.cer</span> from the DLP Server Telemetry export). Subject, issuer, validity dates, key length, signature algorithm, and CA constraint were parsed directly from the DER-encoded certificate bodies.
  </p>

  ${(() => {
    // Group certificates so the comparison table shows host certs alongside CA certs (matches the customer-facing table layout).
    const sortedCerts = [...p.certificates].sort((a, b) => {
      const order = (c: ParsedCertificate) => c.fileLabel === 'Host Cert' ? 0 : c.fileLabel === 'CA Cert' ? 1 : 2;
      return order(a) - order(b);
    });
    const colWidth = `${Math.floor(80 / sortedCerts.length)}%`;

    const headerCells = sortedCerts.map(c => `
      <th style="text-align:left;padding:8px 10px;font-size:9.5px;color:#fff;background:#023E8A;border-left:1px solid rgba(255,255,255,0.15);width:${colWidth};">
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="color:${certStatusColor(c.status)};">${certStatusIcon(c.status)}</span>
          <div>
            <div style="font-weight:700;text-transform:none;letter-spacing:0;">${esc(c.fileName)}</div>
            <div style="font-weight:500;color:#cbd5e1;font-size:8.5px;text-transform:none;letter-spacing:0;">(${esc(c.fileLabel)})</div>
          </div>
        </div>
      </th>`).join('');

    type RowDef = { label: string; getter: (c: ParsedCertificate) => string; mono?: boolean; colorByStatus?: boolean; bold?: boolean };
    const rows: RowDef[] = [
      { label: 'Type',         getter: c => c.certificateType },
      { label: 'CN / Subject', getter: c => c.subjectCN || '—' },
      { label: 'Issuer',       getter: c => c.issuerCN || '—' },
      { label: 'Key',          getter: c => c.keyAlgorithm && c.keyBits ? `${c.keyAlgorithm} ${c.keyBits}-bit` : (c.keyAlgorithm || '—'), mono: true },
      { label: 'Algorithm',    getter: c => c.signatureAlgorithm || '—', mono: true },
      { label: 'Valid From',   getter: c => c.validFromRaw || '—' },
      { label: 'Valid To',     getter: c => `${c.validToRaw || '—'} ${certStatusIcon(c.status)}`, colorByStatus: true, bold: true },
      { label: 'Remaining',    getter: c => formatRemaining(c.daysRemaining), colorByStatus: true, bold: true },
      { label: 'CA Flag',      getter: c => c.isCA ? 'TRUE — Yes (root CA authority)' : 'FALSE — End-entity' },
      { label: 'Self-Signed',  getter: c => c.isSelfSigned ? 'Yes' : 'No' },
      { label: 'Serial',       getter: c => c.serialNumber || '—', mono: true },
    ];

    const bodyRows = rows.map((r, i) => `
      <tr style="${i % 2 === 1 ? 'background:#fafbff;' : ''}">
        <td style="padding:7px 10px;font-weight:700;color:#475569;font-size:10px;background:#f8fafc;border-right:1px solid #e2e8f0;width:18%;">${esc(r.label)}</td>
        ${sortedCerts.map(c => {
          const v = r.getter(c);
          const styles: string[] = [
            'padding:7px 10px',
            'border-left:1px solid #f1f5f9',
            'vertical-align:top',
            `font-size:${r.label === 'Serial' ? '9.5px' : '10.5px'}`,
            `color:${r.colorByStatus ? certStatusColor(c.status) : '#1D252C'}`,
          ];
          if (r.mono) styles.push("font-family:monospace", 'word-break:break-all');
          if (r.bold) styles.push('font-weight:700');
          return `<td style="${styles.join(';')}">${esc(v)}</td>`;
        }).join('')}
      </tr>`).join('');

    return `
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      <thead><tr><th style="text-align:left;padding:8px 10px;font-size:9.5px;color:#fff;background:#023E8A;width:18%;">FIELD</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  })()}

  ${(() => {
    const expired = p.certificates.filter(c => c.status === 'EXPIRED');
    const expiring = p.certificates.filter(c => c.status === 'EXPIRING_SOON');
    if (expired.length === 0 && expiring.length === 0) {
      return `<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#3D6E00;">
        ✓ All ${p.certificates.length} certificate${p.certificates.length !== 1 ? 's are' : ' is'} valid for at least 90 days. No expiry action required at this time.
      </div>`;
    }
    return `
    <div style="margin-top:14px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:11px;color:#9a3412;">
      <div style="font-weight:700;margin-bottom:4px;">⚠ Certificate expiry warnings</div>
      ${expired.map(c => `<div>• <span style="color:#A30080;font-weight:700;">EXPIRED</span> — ${esc(c.fileName)} (${esc(c.subjectCN)}) expired ${Math.abs(c.daysRemaining)} days ago.</div>`).join('')}
      ${expiring.map(c => `<div>• <span style="color:#B58800;font-weight:700;">EXPIRING SOON</span> — ${esc(c.fileName)} (${esc(c.subjectCN)}) expires in ${c.daysRemaining} days (${esc(c.validToRaw)}).</div>`).join('')}
    </div>`;
  })()}
</div>` : ''}

</div><!-- /content (Part II closes here) -->
<!--VARIANT:TECH_ONLY:END-->

<!-- ══════════════════════════════════════
     PART III — ROADMAP & STRATEGY
     Chapter header itself is shared across both variants; only the
     "Part III" label flips to "Part 2" for the Executive Risk Briefing.
══════════════════════════════════════ -->
<div class="chapter">
  <div class="chapter-part">${isExec ? 'PART 3' : 'PART III'}</div>
  <div class="chapter-title">Roadmap &amp; Strategy</div>
  <div class="chapter-sub">${isExec
    ? `Decision points for security leadership — the additional Forcepoint entitlement coverage that closes today's licensing gaps, and the enhancement initiatives that strengthen the customer's overall security posture.`
    : `The implementation plan — prioritized recommendations, dated action items, customer-requested enhancements, and forward-looking Forcepoint product proposals that translate the assessment into a sequence of decisions.`}</div>
</div>

<div class="content">

<!--VARIANT:TECH_ONLY:START-->
<!-- ══════════════════════════════════════
     FINDINGS, OBSERVATIONS & RECOMMENDATIONS
══════════════════════════════════════ -->
${p.recommendations.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 12 · Part III · Prioritized Remediation</div>
  <div class="section-title">Findings, Observations &amp; Recommendations</div>
  <table class="rec-table">
    <thead>
      <tr>
        <th>Recommendation</th>
        <th style="width:120px;">Category</th>
        <th style="width:95px;">Product</th>
        <th style="width:80px;text-align:center;">Priority</th>
        <th style="width:80px;text-align:center;">Effort</th>
        <th style="width:100px;text-align:center;">Status</th>
      </tr>
    </thead>
    ${p.recommendations.map(r => {
      const isVersionUpgrade = r.category === 'version_upgrade';
      const hasReleaseNotes = isVersionUpgrade && (r.targetVersion || r.releaseNotesUrl || r.releaseNotes);
      const safeUrl = (r.releaseNotesUrl ?? '').trim();
      const isHttp = /^https?:\/\//i.test(safeUrl);
      const hasDetailContent = !!r.detail || hasReleaseNotes;
      const releaseNotesBlock = hasReleaseNotes ? `
        <div style="margin-top:9px;padding:10px 12px;background:#fff;border:1px solid #C7D6F0;border-left:3px solid #023E8A;border-radius:4px;">
          <div style="font-size:9px;font-weight:800;letter-spacing:0.1em;color:#023E8A;margin-bottom:5px;text-transform:uppercase;">Release Notes${r.targetVersion ? ` · Target v${esc(r.targetVersion)}` : ''}</div>
          ${isHttp ? `<div style="font-size:11px;margin-bottom:4px;"><a href="${esc(safeUrl)}" target="_blank" rel="noopener" style="color:#023E8A;text-decoration:underline;font-family:'JetBrains Mono',monospace;word-break:break-all;">${esc(safeUrl)}</a></div>` : (safeUrl ? `<div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#475569;margin-bottom:4px;word-break:break-all;">${esc(safeUrl)}</div>` : '')}
          ${r.releaseNotes ? `<div style="font-size:11px;color:#1D252C;line-height:1.65;white-space:pre-wrap;">${esc(r.releaseNotes)}</div>` : ''}
        </div>` : '';
      return `<tbody class="rec-pair">
      <tr class="rec-summary">
        <td><div style="font-weight:600;color:#023E8A;font-size:12px;line-height:1.45;">${esc(r.title)}</div></td>
        <td style="font-size:10.5px;color:#475569;">${esc(r.category.replace(/_/g,' '))}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#1D252C;">${esc(r.product || '—')}</td>
        <td style="text-align:center;"><span class="badge" style="${sevStyle(r.priority.toUpperCase())}">${esc(r.priority.toUpperCase())}</span></td>
        <td style="font-size:10.5px;color:#475569;text-align:center;">${esc(r.effort)}</td>
        <td style="text-align:center;"><span class="badge" style="${stStyle(r.status)}">${esc(r.status.replace(/_/g,' ').toUpperCase())}</span></td>
      </tr>
      ${hasDetailContent ? `
      <tr class="rec-detail">
        <td colspan="6">
          <div class="rec-detail-inner">
            <span class="rec-detail-tag">Details</span>
            ${r.detail ? `<div class="rec-detail-text">${esc(r.detail)}</div>` : ''}
            ${releaseNotesBlock}
          </div>
        </td>
      </tr>` : ''}
    </tbody>`;
    }).join('')}
  </table>
</div>` : ''}

<!-- ══════════════════════════════════════
     VERSION UPGRADE PROPOSALS
══════════════════════════════════════ -->
${p.versionUpgrades.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 13 · Part III · Version Upgrade Path</div>
  <div class="section-title">Version Upgrade Proposals (${p.versionUpgrades.length})</div>
  <p class="section-lead">
    Target version recommendations with the release context the customer needs to plan a deployment: what's new, what's fixed, what's still open, and what to prepare before cut-over.
  </p>
  ${(() => {
    const PRIO: Record<string, { label: string; color: string; bg: string; border: string }> = {
      critical: { label: 'CRITICAL', color: '#A30080', bg: '#F9F0F6', border: '#E9CCDF' },
      high:     { label: 'HIGH',     color: '#DA1B2E', bg: '#FEF2F2', border: '#FECACA' },
      medium:   { label: 'MEDIUM',   color: '#B58800', bg: '#FFFBEB', border: '#FDE68A' },
      low:      { label: 'LOW',      color: '#228BA0', bg: '#E5F4F8', border: '#BFE3EC' },
    };
    return p.versionUpgrades.map(v => {
      const pCfg = PRIO[v.priority] ?? PRIO.medium;
      const safeUrl = (v.releaseNotesUrl ?? '').trim();
      const isHttp = /^https?:\/\//i.test(safeUrl);
      const block = (accent: string, label: string, text: string) => text.trim() ? `
        <div style="background:#fff;border:1px solid var(--fp-rule);border-left:3px solid ${accent};border-radius:5px;padding:11px 13px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${accent};margin-bottom:5px;">${esc(label)}</div>
          <div style="font-size:11px;color:#1D252C;line-height:1.6;white-space:pre-wrap;">${esc(text)}</div>
        </div>` : '';
      return `
      <div style="background:#fff;border:1px solid var(--fp-rule);border-left:4px solid ${pCfg.color};border-radius:6px;margin-bottom:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);page-break-inside:avoid;">
        <!-- Header -->
        <div style="background:var(--fp-navy-soft);padding:13px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--fp-rule);">
          <div style="width:30px;height:30px;border-radius:6px;background:var(--fp-navy);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:14px;">↑</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--fp-navy);">${esc(v.product)}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;font-size:10.5px;">
              ${v.fromVersion ? `<span class="mono" style="background:#F1F5F9;color:#475569;padding:1px 6px;border-radius:3px;font-weight:600;">${esc(v.fromVersion)}</span><span style="color:#94A3B8;">→</span>` : ''}
              <span class="mono" style="background:var(--fp-navy);color:#fff;padding:2px 8px;border-radius:3px;font-weight:700;letter-spacing:0.03em;">v${esc(v.toVersion)}</span>
              ${v.releaseDate ? `<span class="mono" style="color:var(--fp-ink-muted);">📅 ${esc(v.releaseDate)}</span>` : ''}
              ${isHttp ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener" class="mono" style="color:var(--fp-cyan-deep);text-decoration:underline;word-break:break-all;">↗ Release notes</a>` : ''}
            </div>
          </div>
          <span class="badge" style="background:${pCfg.bg};color:${pCfg.color};border:1px solid ${pCfg.border};flex-shrink:0;">${pCfg.label}</span>
        </div>

        <!-- 4-quadrant body: What's New / Bug Fixes / Known Issues / Pre-Deployment -->
        <div style="padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${block('var(--fp-cyan)',     `What's New`, v.whatsNew)}
          ${block('var(--fp-green)',    'Bug Fixes',  v.bugFixes)}
          ${block('var(--fp-red)',      'Known Issues', v.knownIssues)}
          ${block('var(--fp-navy)',     'Pre-Deployment Considerations', v.deploymentNotes)}
        </div>
      </div>`;
    }).join('');
  })()}
</div>` : ''}

<!-- ══════════════════════════════════════
     INFORMATION SECURITY POSTURE DASHBOARD
     Pulled live from the Forcepoint DLP REST API via the companion server
     when the operator enabled the DLP connector AND ticked
     "Include Information Security Posture Dashboard in report" on Step 3.
     Per the project's redaction rules, only categorical aggregations are
     emitted — no login names, AD domains, or run-as identities.
══════════════════════════════════════ -->
${postureSection}

<!-- Legacy raw-matrix dump retained as a hidden fallback only when an
     assessment hasn't been produced yet but the operator did import the
     matrix. This stops the report from being empty during a partial fill,
     while the customer-specific section above is the primary surface. -->
${(p.selectedProducts.data || p.selectedProducts.web) && !p.endpointCompatAssessment && !isMatrixEmpty(p.endpointMatrix) ? (() => {
  const epScopeLabel =
    p.selectedProducts.data && p.selectedProducts.web ? 'DLP + Hybrid Web'
    : p.selectedProducts.data ? 'DLP'
    : p.selectedProducts.web  ? 'Hybrid Web'
    : 'Endpoint';
  return `
<div class="section">
  <div class="section-eyebrow">Section 14 · Part III · OS &amp; Browser Support Matrix</div>
  <div class="section-title">F1E ${esc(epScopeLabel)} Endpoint — OS &amp; Browser Support Matrix</div>
  <p class="section-lead">
    Reference: minimum agent versions for current Windows, macOS, virtual desktop, and browser platforms — used to confirm endpoint compatibility ahead of any upgrade or new-deployment decision.
    ${p.endpointMatrix.lastUpdated ? `<span style="color:var(--fp-ink-faint);font-family:'JetBrains Mono',monospace;font-size:10.5px;">Last updated: ${esc(p.endpointMatrix.lastUpdated)}.</span>` : ''}
  </p>

  ${(p.endpointMatrix.windows.length > 0 || p.endpointMatrix.macos.length > 0) ? `
  <div style="display:grid;grid-template-columns:${(p.endpointMatrix.windows.length > 0 && p.endpointMatrix.macos.length > 0) ? '1fr 1fr' : '1fr'};gap:14px;page-break-inside:avoid;">
    ${p.endpointMatrix.windows.length > 0 ? `
    <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-navy);border-radius:6px;padding:12px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-navy);margin-bottom:8px;">Windows Support</div>
      <table style="margin-bottom:6px;box-shadow:none;border:1px solid var(--fp-rule);">
        <thead>
          <tr>
            <th style="padding:5px 8px;font-size:9px;">Platform</th>
            <th style="padding:5px 8px;font-size:9px;">Min Agent</th>
            <th style="padding:5px 8px;font-size:9px;width:80px;text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${p.endpointMatrix.windows.map(r => `<tr>
            <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;">${esc(r.platform)}</td>
            <td style="padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--fp-ink-muted);">${esc(r.supportedFrom)}</td>
            <td style="padding:5px 8px;text-align:center;"><span class="badge ${r.status === 'eos' ? 'badge-critical' : 'badge-low'}">${r.status === 'eos' ? 'EOS' : 'CURRENT'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${p.endpointMatrix.windowsNotes.length > 0 ? `<ul style="margin:6px 0 0;padding-left:18px;">${p.endpointMatrix.windowsNotes.map(n => `<li style="font-size:10px;color:var(--fp-ink-muted);line-height:1.55;">${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}

    ${p.endpointMatrix.macos.length > 0 ? `
    <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-cyan);border-radius:6px;padding:12px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-cyan-deep);margin-bottom:8px;">macOS Support</div>
      <table style="margin-bottom:6px;box-shadow:none;border:1px solid var(--fp-rule);">
        <thead>
          <tr>
            <th style="padding:5px 8px;font-size:9px;">Platform</th>
            <th style="padding:5px 8px;font-size:9px;">Min Agent</th>
            <th style="padding:5px 8px;font-size:9px;width:80px;text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${p.endpointMatrix.macos.map(r => `<tr>
            <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;">${esc(r.platform)}</td>
            <td style="padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--fp-ink-muted);">${esc(r.supportedFrom)}</td>
            <td style="padding:5px 8px;text-align:center;"><span class="badge ${r.status === 'eos' ? 'badge-critical' : 'badge-low'}">${r.status === 'eos' ? 'EOS' : 'CURRENT'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${p.endpointMatrix.macosNotes.length > 0 ? `<ul style="margin:6px 0 0;padding-left:18px;">${p.endpointMatrix.macosNotes.map(n => `<li style="font-size:10px;color:var(--fp-ink-muted);line-height:1.55;">${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
  </div>` : ''}

  ${p.endpointMatrix.vdi.length > 0 ? `
  <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-yellow);border-radius:6px;padding:12px 14px;margin-top:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);page-break-inside:avoid;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-warn);margin-bottom:8px;">Virtual Desktop Infrastructure</div>
    <table style="margin-bottom:0;box-shadow:none;border:1px solid var(--fp-rule);">
      <thead>
        <tr>
          <th style="padding:5px 8px;font-size:9px;">Platform</th>
          <th style="padding:5px 8px;font-size:9px;">Min Agent</th>
        </tr>
      </thead>
      <tbody>
        ${p.endpointMatrix.vdi.map(r => `<tr>
          <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;">${esc(r.platform)}</td>
          <td style="padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--fp-ink-muted);">${esc(r.supportedFrom)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${p.endpointMatrix.browsers.length > 0 ? `
  <div style="background:#fff;border:1px solid var(--fp-rule);border-top:3px solid var(--fp-violette);border-radius:6px;padding:12px 14px;margin-top:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);page-break-inside:avoid;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-violette);margin-bottom:8px;">Browser Support</div>
    <table style="margin-bottom:0;box-shadow:none;border:1px solid var(--fp-rule);">
      <thead>
        <tr>
          <th style="padding:5px 8px;font-size:9px;">Browser</th>
          <th style="padding:5px 8px;font-size:9px;width:90px;">Platform</th>
          <th style="padding:5px 8px;font-size:9px;">Versions</th>
          <th style="padding:5px 8px;font-size:9px;width:120px;">Min Agent</th>
        </tr>
      </thead>
      <tbody>
        ${p.endpointMatrix.browsers.map(r => `<tr>
          <td style="padding:5px 8px;font-size:10.5px;color:var(--fp-ink);font-weight:500;">${esc(r.browser)}</td>
          <td style="padding:5px 8px;font-size:10px;color:var(--fp-ink-muted);">${esc(r.platform)}</td>
          <td style="padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--fp-ink);">${esc(r.versions)}</td>
          <td style="padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--fp-cyan-deep);font-weight:600;">${esc(r.minAgent)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${p.endpointMatrix.criticalNotes.length > 0 ? `
  <div style="margin-top:14px;page-break-inside:avoid;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--fp-red);margin-bottom:8px;">Critical Compatibility Notes</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${p.endpointMatrix.criticalNotes.map(n => {
        const accentMap: Record<string, { bar: string; bg: string; border: string }> = {
          critical: { bar: 'var(--fp-violette)', bg: 'var(--fp-violette-soft)', border: '#E9CCDF' },
          high:     { bar: 'var(--fp-red)',      bg: 'var(--fp-red-soft)',      border: '#FECACA' },
          medium:   { bar: 'var(--fp-yellow)',   bg: 'var(--fp-yellow-soft)',   border: '#FDE68A' },
        };
        const a = accentMap[n.severity] ?? accentMap.medium;
        return `<div style="background:${a.bg};border:1px solid ${a.border};border-left:3px solid ${a.bar};border-radius:5px;padding:9px 12px;">
          <div style="font-size:11px;font-weight:700;color:var(--fp-ink);margin-bottom:3px;">⚠ ${esc(n.title)}</div>
          <div style="font-size:10.5px;color:var(--fp-ink-muted);line-height:1.6;">${esc(n.body)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  ${p.endpointAgentSummary && p.endpointAgentSummary.latestVersion ? (() => {
    /* If we have endpoint-agent telemetry, surface a customer-specific compatibility
       check: which deployed agent versions sit BELOW the minimum required for the
       browsers in this matrix. */
    const fleetLatest = p.endpointAgentSummary.latestVersion;
    const outdatedCount = p.endpointAgentSummary.outdatedCount;
    const outdatedPct = p.endpointAgentSummary.outdatedPct;
    if (outdatedCount === 0) return '';
    return `
    <div style="margin-top:14px;background:var(--fp-violette-soft);border:1px solid #E9CCDF;border-left:4px solid var(--fp-violette);border-radius:6px;padding:12px 16px;page-break-inside:avoid;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--fp-violette);margin-bottom:6px;">Fleet Compatibility Alert</div>
      <div style="font-size:11.5px;color:var(--fp-ink);line-height:1.65;">
        Customer fleet snapshot shows <strong style="color:var(--fp-violette);">${outdatedCount.toLocaleString()} endpoints (${outdatedPct}%)</strong> running agent versions below 25.x — these sit beneath the minimum required by the browser support matrix above. Chrome 138+ in particular drops Manifest V2 extension support, so agents older than v26.02 cannot deliver full browser-channel DLP coverage on those endpoints. Deployed latest version observed: <span class="mono" style="color:var(--fp-navy);font-weight:700;">${esc(fleetLatest)}</span>.
      </div>
    </div>`;
  })() : ''}
</div>`;
})() : ''}

<!-- ══════════════════════════════════════
     ACTION ITEMS & NEXT STEPS
══════════════════════════════════════ -->
${p.actionItems.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 15 · Part III · Execution Plan</div>
  <div class="section-title">Action Items &amp; Next Steps (${p.actionItems.length})</div>
  <table class="rec-table">
    <thead>
      <tr>
        <th style="width:34px;text-align:center;">#</th>
        <th>Task</th>
        <th style="width:120px;">Owner</th>
        <th style="width:110px;">Due Date</th>
        <th style="width:90px;">Product</th>
        <th style="width:85px;text-align:center;">Priority</th>
        <th style="width:110px;text-align:center;">Status</th>
      </tr>
    </thead>
    ${p.actionItems.map((a, i) => `<tbody class="rec-pair">
      <tr class="rec-summary">
        <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#36B0C9;text-align:center;">${i + 1}</td>
        <td><div style="font-weight:600;color:#023E8A;font-size:12px;line-height:1.45;">${esc(a.task)}</div></td>
        <td style="font-size:10.5px;color:#475569;">${esc(a.owner || '—')}</td>
        <td class="mono" style="font-size:10.5px;color:#1D252C;">${esc(a.dueDate || '—')}</td>
        <td class="mono" style="font-size:10.5px;color:#1D252C;">${esc(a.product || '—')}</td>
        <td style="text-align:center;"><span class="badge" style="${sevStyle(a.priority.toUpperCase())}">${esc(a.priority.toUpperCase())}</span></td>
        <td style="text-align:center;"><span class="badge" style="${stStyle(a.status)}">${esc(a.status.replace(/_/g,' ').toUpperCase())}</span></td>
      </tr>
      ${a.details ? `
      <tr class="rec-detail">
        <td colspan="7">
          <div class="rec-detail-inner">
            <span class="rec-detail-tag">Details</span>
            <div class="rec-detail-text">${esc(a.details)}</div>
          </div>
        </td>
      </tr>` : ''}
    </tbody>`).join('')}
  </table>
</div>` : ''}

<!-- ══════════════════════════════════════
     ENHANCEMENT REQUESTS
══════════════════════════════════════ -->
${p.featureRequests.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 16 · Part III · Customer Voice</div>
  <div class="section-title">Customer Feature Requests (${p.featureRequests.length})</div>
  <table class="rec-table">
    <thead>
      <tr>
        <th>Request</th>
        <th style="width:110px;">Product</th>
        <th style="width:80px;text-align:center;">Priority</th>
        <th style="width:100px;text-align:center;">Status</th>
        <th style="width:60px;text-align:center;">Votes</th>
      </tr>
    </thead>
    ${p.featureRequests.map(fr => {
      const hasDetailContent = !!fr.description || !!fr.businessJustification;
      return `<tbody class="rec-pair">
      <tr class="rec-summary">
        <td><div style="font-weight:600;color:#023E8A;font-size:12px;line-height:1.45;">${esc(fr.title)}</div></td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#1D252C;">${esc(fr.product)}</td>
        <td style="text-align:center;"><span class="badge" style="${sevStyle(fr.priority.toUpperCase())}">${esc(fr.priority.toUpperCase())}</span></td>
        <td style="text-align:center;"><span class="badge" style="${stStyle(fr.status)}">${esc(fr.status.replace(/_/g,' ').toUpperCase())}</span></td>
        <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;color:#1D252C;">${fr.votes}</td>
      </tr>
      ${hasDetailContent ? `
      <tr class="rec-detail">
        <td colspan="5">
          <div class="rec-detail-inner">
            <span class="rec-detail-tag">Details</span>
            ${fr.description ? `<div class="rec-detail-text">${esc(fr.description)}</div>` : ''}
            ${fr.businessJustification ? `
              <div style="margin-top:9px;padding:10px 12px;background:#fff;border:1px solid #E9CCDF;border-left:3px solid #A30080;border-radius:4px;">
                <div style="font-size:9px;font-weight:800;letter-spacing:0.14em;color:#A30080;margin-bottom:5px;text-transform:uppercase;">Business Justification</div>
                <div style="font-size:11.5px;color:#1D252C;line-height:1.65;">${esc(fr.businessJustification)}</div>
              </div>` : ''}
          </div>
        </td>
      </tr>` : ''}
    </tbody>`;
    }).join('')}
  </table>
</div>` : ''}

<!--VARIANT:TECH_ONLY:END-->

<!-- ══════════════════════════════════════
     RECOMMENDED LICENSE EXTENSION (standalone section, above Enhancements)
     Kept in BOTH variants — license decisions are an executive concern
     even in the short-form Executive Risk Briefing.
══════════════════════════════════════ -->
${(() => {
  const gaps = p.licenseGaps ?? [];
  if (gaps.length === 0) return '';
  const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...gaps].sort((a, b) => (PRIO[a.priority ?? 'medium'] ?? 9) - (PRIO[b.priority ?? 'medium'] ?? 9));
  return `
<div class="section">
  <div class="section-eyebrow">${isExec ? 'Section 5 · Part 3 · Licensing Roadmap' : 'Section 17 · Part III · Licensing Roadmap'}</div>
  <div class="section-title">Recommended License Extension <span style="font-weight:400;color:var(--fp-ink-faint);font-size:14px;letter-spacing:0;">(${gaps.length})</span></div>
  <p class="section-lead">
    Products where Forcepoint recommends the customer expand their entitlement count, based on the deployment scope, headcount growth, and operational coverage observed in this assessment. Each line below proposes the additional licenses needed per product — quantities are not aggregated, as each product carries its own licensing unit.
  </p>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th style="width:80px;">Code</th>
        <th style="width:70px;text-align:right;">Current</th>
        <th style="width:90px;text-align:right;">+ Additional</th>
        <th style="width:80px;text-align:right;">Total After</th>
        <th style="width:75px;">Priority</th>
        <th>Rationale</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(g => {
        const recN = parseInt(g.recommendedAdditional, 10);
        const curN = parseInt(g.currentQuantity ?? '', 10);
        const totalAfter = Number.isFinite(recN) && Number.isFinite(curN) ? curN + recN : null;
        const prio = g.priority ?? 'medium';
        return `<tr>
          <td style="font-weight:600;color:#023E8A;">${esc(g.product || '—')}</td>
          <td style="font-family:monospace;font-size:9.5px;color:#475569;">${esc(g.productCode || '—')}</td>
          <td style="font-family:monospace;text-align:right;color:#475569;">${esc(g.currentQuantity || '—')}</td>
          <td style="font-family:monospace;text-align:right;font-weight:700;color:#228BA0;background:#ecfeff;">${Number.isFinite(recN) ? `+${recN.toLocaleString()}` : esc(g.recommendedAdditional || '—')}</td>
          <td style="font-family:monospace;text-align:right;font-weight:700;color:#023E8A;">${totalAfter !== null ? totalAfter.toLocaleString() : '—'}</td>
          <td><span class="badge" style="${sevStyle(prio.toUpperCase())}">${esc(prio.toUpperCase())}</span></td>
          <td style="font-size:10.5px;color:#475569;line-height:1.55;">${g.rationale ? esc(g.rationale) : '<span style="color:#cbd5e1;">—</span>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`;
})()}

<!-- ══════════════════════════════════════
     RECOMMENDED ENHANCEMENTS
══════════════════════════════════════ -->
${p.selectedEnhancements.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">${isExec ? 'Section 6 · Part 3 · Strategic Initiatives' : 'Section 18 · Part III · Strategic Initiatives'}</div>
  <div class="section-title">Recommended Enhancements</div>
  <p style="margin-bottom:18px;color:#475569;line-height:1.7;font-size:11px;">
    The following Forcepoint product enhancements are proposed as next-step initiatives to strengthen the customer's overall security posture. Each recommendation is selected based on the health check findings, current scope, and identified gaps. The business value commentary below should be reviewed jointly with the customer's security and compliance stakeholders.
  </p>

  ${ENHANCEMENTS.filter(eBase => p.selectedEnhancements.includes(eBase.id)).map((eBase, idx) => { const e = mergeEnhancement(eBase, p.enhancementOverrides?.[eBase.id]); return `
  <div style="border:1.5px solid ${e.accent}55;border-radius:6px;margin-bottom:16px;overflow:hidden;page-break-inside:avoid;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <!-- Header band -->
    <div style="background:linear-gradient(135deg,${e.accent},${e.accent}DD);padding:14px 18px;color:#fff;display:flex;align-items:center;gap:12px;">
      <div style="width:38px;height:38px;border-radius:6px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
        ${e.emoji}
      </div>
      <div style="background:rgba(255,255,255,0.18);padding:5px 10px;border-radius:3px;font-size:9.5px;font-weight:700;letter-spacing:0.08em;font-family:'JetBrains Mono',monospace;">
        ${String(idx + 1).padStart(2, '0')}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:700;letter-spacing:-0.01em;">${esc(e.name)}</div>
        <div style="font-size:10.5px;opacity:0.88;margin-top:2px;line-height:1.45;">${esc(e.tagline)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.22);padding:4px 10px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;flex-shrink:0;">${esc(e.category)}</div>
    </div>

    <!-- Why -->
    <div style="padding:16px 20px 8px;">
      <div style="font-size:9.5px;font-weight:700;color:#94a3b8;letter-spacing:0.12em;margin-bottom:6px;text-transform:uppercase;">Why We Recommend It</div>
      <div style="font-size:11.5px;color:#334155;line-height:1.7;">${esc(e.whyWeRecommendIt)}</div>
    </div>

    <!-- Business value -->
    <div style="padding:8px 20px ${e.extraTable ? '14px' : '18px'};">
      <div style="font-size:9.5px;font-weight:700;color:${e.accent};letter-spacing:0.12em;margin-bottom:6px;text-transform:uppercase;">Business Value</div>
      <div style="font-size:11.5px;color:#1D252C;line-height:1.7;">${esc(e.businessValue)}</div>
    </div>

    ${e.extraTable ? `
    <div style="padding:0 20px 18px;">
      <div style="font-size:9.5px;font-weight:700;color:${e.accent};letter-spacing:0.12em;margin-bottom:8px;text-transform:uppercase;">${esc(e.extraTable.title)}</div>
      <table style="margin-bottom:0;border:1px solid ${e.accent}40;">
        <thead>
          <tr>
            ${e.extraTable.headers.map((h, hi) => `<th style="background:${e.accent};color:#fff;font-size:10px;${hi === 0 ? 'width:140px;' : 'text-align:center;'}">${esc(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${e.extraTable.rows.map(r => `<tr>
            ${r.map((c, ci) => `<td style="font-size:11px;${ci === 0 ? `font-weight:700;color:${e.accent};` : `text-align:center;font-family:'JetBrains Mono',monospace;color:#1D252C;`}">${esc(c)}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
      ${e.extraTable.note ? `<div style="margin-top:8px;padding:8px 12px;background:${e.accent}10;border-left:3px solid ${e.accent};border-radius:3px;font-size:10.5px;color:#475569;line-height:1.55;">${esc(e.extraTable.note)}</div>` : ''}
    </div>` : ''}
  </div>`; }).join('')}
</div>` : ''}

</div><!-- /content (Part III closes here) -->

<!--VARIANT:TECH_ONLY:START-->
<!-- ══════════════════════════════════════
     PART IV — REFERENCE
══════════════════════════════════════ -->
<div class="chapter">
  <div class="chapter-part">PART IV</div>
  <div class="chapter-title">Reference</div>
  <div class="chapter-sub">Appendix material — the effort &amp; complexity scoring rubric used to scope the action items in Part III.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     APPENDIX — EFFORT SCORE CARD
══════════════════════════════════════ -->
<div class="section">
  <div class="section-eyebrow">Section 19 · Part IV · Scoring Rubric</div>
  <div class="section-title">Appendix — Effort Score Card</div>
  <table>
    <thead>
      <tr>
        <th style="width:80px;">Level</th>
        <th>Project Characteristics</th>
        <th>Required Skills</th>
        <th style="width:180px;">Typical Roles</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><span class="badge" style="background:#d1fae5;color:#69BC00;border:1px solid #6ee7b7;">LOW</span></td>
        <td>Clear objectives, minimal risk, familiar technology</td>
        <td>Basic technical proficiency, standard tools</td>
        <td>Customer</td>
      </tr>
      <tr>
        <td><span class="badge" style="background:#fef3c7;color:#B58800;border:1px solid #fcd34d;">MEDIUM</span></td>
        <td>Some ambiguity, multiple teams, system integration, moderate risk</td>
        <td>Intermediate skills, cross-functional experience, basic project management</td>
        <td>Customer / Partner / Forcepoint PS</td>
      </tr>
      <tr>
        <td><span class="badge" style="background:#fee2e2;color:#DA1B2E;border:1px solid #fca5a5;">HIGH</span></td>
        <td>High uncertainty, complex technology, strategic importance</td>
        <td>Advanced expertise, leadership, risk management</td>
        <td>Partner / Forcepoint PS</td>
      </tr>
      <tr>
        <td><span class="badge" style="background:#F9F0F6;color:#A30080;border:1px solid #E9CCDF;">CRITICAL</span></td>
        <td>Severe uncertainty, mission-critical deployment, regulatory or audit-driven, multi-stakeholder governance, irreversible cut-over risk</td>
        <td>Deep Forcepoint product expertise, executive sponsorship, formal change-management and rollback planning</td>
        <td>Forcepoint PS lead · Customer executive sponsor · Partner support</td>
      </tr>
    </tbody>
  </table>
</div>
<!--VARIANT:TECH_ONLY:END-->

<!-- ══════════════════════════════════════
     CLOSING NOTE — Forcepoint's Commitment
     Final page before the footer. Mirrors the opening "Purpose" page
     in tone — brief, customer-named, no metrics. Wraps the report on
     a forward-looking note.
══════════════════════════════════════ -->
<div class="content">
<div class="section" style="page-break-before:always;border-top:3px solid var(--fp-navy);padding-top:18px;">
  <div class="section-eyebrow">Closing · Forcepoint Customer Success</div>
  <div class="section-title">Forcepoint's Commitment</div>
  <p style="font-size:12.5px;line-height:1.7;color:var(--fp-ink);margin:14px 0 12px;">
    Forcepoint is committed to the ongoing success of <strong>${esc(p.sessionData.customerName || 'the customer')}</strong>'s data and network security program. This Health Check is part of Forcepoint's proactive Customer Success engagement model, and the findings contained herein represent our team's expert assessment based on industry best practices, product knowledge, and direct analysis of your environment.
  </p>
  <p style="font-size:12.5px;line-height:1.7;color:var(--fp-ink);margin:0 0 14px;">
    We welcome the opportunity to discuss these findings in detail and to work collaboratively with <strong>${esc(p.sessionData.customerName || 'the customer')}</strong>'s technical and leadership teams to address identified gaps and plan a roadmap for continued improvement.
  </p>
  ${(p.sessionData.csm || p.sessionData.salesEngineer) ? `
  <div style="margin-top:18px;padding:14px 16px;background:var(--fp-surface-alt);border:1px solid var(--fp-rule);border-left:3px solid var(--fp-navy);border-radius:6px;">
    <div style="font-size:9.5px;font-weight:800;color:var(--fp-navy);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">Your Forcepoint Team</div>
    ${p.sessionData.csm ? `<div style="font-size:11.5px;color:var(--fp-ink);"><strong>Customer Success Manager:</strong> ${esc(p.sessionData.csm)}</div>` : ''}
    ${p.sessionData.salesEngineer ? `<div style="font-size:11.5px;color:var(--fp-ink);margin-top:3px;"><strong>Sales Engineer:</strong> ${esc(p.sessionData.salesEngineer)}</div>` : ''}
  </div>` : ''}
  <p style="font-size:10.5px;line-height:1.65;color:var(--fp-ink-faint);font-style:italic;margin:20px 0 0;">
    This document is confidential and intended solely for ${esc(p.sessionData.customerName || 'the customer')}. Findings reflect the state of the deployment at the time of the assessment (${esc(p.date)}); follow-up engagements may revise these conclusions as the environment evolves.
  </p>
</div>
</div>

<!-- FOOTER -->
<div class="rpt-footer">
  <div class="rpt-footer-brand">Forcepoint</div>
  <div>${isExec ? 'Executive Risk Briefing' : 'Health Check &amp; Maturity Assessment Report'} &nbsp;·&nbsp; ${esc(p.date)} &nbsp;·&nbsp; Confidential</div>
  <div style="display:flex;align-items:center;gap:10px;">
    ${p.customerLogo ? `<img src="${esc(p.customerLogo)}" alt="${esc(p.sessionData.customerName || 'Customer')} logo" style="max-height:22px;max-width:80px;object-fit:contain;opacity:0.8;">` : ''}
    <span>© ${new Date().getFullYear()} Forcepoint LLC | Confidential</span>
  </div>
</div>

</div>
</body>
</html>`;

  return stripVariantBlocks(html);
}

export function Step11Summary({ sessionData, templates, selectedProducts, checklistAnswers, versionEntries, versionData, recommendations, actionItems, featureRequests, serverDetails, selectedReports, dlpBundles, certificates, selectedEnhancements, licenseGaps, endpointAgentSummary, dlpDashboardSummary, dlpAllLogReport, auditLogReport, serviceLogsReport, starredLogIssues, dlpPostureSummary, dlpPostureSections, customerLogo, setCustomerLogo, complianceFrameworks, enhancementOverrides, versionUpgrades, endpointMatrix, endpointCompatAssessment, endpointCompatInput, reportRuns, onComplete, isComplete }: Step11Props) {
  /* Tracks which report variant is mid-generation so only that card's
     button switches to "Generating…". null when idle. */
  const [isExporting, setIsExporting] = useState<'executive' | 'healthcheck' | null>(null);
  const [exportDone,  setExportDone]  = useState(false);
  const [logoError,   setLogoError]   = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const MAX_LOGO_BYTES = 750 * 1024;   // 750 KB cap to stay well under the 5 MB localStorage budget
  const handleLogoFile = (file: File) => {
    setLogoError(null);
    if (!/^image\//.test(file.type)) {
      setLogoError('Please choose an image file (PNG, JPG, or SVG).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Image is too large (${(file.size / 1024).toFixed(0)} KB). Limit is ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) setCustomerLogo(result);
    };
    reader.onerror = () => setLogoError('Failed to read the file.');
    reader.readAsDataURL(file);
  };

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

  const checkData: CheckData = {
    customerName:    sessionData.customerName,
    productsSelected: Object.values(selectedProducts).some(Boolean),
    versionCount:    Object.values(versionEntries).filter(e => e.installedVersion).length,
    serverCount:     serverDetails.filter(s => s.applicable).length,
    totalAnswered,
    recsCount:       recommendations.length,
    actionsCount:    actionItems.length,
    frsCount:        featureRequests.length,
    certificatesCount: certificates.length,
    endpointAgentCount: endpointAgentSummary?.totalRecords ?? 0,
    enhancementsCount: selectedEnhancements.length,
    licenseGapCount:  licenseGaps.length,
    dlpBundleCount:   dlpBundles.length,
    versionUpgradeCount: versionUpgrades.length,
  };

  const completedSteps = COMPLETION_STEPS.filter(s => s.check(checkData)).length;
  const hsc = scoreColor(healthScore);
  const criticalCount = allFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount     = allFindings.filter(f => f.severity === 'HIGH').length;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const handleExport = (variant: 'executive' | 'healthcheck' | 'powerpoint' = 'healthcheck') => {
    setIsExporting(variant);
    setExportDone(false);

    if (variant === 'powerpoint') {
      /* PowerPoint export: POST report data to server, download .pptx file */
      setTimeout(async () => {
        try {
          const topRisks = allFindings
            .filter(f => f.severity === 'critical' || f.severity === 'high')
            .slice(0, 5)
            .map(f => ({
              severity: f.severity,
              title: f.text,
              description: f.note || f.description,
            }));

          const topRecs = recommendations
            .filter(r => r.priority === 'critical' || r.priority === 'high')
            .slice(0, 5)
            .map(r => ({
              priority: r.priority,
              title: r.title,
              description: r.description,
            }));

          const productList = Object.keys(selectedProducts)
            .filter(k => selectedProducts[k])
            .map(k => k.charAt(0).toUpperCase() + k.slice(1));

          const serverUrl = `${window.location.protocol}//${window.location.hostname}:3001/api/report/export-ppt`;
          const response = await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName: sessionData.customerName || 'Health Check Assessment',
              healthScore: healthScore ?? 0,
              riskSummary: topRisks,
              recommendations: topRecs,
              productList,
              generatedAt: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${await response.text()}`);
          }

          const buffer = await response.arrayBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `HC-Executive-Summary-${Date.now()}.pptx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          setIsExporting(null);
          setExportDone(true);
        } catch (err) {
          setIsExporting(null);
          setExportDone(false);
          console.error('[Step11Summary] PowerPoint export failed:', err);
          const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;
          alert(`PowerPoint export failed:\n\n${(err as Error).message}\n\nMake sure the Forcepoint HC companion server (${hostname}:3001) is running.\n\nCheck the browser console for the full stack trace.`);
        }
      }, 600);
      return;
    }

    /* HTML export: build report in-browser and open in new window */
    setTimeout(() => {
      /* Wrap the build + write in try/catch so any synchronous throw doesn't
         leave the button stuck on "Generating" forever — surface the error
         to the user and the console instead. */
      try {
        const html = buildReportHTML({
          sessionData, selectedTemplates, selectedProducts, checklistAnswers, allFindings,
          versionEntries, versionData, serverDetails, recommendations, actionItems, featureRequests,
          totalAnswered, totalQuestions, healthScore, date, selectedReports, dlpBundles, certificates, selectedEnhancements,
          licenseGaps, endpointAgentSummary, dlpDashboardSummary, dlpAllLogReport, auditLogReport, serviceLogsReport, starredLogIssues, dlpPostureSummary, dlpPostureSections, customerLogo,
          complianceFrameworks, enhancementOverrides, versionUpgrades, endpointMatrix, endpointCompatAssessment, endpointCompatInput,
          reportRuns: reportRuns ?? {},
          healthBreakdown,
          variant,
        });
        const win = window.open('', '_blank', 'width=1100,height=900');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => { setIsExporting(null); setExportDone(true); }, 400);
        } else {
          setIsExporting(null);
          alert('Pop-up blocked. Please allow pop-ups for this page and try again.');
        }
      } catch (err) {
        setIsExporting(null);
        setExportDone(false);
        console.error('[Step11Summary] buildReportHTML failed:', err);
        alert(`Report generation failed:\n\n${(err as Error).message}\n\nCheck the browser console for the full stack trace.`);
      }
    }, 600);
  };

  const reportItems = [
    { icon: '📋', label: 'Customer Information', detail: sessionData.customerName || 'Not set', ok: !!sessionData.customerName },
    { icon: '🎯', label: 'Per-Product Assessment', detail: `${selectedTemplates.length} product${selectedTemplates.length !== 1 ? 's' : ''} in scope`, ok: selectedTemplates.length > 0 },
    { icon: '🗂', label: 'Data Collection',       detail: `${dlpBundles.length} DLP Telemetry export${dlpBundles.length !== 1 ? 's' : ''} · ${selectedReports.length} report${selectedReports.length !== 1 ? 's' : ''} selected`, ok: dlpBundles.length > 0 || selectedReports.length > 0 },
    { icon: '🔢', label: 'Version & EoS Status',  detail: `${checkData.versionCount} components tracked`, ok: checkData.versionCount > 0 },
    { icon: '🖥',  label: 'Server Infrastructure', detail: `${checkData.serverCount} server${checkData.serverCount !== 1 ? 's' : ''} configured`, ok: checkData.serverCount > 0 },
    { icon: '💻', label: 'Endpoint Agent Analysis', detail: endpointAgentSummary
        ? `${endpointAgentSummary.totalRecords.toLocaleString()} endpoints${endpointAgentSummary.outdatedCount > 0 ? ` (${endpointAgentSummary.outdatedCount} outdated)` : ''}`
        : 'Not imported', ok: !!endpointAgentSummary && endpointAgentSummary.totalRecords > 0 },
    { icon: '🔍', label: 'Feature Posture Control', detail: `${allFindings.length} findings from ${totalAnswered} checks`, ok: totalAnswered > 0 },
    { icon: '🔐', label: 'Certificate Analysis',  detail: `${certificates.length} certificate${certificates.length !== 1 ? 's' : ''}${certificates.filter(c => c.status !== 'VALID').length > 0 ? ` (${certificates.filter(c => c.status !== 'VALID').length} need attention)` : ''}`, ok: certificates.length > 0 },
    { icon: '💡', label: 'Recommendations',       detail: `${recommendations.length} defined`, ok: recommendations.length > 0 },
    { icon: '⬆️', label: 'Version Upgrade Proposals', detail: `${versionUpgrades.length} proposal${versionUpgrades.length === 1 ? '' : 's'}`, ok: versionUpgrades.length > 0 },
    { icon: '📋', label: 'Action Items',          detail: `${actionItems.length} items (${actionItems.filter(a => a.status === 'done').length} done)`, ok: actionItems.length > 0 },
    { icon: '🚀', label: 'Customer Feature Requests', detail: `${featureRequests.length} submitted`, ok: featureRequests.length > 0 },
    { icon: '✨', label: 'Recommended Enhancements', detail: `${selectedEnhancements.length} selected`, ok: selectedEnhancements.length > 0 },
    { icon: '🔑', label: 'License Gap',            detail: `${licenseGaps.length} gap${licenseGaps.length !== 1 ? 's' : ''} recorded`, ok: licenseGaps.length > 0 },
    { icon: '💳', label: 'License Information',   detail: `${sessionData.licenses?.length ?? 0} licenses`, ok: (sessionData.licenses?.length ?? 0) > 0 },
    { icon: '🏆', label: 'Support Level',          detail: sessionData.supportLevel
        ? (sessionData.recommendedSupportLevel && sessionData.supportLevel.trim().toLowerCase() !== sessionData.recommendedSupportLevel.trim().toLowerCase()
            ? `${sessionData.supportLevel} → ${sessionData.recommendedSupportLevel} (upgrade recommended)`
            : sessionData.supportLevel)
        : 'Not set', ok: !!sessionData.supportLevel },
  ];

  return (
    <div className="space-y-[13px]">

      {/* Executive Brief blue header removed — the customer-facing PDF on the
          next page covers identity, KPIs, score and product chips already.
          The wizard step now opens straight to Assessment Completion. */}

      {/* ── TWO COLUMNS: COMPLETION + REPORT CONTENTS ── */}
      <div className="grid grid-cols-2 gap-[13px]">

        {/* Assessment Completion */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1D252C' }}>Assessment Completion</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${Math.round((completedSteps / COMPLETION_STEPS.length) * 100)}%`, background: 'linear-gradient(90deg,#023E8A,#69BC00)' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#69BC00' }}>
                {completedSteps}/{COMPLETION_STEPS.length}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {COMPLETION_STEPS.map((cs) => {
              const done = cs.check(checkData);
              return (
                <div key={cs.step} className="flex items-center gap-2 py-1 px-2 rounded-lg"
                  style={{ background: done ? 'rgba(22,163,74,0.04)' : 'transparent' }}>
                  {done
                    ? <CheckCircle2 size={13} style={{ color: '#69BC00', flexShrink: 0 }} />
                    : <Circle size={13} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: '11.5px', color: done ? '#1D252C' : '#94A3B8', fontWeight: done ? 500 : 400, flex: 1 }}>
                    {cs.label}
                  </span>
                  <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#CBD5E1' }}>
                    {String(cs.step).padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Report Contents */}
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} style={{ color: '#023E8A' }} />
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1D252C' }}>Report Contents</div>
          </div>
          <div className="space-y-1">
            {reportItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 py-1 px-2 rounded-lg"
                style={{ background: item.ok ? 'rgba(37,99,235,0.03)' : '#FAFAFA' }}>
                <span style={{ fontSize: '13px', flexShrink: 0 }}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '11.5px', fontWeight: 500, color: item.ok ? '#1D252C' : '#94A3B8' }}>{item.label}</div>
                </div>
                <div style={{ fontSize: '10px', color: item.ok ? '#64748B' : '#A30080', flexShrink: 0 }}>{item.detail}</div>
                {item.ok
                  ? <CheckCircle2 size={11} style={{ color: '#69BC00', flexShrink: 0 }} />
                  : <AlertCircle  size={11} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                }
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CUSTOMER LOGO UPLOAD ── */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.06)] p-[18px_20px]">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(54,176,201,0.12)' }}>
            <ImageIcon size={15} style={{ color: '#36B0C9' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1D252C' }}>Customer Logo</div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
              {customerLogo
                ? 'Logo appears on the report cover page next to the customer name.'
                : 'Optional. PNG, JPG, or SVG up to 750 KB — appears on the report cover page next to the customer name.'}
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLogoFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />
          {customerLogo ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-lg overflow-hidden"
                style={{ width: 72, height: 40, background: '#fff', border: '1px solid #E2E8F0', padding: 4 }}>
                <img src={customerLogo} alt="Customer logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <button
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                style={{ fontSize: '11px', background: 'rgba(54,176,201,0.1)', color: '#228BA0', border: '1px solid rgba(54,176,201,0.25)' }}
              >
                <Upload size={11} /> Replace
              </button>
              <button
                onClick={() => { setCustomerLogo(null); setLogoError(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                style={{ fontSize: '11px', background: 'rgba(220,38,38,0.05)', color: '#DA1B2E', border: '1px solid rgba(220,38,38,0.2)' }}
              >
                <X size={11} /> Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white"
              style={{ fontSize: '12px', background: 'linear-gradient(135deg,#36B0C9,#228BA0)' }}
            >
              <Upload size={12} /> Upload Logo
            </button>
          )}
        </div>
        {logoError && (
          <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <AlertCircle size={11} style={{ color: '#DA1B2E' }} />
            <span style={{ fontSize: '11px', color: '#7F1D1D' }}>{logoError}</span>
          </div>
        )}
      </div>

      {/* ── EXPORT CTA — two report variants side-by-side ──
          Left card: Executive Risk Briefing (short, CISO/CIO/Director).
          Right card: Health Check & Maturity Assessment (full technical, SOC/Infra/Ops).
          Same underlying data, different framing/depth. */}
      {exportDone ? (
        <div className="rounded-xl overflow-hidden"
          style={{ border: '1.5px solid rgba(22,163,74,0.3)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)' }}>
          <div className="p-[22px_26px]" style={{ background: 'rgba(22,163,74,0.03)' }}>
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(22,163,74,0.1)', border: '1.5px solid rgba(22,163,74,0.25)' }}>
                <CheckCircle2 size={22} style={{ color: '#69BC00' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#69BC00', marginBottom: '3px' }}>
                  Report opened in new tab
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Use the <strong>"Print / Save as PDF"</strong> button in the report to save it as a PDF file.
                </div>
              </div>
              <button onClick={() => setExportDone(false)}
                className="px-5 py-2.5 rounded-xl font-semibold transition-all flex-shrink-0"
                style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#64748B', border: '1.5px solid #E2E8F0' }}>
                Pick another
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* ── Executive Risk Briefing ── */}
          <div className="rounded-xl overflow-hidden flex flex-col"
            style={{ border: '1.5px solid rgba(163,0,128,0.22)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)', background: 'linear-gradient(135deg, #FDF7FB 0%, #F9F0F6 100%)' }}>
            <div className="p-[20px_22px] flex-1 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(163,0,128,0.1)', border: '1.5px solid rgba(163,0,128,0.25)' }}>
                  <Shield size={20} style={{ color: '#A30080' }} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1D252C', letterSpacing: '-0.01em', marginBottom: '2px' }}>
                    Executive Risk Briefing
                  </div>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#A30080', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Short · CISO, CIO, Director
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.55, marginBottom: '14px' }}>
                Decision-ready summary for security leadership. Risk posture, compliance exposure, executive overview, and the licensing &amp; enhancement roadmap. Technical evidence is excluded.
              </div>
              <ul style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.7, margin: '0 0 16px 16px', padding: 0 }}>
                <li>Risk Posture &amp; CISO Dashboard</li>
                <li>Compliance Exposure</li>
                <li>Customer Account &amp; Licensing</li>
                <li>Recommended License Extension</li>
                <li>Recommended Enhancements</li>
              </ul>
              <button
                onClick={() => handleExport('executive')}
                disabled={!!isExporting}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-all w-full mt-auto"
                style={{
                  fontSize: '13px',
                  background: isExporting === 'executive' ? '#D8B4D5' : 'linear-gradient(135deg, #A30080, #7A005F)',
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  boxShadow: isExporting ? 'none' : '0 4px 14px rgba(163,0,128,0.3)',
                  letterSpacing: '-0.01em',
                  opacity: isExporting && isExporting !== 'executive' ? 0.5 : 1,
                }}
              >
                {isExporting === 'executive'
                  ? <><Loader size={14} className="animate-spin" /> Generating…</>
                  : <><Download size={14} /> Generate Executive Risk Briefing</>
                }
              </button>
            </div>
          </div>

          {/* ── Health Check & Maturity Assessment ── */}
          <div className="rounded-xl overflow-hidden flex flex-col"
            style={{ border: '1.5px solid rgba(2,62,138,0.22)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)', background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF4FF 100%)' }}>
            <div className="p-[20px_22px] flex-1 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(37,99,235,0.1)', border: '1.5px solid rgba(37,99,235,0.2)' }}>
                  <Shield size={20} style={{ color: '#023E8A' }} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1D252C', letterSpacing: '-0.01em', marginBottom: '2px' }}>
                    Health Check &amp; Maturity Assessment
                  </div>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#023E8A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Full · Security Team, SOC, Infra, Ops
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.55, marginBottom: '14px' }}>
                Technical deep-dive — every checklist finding, version &amp; EoS detail, server posture, certificate trust, agent compatibility, and the prioritized remediation roadmap. Contains {reportItems.filter(i => i.ok).length} data sections.
              </div>
              <ul style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.7, margin: '0 0 16px 16px', padding: 0 }}>
                <li>Infrastructure &amp; Version Review · Server Health</li>
                <li>DLP / Endpoint / Posture Telemetry</li>
                <li>Certificate Analysis · Per-Product Findings</li>
                <li>Recommendations · Version Upgrades · Action Items</li>
                <li>Recommended License Extension &amp; Enhancements</li>
              </ul>
              <button
                onClick={() => handleExport('healthcheck')}
                disabled={!!isExporting}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-all w-full mt-auto"
                style={{
                  fontSize: '13px',
                  background: isExporting === 'healthcheck' ? '#93C5FD' : 'linear-gradient(135deg, #023E8A, #022D66)',
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  boxShadow: isExporting ? 'none' : '0 4px 14px rgba(37,99,235,0.3)',
                  letterSpacing: '-0.01em',
                  opacity: isExporting && isExporting !== 'healthcheck' ? 0.5 : 1,
                }}
              >
                {isExporting === 'healthcheck'
                  ? <><Loader size={14} className="animate-spin" /> Generating…</>
                  : <><Download size={14} /> Generate Health Check &amp; Maturity Assessment</>
                }
              </button>
            </div>
          </div>

          {/* ── PowerPoint Executive Summary ── */}
          <div className="rounded-xl overflow-hidden flex flex-col"
            style={{ border: '1.5px solid rgba(245,158,11,0.22)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)', background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' }}>
            <div className="p-[20px_22px] flex-1 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.2)' }}>
                  <FileText size={20} style={{ color: '#D97706' }} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1D252C', letterSpacing: '-0.01em', marginBottom: '2px' }}>
                    PowerPoint Executive Summary
                  </div>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#D97706', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Editable · Board Presentations
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.55, marginBottom: '14px' }}>
                One-page formatted presentation with health score, top risks, and recommended actions. Perfect for leadership briefings, presentations, and board-level discussions.
              </div>
              <ul style={{ fontSize: '10.5px', color: '#64748B', lineHeight: 1.7, margin: '0 0 16px 16px', padding: 0 }}>
                <li>Overall Health Score</li>
                <li>Critical Findings · Top Risks</li>
                <li>Recommended Actions</li>
                <li>Next Steps &amp; Roadmap</li>
              </ul>
              <button
                onClick={() => handleExport('powerpoint')}
                disabled={!!isExporting}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-all w-full mt-auto"
                style={{
                  fontSize: '13px',
                  background: isExporting === 'powerpoint' ? '#FCD34D' : 'linear-gradient(135deg, #D97706, #B45309)',
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  boxShadow: isExporting ? 'none' : '0 4px 14px rgba(217,119,6,0.3)',
                  letterSpacing: '-0.01em',
                  opacity: isExporting && isExporting !== 'powerpoint' ? 0.5 : 1,
                }}
              >
                {isExporting === 'powerpoint'
                  ? <><Loader size={14} className="animate-spin" /> Generating…</>
                  : <><Download size={14} /> Generate PowerPoint Summary</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLETE SESSION CTA ──
          Final action of the wizard. Marks the session as completed (sets
          completedAt on the persisted HCSession) and navigates back to the
          Sessions list, where the new COMPLETED badge is visible. Stays
          available even after the session was already completed — the
          operator can re-mark it (e.g. after edits) without harm. */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: isComplete ? '1.5px solid rgba(22,163,74,0.3)' : '1.5px solid rgba(217,119,6,0.25)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)' }}>
        <div className="p-[22px_26px]"
          style={{ background: isComplete ? 'rgba(22,163,74,0.03)' : 'linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 100%)' }}>
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: isComplete ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)',
                border: `1.5px solid ${isComplete ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}`,
              }}>
              {isComplete
                ? <CheckCircle2 size={22} style={{ color: '#16A34A' }} />
                : <Flag size={22} style={{ color: '#B58800' }} />
              }
            </div>
            <div className="flex-1">
              <div style={{ fontSize: '14px', fontWeight: 700, color: isComplete ? '#15803D' : '#92400E', marginBottom: '3px' }}>
                {isComplete ? 'Session is marked complete' : 'Wrap up this session'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {isComplete
                  ? 'You can still re-open this session to make edits — clicking Done again will refresh the completion timestamp.'
                  : 'When you\'re finished with this assessment, click Done to save current state, stamp a completion date, and return to the Sessions list.'}
              </div>
            </div>
            <button
              onClick={onComplete}
              className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-white transition-all flex-shrink-0"
              style={{
                fontSize: '14px',
                background: 'linear-gradient(135deg,#16A34A,#15803D)',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(22,163,74,0.35)',
                letterSpacing: '-0.01em',
              }}
            >
              <CheckCircle2 size={16} /> {isComplete ? 'Mark Complete Again' : 'Done'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

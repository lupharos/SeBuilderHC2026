import { useState, useMemo, useRef } from 'react';
import { CheckCircle2, Circle, Download, Loader, AlertCircle, FileText, Shield, Image as ImageIcon, X, Upload } from 'lucide-react';
import type { Template } from '../types/templates';
import type { TemplateAnswers } from '../rules/ruleEngine';
import type { SessionData, LicenseGapItem } from '../Dashboard';
import { CATALOG, GROUP_CONFIG, resolveLatest, resolveInstalledDates, STATUS_CFG, type VersionEntry } from './Step4VersionCheck';
import { WEB_REPORTS, DLP_REPORTS, EMAIL_REPORTS } from '../../constants/reportDefinitions';
import type { VersionDataStore } from '../../constants/versionData';
import type { Recommendation as StoredRec } from './Step8Recommendations';
import type { ActionItem as StoredAction } from './Step9NextSteps';
import type { FeatureRequest as StoredFR } from './Step10FeatureRequests';
import type { ServerEntry as StoredServer } from './StepServerDetails';
import { formatMemoryGB, memoryUsagePct, statusColor as statusColorDlp, type DlpServerBundle } from './dlpServerInfoParser';
import { formatRemaining, certStatusColor, certStatusIcon, type ParsedCertificate } from './certificateParser';
import type { EndpointAgentSummary } from './endpointAgentParser';
import type { DlpDashboardSummary } from './dlpDashboardParser';
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
  customerLogo: string | null;
  setCustomerLogo: React.Dispatch<React.SetStateAction<string | null>>;
}

function buildReportHTML(p: {
  sessionData: SessionData; selectedTemplates: Template[];
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
  customerLogo: string | null;
  healthBreakdown: {
    questionPenalty: number;
    eosCount: number;
    warnVersionCount: number;
    infraCritical: number;
    infraWarn: number;
    versionPenalty: number;
    infraPenalty: number;
  };
}) {
  const criticalCount = p.allFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount     = p.allFindings.filter(f => f.severity === 'HIGH').length;

  const hasWeb   = p.selectedTemplates.some(t => t.id === 'web');
  const hasDLP   = p.selectedTemplates.some(t => t.id === 'dlp');
  const hasEmail = p.selectedTemplates.some(t => t.id === 'email');

  const webUsageReports   = WEB_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);
  const dataUsageReports  = DLP_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);
  const emailUsageReports = EMAIL_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);

  const effectiveStatus = (e: VersionEntry) => e.statusOverride ?? e.status;
  const customEntriesByGroup = Object.values(p.versionEntries).filter(
    (e): e is VersionEntry => !!e?.isCustom,
  );
  const versionGroups = Object.entries(GROUP_CONFIG).map(([groupKey, grp]) => {
    const catalogEntries = grp.componentIds
      .map(id => ({ id, entry: p.versionEntries[id] }))
      .filter((x): x is { id: string; entry: VersionEntry } => !!(x.entry?.installedVersion));
    const customEntries = customEntriesByGroup
      .filter(e => e.groupId === groupKey && e.installedVersion)
      .map(e => ({ id: e.id, entry: e }));
    return { grp, entries: [...catalogEntries, ...customEntries] };
  }).filter(({ entries }) => entries.length > 0);

  const allVEntries = Object.values(p.versionEntries).filter(e => e.installedVersion);
  const vCounts = {
    ok:       allVEntries.filter(e => effectiveStatus(e) === 'ok').length,
    warning:  allVEntries.filter(e => effectiveStatus(e) === 'warning').length,
    critical: allVEntries.filter(e => ['critical','eos','eol'].includes(effectiveStatus(e))).length,
    unknown:  allVEntries.filter(e => effectiveStatus(e) === 'unknown').length,
  };
  const activeServers = p.serverDetails.filter(s => s.applicable);

  const infraAlerts: string[] = [];
  for (const s of activeServers) {
    const name = s.hostname || SRV_LABELS[s.type] || s.type;
    for (const d of s.drives) {
      const dp = pct(d.usedGB, d.totalGB);
      if (dp >= 70) infraAlerts.push(`${name} — ${d.label || 'Drive'}: ${dp}% disk used`);
    }
    if (s.ramTotalGB > 0) { const rp = pct(s.ramUsedGB, s.ramTotalGB); if (rp >= 70) infraAlerts.push(`${name}: ${rp}% RAM used`); }
    if (s.cpuUsagePercent >= 70) infraAlerts.push(`${name}: ${s.cpuUsagePercent}% CPU`);
  }

  const productRows = p.selectedTemplates.map(t => {
    let answered = 0;
    const bySev: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const q of t.questions) {
      const key = `${t.id}__${q.id}`;
      const ans = p.checklistAnswers[key];
      if (ans?.value != null) answered++;
      if (q.severity && ans?.value === (q.triggerOn ?? 'no')) bySev[q.severity] = (bySev[q.severity] ?? 0) + 1;
    }
    const totalF = Object.values(bySev).reduce((a, b) => a + b, 0);
    const score  = answered === 0 ? null : Math.round(Math.max(0, (answered - totalF) / answered * 100));
    const sc     = score === null ? '#64748b' : score >= 80 ? '#69BC00' : score >= 60 ? '#B58800' : '#A30080';
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

  /* Grouped TOC by Part — each part renders as a sub-header in the TOC list */
  type TocEntry = { kind: 'part'; label: string } | { kind: 'item'; label: string };
  const tocEntries: TocEntry[] = [
    { kind: 'part', label: 'Part I · Executive Overview' },
    { kind: 'item', label: 'Introduction' },
    ...(hasAccountSection ? [{ kind: 'item' as const, label: 'Customer Account &amp; Licensing' }] : []),
    { kind: 'item', label: 'Executive Summary' },

    { kind: 'part', label: 'Part II · Technical Assessment' },
    { kind: 'item', label: 'Infrastructure &amp; Version Review' },
    ...(activeServers.length > 0 ? [{ kind: 'item' as const, label: 'Server Infrastructure' }] : []),
    ...(p.dlpBundles.length > 0 ? [{ kind: 'item' as const, label: 'DLP Server Bundle Analysis' }] : []),
    ...(p.endpointAgentSummary && p.endpointAgentSummary.totalRecords > 0 ? [{ kind: 'item' as const, label: 'Endpoint Agent Analysis' }] : []),
    ...(p.certificates.length > 0 ? [{ kind: 'item' as const, label: 'Certificate Analysis' }] : []),
    ...(p.selectedTemplates.length > 0 ? [{ kind: 'item' as const, label: 'Per-Product Security Assessment' }] : []),
    ...(p.allFindings.length > 0 ? [{ kind: 'item' as const, label: 'Checklist Findings' }] : []),
    ...(hasWeb   ? [{ kind: 'item' as const, label: 'Web Security Usage' }] : []),
    ...(hasDLP   ? [{ kind: 'item' as const, label: 'Data Security Usage' }] : []),
    ...(hasEmail ? [{ kind: 'item' as const, label: 'Email Security Usage' }] : []),

    { kind: 'part', label: 'Part III · Roadmap &amp; Strategy' },
    ...(p.recommendations.length > 0 ? [{ kind: 'item' as const, label: 'Recommendations' }] : []),
    ...(p.actionItems.length > 0 ? [{ kind: 'item' as const, label: 'Action Items &amp; Next Steps' }] : []),
    ...(p.featureRequests.length > 0 ? [{ kind: 'item' as const, label: 'Customer Feature Requests' }] : []),
    ...((p.licenseGaps?.length ?? 0) > 0 ? [{ kind: 'item' as const, label: 'Recommended License Extension' }] : []),
    ...(p.selectedEnhancements.length > 0 ? [{ kind: 'item' as const, label: 'Recommended Enhancements' }] : []),

    { kind: 'part', label: 'Part IV · Reference' },
    { kind: 'item', label: 'Appendix — Effort Score Card' },
  ];
  /* Backward-compat: keep the old flat list reachable for any downstream code that scans it */
  const tocItems = tocEntries.filter((e): e is { kind: 'item'; label: string } => e.kind === 'item').map(e => e.label);
  void tocItems;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>HC Report — ${esc(p.sessionData.customerName || 'Customer')}</title>
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
    <div class="cover-h1">Health Check &amp; Maturity Assessment</div>
    <div class="cover-sub">A comprehensive review of the customer's Forcepoint infrastructure — infrastructure posture, version &amp; lifecycle risk, licensing alignment, and a prioritized roadmap of remediation actions.</div>
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
      <div class="cover-summary-grid">
        <div class="cover-summary-cell">
          <div class="cover-summary-cell-val" style="color:${p.healthScore === null ? '#94a3b8' : p.healthScore >= 80 ? 'var(--fp-ok)' : p.healthScore >= 60 ? 'var(--fp-warn)' : 'var(--fp-critical)'};">
            ${p.healthScore === null ? '—' : p.healthScore + '%'}
          </div>
          <div class="cover-summary-cell-label">Health Score</div>
        </div>
        <div class="cover-summary-cell">
          <div class="cover-summary-cell-val" style="color:${criticalCount > 0 ? 'var(--fp-critical)' : 'var(--fp-ink-faint)'};">${criticalCount}</div>
          <div class="cover-summary-cell-label">Critical Findings</div>
        </div>
        <div class="cover-summary-cell">
          <div class="cover-summary-cell-val" style="color:${highCount > 0 ? 'var(--fp-high)' : 'var(--fp-ink-faint)'};">${highCount}</div>
          <div class="cover-summary-cell-label">High Findings</div>
        </div>
        <div class="cover-summary-cell">
          <div class="cover-summary-cell-val" style="color:${openActions > 0 ? 'var(--fp-warn)' : 'var(--fp-ok)'};">${openActions}</div>
          <div class="cover-summary-cell-label">Open Actions</div>
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
     PART I — EXECUTIVE OVERVIEW
══════════════════════════════════════ -->
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
  <div class="section-eyebrow">Section 01 · Background</div>
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
  <div class="section-eyebrow">Section 02 · Customer Profile</div>
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

  ${hasLicenses ? `
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

  ${hasEntitlements ? `
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

  ${hasHardware ? `
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

  ${hasCases ? `
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

  ${hasCustFR ? `
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
  <div class="section-eyebrow">${hasAccountSection ? 'Section 03' : 'Section 02'} · Board Briefing</div>
  <div class="section-title">Executive Summary</div>

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

    const mediumCount = p.allFindings.filter(f => f.severity === 'MEDIUM').length;
    const lowCount    = p.allFindings.filter(f => f.severity === 'LOW').length;
    const maxSev = Math.max(criticalCount, highCount, mediumCount, lowCount, 1);
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
        <div class="exec-sev-title">Findings by Severity (${p.allFindings.length} total)</div>
        ${sevRow('CRITICAL', criticalCount, 'var(--fp-violette)')}
        ${sevRow('HIGH',     highCount,     'var(--fp-red)')}
        ${sevRow('MEDIUM',   mediumCount,   'var(--fp-yellow)')}
        ${sevRow('LOW',      lowCount,      'var(--fp-green)')}
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
      if (hb.questionPenalty > 0) pills.push({ label: 'Checklist Findings', count: hb.questionPenalty, pts: 0, color: 'var(--fp-violette)' });
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
      ? `Building on the account &amp; licensing context established in the preceding section, this Executive Summary consolidates the headline metrics, the highest-priority findings, and the strategic recommendations into a single decision-ready view.`
      : `This Executive Summary consolidates the headline metrics, the highest-priority findings, and the strategic recommendations into a single decision-ready view.`}
    Detailed evidence is presented in <em>Part II — Technical Assessment</em>, and the implementation plan in <em>Part III — Roadmap &amp; Strategy</em>.
  </p>

  ${keyObs.length > 0 ? `
  <div class="subsection-title">Key Observations</div>
  <div class="obs-group">
    ${keyObs.map(o => `<div class="obs obs-${esc(o.level)}">
      <span class="obs-label" style="color:${obsColor[o.level] ?? '#64748b'};">${esc(o.level)}</span>
      <span class="obs-text">${esc(o.text)}</span>
    </div>`).join('')}
  </div>` : ''}

  ${(() => {
    if (p.recommendations.length === 0) return '';
    /* If the analyst flagged any recommendations as ★ featured, use that selection.
       Otherwise fall back to the first 12 — preserving legacy behaviour for old sessions. */
    const featured = p.recommendations.filter((r) => r.featured);
    const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const list = featured.length > 0
      ? [...featured].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9))
      : p.recommendations.slice(0, 12);
    const curatedNote = featured.length > 0
      ? '<span style="font-size:10px;color:var(--fp-cyan-deep);font-weight:600;margin-left:8px;letter-spacing:0.04em;">★ ANALYST-CURATED</span>'
      : '';
    return `
  <div class="subsection-title" style="margin-top:22px;">High-Level Recommendations${curatedNote}</div>
  <ul style="padding-left:20px;color:#334155;line-height:1.9;margin-bottom:16px;">
    ${list.map(r => `<li style="margin-bottom:3px;"><span style="${sevStyle(r.priority.toUpperCase())};padding:1px 6px;border-radius:3px;font-size:8.5px;font-weight:700;margin-right:7px;">${esc(r.priority.toUpperCase())}</span><span style="font-weight:500;">${esc(r.title)}</span>${r.detail ? `<span style="color:#94a3b8;font-size:10.5px;"> — ${esc(r.detail)}</span>` : ''}</li>`).join('')}
  </ul>`;
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

<!-- ══════════════════════════════════════
     PART II — TECHNICAL ASSESSMENT
══════════════════════════════════════ -->
<div class="chapter">
  <div class="chapter-part">PART II</div>
  <div class="chapter-title">Technical Assessment</div>
  <div class="chapter-sub">The supporting evidence behind the verdict — infrastructure inventory, software version &amp; end-of-life posture, server health, DLP bundle telemetry, certificate validity, and per-product checklist findings.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     INFRASTRUCTURE & VERSION REVIEW
══════════════════════════════════════ -->
${versionGroups.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 04 · Version Lifecycle</div>
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
  <div class="section-eyebrow">Section 05 · Server Health</div>
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
  <div class="section-eyebrow">Section 06 · DLP Telemetry</div>
  <div class="section-title">DLP Server Bundle Analysis</div>
  <p style="margin-bottom:14px;color:#475569;line-height:1.65;font-size:11px;">
    The following analysis was generated from <span style="font-family:monospace;background:#f1f5f9;padding:1px 5px;border-radius:3px;">DLPServerInfo_*</span> diagnostic bundles collected from each Forcepoint Security Manager / DLP server. Each bundle contains the output of <span style="font-family:monospace;">systeminfo</span>, WMIC hardware queries, Windows service status, Forcepoint product detection, SQL Server health queries, and active policy data.
  </p>

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

    // ── System properties table ──
    // NOTE: Domain (AD), Logon Server, and service Run-As accounts are
    // intentionally redacted from the customer-facing report — they leak
    // internal AD topology and service-account names.
    const sysFields: Array<[string, string]> = sys ? [
      ['Host Name', sys.hostName],
      ['OS Name', sys.osName],
      ['OS Version', sys.osVersion],
      ['OS Build Type', sys.osBuildType],
      ['System Model', `${sys.systemManufacturer} ${sys.systemModel}`.trim()],
      ['System Type', sys.systemType],
      ['BIOS Version', sys.biosVersion],
      ['Hypervisor', sys.hypervisorDetected ? 'Detected' : '—'],
      ['Time Zone', sys.timeZone],
      ['Install Date', sys.installDate],
      ['Last Boot', sys.bootTime],
    ] : [];

    const sysRows = sysFields.filter(([, v]) => v).map(([k, v]) => `
      <tr><td style="font-weight:700;color:#475569;width:35%;font-size:10px;">${esc(k)}</td><td style="font-family:monospace;font-size:10px;color:#1D252C;">${esc(v)}</td></tr>`).join('');

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
        <div style="background:rgba(255,255,255,0.15);padding:5px 10px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.08em;">DLP BUNDLE</div>
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

      <!-- System properties -->
      ${sysRows ? `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">SYSTEM PROPERTIES</div>
        <table style="width:100%;border-collapse:collapse;">${sysRows}</table>
      </div>` : ''}

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
          </div>` : `<div style="font-size:10.5px;color:#69BC00;margin-bottom:8px;">✓ All ${svc.totalWebsenseServices} services parsed from the bundle were reporting Running state.</div>`}

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

      <!-- Active policies -->
      ${pol ? `
      <div style="padding:12px 16px;${b.installedProducts.length > 0 || b.depEnabled != null ? 'border-bottom:1px solid #e2e8f0;' : ''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">ACTIVE POLICIES &amp; RULES</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#dbeafe;color:#023E8A;border:1px solid #93c5fd;">${pol.policyNames.length} POLICIES · ${pol.totalRules} RULES</span>
          ${pol.rulesWithExceptions.length > 0 ? `<span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fff7ed;color:#B58800;border:1px solid #fdba74;">${pol.rulesWithExceptions.length} WITH EXCEPTIONS</span>` : ''}
        </div>
        <div style="font-size:10.5px;color:#475569;column-count:2;column-gap:16px;">
          ${pol.policyNames.slice(0, 40).map(n => `<div style="margin-bottom:2px;">• ${esc(n)}</div>`).join('')}
          ${pol.policyNames.length > 40 ? `<div style="color:#94a3b8;font-style:italic;">… and ${pol.policyNames.length - 40} more</div>` : ''}
        </div>
      </div>` : ''}

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
  <div class="section-eyebrow">Section · Endpoint Agents</div>
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
     PER-PRODUCT SECURITY ASSESSMENT
══════════════════════════════════════ -->
${p.selectedTemplates.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 08 · Product Scorecard</div>
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
  <div class="section-eyebrow">Section 08b · Findings Detail</div>
  <div class="section-title">Checklist Findings (${p.allFindings.length})</div>
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
    The following reports provide behavioural intelligence derived from Forcepoint Web Security telemetry.
    Data will be populated automatically via SQL integration and will reflect live customer data once the integration is configured.
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  ${webUsageReports.map((r, i) => `
  <div style="border:1.5px solid #bae6fd;border-radius:8px;overflow:hidden;">
    <div style="background:#f0f9ff;padding:8px 12px;border-bottom:1px solid #bae6fd;display:flex;align-items:center;gap:8px;">
      <span style="font-family:monospace;font-size:9px;font-weight:700;color:#36B0C9;background:#fff;border:1px solid #bae6fd;padding:1px 6px;border-radius:3px;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-size:11px;font-weight:700;color:#023E8A;flex:1;">${esc(r)}</span>
      <span style="font-size:8.5px;font-weight:700;padding:1px 7px;border-radius:3px;background:#fef9c3;color:#a16207;border:1px solid #fde68a;flex-shrink:0;">PENDING</span>
    </div>
    <div style="padding:10px 12px;color:#94a3b8;font-size:10.5px;font-style:italic;">
      Data pending — SQL integration required.
    </div>
  </div>`).join('')}
  </div>
</div>` : ''}

${hasDLP ? `
<!-- ══════════════════════════════════════
     DATA SECURITY USAGE
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Data Security Usage</div>
  <p style="margin-bottom:20px;color:#334155;line-height:1.75;">
    The following reports provide data loss prevention intelligence derived from Forcepoint DLP telemetry.
    Data will be populated automatically via SQL integration and will reflect live customer data once the integration is configured.
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  ${dataUsageReports.map((r, i) => `
  <div style="border:1.5px solid #d9f99d;border-radius:8px;overflow:hidden;">
    <div style="background:#f7fee7;padding:8px 12px;border-bottom:1px solid #d9f99d;display:flex;align-items:center;gap:8px;">
      <span style="font-family:monospace;font-size:9px;font-weight:700;color:#69BC00;background:#fff;border:1px solid #bbf7d0;padding:1px 6px;border-radius:3px;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-size:11px;font-weight:700;color:#023E8A;flex:1;">${esc(r)}</span>
      <span style="font-size:8.5px;font-weight:700;padding:1px 7px;border-radius:3px;background:#fef9c3;color:#a16207;border:1px solid #fde68a;flex-shrink:0;">PENDING</span>
    </div>
    <div style="padding:10px 12px;color:#94a3b8;font-size:10.5px;font-style:italic;">
      Data pending — SQL integration required.
    </div>
  </div>`).join('')}
  </div>
</div>` : ''}

${hasEmail ? `
<!-- ══════════════════════════════════════
     EMAIL SECURITY USAGE
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Email Security Usage</div>
  <p style="margin-bottom:20px;color:#334155;line-height:1.75;">
    The following reports provide threat intelligence derived from Forcepoint Email Security telemetry.
    Data will be populated automatically via SQL integration and will reflect live customer data once the integration is configured.
  </p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  ${emailUsageReports.map((r, i) => `
  <div style="border:1.5px solid #fecdd3;border-radius:8px;overflow:hidden;">
    <div style="background:#fff1f2;padding:8px 12px;border-bottom:1px solid #fecdd3;display:flex;align-items:center;gap:8px;">
      <span style="font-family:monospace;font-size:9px;font-weight:700;color:#e11d48;background:#fff;border:1px solid #fecdd3;padding:1px 6px;border-radius:3px;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-size:11px;font-weight:700;color:#023E8A;flex:1;">${esc(r)}</span>
      <span style="font-size:8.5px;font-weight:700;padding:1px 7px;border-radius:3px;background:#fef9c3;color:#a16207;border:1px solid #fde68a;flex-shrink:0;">PENDING</span>
    </div>
    <div style="padding:10px 12px;color:#94a3b8;font-size:10.5px;font-style:italic;">
      Data pending — SQL integration required.
    </div>
  </div>`).join('')}
  </div>
</div>` : ''}

<!-- ══════════════════════════════════════
     CERTIFICATE ANALYSIS
══════════════════════════════════════ -->
${p.certificates.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 07 · Certificate Trust</div>
  <div class="section-title">Certificate Analysis</div>
  <p style="margin-bottom:14px;color:#475569;line-height:1.65;font-size:11px;">
    The following X.509 certificates were imported from the customer's environment (typically <span style="font-family:monospace;background:#f1f5f9;padding:1px 5px;border-radius:3px;">allcerts.cer</span> and <span style="font-family:monospace;background:#f1f5f9;padding:1px 5px;border-radius:3px;">ca.cer</span> from the DLP Server Info bundle). Subject, issuer, validity dates, key length, signature algorithm, and CA constraint were parsed directly from the DER-encoded certificate bodies.
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

<!-- ══════════════════════════════════════
     PART III — ROADMAP & STRATEGY
══════════════════════════════════════ -->
<div class="chapter">
  <div class="chapter-part">PART III</div>
  <div class="chapter-title">Roadmap &amp; Strategy</div>
  <div class="chapter-sub">The implementation plan — prioritized recommendations, dated action items, customer-requested enhancements, and forward-looking Forcepoint product proposals that translate the assessment into a sequence of decisions.</div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     FINDINGS, OBSERVATIONS & RECOMMENDATIONS
══════════════════════════════════════ -->
${p.recommendations.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 09 · Prioritized Remediation</div>
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
     ACTION ITEMS & NEXT STEPS
══════════════════════════════════════ -->
${p.actionItems.length > 0 ? `
<div class="section">
  <div class="section-eyebrow">Section 10 · Execution Plan</div>
  <div class="section-title">Action Items &amp; Next Steps (${p.actionItems.length})</div>
  <table>
    <thead>
      <tr>
        <th style="width:34px;">#</th>
        <th>Task</th>
        <th style="width:110px;">Owner</th>
        <th style="width:110px;">Due Date</th>
        <th style="width:90px;">Product</th>
        <th style="width:80px;">Priority</th>
        <th style="width:100px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${p.actionItems.map((a, i) => `<tr>
        <td style="font-family:monospace;font-weight:700;color:#36B0C9;text-align:center;">${i + 1}</td>
        <td style="font-weight:500;color:#023E8A;">${esc(a.task)}</td>
        <td style="font-size:10.5px;">${esc(a.owner || '—')}</td>
        <td style="font-family:monospace;font-size:10.5px;">${esc(a.dueDate || '—')}</td>
        <td style="font-family:monospace;font-size:10.5px;">${esc(a.product || '—')}</td>
        <td><span class="badge" style="${sevStyle(a.priority.toUpperCase())}">${esc(a.priority.toUpperCase())}</span></td>
        <td><span class="badge" style="${stStyle(a.status)}">${esc(a.status.replace(/_/g,' ').toUpperCase())}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- ══════════════════════════════════════
     ENHANCEMENT REQUESTS
══════════════════════════════════════ -->
${p.featureRequests.length > 0 ? `
<div class="section">
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

<!-- ══════════════════════════════════════
     RECOMMENDED LICENSE EXTENSION (standalone section, above Enhancements)
══════════════════════════════════════ -->
${(() => {
  const gaps = p.licenseGaps ?? [];
  if (gaps.length === 0) return '';
  const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...gaps].sort((a, b) => (PRIO[a.priority ?? 'medium'] ?? 9) - (PRIO[b.priority ?? 'medium'] ?? 9));
  return `
<div class="section">
  <div class="section-eyebrow">Section 11 · Licensing Roadmap</div>
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
  <div class="section-eyebrow">Section 12 · Strategic Initiatives</div>
  <div class="section-title">Recommended Enhancements</div>
  <p style="margin-bottom:18px;color:#475569;line-height:1.7;font-size:11px;">
    The following Forcepoint product enhancements are proposed as next-step initiatives to strengthen the customer's overall security posture. Each recommendation is selected based on the health check findings, current scope, and identified gaps. The business value commentary below should be reviewed jointly with the customer's security and compliance stakeholders.
  </p>

  ${ENHANCEMENTS.filter(e => p.selectedEnhancements.includes(e.id)).map((e, idx) => `
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
  </div>`).join('')}
</div>` : ''}

</div><!-- /content (Part III closes here) -->

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
  <div class="section-eyebrow">Section A · Scoring Rubric</div>
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

<!-- FOOTER -->
<div class="rpt-footer">
  <div class="rpt-footer-brand">Forcepoint</div>
  <div>Health Check &amp; Maturity Assessment Report &nbsp;·&nbsp; ${esc(p.date)} &nbsp;·&nbsp; Confidential</div>
  <div style="display:flex;align-items:center;gap:10px;">
    ${p.customerLogo ? `<img src="${esc(p.customerLogo)}" alt="${esc(p.sessionData.customerName || 'Customer')} logo" style="max-height:22px;max-width:80px;object-fit:contain;opacity:0.8;">` : ''}
    <span>© ${new Date().getFullYear()} Forcepoint LLC | Confidential</span>
  </div>
</div>

</div>
</body>
</html>`;
}

export function Step11Summary({ sessionData, templates, selectedProducts, checklistAnswers, versionEntries, versionData, recommendations, actionItems, featureRequests, serverDetails, selectedReports, dlpBundles, certificates, selectedEnhancements, licenseGaps, endpointAgentSummary, dlpDashboardSummary, customerLogo, setCustomerLogo }: Step11Props) {
  const [isExporting, setIsExporting] = useState(false);
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
  };

  const completedSteps = COMPLETION_STEPS.filter(s => s.check(checkData)).length;
  const hsc = scoreColor(healthScore);
  const criticalCount = allFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount     = allFindings.filter(f => f.severity === 'HIGH').length;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const handleExport = () => {
    setIsExporting(true);
    setExportDone(false);
    setTimeout(() => {
      const html = buildReportHTML({
        sessionData, selectedTemplates, checklistAnswers, allFindings,
        versionEntries, versionData, serverDetails, recommendations, actionItems, featureRequests,
        totalAnswered, totalQuestions, healthScore, date, selectedReports, dlpBundles, certificates, selectedEnhancements,
        licenseGaps, endpointAgentSummary, dlpDashboardSummary, customerLogo, healthBreakdown,
      });
      const win = window.open('', '_blank', 'width=1100,height=900');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { setIsExporting(false); setExportDone(true); }, 400);
      } else {
        setIsExporting(false);
        alert('Pop-up blocked. Please allow pop-ups for this page and try again.');
      }
    }, 600);
  };

  const reportItems = [
    { icon: '📋', label: 'Customer Information', detail: sessionData.customerName || 'Not set', ok: !!sessionData.customerName },
    { icon: '🎯', label: 'Per-Product Assessment', detail: `${selectedTemplates.length} product${selectedTemplates.length !== 1 ? 's' : ''} in scope`, ok: selectedTemplates.length > 0 },
    { icon: '🗂', label: 'Data Collection',       detail: `${dlpBundles.length} DLP bundle${dlpBundles.length !== 1 ? 's' : ''} · ${selectedReports.length} report${selectedReports.length !== 1 ? 's' : ''} selected`, ok: dlpBundles.length > 0 || selectedReports.length > 0 },
    { icon: '🔢', label: 'Version & EoS Status',  detail: `${checkData.versionCount} components tracked`, ok: checkData.versionCount > 0 },
    { icon: '🖥',  label: 'Server Infrastructure', detail: `${checkData.serverCount} server${checkData.serverCount !== 1 ? 's' : ''} configured`, ok: checkData.serverCount > 0 },
    { icon: '💻', label: 'Endpoint Agent Analysis', detail: endpointAgentSummary
        ? `${endpointAgentSummary.totalRecords.toLocaleString()} endpoints${endpointAgentSummary.outdatedCount > 0 ? ` (${endpointAgentSummary.outdatedCount} outdated)` : ''}`
        : 'Not imported', ok: !!endpointAgentSummary && endpointAgentSummary.totalRecords > 0 },
    { icon: '🔍', label: 'Checklist Findings',    detail: `${allFindings.length} findings from ${totalAnswered} checks`, ok: totalAnswered > 0 },
    { icon: '🔐', label: 'Certificate Analysis',  detail: `${certificates.length} certificate${certificates.length !== 1 ? 's' : ''}${certificates.filter(c => c.status !== 'VALID').length > 0 ? ` (${certificates.filter(c => c.status !== 'VALID').length} need attention)` : ''}`, ok: certificates.length > 0 },
    { icon: '💡', label: 'Recommendations',       detail: `${recommendations.length} defined`, ok: recommendations.length > 0 },
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

      {/* ── EXECUTIVE BRIEF HEADER ── */}
      <div className="rounded-xl overflow-hidden text-white"
        style={{ background: 'linear-gradient(145deg,#012566 0%,#023E8A 40%,#023E8A 100%)', boxShadow: '0 6px 24px rgba(15,41,82,0.22)' }}>
        <div className="p-[24px_28px]">

          {/* Top row */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0 pr-6">
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', opacity: 0.5, marginBottom: '8px' }}>
                FORCEPOINT INTELLIGENCE PLATFORM — EXECUTIVE HEALTH CHECK REPORT
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '6px' }}>
                {sessionData.customerName ? `${sessionData.customerName}` : 'Customer Not Set'}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.6 }}>
                {[
                  sessionData.forcepointId && `ID: ${sessionData.forcepointId}`,
                  sessionData.industry, sessionData.country,
                ].filter(Boolean).join(' · ')}
              </div>
              {(sessionData.csm || sessionData.salesEngineer) && (
                <div style={{ fontSize: '11px', opacity: 0.45, marginTop: '3px' }}>
                  {[sessionData.csm && `CSM: ${sessionData.csm}`, sessionData.salesEngineer && `SE: ${sessionData.salesEngineer}`].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>

            {/* Score badge */}
            <div className="rounded-2xl p-[14px_20px] text-center flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.12)', minWidth: '90px' }}>
              <div style={{
                fontSize: '32px', fontWeight: 800, lineHeight: 1,
                color: healthScore === null ? 'rgba(255,255,255,0.35)'
                  : healthScore >= 80 ? '#6EE7B7'
                  : healthScore >= 60 ? '#FCD34D' : '#FCA5A5',
              }}>
                {healthScore === null ? '—' : `${healthScore}%`}
              </div>
              <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', opacity: 0.5, marginTop: '5px' }}>HEALTH</div>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { val: allFindings.length,    label: 'Total Findings',   color: allFindings.length > 0 ? '#FCA5A5' : '#6EE7B7' },
              { val: criticalCount + highCount, label: 'Critical + High', color: criticalCount + highCount > 0 ? '#FCA5A5' : '#6EE7B7' },
              { val: totalAnswered,          label: 'Checks Done',     color: '#93C5FD' },
              { val: recommendations.length, label: 'Recommendations', color: '#FCD34D' },
              { val: actionItems.length,     label: 'Action Items',    color: '#C4B5FD' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl p-[10px_14px]"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1, color: kpi.color }}>{kpi.val}</div>
                <div style={{ fontSize: '9.5px', opacity: 0.55, marginTop: '4px' }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Products + date */}
          <div className="flex items-center gap-2 flex-wrap mt-4">
            {selectedTemplates.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: 600 }}>
                <span>{t.icon}</span><span>{t.name.replace(' HC', '')}</span>
              </div>
            ))}
            {selectedTemplates.length === 0 && (
              <span style={{ fontSize: '11px', opacity: 0.4 }}>No products selected</span>
            )}
            <div className="ml-auto" style={{ fontSize: '10px', opacity: 0.4 }}>{date}</div>
          </div>
        </div>
      </div>

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

      {/* ── EXPORT CTA ── */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: exportDone ? '1.5px solid rgba(22,163,74,0.3)' : '1.5px solid rgba(37,99,235,0.2)', boxShadow: '0 2px 12px rgba(15,41,82,0.06)' }}>
        <div className="p-[22px_26px]"
          style={{ background: exportDone ? 'rgba(22,163,74,0.03)' : 'linear-gradient(135deg, #F8FAFC 0%, #EEF4FF 100%)' }}>
          {exportDone ? (
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
                Regenerate
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1.5px solid rgba(37,99,235,0.2)' }}>
                <Shield size={22} style={{ color: '#023E8A' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1D252C', marginBottom: '3px' }}>
                  Generate Executive Report
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Opens a complete, print-ready HTML report in a new tab. Contains all {reportItems.filter(i => i.ok).length} data sections.
                  Use browser <strong>Print → Save as PDF</strong> to create a PDF file.
                </div>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-white transition-all flex-shrink-0"
                style={{
                  fontSize: '14px',
                  background: isExporting ? '#93C5FD' : 'linear-gradient(135deg, #023E8A, #023E8A)',
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  boxShadow: isExporting ? 'none' : '0 4px 18px rgba(37,99,235,0.4)',
                  letterSpacing: '-0.01em',
                }}
              >
                {isExporting
                  ? <><Loader size={16} className="animate-spin" /> Generating…</>
                  : <><Download size={16} /> Export Report</>
                }
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

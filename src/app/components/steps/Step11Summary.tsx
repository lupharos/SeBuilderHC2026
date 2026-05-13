import { useState, useMemo } from 'react';
import { CheckCircle2, Circle, Download, Loader, AlertCircle, FileText, Shield } from 'lucide-react';
import type { Template, QuestionSeverity } from '../types/templates';
import type { TemplateAnswers } from '../rules/ruleEngine';
import type { SessionData } from '../Dashboard';
import { CATALOG, GROUP_CONFIG, resolveLatest, resolveInstalledDates, STATUS_CFG, type VersionEntry } from './Step4VersionCheck';
import { WEB_REPORTS, DLP_REPORTS, EMAIL_REPORTS } from '../../constants/reportDefinitions';
import type { VersionDataStore } from '../../constants/versionData';
import type { Recommendation as StoredRec } from './Step8Recommendations';
import type { ActionItem as StoredAction } from './Step9NextSteps';
import type { FeatureRequest as StoredFR } from './Step10FeatureRequests';
import type { ServerEntry as StoredServer } from './StepServerDetails';
import { formatMemoryGB, memoryUsagePct, statusColor as statusColorDlp, type DlpServerBundle } from './dlpServerInfoParser';
import { formatRemaining, certStatusColor, certStatusIcon, type ParsedCertificate } from './certificateParser';
import { ENHANCEMENTS } from '../../constants/enhancements';
import { lookupHardwareLifecycle, lifecycleStatus, lifecycleStatusColor } from '../../utils/hardwareLifecycle';

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
}

const PRODUCT_ID_MAP: Record<string, string> = {
  web: 'web', email: 'email', data: 'dlp', ngfw: 'ngfw',
  dspm: 'dspm', cls: 'classification', appl: 'appl', vappl: 'appl',
};
const SEV_ORDER: QuestionSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SRV_LABELS: Record<string, string> = {
  fsm: 'FSM Server', sql: 'SQL Server', protector: 'Protector',
  supplemental: 'Supplemental DLP', content_gateway: 'Content Gateway',
  email_gateway: 'Email Gateway', ngfw: 'NGFW Management',
};

const COMPLETION_STEPS = [
  { step: 1,  label: 'Customer Information',  check: (d: CheckData) => !!d.customerName },
  { step: 2,  label: 'Product Scope',          check: (d: CheckData) => d.productsSelected },
  { step: 3,  label: 'Data Collection',        check: (_: CheckData) => true },
  { step: 4,  label: 'Version & EoS Check',    check: (d: CheckData) => d.versionCount > 0 },
  { step: 5,  label: 'Server Infrastructure',  check: (d: CheckData) => d.serverCount > 0 },
  { step: 6,  label: 'Per-Product Checklist',  check: (d: CheckData) => d.totalAnswered > 0 },
  { step: 7,  label: 'Parsing & Analysis',     check: (d: CheckData) => d.totalAnswered > 0 },
  { step: 8,  label: 'Certificate Analysis',   check: (d: CheckData) => d.certificatesCount > 0 },
  { step: 9,  label: 'Recommendations',        check: (d: CheckData) => d.recsCount > 0 },
  { step: 10, label: 'Next Steps',             check: (d: CheckData) => d.actionsCount > 0 },
  { step: 11, label: 'Enhancement Requests',   check: (d: CheckData) => d.frsCount > 0 },
  { step: 12, label: 'Summary & Review',       check: (d: CheckData) => d.productsSelected },
];

interface CheckData {
  customerName: string; productsSelected: boolean; versionCount: number;
  serverCount: number; totalAnswered: number; recsCount: number;
  actionsCount: number; frsCount: number; certificatesCount: number;
}


function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sevStyle(sev: string) {
  const m: Record<string, string> = {
    CRITICAL: 'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
    HIGH:     'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
    MEDIUM:   'background:#dbeafe;color:#2563eb;border:1px solid #93c5fd;',
    LOW:      'background:#d1fae5;color:#059669;border:1px solid #6ee7b7;',
  };
  return m[sev] ?? 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';
}
function stStyle(st: string) {
  const m: Record<string, string> = {
    ok: 'background:#d1fae5;color:#059669;', warning: 'background:#fef3c7;color:#d97706;',
    eos: 'background:#fee2e2;color:#dc2626;', unknown: 'background:#f1f5f9;color:#64748b;',
    done: 'background:#d1fae5;color:#059669;', in_progress: 'background:#dbeafe;color:#2563eb;',
    not_started: 'background:#f1f5f9;color:#64748b;', open: 'background:#f1f5f9;color:#64748b;',
    planned: 'background:#ede9fe;color:#7c3aed;', delivered: 'background:#d1fae5;color:#059669;',
  };
  return m[st] ?? 'background:#f1f5f9;color:#64748b;';
}
function pct(used: number, total: number) { return total ? Math.min(100, Math.round((used / total) * 100)) : 0; }
function dateBadgeHtml(value: string): string {
  if (!value || value === '—') return '<span style="color:#cbd5e1;">—</span>';
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isIso) return `<span style="font-family:monospace;font-size:10.5px;color:#475569;">${esc(value)}</span>`;
  const today = new Date().toISOString().slice(0, 10);
  const expired = value < today;
  const diff = (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const soon = !expired && diff < 180;
  const col = expired ? '#dc2626' : soon ? '#d97706' : '#475569';
  const bg  = expired ? '#fef2f2' : soon ? '#fffbeb' : '#f8fafc';
  const bdr = expired ? '#fecaca' : soon ? '#fde68a' : '#e2e8f0';
  return `<span style="font-family:monospace;font-size:10.5px;font-weight:600;color:${col};background:${bg};border:1px solid ${bdr};border-radius:4px;padding:2px 6px;white-space:nowrap;">${esc(value)}</span>`;
}
function scoreColor(s: number | null) {
  if (s === null) return '#94A3B8';
  return s >= 80 ? '#16A34A' : s >= 60 ? '#D97706' : '#DC2626';
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
}) {
  const criticalCount = p.allFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount     = p.allFindings.filter(f => f.severity === 'HIGH').length;

  const hasWeb   = p.selectedTemplates.some(t => t.id === 'web');
  const hasDLP   = p.selectedTemplates.some(t => t.id === 'dlp');
  const hasEmail = p.selectedTemplates.some(t => t.id === 'email');

  const webUsageReports   = WEB_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);
  const dataUsageReports  = DLP_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);
  const emailUsageReports = EMAIL_REPORTS.filter(r => p.selectedReports.includes(r.id)).map(r => r.title);

  const versionGroups = Object.entries(GROUP_CONFIG).map(([, grp]) => ({
    grp,
    entries: grp.componentIds
      .map(id => ({ id, entry: p.versionEntries[id] }))
      .filter((x): x is { id: string; entry: VersionEntry } => !!(x.entry?.installedVersion)),
  })).filter(({ entries }) => entries.length > 0);
  const allVEntries = Object.values(p.versionEntries).filter(e => e.installedVersion);
  const vCounts = {
    ok:       allVEntries.filter(e => e.status === 'ok').length,
    warning:  allVEntries.filter(e => e.status === 'warning').length,
    critical: allVEntries.filter(e => ['critical','eos','eol'].includes(e.status)).length,
    unknown:  allVEntries.filter(e => e.status === 'unknown').length,
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
    const sc     = score === null ? '#64748b' : score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
    return `<tr>
      <td style="font-weight:600;color:#0f2952;">${esc(t.icon)} ${esc(t.name.replace(' HC', ''))}</td>
      <td style="text-align:center;font-family:monospace;">${answered}/${t.questions.length}</td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('CRITICAL')}">${bySev.CRITICAL}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('HIGH')}">${bySev.HIGH}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('MEDIUM')}">${bySev.MEDIUM}</span></td>
      <td style="text-align:center;"><span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;${sevStyle('LOW')}">${bySev.LOW}</span></td>
      <td style="font-weight:800;color:${sc};font-family:monospace;text-align:right;">${score === null ? '—' : score + '%'}</td>
    </tr>`;
  }).join('');

  // Build executive summary key observations
  const eosEntries  = allVEntries.filter(e => ['eos','eol','critical'].includes(e.status));
  const warnEntries = allVEntries.filter(e => e.status === 'warning');
  const obsColor: Record<string, string> = { CRITICAL:'#dc2626', HIGH:'#ea580c', WARNING:'#d97706', MEDIUM:'#2563eb', LOW:'#16a34a' };
  const obsBg:    Record<string, string> = { CRITICAL:'#fef2f2', HIGH:'#fff7ed', WARNING:'#fffbeb', MEDIUM:'#eff6ff', LOW:'#f0fdf4' };
  const obsBorder:Record<string, string> = { CRITICAL:'#dc2626', HIGH:'#ea580c', WARNING:'#d97706', MEDIUM:'#3b82f6', LOW:'#16a34a' };

  const expiredCerts = p.certificates.filter(c => c.status === 'EXPIRED');
  const expiringCerts = p.certificates.filter(c => c.status === 'EXPIRING_SOON');

  // Surface support-level upgrade as a HIGH executive observation when the recommended tier differs.
  const supportUpgradeNeeded =
    !!p.sessionData.supportLevel
    && !!p.sessionData.recommendedSupportLevel
    && p.sessionData.supportLevel.trim().toLowerCase() !== p.sessionData.recommendedSupportLevel.trim().toLowerCase();

  type Obs = { level: string; text: string };
  const keyObs: Obs[] = [
    ...eosEntries.map(e => ({ level: 'CRITICAL', text: `${e.component} (v${e.installedVersion}) — ${e.notes || 'End of Support reached'}` })),
    ...infraAlerts.map(a => ({ level: 'CRITICAL', text: a })),
    ...expiredCerts.map(c => ({ level: 'CRITICAL', text: `Certificate EXPIRED: ${c.subjectCN} (${c.fileName}) — expired ${Math.abs(c.daysRemaining)} days ago` })),
    ...p.allFindings.filter(f => f.severity === 'CRITICAL').slice(0, 6).map(f => ({ level: 'CRITICAL', text: f.text })),
    ...(supportUpgradeNeeded ? [{ level: 'HIGH', text: `Support level upgrade recommended: ${p.sessionData.supportLevel} → ${p.sessionData.recommendedSupportLevel} — review entitlement tier with the customer to align with their growing footprint and risk profile.` }] : []),
    ...expiringCerts.map(c => ({ level: 'HIGH', text: `Certificate expiring soon: ${c.subjectCN} (${c.fileName}) — ${c.daysRemaining} days remaining (${c.validToRaw})` })),
    ...p.allFindings.filter(f => f.severity === 'HIGH').slice(0, 5).map(f => ({ level: 'HIGH', text: f.text })),
    ...warnEntries.map(e => ({ level: 'WARNING', text: `${e.component} (v${e.installedVersion}) — ${e.notes || 'Update available'}` })),
    ...p.allFindings.filter(f => f.severity === 'MEDIUM').slice(0, 3).map(f => ({ level: 'MEDIUM', text: f.text })),
  ];

  const productsInScope = p.selectedTemplates.map(t => t.name.replace(' HC', '')).join(', ') || '—';
  const openActions = p.actionItems.filter(a => a.status !== 'done').length;

  const tocItems = [
    'Introduction',
    'Executive Summary',
    'Infrastructure &amp; Version Review',
    ...(activeServers.length > 0 ? ['Server Infrastructure'] : []),
    ...(p.dlpBundles.length > 0 ? ['DLP Server Bundle Analysis'] : []),
    ...(p.certificates.length > 0 ? ['Certificate Analysis'] : []),
    ...(p.selectedTemplates.length > 0 ? ['Per-Product Security Assessment'] : []),
    ...(p.allFindings.length > 0 ? ['Checklist Findings'] : []),
    ...(hasWeb   ? ['Web Security Usage'] : []),
    ...(hasDLP   ? ['Data Security Usage'] : []),
    ...(hasEmail ? ['Email Security Usage'] : []),
    ...(p.recommendations.length > 0 ? ['Recommendations'] : []),
    ...(p.actionItems.length > 0 ? ['Action Items &amp; Next Steps'] : []),
    ...(p.featureRequests.length > 0 ? ['Enhancement Requests'] : []),
    ...((p.sessionData.licenses?.length ?? 0) > 0
        || (p.sessionData.entitlements?.length ?? 0) > 0
        || (p.sessionData.hardware?.length ?? 0) > 0
        || (p.sessionData.cases?.length ?? 0) > 0
        || (p.sessionData.featureRequests?.length ?? 0) > 0
      ? ['Customer Account &amp; Licensing'] : []),
    ...(p.selectedEnhancements.length > 0 ? ['Recommended Enhancements'] : []),
    'Appendix — Effort Score Card',
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>HC Report — ${esc(p.sessionData.customerName || 'Customer')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11.5px;color:#1e293b;line-height:1.65;background:#fff;}
.print-btn{position:fixed;top:16px;right:16px;background:#0ea5e9;color:#fff;border:none;padding:9px 22px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12.5px;z-index:999;box-shadow:0 3px 14px rgba(14,165,233,0.4);letter-spacing:0.01em;}
.print-btn:hover{background:#0284c7;}

/* COVER */
.cover{padding:56px 60px 48px;min-height:260mm;display:flex;flex-direction:column;background:#fff;}
.cover-brand{color:#0ea5e9;font-weight:800;font-size:14px;letter-spacing:-0.01em;margin-bottom:2px;}
.cover-tagline{font-size:10px;color:#94a3b8;margin-bottom:72px;}
.cover-title-block{border-left:5px solid #0ea5e9;padding-left:22px;margin-bottom:44px;}
.cover-h1{font-size:30px;font-weight:800;color:#0f2952;line-height:1.18;margin-bottom:7px;letter-spacing:-0.028em;}
.cover-sub{font-size:14px;color:#64748b;font-weight:400;}
.cover-customer{color:#0ea5e9;font-size:24px;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px;}
.cover-date{font-size:12px;color:#94a3b8;}
.cover-spacer{flex:1;}
.cover-footer{padding-top:14px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;}
.cover-footer-brand{font-weight:700;color:#0f2952;font-size:11.5px;}
.cover-footer-right{font-size:10px;color:#94a3b8;}

/* CONTENT WRAPPER */
.content{padding:36px 60px 56px;max-width:960px;margin:0 auto;}

/* SECTION */
.section{margin-bottom:36px;}
.section-title{font-size:17px;font-weight:800;color:#0f2952;border-bottom:2.5px solid #0ea5e9;padding-bottom:7px;margin-bottom:18px;letter-spacing:-0.022em;}
.subsection-title{font-size:13px;font-weight:700;color:#0f2952;margin:18px 0 10px;letter-spacing:-0.01em;}

/* TOC */
.toc-item{display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #f8fafc;}
.toc-num{width:28px;font-size:11px;color:#0ea5e9;font-weight:700;flex-shrink:0;}
.toc-label{font-size:12px;color:#334155;flex:1;}

/* TABLES */
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;}
th{background:#0f2952;color:#fff;padding:8px 12px;text-align:left;font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;}
td{padding:8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#334155;}
tr:nth-child(even) td{background:#fafbff;}
.info-label{font-weight:700;color:#0f2952;background:#f8fafc!important;width:200px;white-space:nowrap;}

/* KPI GRID */
.kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0 24px;}
.kpi{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:14px 12px;text-align:center;}
.kpi-val{font-size:28px;font-weight:800;line-height:1;margin-bottom:5px;font-family:monospace;}
.kpi-label{font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.07em;text-transform:uppercase;}

/* OBSERVATIONS */
.obs{padding:8px 14px 8px 16px;border-radius:0 7px 7px 0;margin-bottom:5px;border-left:4px solid;display:flex;gap:10px;align-items:flex-start;}
.obs-label{font-size:8.5px;font-weight:800;letter-spacing:0.09em;flex-shrink:0;padding-top:2px;font-family:monospace;}
.obs-text{font-size:11.5px;color:#0f172a;line-height:1.5;}

/* VERSION GROUPS */
.vg{margin-bottom:14px;border-radius:10px;overflow:hidden;border:1.5px solid;}
.vg-hdr{padding:9px 14px;display:flex;align-items:center;gap:8px;font-weight:700;font-size:12px;}
.vg-tag{font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:4px;}

/* SERVER CARDS */
.srv{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;overflow:hidden;}
.srv-hdr{background:#f8fafc;padding:9px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #e2e8f0;}
.srv-metrics{padding:8px 14px;display:flex;flex-wrap:wrap;gap:8px;}
.chip{font-family:monospace;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:5px;}

/* FINDINGS */
.finding{padding:9px 14px 9px 18px;border-radius:0 8px 8px 0;margin-bottom:6px;border:1px solid #e2e8f0;background:#fafafa;}
.finding-CRITICAL{border-left:4px solid #dc2626;background:#fef9f9;}
.finding-HIGH{border-left:4px solid #ea580c;background:#fffcf9;}
.finding-MEDIUM{border-left:4px solid #3b82f6;background:#fafbff;}
.finding-LOW{border-left:4px solid #16a34a;background:#fafff9;}
.finding-text{font-weight:600;font-size:11.5px;color:#0f172a;margin-bottom:3px;}
.finding-meta{font-size:9.5px;color:#94a3b8;font-family:monospace;display:flex;align-items:center;gap:8px;}
.finding-note{margin-top:6px;padding:5px 9px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;font-size:10.5px;color:#1e40af;}

/* BADGE */
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:8.5px;font-weight:700;letter-spacing:0.04em;}

/* VERSION SUMMARY BAR */
.vsb{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;}
.vsb-card{border-radius:8px;padding:10px 14px;text-align:center;}
.vsb-val{font-size:22px;font-weight:800;font-family:monospace;line-height:1;}
.vsb-label{font-size:10px;font-weight:600;color:#334155;margin-top:3px;}

/* FOOTER */
.rpt-footer{margin-top:48px;padding-top:14px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;}
.rpt-footer-brand{color:#0ea5e9;font-weight:800;font-size:11px;}

/* PAGE BREAKS */
.pb{page-break-after:always;}

@media print{
  .print-btn{display:none;}
  .cover{page-break-after:always;min-height:auto;}
  .pb{page-break-after:always;}
  .section{page-break-inside:avoid;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-size:10.5px;}
  /* Use full printable area — let @page margins do the spacing */
  .content{padding:18px 0 24px;max-width:none;margin:0;}
  .cover{padding-left:28px;padding-right:28px;}
  /* Dense version-review table so 9 columns fit comfortably on A4 */
  table{font-size:9.5px;}
  th{padding:5px 5px;font-size:8px;letter-spacing:0.04em;}
  td{padding:5px 5px;}
  .vg-hdr{padding:7px 10px;}
}
@page{margin:12mm 8mm;size:A4;}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>

<!-- ══════════════════════════════════════
     COVER PAGE
══════════════════════════════════════ -->
<div class="cover">
  <div class="cover-brand">Forcepoint</div>
  <div class="cover-tagline">${esc(p.date)}<br>Forcepoint Private &nbsp;|&nbsp; forcepoint.com</div>

  <div class="cover-title-block">
    <div class="cover-h1">Forcepoint Health Check<br>&amp; Maturity Assessment Report</div>
    <div class="cover-sub">Infrastructure Review, Findings &amp; Recommendations</div>
  </div>

  <div class="cover-customer">${esc(p.sessionData.customerName || 'Customer')}</div>
  <div class="cover-date">${esc(p.date)}</div>

  <div class="cover-spacer"></div>

  <div class="cover-footer">
    <div class="cover-footer-brand">Forcepoint</div>
    <div class="cover-footer-right">Confidential &nbsp;|&nbsp; forcepoint.com</div>
  </div>
</div>

<!-- ══════════════════════════════════════
     TABLE OF CONTENTS
══════════════════════════════════════ -->
<div class="content pb">
  <div class="section">
    <div class="section-title">Contents</div>
    ${tocItems.map((label, i) => `<div class="toc-item"><span class="toc-num">${i + 1}</span><span class="toc-label">${label}</span></div>`).join('')}
  </div>
</div>

<div class="content">

<!-- ══════════════════════════════════════
     INTRODUCTION
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Introduction</div>
  <p style="margin-bottom:14px;line-height:1.75;color:#334155;">
    The Forcepoint Health Check &amp; Maturity Assessment is designed to evaluate the current state of the deployed
    Forcepoint infrastructure and provide actionable recommendations to help the organization maximize the value
    and security posture of its Forcepoint investment. This assessment reviews the current configuration, identifies
    critical issues, evaluates end-of-life risks, and highlights opportunities for optimization based on data collected
    from the environment and aligned with Forcepoint best practices.
  </p>
  <p style="margin-bottom:18px;line-height:1.75;color:#334155;">
    Findings are based on environment data collected at the time of the review. Recommendations are prioritized
    by risk and operational impact.
  </p>

  <div class="subsection-title">Scope</div>
  <p style="margin-bottom:16px;line-height:1.75;color:#334155;">
    This Health Check Assessment focuses on: evaluating current Forcepoint infrastructure health, identifying
    critical operational issues, assessing version currency and End-of-Life / End-of-Maintenance timelines,
    evaluating licensing alignment, and providing a prioritized roadmap of remediation and optimization actions.
  </p>

  <div class="subsection-title">Data Collection Participants</div>
  <table>
    <tbody>
      <tr><td class="info-label">Assessment Date</td><td>${esc(p.date)}</td></tr>
      <tr><td class="info-label">Customer</td><td style="font-weight:600;color:#0f2952;">${esc(p.sessionData.customerName || '—')}</td></tr>
      ${p.sessionData.forcepointId ? `<tr><td class="info-label">Forcepoint ID</td><td style="font-family:monospace;">${esc(p.sessionData.forcepointId)}</td></tr>` : ''}
      ${p.sessionData.industry ? `<tr><td class="info-label">Industry</td><td>${esc(p.sessionData.industry)}</td></tr>` : ''}
      ${p.sessionData.country ? `<tr><td class="info-label">Country / Region</td><td>${esc(p.sessionData.country)}</td></tr>` : ''}
      <tr><td class="info-label">Products Reviewed</td><td>${esc(productsInScope)}</td></tr>
      ${p.sessionData.csm ? `<tr><td class="info-label">Customer Success Manager</td><td>${esc(p.sessionData.csm)}</td></tr>` : ''}
      ${p.sessionData.accountOwner ? `<tr><td class="info-label">Account Owner</td><td>${esc(p.sessionData.accountOwner)}</td></tr>` : ''}
      ${p.sessionData.salesEngineer ? `<tr><td class="info-label">Prepared by</td><td>${esc(p.sessionData.salesEngineer)}</td></tr>` : ''}
      ${p.sessionData.partner ? `<tr><td class="info-label">Partner</td><td>${esc(p.sessionData.partner)}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════
     EXECUTIVE SUMMARY
══════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Executive Summary</div>
  <p style="margin-bottom:18px;color:#334155;line-height:1.75;">
    This Executive Summary provides a high-level overview of findings from the
    ${esc(p.sessionData.customerName || 'Customer')} Forcepoint Health Check assessment.
    Detailed observations and supporting data are included in the subsequent sections.
  </p>

  <!-- KPI Bar -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-val" style="color:${p.healthScore === null ? '#94a3b8' : p.healthScore >= 80 ? '#16a34a' : p.healthScore >= 60 ? '#d97706' : '#dc2626'};">
        ${p.healthScore === null ? '—' : p.healthScore + '%'}
      </div>
      <div class="kpi-label">Health Score</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:${criticalCount > 0 ? '#dc2626' : '#64748b'};">${criticalCount}</div>
      <div class="kpi-label">Critical</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:${highCount > 0 ? '#ea580c' : '#64748b'};">${highCount}</div>
      <div class="kpi-label">High</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:#2563eb;">${p.allFindings.length}</div>
      <div class="kpi-label">Total Findings</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:${openActions > 0 ? '#d97706' : '#16a34a'};">${openActions}</div>
      <div class="kpi-label">Open Actions</div>
    </div>
  </div>

  ${keyObs.length > 0 ? `
  <div class="subsection-title">Key Observations</div>
  ${keyObs.map(o => `<div class="obs" style="background:${obsBg[o.level] ?? '#f8fafc'};border-color:${obsBorder[o.level] ?? '#94a3b8'};">
    <span class="obs-label" style="color:${obsColor[o.level] ?? '#64748b'};">${esc(o.level)}</span>
    <span class="obs-text">${esc(o.text)}</span>
  </div>`).join('')}` : ''}

  ${p.recommendations.length > 0 ? `
  <div class="subsection-title" style="margin-top:22px;">High-Level Recommendations</div>
  <ul style="padding-left:20px;color:#334155;line-height:1.9;margin-bottom:16px;">
    ${p.recommendations.slice(0, 12).map(r => `<li style="margin-bottom:3px;"><span style="${sevStyle(r.priority.toUpperCase())};padding:1px 6px;border-radius:3px;font-size:8.5px;font-weight:700;margin-right:7px;">${esc(r.priority.toUpperCase())}</span><span style="font-weight:500;">${esc(r.title)}</span>${r.detail ? `<span style="color:#94a3b8;font-size:10.5px;"> — ${esc(r.detail)}</span>` : ''}</li>`).join('')}
  </ul>` : ''}

  ${p.actionItems.length > 0 ? `
  <div class="subsection-title" style="margin-top:22px;">Next Steps</div>
  <table>
    <thead>
      <tr>
        <th style="width:34px;">#</th>
        <th>Action</th>
        <th style="width:100px;">Priority</th>
        <th style="width:110px;">Target Date</th>
        <th style="width:90px;">Product</th>
      </tr>
    </thead>
    <tbody>
      ${p.actionItems.map((a, i) => `<tr>
        <td style="font-family:monospace;font-weight:700;color:#0ea5e9;text-align:center;">${i + 1}</td>
        <td style="font-weight:500;color:#0f2952;">${esc(a.task)}</td>
        <td><span class="badge" style="${sevStyle(a.priority.toUpperCase())}">${esc(a.priority.toUpperCase())}</span></td>
        <td style="font-family:monospace;font-size:10.5px;">${esc(a.dueDate || '—')}</td>
        <td style="font-size:10.5px;color:#64748b;">${esc(a.product || '—')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
</div>

<!-- ══════════════════════════════════════
     INFRASTRUCTURE & VERSION REVIEW
══════════════════════════════════════ -->
${versionGroups.length > 0 ? `
<div class="section">
  <div class="section-title">Infrastructure &amp; Version Review</div>
  <div class="subsection-title" style="margin-top:0;margin-bottom:14px;">Software Version &amp; End-of-Life Analysis</div>

  <!-- Summary bar -->
  <div class="vsb">
    <div class="vsb-card" style="background:rgba(22,163,74,0.08);">
      <div class="vsb-val" style="color:#16a34a;">${vCounts.ok}</div>
      <div class="vsb-label">Up to Date</div>
    </div>
    <div class="vsb-card" style="background:rgba(217,119,6,0.08);">
      <div class="vsb-val" style="color:#d97706;">${vCounts.warning}</div>
      <div class="vsb-label">Updates Available</div>
    </div>
    <div class="vsb-card" style="background:rgba(220,38,38,0.08);">
      <div class="vsb-val" style="color:#dc2626;">${vCounts.critical}</div>
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
    <table style="margin-bottom:0;">
      <thead>
        <tr>
          <th>Component</th><th>Product</th>
          <th>Installed</th><th>Latest GA</th><th>Release Date</th>
          <th>End of Sale</th><th>End of Maint.</th><th>End of Support</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(({ id, entry }) => {
          const def = CATALOG[id]; if (!def) return '';
          const latest = resolveLatest(def, p.versionData);
          const dates  = resolveInstalledDates(entry.installedVersion, def, p.versionData);
          const sc     = STATUS_CFG[entry.status];
          const isFSM  = entry.component === 'FSM Server';
          const isSQL  = entry.component === 'SQL Server';
          return `<tr>
            <td>
              <div style="font-weight:600;font-size:11.5px;color:#0f172a;display:flex;align-items:center;gap:5px;">
                ${esc(entry.component)}
                ${isFSM ? '<span style="font-size:7.5px;font-weight:700;background:#2563eb14;color:#2563eb;border:1px solid #2563eb26;padding:1px 4px;border-radius:3px;margin-left:3px;">FSM</span>' : ''}
                ${isSQL ? '<span style="font-size:7.5px;font-weight:700;background:#64748b14;color:#64748b;border:1px solid #64748b26;padding:1px 4px;border-radius:3px;margin-left:3px;">SQL</span>' : ''}
              </div>
            </td>
            <td style="font-size:9.5px;color:#94a3b8;">${esc(entry.productLabel)}</td>
            <td style="font-family:monospace;font-weight:700;color:#0f172a;">${esc(entry.installedVersion || '—')}</td>
            <td><span style="font-family:monospace;font-size:10.5px;font-weight:600;background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2px 7px;white-space:nowrap;">${esc(latest.latestVersion)}</span></td>
            <td style="font-family:monospace;font-size:10.5px;color:#475569;">${esc(latest.releaseDate)}</td>
            <td>${dateBadgeHtml(dates.eoSale)}</td>
            <td>${dateBadgeHtml(dates.eoMaintenance)}</td>
            <td>${dateBadgeHtml(dates.eoSupport)}</td>
            <td><span class="badge" style="background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};">${esc(sc.label)}</span></td>
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
  <div class="section-title">Server Infrastructure</div>
  ${activeServers.map(s => {
    const name = s.hostname || SRV_LABELS[s.type] || s.type;
    const driveChips = s.drives.map(d => {
      const dp = pct(d.usedGB, d.totalGB);
      const c = dp >= 85 ? '#dc2626' : dp >= 70 ? '#d97706' : '#16a34a';
      return `<span class="chip" style="background:${c}15;color:${c};">${esc(d.label || 'Drive')} ${dp}% (${d.usedGB}/${d.totalGB} GB)</span>`;
    }).join('');
    let ramChip = '';
    if (s.ramTotalGB > 0) {
      const rp = pct(s.ramUsedGB, s.ramTotalGB);
      const rc = rp >= 85 ? '#dc2626' : rp >= 70 ? '#d97706' : '#16a34a';
      ramChip = `<span class="chip" style="background:${rc}15;color:${rc};">RAM ${rp}% (${s.ramUsedGB}/${s.ramTotalGB} GB)</span>`;
    }
    let cpuChip = '';
    if (s.cpuUsagePercent > 0) {
      const cc = s.cpuUsagePercent >= 85 ? '#dc2626' : s.cpuUsagePercent >= 70 ? '#d97706' : '#16a34a';
      cpuChip = `<span class="chip" style="background:${cc}15;color:${cc};">CPU ${s.cpuUsagePercent}%${s.cpuCores > 0 ? ` (${s.cpuCores} cores)` : ''}</span>`;
    }
    return `<div class="srv">
      <div class="srv-hdr">
        <div style="font-weight:700;font-size:12.5px;color:#0f2952;min-width:180px;">${esc(name)}</div>
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
    const memColor = memPct >= 85 ? '#dc2626' : memPct >= 70 ? '#d97706' : '#16a34a';
    const diskColor = hw && hw.diskCUsagePercent >= 85 ? '#dc2626' : hw && hw.diskCUsagePercent >= 70 ? '#d97706' : '#16a34a';

    const headerHost = sys?.hostName || b.bundleName;
    const headerSub = [sys?.osName, fp?.dlpVersion && `DLP ${fp.dlpVersion}`].filter(Boolean).join(' · ');

    // ── System properties table ──
    const sysFields: Array<[string, string]> = sys ? [
      ['Host Name', sys.hostName],
      ['Domain', sys.domain],
      ['Logon Server', sys.logonServer],
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
      <tr><td style="font-weight:700;color:#475569;width:35%;font-size:10px;">${esc(k)}</td><td style="font-family:monospace;font-size:10px;color:#0f172a;">${esc(v)}</td></tr>`).join('');

    // ── Network adapters ──
    const netRows = sys?.networkAdapters.map(n => `
      <tr>
        <td style="font-weight:600;color:#0f2952;width:35%;font-size:10px;">${esc(n.name)}${n.connectionName ? `<br><span style="font-weight:400;color:#94a3b8;font-size:9.5px;">${esc(n.connectionName)}</span>` : ''}</td>
        <td style="font-family:monospace;font-size:10px;color:#0f172a;">${n.ipAddresses.length > 0 ? n.ipAddresses.map(ip => esc(ip)).join('<br>') : '<span style="color:#cbd5e1;">No IP</span>'}${n.dhcp ? `<div style="font-family:'Segoe UI',sans-serif;font-size:9.5px;color:#64748b;margin-top:2px;">DHCP: ${esc(n.dhcp)}</div>` : ''}</td>
      </tr>`).join('') ?? '';

    return `
    <div style="border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:22px;overflow:hidden;page-break-inside:avoid;">

      <!-- Bundle header -->
      <div style="background:linear-gradient(135deg,#0f2952,#1d4ed8);padding:12px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
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
          <div style="font-size:18px;font-weight:800;color:#0f2952;font-family:monospace;margin-top:2px;">${hw ? hw.cpuCount : (sys?.processorCount || '—')}</div>
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
            ${fp.eipInfraInstalled ? `<tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">EIP Infrastructure</td><td style="font-family:monospace;font-size:10px;color:#0f172a;padding:3px 0;">${esc(fp.eipInfraVersion)}</td></tr>` : ''}
            ${fp.dlpInstalled ? `<tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">Data Security (DLP)</td><td style="font-family:monospace;font-size:10px;color:#0f172a;padding:3px 0;">${esc(fp.dlpVersion)}</td></tr>` : ''}
            <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Web Security</td><td style="font-size:10px;color:${fp.webSecurityInstalled ? '#16a34a' : '#94a3b8'};padding:3px 0;">${fp.webSecurityInstalled ? '✓ Installed' : '— Not installed'}</td></tr>
            <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Email Security</td><td style="font-size:10px;color:${fp.emailSecurityInstalled ? '#16a34a' : '#94a3b8'};padding:3px 0;">${fp.emailSecurityInstalled ? '✓ Installed' : '— Not installed'}</td></tr>
          </table>
        </div>` : ''}
        ${(sql || db) ? `
        <div style="padding:12px 16px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px;">SQL SERVER &amp; DATABASE</div>
          <table style="width:100%;border-collapse:collapse;">
            ${sql ? `
              <tr><td style="font-weight:700;color:#475569;width:45%;font-size:10px;padding:3px 0;">Version</td><td style="font-family:monospace;font-size:10px;color:#0f172a;padding:3px 0;">${esc(sql.versionShort)} <span style="color:#94a3b8;">(${esc(sql.buildNumber)})</span></td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Build Date</td><td style="font-family:monospace;font-size:10px;color:${statusColorDlp(sql.patchStatus)};padding:3px 0;">${esc(sql.buildDate)} <span style="font-weight:700;">[${sql.patchStatus}]</span></td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Edition</td><td style="font-family:monospace;font-size:10px;color:${statusColorDlp(sql.editionStatus)};padding:3px 0;">${esc(sql.edition)} ${sql.editionStatus === 'WARNING' ? '<span style="font-weight:700;">[NOT FOR PROD]</span>' : ''}</td></tr>
            ` : ''}
            ${db ? `
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Database</td><td style="font-family:monospace;font-size:10px;color:#0f172a;padding:3px 0;">${esc(db.name)}</td></tr>
              <tr><td style="font-weight:700;color:#475569;font-size:10px;padding:3px 0;">Size</td><td style="font-family:monospace;font-size:10px;color:#0f172a;padding:3px 0;">${db.totalSizeMB} MB (data ${db.dataFileSizeMB} · log ${db.logFileSizeMB})</td></tr>
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
          ${hf.latestHotfixId ? `<span style="font-size:10px;color:#64748b;">Latest: <strong style="color:#0f2952;font-family:monospace;">${esc(hf.latestHotfixId)}</strong> on ${esc(hf.latestHotfixDateRaw)} (${hf.daysSinceLastPatch ?? '—'} days ago)</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;">
          ${hf.hotfixes.map(h => `<span style="font-family:monospace;font-size:9px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:1px 5px;border-radius:3px;" title="${esc(h.installedOnRaw)}">${esc(h.id)}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Services — full per-row table so readers can audit each service independently -->
      ${svc ? (() => {
        const stateBadge = (state: string) => {
          const s = (state || '').toLowerCase();
          if (s === 'running')   return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#d1fae5;color:#059669;border:1px solid #6ee7b7;">RUNNING</span>';
          if (s === 'stopped')   return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;">STOPPED</span>';
          if (s === 'paused')    return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;">PAUSED</span>';
          if (s.includes('pending')) return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef9c3;color:#a16207;border:1px solid #fde68a;">${esc(state.toUpperCase())}</span>`;
          if (!state)            return '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;">UNKNOWN</span>';
          return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;">${esc(state.toUpperCase())}</span>`;
        };

        return `
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;page-break-inside:auto;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">WEBSENSE / SQL SERVICES (${svc.totalWebsenseServices})</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:${svc.allRunning ? '#d1fae5' : '#fee2e2'};color:${svc.allRunning ? '#059669' : '#dc2626'};border:1px solid ${svc.allRunning ? '#6ee7b7' : '#fca5a5'};">${svc.allRunning ? 'ALL RUNNING' : `${svc.notRunning.length} NOT RUNNING`}</span>
        </div>
        ${svc.notRunning.length > 0 ? `
          <div style="font-size:10.5px;color:#475569;margin-bottom:8px;padding:7px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;">
            <div style="font-weight:700;color:#dc2626;margin-bottom:3px;">⚠ Services not running:</div>
            <ul style="margin-left:18px;list-style:disc;">${svc.notRunning.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
          </div>` : `<div style="font-size:10.5px;color:#16a34a;margin-bottom:8px;">✓ All ${svc.totalWebsenseServices} services parsed from the bundle were reporting Running state.</div>`}

        <!-- Per-service detail table -->
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:5px;font-size:9.5px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;">SERVICE NAME</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:130px;">INTERNAL NAME</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:70px;">START MODE</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:130px;">RUN AS</th>
              <th style="text-align:left;padding:5px 8px;font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:75px;">STATE</th>
            </tr>
          </thead>
          <tbody>
            ${svc.services.map((s, i) => `
            <tr style="${i % 2 === 1 ? 'background:#fafbff;' : ''}">
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:500;">${esc(s.displayName || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#475569;font-family:monospace;font-size:9px;">${esc(s.name || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(s.startMode || '—')}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;font-family:monospace;font-size:9px;">${esc(s.startName || '—')}</td>
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
          <tr><td style="font-weight:700;color:#475569;width:35%;font-size:10.5px;padding:3px 0;">Synced</td><td style="font-family:monospace;font-size:10.5px;color:#0f172a;padding:3px 0;">${ep.syncedCount}</td></tr>
          <tr><td style="font-weight:700;color:#475569;font-size:10.5px;padding:3px 0;">Unsynced</td><td style="font-family:monospace;font-size:10.5px;color:${ep.unsyncedCount > 0 ? '#d97706' : '#0f172a'};padding:3px 0;">${ep.unsyncedCount}</td></tr>
          ${ep.profileName ? `<tr><td style="font-weight:700;color:#475569;font-size:10.5px;padding:3px 0;">Active Profile</td><td style="font-size:10.5px;color:#0f172a;padding:3px 0;">${esc(ep.profileName)} ${ep.profileEnabled ? '<span style="color:#16a34a;font-weight:700;">(enabled)</span>' : '<span style="color:#dc2626;font-weight:700;">(disabled)</span>'}</td></tr>` : ''}
        </table>
      </div>` : ''}

      <!-- Active policies -->
      ${pol ? `
      <div style="padding:12px 16px;${b.installedProducts.length > 0 || b.depEnabled != null ? 'border-bottom:1px solid #e2e8f0;' : ''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;">ACTIVE POLICIES &amp; RULES</div>
          <span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#dbeafe;color:#2563eb;border:1px solid #93c5fd;">${pol.policyNames.length} POLICIES · ${pol.totalRules} RULES</span>
          ${pol.rulesWithExceptions.length > 0 ? `<span style="font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;background:#fff7ed;color:#d97706;border:1px solid #fdba74;">${pol.rulesWithExceptions.length} WITH EXCEPTIONS</span>` : ''}
        </div>
        <div style="font-size:10.5px;color:#475569;column-count:2;column-gap:16px;">
          ${pol.policyNames.slice(0, 40).map(n => `<div style="margin-bottom:2px;">• ${esc(n)}</div>`).join('')}
          ${pol.policyNames.length > 40 ? `<div style="color:#94a3b8;font-style:italic;">… and ${pol.policyNames.length - 40} more</div>` : ''}
        </div>
      </div>` : ''}

      <!-- Third-party installed products + DEP footer -->
      ${(b.installedProducts.length > 0 || b.depEnabled != null) ? `
      <div style="padding:12px 16px;">
        ${b.depEnabled != null ? `<div style="font-size:10.5px;color:#475569;margin-bottom:6px;"><strong>DEP (Data Execution Prevention):</strong> <span style="color:${b.depEnabled ? '#16a34a' : '#dc2626'};font-weight:700;">${b.depEnabled ? 'Enabled' : 'Disabled'}</span></div>` : ''}
        ${b.installedProducts.length > 0 ? `
          <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:4px;">THIRD-PARTY INSTALLED APPS (${b.installedProducts.length})</div>
          <div style="font-size:10px;color:#475569;column-count:2;column-gap:16px;">
            ${b.installedProducts.map(prod => `<div style="margin-bottom:2px;">• <span style="color:#0f2952;font-weight:500;">${esc(prod.name)}</span> <span style="color:#94a3b8;font-family:monospace;">${esc(prod.vendor)} · ${esc(prod.version)}</span></div>`).join('')}
          </div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('')}
</div>` : ''}

<!-- ══════════════════════════════════════
     PER-PRODUCT SECURITY ASSESSMENT
══════════════════════════════════════ -->
${p.selectedTemplates.length > 0 ? `
<div class="section">
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
  <div class="section-title">Checklist Findings (${p.allFindings.length})</div>
  ${p.allFindings.length === 0
    ? '<p style="color:#16a34a;font-weight:600;padding:10px 0;">✓ No findings — all checklist items passed.</p>'
    : p.allFindings.map(f => `
      <div class="finding finding-${f.severity}">
        <div class="finding-text">${esc(f.text)}</div>
        <div class="finding-meta">
          <span class="badge" style="${sevStyle(f.severity)}">${esc(f.severity)}</span>
          <span>${esc(f.templateName.replace(' HC', ''))}</span>
          <span>${esc(f.section)}</span>
          <span class="badge" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;">Answer: ${esc((f.answer || '—').toUpperCase())}</span>
        </div>
        ${f.description ? `<div style="margin-top:6px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;font-size:10.5px;color:#475569;line-height:1.6;"><span style="font-weight:700;color:#334155;">Description: </span>${esc(f.description)}</div>` : ''}
        ${f.remediation ? `<div style="margin-top:5px;padding:6px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;font-size:10.5px;color:#166534;line-height:1.6;"><span style="font-weight:700;">Remediation: </span>${esc(f.remediation)}</div>` : ''}
        ${f.note ? `<div class="finding-note"><strong>Analyst Note:</strong> ${esc(f.note)}</div>` : ''}
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
      <span style="font-family:monospace;font-size:9px;font-weight:700;color:#0ea5e9;background:#fff;border:1px solid #bae6fd;padding:1px 6px;border-radius:3px;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-size:11px;font-weight:700;color:#0f2952;flex:1;">${esc(r)}</span>
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
      <span style="font-family:monospace;font-size:9px;font-weight:700;color:#16a34a;background:#fff;border:1px solid #bbf7d0;padding:1px 6px;border-radius:3px;flex-shrink:0;">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-size:11px;font-weight:700;color:#0f2952;flex:1;">${esc(r)}</span>
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
      <span style="font-size:11px;font-weight:700;color:#0f2952;flex:1;">${esc(r)}</span>
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
      <th style="text-align:left;padding:8px 10px;font-size:9.5px;color:#fff;background:#0f2952;border-left:1px solid rgba(255,255,255,0.15);width:${colWidth};">
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
            `color:${r.colorByStatus ? certStatusColor(c.status) : '#0f172a'}`,
          ];
          if (r.mono) styles.push("font-family:monospace", 'word-break:break-all');
          if (r.bold) styles.push('font-weight:700');
          return `<td style="${styles.join(';')}">${esc(v)}</td>`;
        }).join('')}
      </tr>`).join('');

    return `
    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      <thead><tr><th style="text-align:left;padding:8px 10px;font-size:9.5px;color:#fff;background:#0f2952;width:18%;">FIELD</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  })()}

  ${(() => {
    const expired = p.certificates.filter(c => c.status === 'EXPIRED');
    const expiring = p.certificates.filter(c => c.status === 'EXPIRING_SOON');
    if (expired.length === 0 && expiring.length === 0) {
      return `<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534;">
        ✓ All ${p.certificates.length} certificate${p.certificates.length !== 1 ? 's are' : ' is'} valid for at least 90 days. No expiry action required at this time.
      </div>`;
    }
    return `
    <div style="margin-top:14px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:11px;color:#9a3412;">
      <div style="font-weight:700;margin-bottom:4px;">⚠ Certificate expiry warnings</div>
      ${expired.map(c => `<div>• <span style="color:#dc2626;font-weight:700;">EXPIRED</span> — ${esc(c.fileName)} (${esc(c.subjectCN)}) expired ${Math.abs(c.daysRemaining)} days ago.</div>`).join('')}
      ${expiring.map(c => `<div>• <span style="color:#d97706;font-weight:700;">EXPIRING SOON</span> — ${esc(c.fileName)} (${esc(c.subjectCN)}) expires in ${c.daysRemaining} days (${esc(c.validToRaw)}).</div>`).join('')}
    </div>`;
  })()}
</div>` : ''}

<!-- ══════════════════════════════════════
     FINDINGS, OBSERVATIONS & RECOMMENDATIONS
══════════════════════════════════════ -->
${p.recommendations.length > 0 ? `
<div class="section">
  <div class="section-title">Findings, Observations &amp; Recommendations</div>
  <table>
    <thead>
      <tr>
        <th>Recommendation</th>
        <th style="width:110px;">Category</th>
        <th style="width:90px;">Product</th>
        <th style="width:80px;">Priority</th>
        <th style="width:80px;">Effort</th>
        <th style="width:90px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${p.recommendations.map(r => `<tr>
        <td>
          <div style="font-weight:600;color:#0f2952;">${esc(r.title)}</div>
          ${r.detail ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${esc(r.detail)}</div>` : ''}
        </td>
        <td style="font-size:10.5px;">${esc(r.category.replace(/_/g,' '))}</td>
        <td style="font-family:monospace;font-size:10.5px;">${esc(r.product || '—')}</td>
        <td><span class="badge" style="${sevStyle(r.priority.toUpperCase())}">${esc(r.priority.toUpperCase())}</span></td>
        <td style="font-size:10.5px;">${esc(r.effort)}</td>
        <td><span class="badge" style="${stStyle(r.status)}">${esc(r.status.replace(/_/g,' ').toUpperCase())}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- ══════════════════════════════════════
     ACTION ITEMS & NEXT STEPS
══════════════════════════════════════ -->
${p.actionItems.length > 0 ? `
<div class="section">
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
        <td style="font-family:monospace;font-weight:700;color:#0ea5e9;text-align:center;">${i + 1}</td>
        <td style="font-weight:500;color:#0f2952;">${esc(a.task)}</td>
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
  <div class="section-title">Enhancement Requests (${p.featureRequests.length})</div>
  <table>
    <thead>
      <tr>
        <th>Request</th>
        <th style="width:100px;">Product</th>
        <th style="width:80px;">Priority</th>
        <th style="width:90px;">Status</th>
        <th style="width:50px;text-align:center;">Votes</th>
      </tr>
    </thead>
    <tbody>
      ${p.featureRequests.map(fr => `<tr>
        <td>
          <div style="font-weight:600;color:#0f2952;">${esc(fr.title)}</div>
          ${fr.description ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${esc(fr.description)}</div>` : ''}
          ${fr.businessJustification ? `<div style="font-size:10px;color:#7c3aed;margin-top:2px;"><strong>Justification:</strong> ${esc(fr.businessJustification)}</div>` : ''}
        </td>
        <td style="font-family:monospace;font-size:10.5px;">${esc(fr.product)}</td>
        <td><span class="badge" style="${sevStyle(fr.priority.toUpperCase())}">${esc(fr.priority.toUpperCase())}</span></td>
        <td><span class="badge" style="${stStyle(fr.status)}">${esc(fr.status.replace(/_/g,' '))}</span></td>
        <td style="text-align:center;font-family:monospace;">${fr.votes}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

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
  if (!hasProfile && !hasLicenses && !hasEntitlements && !hasHardware && !hasCases && !hasCustFR) return '';

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
    .map(([k, v]) => `<tr><td style="font-weight:700;color:#475569;width:34%;font-size:10.5px;padding:5px 10px;background:#f8fafc;">${esc(k)}</td><td style="font-family:${k.includes('ID') ? 'monospace' : 'inherit'};font-size:10.5px;color:#0f172a;padding:5px 10px;">${esc(v)}</td></tr>`).join('');

  const upgradeNeeded = !!sd.supportLevel && !!sd.recommendedSupportLevel
    && sd.supportLevel.trim().toLowerCase() !== sd.recommendedSupportLevel.trim().toLowerCase();

  return `
<div class="section">
  <div class="section-title">Customer Account &amp; Licensing</div>

  ${upgradeNeeded ? `
  <!-- Prominent Support Level Upgrade Recommendation banner -->
  <div style="background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:2px solid #ea580c;border-left:6px solid #ea580c;border-radius:10px;padding:16px 20px;margin-bottom:22px;page-break-inside:avoid;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="font-size:18px;line-height:1;">⚠</div>
      <div style="font-size:11px;font-weight:800;color:#9a3412;letter-spacing:0.1em;">SUPPORT LEVEL UPGRADE RECOMMENDATION</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="text-align:center;background:#fff;border:1.5px solid #fed7aa;border-radius:8px;padding:8px 14px;min-width:140px;">
        <div style="font-size:8.5px;font-weight:700;color:#9a3412;letter-spacing:0.08em;margin-bottom:3px;">CURRENT</div>
        <div style="font-size:16px;font-weight:800;color:#1f2937;letter-spacing:-0.01em;">${esc(sd.supportLevel || '—')}</div>
      </div>
      <div style="font-size:22px;color:#ea580c;font-weight:700;">→</div>
      <div style="text-align:center;background:#16a34a;border:1.5px solid #15803d;border-radius:8px;padding:8px 14px;min-width:140px;box-shadow:0 4px 12px rgba(22,163,74,0.25);">
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
        <td style="font-weight:600;color:#0f2952;">${esc(l.product || '—')}</td>
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
        <td style="font-weight:600;color:#0f2952;">${esc(e.name || '—')}</td>
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
          <td style="font-weight:600;color:#0f2952;">${esc(h.model || '—')}</td>
          <td style="font-family:monospace;font-size:9.5px;color:#475569;">${esc(h.productCode || '—')}</td>
          <td style="font-family:monospace;text-align:right;">${h.units}</td>
          <td style="font-size:10.5px;">
            ${esc(h.warranty || '—')}
            ${h.warrantyStatus ? `<div style="font-size:9px;color:${h.warrantyStatus.toLowerCase() === 'active' ? '#16a34a' : '#dc2626'};font-weight:700;margin-top:1px;">${esc(h.warrantyStatus.toUpperCase())}</div>` : ''}
          </td>
          <td><span class="badge" style="${stStyle((h.status || '').toLowerCase())}">${esc(h.status || '—')}</span></td>
        </tr>${lc ? `
        <tr style="background:#fafcff;">
          <td colspan="5" style="padding:6px 10px;border-top:0;font-size:9.5px;">
            <span style="display:inline-block;font-family:monospace;font-size:8.5px;font-weight:700;background:${lcColor}15;color:${lcColor};border:1px solid ${lcColor}40;padding:1px 6px;border-radius:3px;letter-spacing:0.04em;margin-right:8px;">PRODUCT LIFECYCLE · ${lcStatus}</span>
            <span style="color:#94a3b8;">matched to <strong style="color:#0f2952;">${esc(lc['Model/Version'])}</strong></span>
            <table style="width:100%;border-collapse:collapse;margin-top:5px;">
              <tr>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">GA</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['General Availability'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">END OF SALE</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['End of Sale'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">LAST SUPP. REL.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['Last Supported Release'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">END OF MAINT.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['End Of Maintenance'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">WARRANTY EXT.</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['Last Date for Warranty Extension'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid ${lcStatus === 'EOL' ? '#fca5a5' : '#e2e8f0'};font-size:8.5px;">
                  <div style="color:${lcStatus === 'EOL' ? '#dc2626' : '#94a3b8'};font-weight:700;letter-spacing:0.04em;">END OF LIFE</div>
                  <div style="font-family:monospace;font-size:9.5px;color:${lcStatus === 'EOL' ? '#dc2626' : '#0f172a'};font-weight:${lcStatus === 'EOL' ? 700 : 400};">${esc(String(lc['End of Life'] ?? '—'))}</div>
                </td>
                <td style="padding:3px 6px;background:#fff;border:1px solid #e2e8f0;font-size:8.5px;">
                  <div style="color:#94a3b8;font-weight:700;letter-spacing:0.04em;">MIGRATION</div>
                  <div style="font-family:monospace;font-size:9.5px;color:#0f172a;">${esc(String(lc['Migration Path'] ?? '—'))}</div>
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
          <div style="font-weight:600;color:#0f2952;">${esc(c.title || '—')}</div>
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
  <div class="subsection-title">Customer Feature Requests (Salesforce, ${sd.featureRequests!.length})</div>
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
        <td style="font-size:10.5px;font-weight:600;color:#0f2952;">${esc(f.title || '—')}</td>
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
     RECOMMENDED ENHANCEMENTS
══════════════════════════════════════ -->
${p.selectedEnhancements.length > 0 ? `
<div class="section">
  <div class="section-title">Recommended Enhancements</div>
  <p style="margin-bottom:18px;color:#475569;line-height:1.7;font-size:11px;">
    The following Forcepoint product enhancements are proposed as next-step initiatives to strengthen the customer's overall security posture. Each recommendation is selected based on the health check findings, current scope, and identified gaps. The business value commentary below should be reviewed jointly with the customer's security and compliance stakeholders.
  </p>

  ${ENHANCEMENTS.filter(e => p.selectedEnhancements.includes(e.id)).map((e, idx) => `
  <div style="border:1.5px solid ${e.accent}55;border-radius:10px;margin-bottom:16px;overflow:hidden;page-break-inside:avoid;">
    <!-- Header band -->
    <div style="background:linear-gradient(135deg,${e.accent},${e.accent}CC);padding:12px 18px;color:#fff;display:flex;align-items:center;gap:12px;">
      <div style="background:rgba(255,255,255,0.18);padding:5px 10px;border-radius:6px;font-size:9.5px;font-weight:700;letter-spacing:0.06em;">
        ${String(idx + 1).padStart(2, '0')}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:700;letter-spacing:-0.01em;">${esc(e.name)}</div>
        <div style="font-size:10px;opacity:0.85;margin-top:1px;">${esc(e.tagline)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.18);padding:3px 9px;border-radius:5px;font-size:8.5px;font-weight:700;letter-spacing:0.08em;">${esc(e.category.toUpperCase())}</div>
    </div>

    <!-- Why -->
    <div style="padding:14px 18px 8px;">
      <div style="font-size:9.5px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;margin-bottom:5px;">WHY WE RECOMMEND IT</div>
      <div style="font-size:11px;color:#334155;line-height:1.7;">${esc(e.whyWeRecommendIt)}</div>
    </div>

    <!-- Business value -->
    <div style="padding:8px 18px 16px;">
      <div style="font-size:9.5px;font-weight:700;color:${e.accent};letter-spacing:0.08em;margin-bottom:5px;">BUSINESS VALUE</div>
      <div style="font-size:11px;color:#0f172a;line-height:1.7;">${esc(e.businessValue)}</div>
    </div>
  </div>`).join('')}
</div>` : ''}

<!-- ══════════════════════════════════════
     APPENDIX — EFFORT SCORE CARD
══════════════════════════════════════ -->
<div class="section">
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
        <td><span class="badge" style="background:#d1fae5;color:#059669;border:1px solid #6ee7b7;">LOW</span></td>
        <td>Clear objectives, minimal risk, familiar technology</td>
        <td>Basic technical proficiency, standard tools</td>
        <td>Customer</td>
      </tr>
      <tr>
        <td><span class="badge" style="background:#fef3c7;color:#d97706;border:1px solid #fcd34d;">MEDIUM</span></td>
        <td>Some ambiguity, multiple teams, system integration, moderate risk</td>
        <td>Intermediate skills, cross-functional experience, basic project management</td>
        <td>Customer / Partner / Forcepoint PS</td>
      </tr>
      <tr>
        <td><span class="badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;">HIGH</span></td>
        <td>High uncertainty, complex technology, strategic importance</td>
        <td>Advanced expertise, leadership, risk management</td>
        <td>Partner / Forcepoint PS</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- FOOTER -->
<div class="rpt-footer">
  <div class="rpt-footer-brand">Forcepoint</div>
  <div>Health Check &amp; Maturity Assessment Report &nbsp;·&nbsp; ${esc(p.date)} &nbsp;·&nbsp; Confidential</div>
  <div>© ${new Date().getFullYear()} Forcepoint LLC | Confidential</div>
</div>

</div>
</body>
</html>`;
}

export function Step11Summary({ sessionData, templates, selectedProducts, checklistAnswers, versionEntries, versionData, recommendations, actionItems, featureRequests, serverDetails, selectedReports, dlpBundles, certificates, selectedEnhancements }: Step11Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone,  setExportDone]  = useState(false);

  const selectedTemplates = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(selectedProducts).forEach(([pid, sel]) => {
      if (sel && PRODUCT_ID_MAP[pid]) ids.add(PRODUCT_ID_MAP[pid]);
    });
    return templates.filter((t) => ids.has(t.id));
  }, [templates, selectedProducts]);

  const { allFindings, totalAnswered, totalQuestions, healthScore } = useMemo(() => {
    const findings: Array<{ text: string; severity: string; section: string; note?: string; templateName: string; templateColor: string; templateIcon: string; answer: string; description?: string; remediation?: string; }> = [];
    let answered = 0, total = 0;
    for (const t of selectedTemplates) {
      total += t.questions.length;
      for (const q of t.questions) {
        const key = `${t.id}__${q.id}`;
        const ans = checklistAnswers[key];
        if (ans?.value != null) answered++;
        if (q.severity && ans?.value === (q.triggerOn ?? 'no'))
          findings.push({ text: q.text, severity: q.severity, section: q.section, note: ans.note, templateName: t.name, templateColor: t.color, templateIcon: t.icon, answer: ans.value, description: q.description, remediation: q.remediation });
      }
    }
    findings.sort((a, b) => SEV_ORDER.indexOf(a.severity as QuestionSeverity) - SEV_ORDER.indexOf(b.severity as QuestionSeverity));
    const score = answered === 0 ? null : Math.round(Math.max(0, (answered - findings.length) / answered * 100));
    return { allFindings: findings, totalAnswered: answered, totalQuestions: total, healthScore: score };
  }, [selectedTemplates, checklistAnswers]);

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
    { icon: '🔢', label: 'Version & EoS Status',  detail: `${checkData.versionCount} components tracked`, ok: checkData.versionCount > 0 },
    { icon: '🖥',  label: 'Server Infrastructure', detail: `${checkData.serverCount} server${checkData.serverCount !== 1 ? 's' : ''} configured`, ok: checkData.serverCount > 0 },
    { icon: '🔐', label: 'Certificate Analysis',  detail: `${certificates.length} certificate${certificates.length !== 1 ? 's' : ''}${certificates.filter(c => c.status !== 'VALID').length > 0 ? ` (${certificates.filter(c => c.status !== 'VALID').length} need attention)` : ''}`, ok: certificates.length > 0 },
    { icon: '🔍', label: 'Checklist Findings',    detail: `${allFindings.length} findings from ${totalAnswered} checks`, ok: totalAnswered > 0 },
    { icon: '💡', label: 'Recommendations',       detail: `${recommendations.length} defined`, ok: recommendations.length > 0 },
    { icon: '📋', label: 'Action Items',          detail: `${actionItems.length} items (${actionItems.filter(a => a.status === 'done').length} done)`, ok: actionItems.length > 0 },
    { icon: '🚀', label: 'Enhancement Requests',  detail: `${featureRequests.length} submitted`, ok: featureRequests.length > 0 },
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
        style={{ background: 'linear-gradient(145deg,#0c1f40 0%,#0f2952 40%,#1d4ed8 100%)', boxShadow: '0 6px 24px rgba(15,41,82,0.22)' }}>
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
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>Assessment Completion</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${Math.round((completedSteps / COMPLETION_STEPS.length) * 100)}%`, background: 'linear-gradient(90deg,#2563EB,#16A34A)' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A' }}>
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
                    ? <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0 }} />
                    : <Circle size={13} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: '11.5px', color: done ? '#0F172A' : '#94A3B8', fontWeight: done ? 500 : 400, flex: 1 }}>
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
            <FileText size={14} style={{ color: '#2563EB' }} />
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>Report Contents</div>
          </div>
          <div className="space-y-1">
            {reportItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 py-1 px-2 rounded-lg"
                style={{ background: item.ok ? 'rgba(37,99,235,0.03)' : '#FAFAFA' }}>
                <span style={{ fontSize: '13px', flexShrink: 0 }}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '11.5px', fontWeight: 500, color: item.ok ? '#0F172A' : '#94A3B8' }}>{item.label}</div>
                </div>
                <div style={{ fontSize: '10px', color: item.ok ? '#64748B' : '#DC2626', flexShrink: 0 }}>{item.detail}</div>
                {item.ok
                  ? <CheckCircle2 size={11} style={{ color: '#16A34A', flexShrink: 0 }} />
                  : <AlertCircle  size={11} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                }
              </div>
            ))}
          </div>
        </div>
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
                <CheckCircle2 size={22} style={{ color: '#16A34A' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#16A34A', marginBottom: '3px' }}>
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
                <Shield size={22} style={{ color: '#2563EB' }} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '3px' }}>
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
                  background: isExporting ? '#93C5FD' : 'linear-gradient(135deg, #2563EB, #1D4ED8)',
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

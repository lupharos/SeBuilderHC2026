import type { QuestionSeverity, Template } from '../../types/templates';
import type { TemplateAnswers } from '../../rules/ruleEngine';
import type { VersionEntry } from '../Step4VersionCheck';
import type { ServerEntry } from '../StepServerDetails';
import { SEV_ORDER } from './constants';

export interface HealthFinding {
  key: string;
  text: string;
  severity: QuestionSeverity;
  section: string;
  note?: string;
  templateName: string;
  templateColor: string;
  templateIcon: string;
  answer: string;
  description?: string;
  remediation?: string;
}

export interface HealthBreakdown {
  questionPenalty: number;
  eosCount: number;
  warnVersionCount: number;
  infraCritical: number;
  infraWarn: number;
  versionPenalty: number;
  infraPenalty: number;
}

export interface HealthScoreResult {
  allFindings: HealthFinding[];
  totalAnswered: number;
  totalQuestions: number;
  healthScore: number | null;
  healthBreakdown: HealthBreakdown;
}

const VERSION_EOS_PENALTY = 4;
const VERSION_WARN_PENALTY = 1;
const INFRA_CRIT_PENALTY = 3;
const INFRA_WARN_PENALTY = 1;

/**
 * Composite health score shared between the Summary (Step 14) and the Final
 * Export (Step 15). Splitting this used to live in both files with different
 * formulas; keep it in one place so the two screens never disagree.
 *
 *   base            = (answered − findings) / answered × 100   (or 100 if 0 answered)
 *   versionPenalty  = 4 × (eos/eol/critical) + 1 × (warning)
 *   infraPenalty    = 3 × (disk/RAM/CPU ≥85%) + 1 × (70–85%)
 *   final           = clamp(base − versionPenalty − infraPenalty, 0, 100)
 *
 * Returns null only when nothing has been collected anywhere.
 */
export function computeHealthScore(
  selectedTemplates: Template[],
  checklistAnswers: TemplateAnswers,
  versionEntries: Record<string, VersionEntry>,
  serverDetails: ServerEntry[],
): HealthScoreResult {
  const findings: HealthFinding[] = [];
  let answered = 0;
  let total = 0;

  for (const t of selectedTemplates) {
    total += t.questions.length;
    for (const q of t.questions) {
      const key = `${t.id}__${q.id}`;
      const ans = checklistAnswers[key];
      if (ans?.value != null) answered++;
      if (q.severity && ans?.value === (q.triggerOn ?? 'no')) {
        findings.push({
          key,
          text: q.text,
          severity: q.severity,
          section: q.section,
          note: ans.note,
          templateName: t.name,
          templateColor: t.color,
          templateIcon: t.icon,
          answer: ans.value,
          description: q.description,
          remediation: q.remediation,
        });
      }
    }
  }
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  const allVEntries = Object.values(versionEntries).filter((e) => e.installedVersion);
  const versionEffective = (e: VersionEntry) => e.statusOverride ?? e.status;
  const eosCount = allVEntries.filter((e) =>
    ['eos', 'eol', 'critical'].includes(versionEffective(e)),
  ).length;
  const warnVersionCount = allVEntries.filter((e) => versionEffective(e) === 'warning').length;

  let infraCritical = 0;
  let infraWarn = 0;
  for (const s of serverDetails) {
    if (!s.applicable) continue;
    for (const d of s.drives) {
      if (!d.totalGB) continue;
      const p = Math.round((d.usedGB / d.totalGB) * 100);
      if (p >= 85) infraCritical++;
      else if (p >= 70) infraWarn++;
    }
    if (s.ramTotalGB > 0) {
      const p = Math.round((s.ramUsedGB / s.ramTotalGB) * 100);
      if (p >= 85) infraCritical++;
      else if (p >= 70) infraWarn++;
    }
    if (s.cpuUsagePercent >= 85) infraCritical++;
    else if (s.cpuUsagePercent >= 70) infraWarn++;
  }

  const versionPenalty = eosCount * VERSION_EOS_PENALTY + warnVersionCount * VERSION_WARN_PENALTY;
  const infraPenalty = infraCritical * INFRA_CRIT_PENALTY + infraWarn * INFRA_WARN_PENALTY;

  const hasAnyData =
    answered > 0 || allVEntries.length > 0 || serverDetails.some((s) => s.applicable);

  let score: number | null;
  if (!hasAnyData) {
    score = null;
  } else {
    const base = answered === 0 ? 100 : Math.max(0, ((answered - findings.length) / answered) * 100);
    score = Math.max(0, Math.min(100, Math.round(base - versionPenalty - infraPenalty)));
  }

  return {
    allFindings: findings,
    totalAnswered: answered,
    totalQuestions: total,
    healthScore: score,
    healthBreakdown: {
      questionPenalty: findings.length,
      eosCount,
      warnVersionCount,
      infraCritical,
      infraWarn,
      versionPenalty,
      infraPenalty,
    },
  };
}

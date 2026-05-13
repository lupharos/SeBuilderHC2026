import { useState, useMemo } from 'react';
import {
  ShieldAlert, ChevronDown, ChevronRight, CheckCircle2,
  AlertTriangle, AlertCircle,
  RotateCcw, Copy, Check,
} from 'lucide-react';
import {
  ALL_RULES, PRODUCT_CONFIG, SEVERITY_CONFIG,
  evaluateRules, groupRulesByProduct,
  type ChecklistAnswers, type AnswerValue, type ProductCategory, type Severity,
} from './rules/ruleEngine';

interface RuleEnginePageProps {
  answers: ChecklistAnswers;
  onAnswerChange: (qId: string, value: AnswerValue) => void;
  onResetAnswers: () => void;
}

/* ═══════════════════════════════════════ */
export function RuleEnginePage({ answers, onAnswerChange, onResetAnswers }: RuleEnginePageProps) {
  const [expandedProducts, setExpandedProducts] = useState<Set<ProductCategory>>(
    new Set(['Hardware & OS', 'Web Security', 'DLP'])
  );
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [productFilter, setProductFilter] = useState<ProductCategory | 'ALL'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const groupedRules = useMemo(() => groupRulesByProduct(), []);
  const findings = useMemo(() => evaluateRules(answers), [answers]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== 'ALL' && f.rule.severity !== severityFilter) return false;
      if (productFilter !== 'ALL' && f.rule.product !== productFilter) return false;
      return true;
    });
  }, [findings, severityFilter, productFilter]);

  const totalAnswered = Object.values(answers).filter((v) => v !== null && v !== undefined).length;
  const totalQuestions = ALL_RULES.length;

  const criticalCount = findings.filter((f) => f.rule.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.rule.severity === 'HIGH').length;

  const toggleProduct = (p: ProductCategory) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const copyRemediations = () => {
    const text = filteredFindings
      .map((f) => `[${f.rule.severity}] ${f.rule.id} — ${f.rule.title}\n${f.rule.description}\n${f.rule.remediation}`)
      .join('\n\n');
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId('all');
        setTimeout(() => setCopiedId(null), 1800);
      }).catch(() => fallbackCopy(text));
    } catch {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 1800);
  };

  /* Health score */
  const healthScore = useMemo(() => {
    if (totalAnswered === 0) return null;
    const yesCount = Object.values(answers).filter((v) => v === 'yes').length;
    return Math.round((yesCount / totalAnswered) * 100);
  }, [answers, totalAnswered]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F4F7FB' }}>

      {/* ── Page Header ── */}
      <div
        className="flex-shrink-0 px-8 py-5 border-b flex items-center gap-5"
        style={{ background: '#fff', borderColor: 'rgba(15,41,82,0.08)' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #DC2626 0%, #7C3AED 100%)', boxShadow: '0 2px 12px rgba(220,38,38,0.25)' }}
        >
          <ShieldAlert size={18} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Rule Engine
          </h1>
          <p style={{ fontSize: '12px', color: '#64748B', marginTop: '1px' }}>
            Answer health-check questions — issues fire automatically in real time
          </p>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-2.5 ml-auto">
          <StatChip label="Questions" value={`${totalAnswered}/${totalQuestions}`} color="#475569" bg="#F1F5F9" />
          {criticalCount > 0 && <StatChip label="Critical" value={criticalCount} color="#DC2626" bg="#FEF2F2" pulse />}
          {highCount > 0 && <StatChip label="High" value={highCount} color="#D97706" bg="#FFFBEB" />}
          {healthScore !== null && (
            <StatChip
              label="Health"
              value={`${healthScore}%`}
              color={healthScore >= 80 ? '#16A34A' : healthScore >= 50 ? '#D97706' : '#DC2626'}
              bg={healthScore >= 80 ? '#F0FDF4' : healthScore >= 50 ? '#FFFBEB' : '#FEF2F2'}
            />
          )}
          <button
            onClick={onResetAnswers}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ml-2"
            style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', borderColor: '#E2E8F0', background: '#fff' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#0F172A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}
          >
            <RotateCcw size={12} />
            Reset All
          </button>
        </div>
      </div>

      {/* ── Body: Two Columns ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Questions */}
        <div className="flex-1 overflow-y-auto px-7 py-6 min-w-0">
          {(Array.from(groupedRules.entries()) as [ProductCategory, typeof ALL_RULES][]).map(([product, rules]) => {
            const cfg = PRODUCT_CONFIG[product];
            const answered = rules.filter((r) => answers[r.questionId] !== null && answers[r.questionId] !== undefined).length;
            const issues = rules.filter((r) => answers[r.questionId] === r.triggerOn).length;
            const isOpen = expandedProducts.has(product);

            return (
              <div
                key={product}
                className="mb-3 rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: `1px solid ${isOpen ? cfg.border : '#EEF0F5'}`, transition: 'border-color 0.15s' }}
              >
                {/* Category header */}
                <button
                  className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left"
                  style={{ background: isOpen ? cfg.bg : '#fff' }}
                  onClick={() => toggleProduct(product)}
                >
                  <span style={{ fontSize: '15px' }}>{cfg.emoji}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{product}</span>

                  {/* Progress */}
                  <div className="flex items-center gap-1.5 ml-1">
                    <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(answered / rules.length) * 100}%`, background: cfg.color }}
                      />
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8', fontWeight: 600 }}>
                      {answered}/{rules.length}
                    </span>
                  </div>

                  {issues > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-md"
                      style={{ fontSize: '10px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                    >
                      ⚠ {issues} issue{issues !== 1 ? 's' : ''}
                    </span>
                  )}
                  {answered === rules.length && issues === 0 && (
                    <span
                      className="px-2 py-0.5 rounded-md"
                      style={{ fontSize: '10px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}
                    >
                      ✓ All Clear
                    </span>
                  )}

                  <div className="ml-auto" style={{ color: '#94A3B8' }}>
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>
                </button>

                {/* Questions list */}
                {isOpen && (
                  <div className="divide-y" style={{ borderTop: `1px solid ${cfg.border}` }}>
                    {rules.map((rule, qi) => {
                      const answer = answers[rule.questionId] ?? null;
                      const isFired = answer === rule.triggerOn;
                      const sevCfg = SEVERITY_CONFIG[rule.severity];

                      return (
                        <div
                          key={rule.id}
                          className="flex items-start gap-4 px-5 py-3.5 transition-colors"
                          style={{
                            background: isFired ? sevCfg.bg : answer === 'yes' ? '#F0FDF4' : '#fff',
                          }}
                        >
                          {/* Severity + ID */}
                          <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5" style={{ minWidth: '56px' }}>
                            <span
                              className="px-1.5 py-0.5 rounded text-center"
                              style={{ fontSize: '9px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: sevCfg.bg, color: sevCfg.color, border: `1px solid ${sevCfg.border}` }}
                            >
                              {rule.severity === 'CRITICAL' ? 'CRIT' : rule.severity}
                            </span>
                            <span
                              style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: '#94A3B8', fontWeight: 500, textAlign: 'center' }}
                            >
                              {rule.id}
                            </span>
                          </div>

                          {/* Question text */}
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: '12.5px', color: '#0F172A', lineHeight: 1.5, marginBottom: 0 }}>
                              {rule.questionText}
                            </p>
                            {isFired && (
                              <p style={{ fontSize: '11px', color: sevCfg.color, marginTop: '3px', lineHeight: 1.45 }}>
                                ⚠ {rule.description}
                              </p>
                            )}
                          </div>

                          {/* YES / NO / N-A */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {(['yes', 'no', 'na'] as AnswerValue[]).map((opt) => (
                              <AnswerButton
                                key={opt!}
                                option={opt!}
                                selected={answer === opt}
                                onClick={() => onAnswerChange(rule.questionId, answer === opt ? null : opt)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* RIGHT — Findings Panel */}
        <div
          className="flex-shrink-0 overflow-y-auto flex flex-col"
          style={{ width: '380px', borderLeft: '1px solid rgba(15,41,82,0.07)', background: '#F8FAFC' }}
        >
          {/* Panel header */}
          <div
            className="sticky top-0 z-10 px-5 py-4 border-b flex-shrink-0"
            style={{ background: '#fff', borderColor: 'rgba(15,41,82,0.08)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                Live Findings
              </span>
              <div className="flex items-center gap-2">
                {filteredFindings.length > 0 && (
                  <button
                    onClick={copyRemediations}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all"
                    style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0' }}
                    title="Copy all remediations to clipboard"
                  >
                    {copiedId === 'all' ? <Check size={11} color="#16A34A" /> : <Copy size={11} />}
                    {copiedId === 'all' ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <span
                  style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: filteredFindings.length > 0 ? '#DC2626' : '#16A34A' }}
                >
                  {filteredFindings.length} finding{filteredFindings.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Severity filters */}
            <div className="flex gap-1.5 flex-wrap mb-2">
              {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className="px-2 py-0.5 rounded-full transition-all"
                  style={{
                    fontSize: '10px', fontWeight: 700,
                    background: severityFilter === s
                      ? (s === 'ALL' ? '#0F2952' : SEVERITY_CONFIG[s]?.bg ?? '#F1F5F9')
                      : '#F1F5F9',
                    color: severityFilter === s
                      ? (s === 'ALL' ? '#fff' : SEVERITY_CONFIG[s]?.color ?? '#475569')
                      : '#94A3B8',
                    border: severityFilter === s
                      ? `1.5px solid ${s === 'ALL' ? 'transparent' : SEVERITY_CONFIG[s]?.border ?? '#E2E8F0'}`
                      : '1.5px solid transparent',
                  }}
                >
                  {s === 'ALL' ? 'ALL' : s === 'CRITICAL' ? 'CRIT' : s}
                </button>
              ))}
            </div>

            {/* Product filters */}
            <div className="flex gap-1.5 flex-wrap">
              {(['ALL', ...Object.keys(PRODUCT_CONFIG)] as (ProductCategory | 'ALL')[]).map((p) => {
                const cfg = p !== 'ALL' ? PRODUCT_CONFIG[p as ProductCategory] : null;
                return (
                  <button
                    key={p}
                    onClick={() => setProductFilter(p)}
                    className="px-2 py-0.5 rounded-full transition-all"
                    style={{
                      fontSize: '9.5px', fontWeight: 700,
                      background: productFilter === p
                        ? (p === 'ALL' ? '#0F2952' : cfg?.bg ?? '#F1F5F9')
                        : '#F1F5F9',
                      color: productFilter === p
                        ? (p === 'ALL' ? '#fff' : cfg?.color ?? '#475569')
                        : '#94A3B8',
                      border: productFilter === p
                        ? `1.5px solid ${p === 'ALL' ? 'transparent' : cfg?.border ?? '#E2E8F0'}`
                        : '1.5px solid transparent',
                    }}
                  >
                    {p === 'ALL' ? 'All Products' : `${cfg?.emoji} ${p}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Findings list */}
          <div className="flex-1 px-4 py-4 space-y-2.5">
            {filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                {findings.length === 0 ? (
                  <>
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE' }}
                    >
                      <ShieldAlert size={22} color="#2563EB" />
                    </div>
                    <p style={{ fontSize: '12.5px', color: '#64748B', textAlign: 'center', maxWidth: '220px', lineHeight: 1.5 }}>
                      Answer questions on the left to automatically detect issues
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}
                    >
                      <CheckCircle2 size={22} color="#16A34A" />
                    </div>
                    <p style={{ fontSize: '12.5px', color: '#16A34A', textAlign: 'center', fontWeight: 600 }}>
                      No findings for current filter
                    </p>
                  </>
                )}
              </div>
            ) : (
              filteredFindings.map((finding) => (
                <FindingCard key={finding.rule.id} finding={finding} />
              ))
            )}
          </div>

          {/* Summary footer */}
          {findings.length > 0 && (
            <div
              className="flex-shrink-0 px-5 py-3 border-t"
              style={{ background: '#fff', borderColor: 'rgba(15,41,82,0.08)' }}
            >
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 500 }}>Severity breakdown</span>
              </div>
              <div className="flex gap-3 mt-1.5">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map((sev) => {
                  const cnt = findings.filter((f) => f.rule.severity === sev).length;
                  if (cnt === 0) return null;
                  const sc = SEVERITY_CONFIG[sev];
                  return (
                    <div key={sev} className="flex items-center gap-1">
                      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: sc.color }}>{cnt}</span>
                      <span style={{ fontSize: '10px', color: '#94A3B8' }}>{sc.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Finding Card ─── */
function FindingCard({ finding }: { finding: { rule: typeof ALL_RULES[0]; firedAt: Date } }) {
  const [expanded, setExpanded] = useState(false);
  const sc = SEVERITY_CONFIG[finding.rule.severity];
  const pc = PRODUCT_CONFIG[finding.rule.product];

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{ background: '#fff', border: `1.5px solid ${expanded ? sc.border : '#EEF0F5'}` }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Severity icon */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: sc.bg, border: `1px solid ${sc.border}` }}
        >
          {finding.rule.severity === 'CRITICAL'
            ? <AlertCircle size={13} color={sc.color} />
            : <AlertTriangle size={13} color={sc.color} />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ fontSize: '9px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
            >
              {finding.rule.severity}
            </span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ fontSize: '9px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}
            >
              {finding.rule.id}
            </span>
          </div>

          <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
            {finding.rule.title}
          </p>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              <p style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.55 }}>
                {finding.rule.description}
              </p>
              <div
                className="px-3 py-2 rounded-lg"
                style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}
              >
                <p style={{ fontSize: '11px', color: '#065F46', lineHeight: 1.55, fontWeight: 500 }}>
                  {finding.rule.remediation}
                </p>
              </div>
              <p style={{ fontSize: '10px', color: '#94A3B8' }}>
                {pc.emoji} {finding.rule.product}
              </p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 mt-0.5" style={{ color: '#CBD5E1' }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Answer Button ─── */
function AnswerButton({
  option, selected, onClick,
}: { option: NonNullable<AnswerValue>; selected: boolean; onClick: () => void }) {
  const configs: Record<string, { label: string; selBg: string; selColor: string; selBorder: string }> = {
    yes: { label: 'YES', selBg: '#F0FDF4', selColor: '#16A34A', selBorder: '#86EFAC' },
    no:  { label: 'NO',  selBg: '#FEF2F2', selColor: '#DC2626', selBorder: '#FECACA' },
    na:  { label: 'N/A', selBg: '#F8FAFC', selColor: '#64748B', selBorder: '#CBD5E1' },
  };
  const cfg = configs[option];

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="px-2 py-1 rounded-lg transition-all"
      style={{
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        background: selected ? cfg.selBg : '#F8FAFC',
        color: selected ? cfg.selColor : '#CBD5E1',
        border: `1.5px solid ${selected ? cfg.selBorder : '#E2E8F0'}`,
        minWidth: '34px',
      }}
    >
      {cfg.label}
    </button>
  );
}

/* ─── Stat Chip ─── */
function StatChip({ label, value, color, bg, pulse }: {
  label: string; value: string | number; color: string; bg: string; pulse?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
      style={{ background: bg, border: `1px solid ${color}22` }}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
        </span>
      )}
      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color }}>{value}</span>
    </div>
  );
}
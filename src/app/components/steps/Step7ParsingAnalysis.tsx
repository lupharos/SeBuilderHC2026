import { useState, useMemo } from 'react';
import {
  Upload, FileText, AlertTriangle, Info, X,
  ShieldAlert, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  MessageSquare, Pencil, Check,
} from 'lucide-react';
import type { Template, QuestionSeverity } from '../types/templates';
import type { QuestionAnswer, TemplateAnswers } from '../rules/ruleEngine';

interface Step7Props {
  checklistAnswers: TemplateAnswers;
  templates: Template[];
  onAnswerChange: (qId: string, answer: QuestionAnswer) => void;
}

interface Finding {
  nsKey: string;
  questionText: string;
  severity: QuestionSeverity;
  description?: string;
  remediation?: string;
  note?: string;
  templateId: string;
  templateName: string;
  templateColor: string;
  templateIcon: string;
  section: string;
}

type SevFilter = QuestionSeverity | 'ALL';

const SEV_CFG: Record<QuestionSeverity, { bg: string; text: string; border: string; icon: React.ReactNode; bar: string }> = {
  CRITICAL: { bg: 'rgba(220,38,38,0.07)',  text: '#DC2626', border: 'rgba(220,38,38,0.18)', icon: <AlertCircle size={12} />,   bar: '#DC2626' },
  HIGH:     { bg: 'rgba(217,119,6,0.07)',  text: '#D97706', border: 'rgba(217,119,6,0.18)', icon: <AlertTriangle size={12} />, bar: '#D97706' },
  MEDIUM:   { bg: 'rgba(37,99,235,0.07)',  text: '#2563EB', border: 'rgba(37,99,235,0.18)', icon: <AlertTriangle size={12} />, bar: '#2563EB' },
  LOW:      { bg: 'rgba(16,185,129,0.07)', text: '#059669', border: 'rgba(16,185,129,0.18)', icon: <Info size={12} />,         bar: '#10B981' },
};

const ANSWER_CFG: Record<string, { bg: string; text: string }> = {
  yes: { bg: 'rgba(22,163,74,0.08)',  text: '#16A34A' },
  no:  { bg: 'rgba(220,38,38,0.08)',  text: '#DC2626' },
  na:  { bg: 'rgba(100,116,139,0.1)', text: '#64748B' },
};

export function Step7ParsingAnalysis({ checklistAnswers, templates, onAnswerChange }: Step7Props) {
  const [activeProductTab, setActiveProductTab] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<SevFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteEditKey, setNoteEditKey] = useState<string | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');

  /* ── Data ── */
  const answeredCount = useMemo(
    () => Object.values(checklistAnswers).filter((a) => a?.value != null).length,
    [checklistAnswers],
  );

  // Templates that have at least one answered question → become tabs
  const tabTemplates = useMemo(
    () => templates.filter((t) => t.questions.some((q) => checklistAnswers[`${t.id}__${q.id}`]?.value != null)),
    [templates, checklistAnswers],
  );

  const currentTab = activeProductTab && tabTemplates.find((t) => t.id === activeProductTab)
    ? activeProductTab
    : (tabTemplates[0]?.id ?? null);

  const allFindings = useMemo<Finding[]>(() => {
    const result: Finding[] = [];
    for (const template of templates) {
      for (const question of template.questions) {
        if (!question.severity) continue;
        const key = `${template.id}__${question.id}`;
        const answer = checklistAnswers[key];
        const triggerOn = question.triggerOn ?? 'no';
        if (answer?.value === triggerOn) {
          result.push({
            nsKey: key,
            questionText: question.text,
            severity: question.severity,
            description: question.description,
            remediation: question.remediation,
            note: answer.note,
            templateId: template.id,
            templateName: template.name,
            templateColor: template.color,
            templateIcon: template.icon,
            section: question.section,
          });
        }
      }
    }
    return result;
  }, [templates, checklistAnswers]);

  // Findings for current product tab, filtered by severity
  const tabFindings = useMemo(
    () => allFindings.filter((f) => f.templateId === currentTab),
    [allFindings, currentTab],
  );

  const filteredFindings = useMemo(
    () => (sevFilter === 'ALL' ? tabFindings : tabFindings.filter((f) => f.severity === sevFilter)),
    [tabFindings, sevFilter],
  );

  // Finding counts per product tab
  const findingsByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of allFindings) m[f.templateId] = (m[f.templateId] ?? 0) + 1;
    return m;
  }, [allFindings]);

  // Severity counts for current tab
  const sevCounts = useMemo(() => {
    const c: Partial<Record<QuestionSeverity, number>> = {};
    for (const f of tabFindings) c[f.severity] = (c[f.severity] ?? 0) + 1;
    return c;
  }, [tabFindings]);

  // Health score (global)
  const healthScore = useMemo(() => {
    if (answeredCount === 0) return null;
    return Math.round(Math.max(0, (answeredCount - allFindings.length) / answeredCount * 100));
  }, [answeredCount, allFindings]);

  /* ── Note editing ── */
  const startEditNote = (key: string) => {
    setNoteEditKey(key);
    setNoteEditValue(checklistAnswers[key]?.note ?? '');
  };

  const saveNote = (key: string) => {
    const current = checklistAnswers[key];
    onAnswerChange(key, { value: current?.value ?? null, note: noteEditValue.trim() || undefined });
    setNoteEditKey(null);
  };

  const cancelNote = () => setNoteEditKey(null);

  /* ── Render ── */
  return (
    <div className="space-y-[13px]">

      {/* Global summary header */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.1)' }}
            >
              <ShieldAlert size={15} style={{ color: '#6366F1' }} />
            </div>
            <div>
              <div className="font-semibold text-[13px] text-[#0F172A]">Checklist Analysis</div>
              <div className="text-[10.5px] text-[#64748B] font-mono mt-0.5">
                {answeredCount === 0
                  ? 'No answers yet — complete the checklist in Step 5 first'
                  : `${answeredCount} question${answeredCount !== 1 ? 's' : ''} evaluated · ${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} across ${tabTemplates.length} product${tabTemplates.length !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
          {healthScore !== null && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                background: healthScore >= 80 ? '#F0FDF4' : healthScore >= 50 ? '#FFFBEB' : '#FEF2F2',
                border: `1px solid ${healthScore >= 80 ? '#BBF7D0' : healthScore >= 50 ? '#FDE68A' : '#FECACA'}`,
              }}
            >
              <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>Health Score</span>
              <span style={{
                fontSize: '14px', fontWeight: 800, fontFamily: 'monospace',
                color: healthScore >= 80 ? '#16A34A' : healthScore >= 50 ? '#D97706' : '#DC2626',
              }}>
                {healthScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* No answers empty state */}
      {answeredCount === 0 && (
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
          <div className="text-center py-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(99,102,241,0.08)' }}
            >
              <ShieldAlert size={22} style={{ color: '#6366F1' }} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
              No Checklist Answers Yet
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.65, maxWidth: '380px', margin: '0 auto' }}>
              Go back to <strong>Step 5 — Per-Product Checklist</strong> and answer the health-check questions.
              Findings will appear here automatically as you answer.
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {answeredCount > 0 && (
        <>
          {/* Product tabs */}
          <div className="flex gap-2 flex-wrap">
            {tabTemplates.map((tmpl) => {
              const count = findingsByProduct[tmpl.id] ?? 0;
              const isActive = currentTab === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => { setActiveProductTab(tmpl.id); setSevFilter('ALL'); }}
                  className="flex items-center gap-2 h-[36px] px-[14px] rounded-xl font-semibold text-[12px] transition-all"
                  style={{
                    background: isActive ? 'white' : '#F1F5F9',
                    border: isActive ? `1.5px solid ${tmpl.color}50` : '1.5px solid transparent',
                    color: isActive ? tmpl.color : '#64748B',
                    boxShadow: isActive ? `0 1px 4px rgba(15,41,82,0.1), inset 0 0 0 0 transparent` : 'none',
                  }}
                >
                  <span style={{ fontSize: '15px' }}>{tmpl.icon}</span>
                  <span>{tmpl.name.replace(' HC', '')}</span>
                  {count > 0 ? (
                    <span
                      className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                      style={{ background: '#DC2626', color: 'white' }}
                    >
                      {count}
                    </span>
                  ) : (
                    <CheckCircle2 size={12} style={{ color: '#16A34A' }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Per-product severity chips */}
          {currentTab && (
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => setSevFilter('ALL')}
                className="h-[28px] px-3 rounded-full text-[10.5px] font-bold transition-all"
                style={{
                  background: sevFilter === 'ALL' ? '#0F172A' : '#F1F5F9',
                  color: sevFilter === 'ALL' ? '#fff' : '#94A3B8',
                }}
              >
                All ({tabFindings.length})
              </button>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as QuestionSeverity[]).map((sev) => {
                const cfg = SEV_CFG[sev];
                const count = sevCounts[sev] ?? 0;
                if (count === 0) return null;
                const isActive = sevFilter === sev;
                return (
                  <button
                    key={sev}
                    onClick={() => setSevFilter(isActive ? 'ALL' : sev)}
                    className="flex items-center gap-1 h-[28px] px-3 rounded-full text-[10.5px] font-bold transition-all"
                    style={{
                      background: isActive ? cfg.bg : '#F8FAFC',
                      color: isActive ? cfg.text : '#94A3B8',
                      border: isActive ? `1.5px solid ${cfg.border}` : '1.5px solid transparent',
                    }}
                  >
                    <span style={{ color: cfg.text }}>{cfg.icon}</span>
                    {sev} · {count}
                  </button>
                );
              })}
              {sevFilter !== 'ALL' && (
                <button
                  onClick={() => setSevFilter('ALL')}
                  className="flex items-center gap-1 h-[28px] px-2 rounded-full text-[10px] font-semibold"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  <X size={10} /> Clear
                </button>
              )}
            </div>
          )}

          {/* Findings list */}
          {currentTab && (
            <>
              {filteredFindings.length === 0 ? (
                <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
                  <div className="text-center py-8">
                    <CheckCircle2 size={30} className="mx-auto mb-3" style={{ color: '#16A34A' }} />
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#16A34A' }}>
                      {tabFindings.length === 0
                        ? 'All Clear — no issues detected for this product'
                        : 'No findings match the selected filter'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFindings.map((finding) => {
                    const sev = SEV_CFG[finding.severity];
                    const isExpanded = expandedId === finding.nsKey;
                    const isEditingNote = noteEditKey === finding.nsKey;
                    const currentAnswer = checklistAnswers[finding.nsKey];
                    const answerCfg = currentAnswer?.value ? ANSWER_CFG[currentAnswer.value] : null;

                    return (
                      <div
                        key={finding.nsKey}
                        className="bg-white rounded-xl overflow-hidden transition-all"
                        style={{
                          border: '1px solid rgba(15,41,82,0.08)',
                          boxShadow: `inset 3px 0 0 ${sev.bar}, 0 1px 3px rgba(15,41,82,0.05)`,
                        }}
                      >
                        <div style={{ padding: '14px 16px 14px 18px' }}>
                          {/* Header row */}
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Question + badges */}
                              <div className="flex items-start gap-2 mb-1.5">
                                <div style={{ flex: 1, fontSize: '12.5px', fontWeight: 600, color: '#0F172A', lineHeight: 1.5 }}>
                                  {finding.questionText}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {answerCfg && (
                                    <span
                                      className="px-1.5 py-0.5 rounded font-mono"
                                      style={{ fontSize: '8.5px', fontWeight: 700, background: answerCfg.bg, color: answerCfg.text }}
                                    >
                                      {currentAnswer?.value?.toUpperCase()}
                                    </span>
                                  )}
                                  <span
                                    className="px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                    style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace', background: sev.bg, color: sev.text, border: `1px solid ${sev.border}` }}
                                  >
                                    {sev.icon} {finding.severity}
                                  </span>
                                </div>
                              </div>

                              {/* Section label */}
                              <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace', marginBottom: '6px' }}>
                                {finding.section}
                              </div>

                              {/* Description */}
                              {finding.description && (
                                <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.65, marginBottom: '8px' }}>
                                  {finding.description}
                                </div>
                              )}

                              {/* Note section */}
                              {isEditingNote ? (
                                <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1.5px solid #BFDBFE' }}>
                                  <textarea
                                    value={noteEditValue}
                                    onChange={(e) => setNoteEditValue(e.target.value)}
                                    placeholder="Add a note or description for this finding…"
                                    rows={2}
                                    autoFocus
                                    className="w-full px-3 py-2 text-[12px] text-[#0F172A] resize-none outline-none"
                                    style={{ background: '#EFF6FF', lineHeight: 1.6 }}
                                  />
                                  <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}>
                                    <button
                                      onClick={() => saveNote(finding.nsKey)}
                                      className="flex items-center gap-1 h-[22px] px-2.5 rounded text-[10.5px] font-semibold text-white"
                                      style={{ background: '#2563EB' }}
                                    >
                                      <Check size={10} /> Save
                                    </button>
                                    <button
                                      onClick={cancelNote}
                                      className="flex items-center gap-1 h-[22px] px-2 rounded text-[10.5px] font-semibold"
                                      style={{ background: '#F1F5F9', color: '#64748B' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : finding.note ? (
                                <div
                                  className="mt-1.5 flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer group"
                                  style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
                                  onClick={() => startEditNote(finding.nsKey)}
                                >
                                  <MessageSquare size={11} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
                                  <span style={{ flex: 1, fontSize: '11px', color: '#1E40AF', lineHeight: 1.5 }}>
                                    {finding.note}
                                  </span>
                                  <Pencil size={10} style={{ color: '#93C5FD', flexShrink: 0, marginTop: '2px' }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditNote(finding.nsKey)}
                                  className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold transition-all"
                                  style={{ color: '#94A3B8' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#2563EB'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; }}
                                >
                                  <Pencil size={10} /> Add note
                                </button>
                              )}

                              {/* Remediation (collapsible) */}
                              {finding.remediation && (
                                <div className="mt-2.5">
                                  <button
                                    onClick={() => setExpandedId(isExpanded ? null : finding.nsKey)}
                                    className="flex items-center gap-1 text-[10.5px] font-semibold transition-all"
                                    style={{ color: isExpanded ? '#059669' : '#94A3B8' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#059669'; }}
                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.color = '#94A3B8'; }}
                                  >
                                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                    Remediation
                                  </button>
                                  {isExpanded && (
                                    <div
                                      className="mt-2 px-3 py-2.5 rounded-lg"
                                      style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}
                                    >
                                      <div style={{ fontSize: '11.5px', color: '#065F46', lineHeight: 1.6 }}>
                                        {finding.remediation}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Document Upload */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[20px_22px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-[27px] h-[27px] bg-[rgba(13,148,136,0.1)] rounded-[7px] flex items-center justify-center">
            <Upload size={13} style={{ color: '#0D9488' }} />
          </div>
          <div className="font-semibold text-[13px] text-[#0F172A]">Document Upload & Parse</div>
          <span className="ml-auto" style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8' }}>
            Word · Excel · TXT
          </span>
        </div>
        <div
          className="border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer"
          style={{ borderColor: 'rgba(13,148,136,0.25)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(13,148,136,0.5)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(13,148,136,0.02)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(13,148,136,0.25)'; (e.currentTarget as HTMLDivElement).style.background = ''; }}
        >
          <FileText size={22} className="mx-auto mb-2.5" style={{ color: '#94A3B8' }} />
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
            Drop files here or click to browse
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            Findings will be auto-extracted from uploaded documents
          </div>
        </div>
      </div>
    </div>
  );
}

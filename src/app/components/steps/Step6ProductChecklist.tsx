import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Template } from '../types/templates';
import type { QuestionAnswer, TemplateAnswers } from '../rules/ruleEngine';

interface Step6Props {
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  checklistAnswers: TemplateAnswers;
  onAnswerChange: (qId: string, answer: QuestionAnswer) => void;
}

const productIdMap: Record<string, string> = {
  web: 'web',
  email: 'email',
  data: 'dlp',
  ngfw: 'ngfw',
  dspm: 'dspm',
  cls: 'classification',
  appl: 'appl',
  vappl: 'appl',
};

const SEV_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'rgba(220,38,38,0.08)', text: '#DC2626', border: 'rgba(220,38,38,0.22)' },
  HIGH:     { bg: 'rgba(217,119,6,0.08)',  text: '#D97706', border: 'rgba(217,119,6,0.22)' },
  MEDIUM:   { bg: 'rgba(37,99,235,0.08)',  text: '#2563EB', border: 'rgba(37,99,235,0.22)' },
  LOW:      { bg: 'rgba(16,185,129,0.08)', text: '#059669', border: 'rgba(16,185,129,0.22)' },
};

export function Step6ProductChecklist({ templates, selectedProducts, checklistAnswers, onAnswerChange }: Step6Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const filteredTemplates = useMemo(() => {
    const selectedTemplateIds = new Set<string>();
    Object.entries(selectedProducts).forEach(([productId, isSelected]) => {
      if (isSelected) {
        const templateId = productIdMap[productId];
        if (templateId) selectedTemplateIds.add(templateId);
      }
    });
    return templates.filter((template) => selectedTemplateIds.has(template.id));
  }, [templates, selectedProducts]);

  const currentActiveTab = activeTab || (filteredTemplates.length > 0 ? filteredTemplates[0].id : null);
  const activeTemplate = filteredTemplates.find((t) => t.id === currentActiveTab);

  const questionsBySection = useMemo(() => {
    if (!activeTemplate) return [];
    return activeTemplate.sections.map((section) => ({
      section,
      questions: activeTemplate.questions.filter((q) => q.section === section),
    }));
  }, [activeTemplate]);

  const nsKey = (templateId: string, questionId: string) => `${templateId}__${questionId}`;

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAll = () => {
    if (!activeTemplate) return;
    setCollapsedSections(new Set(activeTemplate.sections.map((s) => `${activeTemplate.id}__${s}`)));
  };

  const expandAll = () => setCollapsedSections(new Set());

  const handleAnswerClick = (templateId: string, questionId: string, answerValue: 'yes' | 'no' | 'na') => {
    const key = nsKey(templateId, questionId);
    const current = checklistAnswers[key];
    const newValue = current?.value === answerValue ? null : answerValue;
    onAnswerChange(key, { value: newValue, note: current?.note });
  };

  const handleNoteChange = (templateId: string, questionId: string, note: string) => {
    const key = nsKey(templateId, questionId);
    const current = checklistAnswers[key];
    onAnswerChange(key, { value: current?.value ?? null, note: note || undefined });
  };

  const getAnsweredCount = (template: Template) =>
    template.questions.filter((q) => checklistAnswers[nsKey(template.id, q.id)]?.value != null).length;

  if (filteredTemplates.length === 0) {
    return (
      <div className="space-y-[13px]">
        <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08),0_1px_2px_rgba(15,41,82,0.05)] p-[20px_22px]">
          <div className="text-center py-12">
            <div className="text-[48px] mb-4">📦</div>
            <div className="font-semibold text-[15px] text-[#0F172A] mb-2">No Products Selected</div>
            <div className="text-[12.5px] text-[#64748B]">
              Please go back to <span className="font-semibold text-[#2563EB]">Step 2: Product Scope</span> to select products for assessment.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      {/* Product Tabs */}
      <div className="flex gap-2 flex-wrap">
        {filteredTemplates.map((template) => {
          const answeredCount = getAnsweredCount(template);
          const totalCount = template.questions.length;
          return (
            <button
              key={template.id}
              onClick={() => { setActiveTab(template.id); setCollapsedSections(new Set()); }}
              className={`h-[33px] px-[15px] rounded-lg font-semibold text-[12.5px] transition-all flex items-center gap-1.5 ${
                currentActiveTab === template.id
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-[#EEF2F8] border border-[rgba(15,41,82,0.14)] text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]'
              }`}
            >
              <span>{template.icon}</span>
              {template.name.replace(' HC', '')}
              <span className={`text-[10px] font-mono ${currentActiveTab === template.id ? 'opacity-60' : 'opacity-50'}`}>
                ({answeredCount}/{totalCount})
              </span>
            </button>
          );
        })}
      </div>

      {activeTemplate && (
        <>
          {/* Template Header */}
          <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08),0_1px_2px_rgba(15,41,82,0.05)] p-[20px_22px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-[20px]"
                  style={{ backgroundColor: `${activeTemplate.color}20` }}
                >
                  {activeTemplate.icon}
                </div>
                <div>
                  <div className="font-semibold text-[14px] text-[#0F172A]">{activeTemplate.name}</div>
                  <div className="text-[11px] text-[#64748B] font-mono">
                    {activeTemplate.productCode} · {activeTemplate.questions.length} Questions · {activeTemplate.sections.length} Sections
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-[#64748B] font-mono">
                  {getAnsweredCount(activeTemplate)}/{activeTemplate.questions.length} answered
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={expandAll}
                    className="h-[26px] px-2.5 rounded text-[10.5px] font-semibold transition-all"
                    style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid rgba(15,41,82,0.1)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#2563EB'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; }}
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="h-[26px] px-2.5 rounded text-[10.5px] font-semibold transition-all"
                    style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid rgba(15,41,82,0.1)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#2563EB'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; }}
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Questions grouped by Section */}
          {questionsBySection.map(({ section, questions }) => {
            const sectionKey = `${activeTemplate.id}__${section}`;
            const isCollapsed = collapsedSections.has(sectionKey);
            const answeredInSection = questions.filter(
              (q) => checklistAnswers[nsKey(activeTemplate.id, q.id)]?.value != null
            ).length;

            return (
              <div
                key={section}
                className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08),0_1px_2px_rgba(15,41,82,0.05)] overflow-hidden"
              >
                {/* Section header — clickable */}
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center gap-2 px-[22px] transition-all"
                  style={{
                    padding: '14px 22px',
                    background: isCollapsed ? '#F8FAFC' : 'white',
                    borderBottom: isCollapsed ? 'none' : '1px solid rgba(15,41,82,0.06)',
                  }}
                >
                  <div className="w-[27px] h-[27px] bg-[rgba(37,99,235,0.1)] rounded-[7px] flex items-center justify-center text-[10px] font-bold font-mono text-[#2563EB] flex-shrink-0">
                    {questions.length}
                  </div>
                  <div className="flex-1 font-semibold text-[13px] text-[#0F172A] text-left">{section}</div>
                  <div className="text-[10px] text-[#64748B] font-mono mr-2">
                    {answeredInSection}/{questions.length} answered
                  </div>
                  {isCollapsed
                    ? <ChevronRight size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                    : <ChevronDown size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                  }
                </button>

                {/* Questions — hidden when collapsed */}
                {!isCollapsed && (
                  <div className="p-[16px_22px] space-y-2.5">
                    {questions.map((question) => {
                      const key = nsKey(activeTemplate.id, question.id);
                      const answer = checklistAnswers[key];
                      const sev = question.severity ? SEV_BADGE[question.severity] : null;
                      const noteOpen = noteOpenId === key;

                      return (
                        <div
                          key={question.id}
                          className="border border-[rgba(15,41,82,0.08)] rounded-lg p-3 bg-[#F4F6FA] hover:border-[rgba(15,41,82,0.14)] transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              {/* Question text + severity badge */}
                              <div className="flex items-start gap-2 mb-2.5">
                                <div className="flex-1 text-[12.5px] text-[#0F172A] leading-[1.6]">
                                  {question.text}
                                </div>
                                {sev && (
                                  <span
                                    className="flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                                    style={{
                                      fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace',
                                      background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
                                    }}
                                  >
                                    {question.severity}
                                  </span>
                                )}
                              </div>

                              {/* Answer buttons */}
                              <div className="flex gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handleAnswerClick(activeTemplate.id, question.id, 'yes')}
                                  className={`h-[28px] px-3 rounded-lg font-semibold text-[11.5px] transition-all ${
                                    answer?.value === 'yes'
                                      ? 'bg-[#16A34A] text-white shadow-sm'
                                      : 'bg-white border border-[rgba(15,41,82,0.14)] text-[#334155] hover:border-[#16A34A] hover:text-[#16A34A]'
                                  }`}
                                >
                                  YES
                                </button>
                                <button
                                  onClick={() => handleAnswerClick(activeTemplate.id, question.id, 'no')}
                                  className={`h-[28px] px-3 rounded-lg font-semibold text-[11.5px] transition-all ${
                                    answer?.value === 'no'
                                      ? 'bg-[#DC2626] text-white shadow-sm'
                                      : 'bg-white border border-[rgba(15,41,82,0.14)] text-[#334155] hover:border-[#DC2626] hover:text-[#DC2626]'
                                  }`}
                                >
                                  NO
                                </button>
                                <button
                                  onClick={() => handleAnswerClick(activeTemplate.id, question.id, 'na')}
                                  className={`h-[28px] px-3 rounded-lg font-semibold text-[11.5px] transition-all ${
                                    answer?.value === 'na'
                                      ? 'bg-[#64748B] text-white shadow-sm'
                                      : 'bg-white border border-[rgba(15,41,82,0.14)] text-[#334155] hover:border-[#64748B] hover:text-[#64748B]'
                                  }`}
                                >
                                  N/A
                                </button>
                                <button
                                  onClick={() => setNoteOpenId(noteOpen ? null : key)}
                                  className={`h-[28px] px-3 rounded-lg font-semibold text-[11.5px] transition-all ${
                                    answer?.note
                                      ? 'bg-[#2563EB] text-white shadow-sm'
                                      : noteOpen
                                      ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#93C5FD]'
                                      : 'bg-white border border-[rgba(15,41,82,0.14)] text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]'
                                  }`}
                                >
                                  {answer?.note ? '📝 Note' : '+ Note'}
                                </button>
                              </div>

                              {/* Note textarea (open) */}
                              {noteOpen && (
                                <div className="mt-2">
                                  <textarea
                                    value={answer?.note ?? ''}
                                    onChange={(e) => handleNoteChange(activeTemplate.id, question.id, e.target.value)}
                                    placeholder="Add a note about this finding…"
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg text-[12px] text-[#0F172A] resize-none outline-none"
                                    style={{ background: '#FFF', border: '1.5px solid #BFDBFE', lineHeight: 1.6 }}
                                  />
                                </div>
                              )}

                              {/* Note preview (closed) */}
                              {answer?.note && !noteOpen && (
                                <div
                                  className="mt-2 px-2.5 py-1.5 rounded-lg text-[11.5px] text-[#334155] cursor-pointer"
                                  style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
                                  onClick={() => setNoteOpenId(key)}
                                >
                                  <span style={{ color: '#64748B', fontWeight: 600 }}>Note: </span>{answer.note}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

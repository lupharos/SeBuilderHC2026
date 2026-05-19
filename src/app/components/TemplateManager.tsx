import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, FolderPlus, Shield, CheckCircle2, ArrowLeft, Layers, Download, Upload, Check, AlertCircle, X, FolderOpen, RefreshCw, FileJson } from 'lucide-react';
import type { Template, Question, QuestionSeverity } from './types/templates';
import {
  saveTemplates, autoLoad, requestAndLoad, clearStoredHandle, isSupported,
  type LoadResult,
} from '../utils/templateFileSystem';
import type { FSFileHandle } from '../utils/templateFileSystem';
import _ruleEngineData from './data/hc-rule-engine.json';

const _rawTemplates: Template[] = _ruleEngineData.templates as Template[];

export const initialTemplates: Template[] = _rawTemplates.map((t) => ({
  ...t,
  questions: t.questions.map((q) => ({
    ...q,
    id: `${t.id}_${q.id}`,
  })),
}));

const SEV_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'rgba(220,38,38,0.08)', text: '#DC2626', border: 'rgba(220,38,38,0.22)' },
  HIGH:     { bg: 'rgba(217,119,6,0.08)',  text: '#D97706', border: 'rgba(217,119,6,0.22)' },
  MEDIUM:   { bg: 'rgba(37,99,235,0.08)', text: '#2563EB', border: 'rgba(37,99,235,0.22)' },
  LOW:      { bg: 'rgba(16,185,129,0.08)', text: '#059669', border: 'rgba(16,185,129,0.22)' },
};

interface TemplateManagerProps {
  onClose: () => void;
  templates: Template[];
  setTemplates: (templates: Template[]) => void;
  selectedProducts: Record<string, boolean>;
}

export function TemplateManager({ onClose, templates, setTemplates, selectedProducts }: TemplateManagerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingQuestionData, setEditingQuestionData] = useState<Partial<Question>>({});
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionSection, setNewQuestionSection] = useState('');
  const [newQuestionSeverity, setNewQuestionSeverity] = useState<string>('');
  const [newQuestionTriggerOn, setNewQuestionTriggerOn] = useState<'yes' | 'no'>('no');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importState, setImportState] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<'checking' | 'linked' | 'needs-permission' | 'none'>('checking');
  const [linkedFilename, setLinkedFilename] = useState<string | null>(null);
  const [pendingHandle, setPendingHandle] = useState<import('../utils/templateFileSystem').FSFileHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  /* Saved-flash state — fires after edits or explicit Save. Templates are
     auto-persisted by Dashboard's useLocalStorage('hc_templates', …); this
     is a visual confirmation so the operator knows the change took. */
  const [savedFlash, setSavedFlash] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, [templates]);

  function manualSave() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function exportJSON() {
    const payload = {
      _format: 'forcepoint-hc-templates',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      templates,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hc-rule-engine-templates-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const productIdMap: Record<string, string> = {
    web: 'web', email: 'email', data: 'dlp', ngfw: 'ngfw',
    dspm: 'dspm', cls: 'classification', appl: 'appl', vappl: 'appl',
  };

  const activeTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(selectedProducts).forEach(([productId, isSelected]) => {
      if (isSelected) {
        const templateId = productIdMap[productId];
        if (templateId) ids.add(templateId);
      }
    });
    return ids;
  }, [selectedProducts]);

  const totalQuestions = templates.reduce((sum, t) => sum + t.questions.length, 0);
  const activeQuestions = templates
    .filter((t) => activeTemplateIds.has(t.id))
    .reduce((sum, t) => sum + t.questions.length, 0);

  const handleAddQuestion = () => {
    if (!newQuestionText.trim() || !newQuestionSection) return;

    const newQuestion: Question = {
      id: `${selectedTemplate.id}_q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      text: newQuestionText,
      section: newQuestionSection,
      ...(newQuestionSeverity ? {
        severity: newQuestionSeverity as QuestionSeverity,
        triggerOn: newQuestionTriggerOn,
      } : {}),
    };

    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id ? { ...t, questions: [...t.questions, newQuestion] } : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setNewQuestionText('');
    setNewQuestionSection('');
    setNewQuestionSeverity('');
    setNewQuestionTriggerOn('no');
  };

  const handleDeleteQuestion = (questionId: string) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, questions: t.questions.filter((q) => q.id !== questionId) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
  };

  const handleUpdateQuestion = (questionId: string, updates: Partial<Question>) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, questions: t.questions.map((q) => (q.id === questionId ? { ...q, ...updates } : q)) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setEditingQuestion(null);
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestion(q.id);
    setEditingQuestionData({
      text: q.text,
      severity: q.severity,
      triggerOn: q.triggerOn,
      description: q.description,
      remediation: q.remediation,
    });
  };


  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportState('importing');
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        const parsed: unknown[] = Array.isArray(raw) ? raw : raw?.templates;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('JSON must contain a "templates" array.');
        }
        const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const validated: Template[] = parsed.map((t: unknown, i: number) => {
          const tmpl = t as Record<string, unknown>;
          if (typeof tmpl.id !== 'string' || !tmpl.id) throw new Error(`Template[${i}]: missing "id".`);
          if (typeof tmpl.name !== 'string' || !tmpl.name) throw new Error(`Template[${i}]: missing "name".`);
          if (!Array.isArray(tmpl.questions)) throw new Error(`Template[${i}]: "questions" must be an array.`);
          if (!Array.isArray(tmpl.sections)) throw new Error(`Template[${i}]: "sections" must be an array.`);

          const questions = (tmpl.questions as unknown[]).map((q: unknown, qi: number) => {
            const qobj = q as Record<string, unknown>;
            if (typeof qobj.id !== 'string' || !qobj.id) throw new Error(`Template[${i}] Question[${qi}]: missing "id".`);
            if (typeof qobj.text !== 'string' || !qobj.text) throw new Error(`Template[${i}] Question[${qi}]: missing "text".`);
            if (typeof qobj.section !== 'string') throw new Error(`Template[${i}] Question[${qi}]: missing "section".`);
            return {
              id: qobj.id,
              text: qobj.text,
              section: qobj.section,
              ...(typeof qobj.severity === 'string' && validSeverities.includes(qobj.severity)
                ? { severity: qobj.severity as QuestionSeverity } : {}),
              ...(typeof qobj.triggerOn === 'string' && (qobj.triggerOn === 'yes' || qobj.triggerOn === 'no')
                ? { triggerOn: qobj.triggerOn as 'yes' | 'no' } : {}),
              ...(typeof qobj.description === 'string' && qobj.description ? { description: qobj.description } : {}),
              ...(typeof qobj.remediation === 'string' && qobj.remediation ? { remediation: qobj.remediation } : {}),
            } as Question;
          });

          return {
            id: tmpl.id as string,
            name: tmpl.name as string,
            productCode: (tmpl.productCode as string) || '',
            color: (tmpl.color as string) || '#3B82F6',
            icon: (tmpl.icon as string) || '📋',
            sections: tmpl.sections as string[],
            questions,
          } satisfies Template;
        });

        setTemplates(validated);
        setSelectedTemplate(validated[0]);
        setImportState('success');
        setTimeout(() => setImportState('idle'), 2500);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file.');
        setImportState('error');
        setTimeout(() => { setImportState('idle'); setImportError(null); }, 4000);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id ? { ...t, sections: [...t.sections, newSectionName] } : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setNewSectionName('');
  };

  const handleDeleteSection = (sectionName: string) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, sections: t.sections.filter((s) => s !== sectionName), questions: t.questions.filter((q) => q.section !== sectionName) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
  };

  const handleRenameSection = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) { setEditingSection(null); return; }
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? {
            ...t,
            sections: t.sections.map((s) => (s === oldName ? newName : s)),
            questions: t.questions.map((q) => (q.section === oldName ? { ...q, section: newName } : q)),
          }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setEditingSection(null);
  };

  // ── Auto-load on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported()) { setFileState('none'); return; }
    autoLoad().then((result: LoadResult) => {
      if (result.status === 'loaded') {
        setTemplates(result.templates);
        setSelectedTemplate(result.templates[0]);
        setLinkedFilename(result.filename);
        setFileState('linked');
      } else if (result.status === 'needs-permission') {
        setPendingHandle(result.handle);
        setFileState('needs-permission');
      } else {
        setFileState('none');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadPermission = async () => {
    if (!pendingHandle) return;
    const result = await requestAndLoad(pendingHandle);
    if (result.status === 'loaded') {
      setTemplates(result.templates);
      setSelectedTemplate(result.templates[0]);
      setLinkedFilename(result.filename);
      setFileState('linked');
      setPendingHandle(null);
    } else {
      setFileState('none');
    }
  };

  const handleUnlinkFile = async () => {
    await clearStoredHandle();
    setFileState('none');
    setLinkedFilename(null);
    setPendingHandle(null);
  };

  // ── Save Config (File System Access API) ─────────────────────────────────
  const handleSaveJSON = async () => {
    setSaveState('saving');
    setSaveError(null);
    const result = await saveTemplates(templates);
    if (result.ok) {
      setLinkedFilename(result.filename);
      setFileState('linked');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } else if ('cancelled' in result && result.cancelled) {
      setSaveState('idle');
    } else {
      setSaveError('error' in result ? result.error : null);
      setSaveState('error');
      setTimeout(() => { setSaveState('idle'); setSaveError(null); }, 4000);
    }
  };

  const questionsBySection = selectedTemplate.sections.map((section) => ({
    section,
    questions: selectedTemplate.questions.filter((q) => q.section === section),
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F4F7FB' }}>

      {/* Page Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-8 py-0"
        style={{ height: '64px', background: '#FFFFFF', borderBottom: '1.5px solid #EEF0F5', boxShadow: '0 1px 4px rgba(15,41,82,0.05)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.12))' }}>
            <Shield size={15} style={{ color: '#2563EB' }} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>HC Rule Engine</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>Manage checklist templates per product</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatPill label="Templates" value={String(templates.length)} color="#3B82F6" />
          <StatPill label="Total Questions" value={String(totalQuestions)} color="#8B5CF6" />
          {activeTemplateIds.size > 0 ? (
            <StatPill label={`${activeTemplateIds.size} Active · ${activeQuestions}Q`} value="LIVE" color="#10B981" dot />
          ) : (
            <StatPill label="No products selected" value="—" color="#F59E0B" />
          )}
          <div style={{ width: '1px', height: '28px', background: '#E2E8F0', margin: '0 4px' }} />
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all"
            style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <ArrowLeft size={14} />
            Back to Wizard
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: '280px', background: '#FFFFFF', borderRight: '1px solid #EEF0F5' }}>
          <div className="p-4">
            <div className="mb-3 px-1" style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.12em' }}>
              PRODUCT TEMPLATES ({templates.length})
            </div>
            <div className="space-y-1.5">
              {templates.map((tmpl) => {
                const isActive = activeTemplateIds.has(tmpl.id);
                const isSelected = selectedTemplate.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all relative"
                    style={{
                      background: isSelected ? `${tmpl.color}10` : '#F8FAFC',
                      border: isSelected ? `1.5px solid ${tmpl.color}38` : '1.5px solid #EEF0F5',
                    }}
                  >
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
                        <CheckCircle2 size={10} className="text-white" />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${tmpl.color}18` }}>
                      {tmpl.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{tmpl.name}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>{tmpl.questions.length}Q · {tmpl.sections.length} sec</div>
                      {isActive && <div style={{ fontSize: '9px', color: '#10B981', fontWeight: 700, letterSpacing: '0.06em', marginTop: '2px' }}>● ACTIVE IN STEP 5</div>}
                    </div>
                    {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r" style={{ background: tmpl.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {/* Template Title */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl relative" style={{ background: `${selectedTemplate.color}18` }}>
                {selectedTemplate.icon}
                {activeTemplateIds.has(selectedTemplate.id) && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
                    <CheckCircle2 size={11} className="text-white" />
                  </div>
                )}
              </div>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>{selectedTemplate.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="px-2 py-0.5 rounded-md" style={{ fontSize: '9.5px', fontWeight: 700, fontFamily: 'monospace', background: `${selectedTemplate.color}14`, color: selectedTemplate.color, border: `1px solid ${selectedTemplate.color}28` }}>
                    {selectedTemplate.productCode}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{selectedTemplate.questions.length} Questions · {selectedTemplate.sections.length} Sections</span>
                </div>
              </div>
            </div>

            {/* File link status banner */}
            {fileState === 'linked' && linkedFilename && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)' }}>
                <FolderOpen size={14} style={{ color: '#059669', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#065F46', flex: 1 }}>
                  Linked to <strong style={{ fontFamily: 'monospace' }}>{linkedFilename}</strong> — changes save automatically.
                </span>
                <button onClick={handleUnlinkFile}
                  style={{ fontSize: '11px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                  Unlink
                </button>
              </div>
            )}
            {fileState === 'needs-permission' && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <RefreshCw size={14} style={{ color: '#D97706', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#92400E', flex: 1 }}>
                  A saved config file was found. Click to reload it.
                </span>
                <button onClick={handleLoadPermission}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: '11.5px', background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <FolderOpen size={12} /> Load File
                </button>
                <button onClick={handleUnlinkFile}
                  style={{ fontSize: '11px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                  Dismiss
                </button>
              </div>
            )}

            {/* Live sync info */}
            <div className="flex items-start gap-3 p-4 rounded-xl mb-6" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#2563EB' }}>
                <span style={{ fontSize: '12px' }}>💡</span>
              </div>
              <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: 1.65 }}>
                <strong>Live Sync:</strong> Changes here reflect immediately in <strong>Step 5 — Per-Product Checklist</strong>.
                {activeTemplateIds.has(selectedTemplate.id)
                  ? <span style={{ color: '#059669', fontWeight: 600 }}> ✓ This template is currently active.</span>
                  : <span style={{ color: '#64748B' }}> Select the corresponding product in Step 2 to activate.</span>
                }
                <span style={{ color: '#64748B' }}> Set <strong>severity</strong> on questions to surface findings in Step 6 — Parsing &amp; Analysis.</span>
              </div>
            </div>

            {/* Add Section + Add Question */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Add Section */}
              <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.12)' }}>
                    <Layers size={13} style={{ color: '#7C3AED' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Add New Section</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g. Advanced Configuration"
                    className="flex-1 px-3 rounded-lg outline-none transition-all"
                    style={{ fontSize: '12.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '36px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid #BFDBFE')}
                    onBlur={(e) => (e.currentTarget.style.border = '1.5px solid #E2E8F0')}
                  />
                  <button onClick={handleAddSection} disabled={!newSectionName.trim()}
                    className="flex items-center gap-1.5 px-4 rounded-lg font-semibold"
                    style={{ fontSize: '12px', height: '36px', background: '#7C3AED', color: '#FFF', opacity: !newSectionName.trim() ? 0.4 : 1, cursor: !newSectionName.trim() ? 'not-allowed' : 'pointer' }}
                  >
                    <FolderPlus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Add Question */}
              <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <Plus size={13} style={{ color: '#10B981' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Add New Question</span>
                </div>
                {/* Row 1: section + text + add */}
                <div className="flex gap-2 items-center mb-2">
                  <select value={newQuestionSection} onChange={(e) => setNewQuestionSection(e.target.value)}
                    className="px-3 rounded-lg outline-none flex-shrink-0"
                    style={{ fontSize: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '34px', width: '130px' }}
                  >
                    <option value="">Section…</option>
                    {selectedTemplate.sections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" value={newQuestionText} onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Question text…"
                    className="flex-1 px-3 rounded-lg outline-none"
                    style={{ fontSize: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '34px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid #BFDBFE')}
                    onBlur={(e) => (e.currentTarget.style.border = '1.5px solid #E2E8F0')}
                  />
                  <button onClick={handleAddQuestion} disabled={!newQuestionText.trim() || !newQuestionSection}
                    className="flex items-center gap-1.5 px-4 rounded-lg font-semibold flex-shrink-0"
                    style={{ fontSize: '12px', height: '34px', background: '#3B82F6', color: '#FFF', opacity: (!newQuestionText.trim() || !newQuestionSection) ? 0.4 : 1, cursor: (!newQuestionText.trim() || !newQuestionSection) ? 'not-allowed' : 'pointer' }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                {/* Row 2: severity + triggerOn */}
                <div className="flex gap-2 items-center">
                  <select value={newQuestionSeverity} onChange={(e) => setNewQuestionSeverity(e.target.value)}
                    style={{ fontSize: '11.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: newQuestionSeverity ? SEV_BADGE[newQuestionSeverity]?.text : '#94A3B8', height: '30px', borderRadius: '8px', padding: '0 8px', width: '135px', outline: 'none' }}
                  >
                    <option value="">No severity</option>
                    <option value="CRITICAL">⚠ CRITICAL</option>
                    <option value="HIGH">▲ HIGH</option>
                    <option value="MEDIUM">● MEDIUM</option>
                    <option value="LOW">○ LOW</option>
                  </select>
                  {newQuestionSeverity ? (
                    <select value={newQuestionTriggerOn} onChange={(e) => setNewQuestionTriggerOn(e.target.value as 'yes' | 'no')}
                      style={{ fontSize: '11.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#475569', height: '30px', borderRadius: '8px', padding: '0 8px', width: '140px', outline: 'none' }}
                    >
                      <option value="no">Flag when: NO</option>
                      <option value="yes">Flag when: YES</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#CBD5E1' }}>Set severity to track in analysis</span>
                  )}
                </div>
              </div>
            </div>

            {/* Questions by Section */}
            <div className="grid grid-cols-2 gap-4">
              {questionsBySection.map(({ section, questions }) => (
                <div key={section} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                  <div className="flex items-center gap-3 px-5 py-3" style={{ background: '#F8FAFC', borderBottom: '1px solid #EEF0F5' }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${selectedTemplate.color}18`, fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', color: selectedTemplate.color }}>
                      {questions.length}
                    </div>
                    {editingSection === section ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input type="text" defaultValue={section}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSection(section, e.currentTarget.value);
                            else if (e.key === 'Escape') setEditingSection(null);
                          }}
                          className="flex-1 px-2.5 rounded-lg outline-none"
                          style={{ height: '28px', fontSize: '13px', fontWeight: 600, background: '#FFF', border: '1.5px solid #3B82F6' }}
                          autoFocus
                        />
                        <button onClick={(e) => { const input = (e.currentTarget.previousElementSibling as HTMLInputElement); handleRenameSection(section, input.value); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#3B82F6', color: '#FFF' }}
                        ><Save size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1" style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{section}</span>
                        <button onClick={() => setEditingSection(section)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF0F5'; e.currentTarget.style.color = '#3B82F6'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                        ><Edit2 size={12} /></button>
                        <button onClick={() => handleDeleteSection(section)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                        ><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    {questions.length === 0 ? (
                      <div className="py-5 text-center" style={{ fontSize: '12px', color: '#94A3B8' }}>No questions in this section yet.</div>
                    ) : questions.map((question, qi) => (
                      <div key={question.id} className="flex items-start gap-3 p-3 rounded-xl transition-all" style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#BFDBFE')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#EEF0F5')}
                      >
                        <span className="flex-shrink-0 mt-0.5" style={{ fontSize: '10px', fontFamily: 'monospace', color: '#CBD5E1', fontWeight: 600, minWidth: '20px' }}>
                          {String(qi + 1).padStart(2, '0')}
                        </span>
                        {editingQuestion === question.id ? (
                          <div className="flex-1 flex flex-col gap-1.5">
                            {/* Row 1: text + severity + triggerOn + save + cancel */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input type="text"
                                value={editingQuestionData.text ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, text: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateQuestion(question.id, editingQuestionData);
                                  else if (e.key === 'Escape') setEditingQuestion(null);
                                }}
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '30px', fontSize: '12.5px', background: '#FFF', border: '1.5px solid #3B82F6', minWidth: '120px' }}
                                autoFocus
                              />
                              <select
                                value={editingQuestionData.severity ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, severity: (e.target.value || undefined) as QuestionSeverity | undefined }))}
                                style={{ height: '30px', fontSize: '11px', background: '#FFF', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '0 6px', color: editingQuestionData.severity ? SEV_BADGE[editingQuestionData.severity]?.text : '#94A3B8', outline: 'none', flexShrink: 0 }}
                              >
                                <option value="">No sev</option>
                                <option value="CRITICAL">CRITICAL</option>
                                <option value="HIGH">HIGH</option>
                                <option value="MEDIUM">MEDIUM</option>
                                <option value="LOW">LOW</option>
                              </select>
                              {editingQuestionData.severity && (
                                <select
                                  value={editingQuestionData.triggerOn ?? 'no'}
                                  onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, triggerOn: e.target.value as 'yes' | 'no' }))}
                                  style={{ height: '30px', fontSize: '11px', background: '#FFF', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '0 6px', color: '#475569', outline: 'none', flexShrink: 0 }}
                                >
                                  <option value="no">Flag: NO</option>
                                  <option value="yes">Flag: YES</option>
                                </select>
                              )}
                              <button onClick={() => handleUpdateQuestion(question.id, editingQuestionData)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#3B82F6', color: '#FFF' }}
                              ><Save size={13} /></button>
                              <button onClick={() => setEditingQuestion(null)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}
                              ><X size={13} /></button>
                            </div>
                            {/* Row 2: description + remediation */}
                            <div className="flex gap-1.5">
                              <input type="text"
                                value={editingQuestionData.description ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, description: e.target.value || undefined }))}
                                placeholder="Description (optional)"
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '28px', fontSize: '11.5px', background: '#FFF', border: '1.5px solid #E2E8F0', color: '#475569' }}
                              />
                              <input type="text"
                                value={editingQuestionData.remediation ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, remediation: e.target.value || undefined }))}
                                placeholder="Remediation (optional)"
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '28px', fontSize: '11.5px', background: '#FFF', border: '1.5px solid #E2E8F0', color: '#475569' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 flex items-start gap-2 min-w-0">
                              <span className="flex-1" style={{ fontSize: '12.5px', color: '#0F172A', lineHeight: 1.55 }}>{question.text}</span>
                              {question.severity && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded mt-0.5"
                                  style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace', background: SEV_BADGE[question.severity].bg, color: SEV_BADGE[question.severity].text, border: `1px solid ${SEV_BADGE[question.severity].border}` }}
                                >
                                  {question.severity}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => startEditQuestion(question)} className="w-6 h-6 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF0F5'; e.currentTarget.style.color = '#3B82F6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                              ><Edit2 size={11} /></button>
                              <button onClick={() => handleDeleteQuestion(question.id)} className="w-6 h-6 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                              ><Trash2 size={11} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-8 py-3"
        style={{ background: '#FFFFFF', borderTop: '1.5px solid #EEF0F5', boxShadow: '0 -4px 16px rgba(15,41,82,0.06)' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: `${selectedTemplate.color}18` }}>
              {selectedTemplate.icon}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{selectedTemplate.name}</span>
          </div>
          <div style={{ width: '1px', height: '18px', background: '#E2E8F0' }} />
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {templates.reduce((s, t) => s + t.questions.length, 0)} total questions &nbsp;·&nbsp; {templates.length} templates
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {importState === 'error' && importError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA', maxWidth: '260px' }}>
              <AlertCircle size={13} color="#DC2626" className="flex-shrink-0" />
              <span style={{ fontSize: '11px', color: '#DC2626', lineHeight: 1.4 }}>{importError}</span>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportJSON} />
          <input ref={jsonInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportJSON} />

          {savedFlash && (
            <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '5px', padding: '4px 9px' }}>
              <Check size={11} /> Saved
            </span>
          )}

          {importState === 'importing' && (
            <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '4px 9px' }}>
              <RefreshCw size={11} className="animate-spin" /> Reading…
            </span>
          )}
          {importState === 'success' && (
            <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '5px', padding: '4px 9px' }}>
              <Check size={11} /> Imported
            </span>
          )}

          <button onClick={manualSave}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Confirm save — templates are auto-persisted to localStorage on every edit">
            <Save size={12} /> Save
          </button>

          <button onClick={exportJSON}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Download all templates as a JSON file">
            <Download size={12} /> Export JSON
          </button>

          <button onClick={() => jsonInputRef.current?.click()}
            disabled={importState === 'importing'}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: importState === 'importing' ? 'not-allowed' : 'pointer', opacity: importState === 'importing' ? 0.6 : 1 }}
            title="Load templates from a previously-exported JSON">
            <FileJson size={12} /> Import JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color, dot }: { label: string; value: string; color: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: `${color}14`, border: `1px solid ${color}28` }}>
      {dot && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
      <span style={{ fontSize: '10px', color: '#94A3B8', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

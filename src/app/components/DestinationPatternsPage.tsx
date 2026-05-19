import { useEffect, useRef, useState } from 'react';
import { Sparkles, Cloud, Mail, Trash2, Save, Download, Upload, Info } from 'lucide-react';
import { type DestinationPatterns } from './steps/dlpPosture';

interface Props {
  patterns: DestinationPatterns;
  onChange: (next: DestinationPatterns) => void;
}

/* ─── Destination Patterns catalogue ──────────────────────────────
   Operator-managed substring lists that classify each DLP incident's
   `destination` field into one of three CXO-grade buckets used by the
   Information Security Posture Dashboard:
     • GenAI Apps    — ChatGPT, Claude, Gemini, Copilot, etc.
     • SaaS / Cloud  — Drive, Dropbox, Box, SharePoint, OneDrive, S3...
     • Webmail       — Gmail, Outlook.com, Yahoo, Proton, etc.

   Match semantics: case-insensitive substring on the raw destination
   text. First match wins (GenAI → SaaS → Webmail evaluation order).
   Patterns are GLOBAL (catalogue scope, shared across sessions),
   persisted to `hc_destination_patterns` localStorage. */
export function DestinationPatternsPage({ patterns, onChange }: Props) {
  /* Textarea drafts are kept here (parent) so the top Save button can
     flush every bucket at once. Children are pure controlled inputs. */
  const [draft, setDraft] = useState({
    genai:   patterns.genai.join('\n'),
    saas:    patterns.saas.join('\n'),
    webmail: patterns.webmail.join('\n'),
  });
  /* Sync drafts whenever the upstream patterns object changes (Clear
     all / JSON import / external mutation). */
  useEffect(() => {
    setDraft({
      genai:   patterns.genai.join('\n'),
      saas:    patterns.saas.join('\n'),
      webmail: patterns.webmail.join('\n'),
    });
  }, [patterns]);

  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Normalise one textarea string into a deduped, trimmed, lowercased
     pattern array. Server matches with `.toLowerCase().includes()`, so
     keeping the canonical form here removes a class of surprises. */
  const normalise = (raw: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const v = line.trim().toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  /* Counts reflect what would land in state right now (before Save). */
  const counts = {
    genai:   normalise(draft.genai).length,
    saas:    normalise(draft.saas).length,
    webmail: normalise(draft.webmail).length,
  };
  const total = counts.genai + counts.saas + counts.webmail;

  /* Has the operator typed something that hasn't been committed yet?
     If yes, the Save button lights up. */
  const isDirty =
    normalise(draft.genai).join('\n')   !== patterns.genai.join('\n')   ||
    normalise(draft.saas).join('\n')    !== patterns.saas.join('\n')    ||
    normalise(draft.webmail).join('\n') !== patterns.webmail.join('\n');

  const save = () => {
    onChange({
      genai:   normalise(draft.genai),
      saas:    normalise(draft.saas),
      webmail: normalise(draft.webmail),
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1100);
  };

  const clearAll = () => {
    if (!confirm(
      'Clear ALL destination patterns? GenAI / SaaS / Webmail classification will return empty results until you re-add patterns.'
    )) return;
    onChange({ genai: [], saas: [], webmail: [] });
  };

  const exportJSON = () => {
    const payload = {
      _format: 'forcepoint-hc-destination-patterns',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      patterns,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forcepoint-hc-destination-patterns-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const txt = typeof reader.result === 'string' ? reader.result : '';
        const parsed = JSON.parse(txt) as { _format?: string; patterns?: DestinationPatterns };
        if (parsed._format !== 'forcepoint-hc-destination-patterns' || !parsed.patterns) {
          throw new Error('File is not a Forcepoint HC destination-patterns export.');
        }
        onChange({
          genai:   Array.isArray(parsed.patterns.genai)   ? parsed.patterns.genai   : patterns.genai,
          saas:    Array.isArray(parsed.patterns.saas)    ? parsed.patterns.saas    : patterns.saas,
          webmail: Array.isArray(parsed.patterns.webmail) ? parsed.patterns.webmail : patterns.webmail,
        });
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F4F7FB' }}>
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.1)' }}>
            <Sparkles size={18} style={{ color: '#7C3AED' }} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>GenAI Apps &amp; Destination Patterns</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
              Classify DLP incident destinations into CXO buckets. Used by the Information Security Posture Dashboard.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatPill label="Total Patterns" value={String(total)} color="#7C3AED" />
          <StatPill label="GenAI"   value={String(counts.genai)}   color="#A30080" />
          <StatPill label="SaaS"    value={String(counts.saas)}    color="#0284C7" />
          <StatPill label="Webmail" value={String(counts.webmail)} color="#B58800" />

          <div style={{ width: '1px', height: '28px', background: '#E2E8F0', margin: '0 4px' }} />

          {savedFlash && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <Save size={11} /> Saved
            </span>
          )}

          {/* Save — flushes every textarea draft into the catalogue at
              once. Lights up when there's an uncommitted edit. */}
          <button onClick={save}
            disabled={!isDirty}
            title={isDirty ? 'Commit all bucket edits (Ctrl+S)' : 'No pending changes'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{
              fontSize: '12px',
              background: isDirty ? 'linear-gradient(135deg,#7C3AED,#5B21B6)' : '#F1F5F9',
              color: isDirty ? '#fff' : '#94A3B8',
              border: '1.5px solid transparent',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              boxShadow: isDirty ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
            }}>
            <Save size={12} /> Save
          </button>

          <button onClick={exportJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', background: '#F8FAFC', color: '#475569', border: '1.5px solid #E2E8F0' }}>
            <Download size={12} /> Export JSON
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', background: '#F8FAFC', color: '#475569', border: '1.5px solid #E2E8F0' }}>
            <Upload size={12} /> Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.currentTarget.value = ''; }} />

          <button onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', background: '#FFFFFF', color: '#DC2626', border: '1.5px solid rgba(220,38,38,0.3)' }}>
            <Trash2 size={12} /> Clear all
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Explainer banner */}
        <div className="rounded-xl flex items-start gap-3 mb-6 px-4 py-3"
          style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.18)' }}>
          <Info size={16} style={{ color: '#7C3AED', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '12.5px', color: '#0F172A', lineHeight: 1.55 }}>
            <strong>How matching works:</strong> one pattern per line, case-insensitive substring match against
            the raw DLP <code>destination</code> field. First matching bucket wins (GenAI → SaaS → Webmail).
            For example, <code>chatgpt</code> matches <code>https://chat.openai.com/c/abc</code> as well as
            <code>app.chatgpt.com</code>. Click <strong>Save</strong> (or Ctrl+S) to commit your edits — they flow
            into every DLP REST API posture fetch on Step 3 and decide which destinations get rolled up into the
            <strong> Top GenAI Applications</strong>, <strong>Top SaaS / Cloud Storage</strong>, and
            <strong> Top Webmail</strong> blocks of the report.
          </div>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <BucketEditor
            title="GenAI Applications"
            subtitle="ChatGPT, Claude, Gemini, Copilot, Perplexity, Midjourney, character.ai, etc."
            icon={<Sparkles size={14} style={{ color: '#A30080' }} />}
            accent="#A30080"
            value={draft.genai}
            onChange={(v) => setDraft((d) => ({ ...d, genai: v }))}
            onSave={save}
          />
          <BucketEditor
            title="SaaS / Cloud Storage"
            subtitle="Google Drive, Dropbox, Box, SharePoint, OneDrive, S3, Azure Blob, etc."
            icon={<Cloud size={14} style={{ color: '#0284C7' }} />}
            accent="#0284C7"
            value={draft.saas}
            onChange={(v) => setDraft((d) => ({ ...d, saas: v }))}
            onSave={save}
          />
          <BucketEditor
            title="Personal Webmail"
            subtitle="Gmail, Outlook.com, Yahoo, ProtonMail, Tutanota, Zoho, etc."
            icon={<Mail size={14} style={{ color: '#B58800' }} />}
            accent="#B58800"
            value={draft.webmail}
            onChange={(v) => setDraft((d) => ({ ...d, webmail: v }))}
            onSave={save}
          />
        </div>

        <div className="mt-6 px-4 py-3 rounded-lg"
          style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: '11.5px', color: '#92400E', lineHeight: 1.55 }}>
            <strong>Tip:</strong> patterns are case-insensitive and matched as substrings, so short tokens
            ({'<'} 4 chars) can cause unintended matches across unrelated domains. Stick to distinctive substrings —
            <code> chatgpt</code> beats <code>gpt</code>, and <code>drive.google</code> beats <code>drive</code>.
          </div>
        </div>
      </div>
    </div>
  );
}

function BucketEditor({ title, subtitle, icon, accent, value, onChange, onSave }: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: '#FFFFFF', border: '1.5px solid #EEF0F5', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>
      <div className="px-4 py-3 flex items-center gap-2"
        style={{ background: `${accent}0A`, borderBottom: `1px solid ${accent}22` }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#fff', border: `1px solid ${accent}33` }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: accent }}>{title}</div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: 1, lineHeight: 1.4 }}>{subtitle}</div>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            onSave();
          }
        }}
        spellCheck={false}
        placeholder={'one pattern per line\nexample: chatgpt\nexample: claude.ai'}
        style={{
          width: '100%',
          minHeight: '320px',
          padding: '12px 14px',
          fontSize: '11.5px',
          fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
          color: '#0F172A',
          background: '#FAFCFF',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          lineHeight: 1.55,
        }}
      />
      <div className="px-4 py-2 flex items-center justify-between"
        style={{ background: '#F8FAFC', borderTop: '1px solid #EEF0F5', fontSize: '10px', color: '#94A3B8' }}>
        <span>{value.split(/\r?\n/).filter((l) => l.trim()).length} patterns · one per line · Ctrl+S to save</span>
        <span style={{ fontFamily: 'monospace' }}>case-insensitive substring</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
      style={{ background: `${color}0E`, border: `1px solid ${color}33` }}>
      <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</span>
      <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

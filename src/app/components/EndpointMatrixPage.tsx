import { useEffect, useRef, useState } from 'react';
import {
  Upload, Trash2, Plus, Check, X, AlertCircle, MonitorSmartphone, FileCode,
  ExternalLink, Info, Download, Save, FileJson,
} from 'lucide-react';
import {
  type EndpointSupportMatrix,
  type EndpointMatrixOSRow,
  type EndpointMatrixBrowserRow,
  type EndpointMatrixCriticalNote,
  type EndpointCoverage,
  type FdcMatrix,
  type FdcOfficeVersionRow,
  EMPTY_ENDPOINT_MATRIX,
  normalizeFdcMatrix,
  COVERAGE_LABELS,
  COVERAGE_FULL_NAMES,
  COVERAGE_COLORS,
  isMatrixEmpty,
  isFdcMatrixEmpty,
  newMatrixId,
} from '../constants/endpointSupportMatrix';
import { parseEndpointMatrixHtml, type MatrixParseResult } from '../utils/endpointMatrixHtmlImporter';

interface Props {
  matrix: EndpointSupportMatrix;
  onChange: (m: EndpointSupportMatrix) => void;
}

type TabKey = 'windows' | 'macos' | 'vdi' | 'browsers' | 'notes';

const TABS: { key: TabKey; label: string; }[] = [
  { key: 'windows',  label: 'Windows' },
  { key: 'macos',    label: 'macOS' },
  { key: 'vdi',      label: 'VDI' },
  { key: 'browsers', label: 'Browsers' },
  { key: 'notes',    label: 'Critical Notes' },
];

type AgentKey = 'f1e' | 'fdc';
type FdcTabKey = 'windows' | 'macos' | 'vdi' | 'office' | 'notes';

const FDC_TABS: { key: FdcTabKey; label: string }[] = [
  { key: 'windows', label: 'Windows' },
  { key: 'macos',   label: 'macOS' },
  { key: 'vdi',     label: 'VDI' },
  { key: 'office',  label: 'Office Versions' },
  { key: 'notes',   label: 'Critical Notes' },
];

export function EndpointMatrixPage({ matrix, onChange }: Props) {
  const [agent, setAgent] = useState<AgentKey>('f1e');
  const [activeTab, setActiveTab] = useState<TabKey>('windows');
  const [fdcTab, setFdcTab] = useState<FdcTabKey>('windows');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<MatrixParseResult | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  /* "Saved" flash banner — fires for ~1.5s after edits or explicit Save. The
     matrix state is auto-persisted by useLocalStorage upstream, so this is a
     visual confirmation rather than a real persistence boundary. */
  const [savedFlash, setSavedFlash] = useState(false);
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportInfo, setJsonImportInfo] = useState<string | null>(null);

  /* Re-fire the saved flash whenever the matrix reference changes (debounced
     by the timeout). First-mount run is skipped via the ref guard so we don't
     show "Saved" on initial page open. */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, [matrix]);

  const f1eEmpty = isMatrixEmpty(matrix);
  const fdcEmpty = isFdcMatrixEmpty(matrix);
  /* The page-level empty CTA only shows when BOTH agents are empty — once
     either has data the agent switch + tables take over. */
  const empty = f1eEmpty && fdcEmpty;
  const fdc: FdcMatrix = normalizeFdcMatrix(matrix.fdc);

  function triggerImport() {
    setImportError(null);
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportError(null);
    try {
      const text = await file.text();
      const result = parseEndpointMatrixHtml(text);
      setImportResult(result);
    } catch (err) {
      setImportError(`Failed to read file: ${(err as Error).message}`);
      setImportResult(null);
    }
  }

  function confirmImport() {
    if (!importResult) return;
    onChange(importResult.matrix);
    setImportResult(null);
    setImportFileName(null);
  }

  function cancelImport() {
    setImportResult(null);
    setImportFileName(null);
    setImportError(null);
  }

  function clearAll() {
    if (!confirmClear) { setConfirmClear(true); return; }
    onChange(EMPTY_ENDPOINT_MATRIX);
    setConfirmClear(false);
  }

  /* Top-bar Add Row — dispatches to whichever collection the active tab
     represents so the operator can add a new row without scrolling to the
     per-tab footer button. */
  function setFdc(next: FdcMatrix) {
    onChange({ ...matrix, fdc: next });
  }

  function addRowForActiveTab() {
    if (agent === 'fdc') {
      const osRow = (pfx: string) => ({ id: newMatrixId(pfx), platform: '', supportedFrom: '', status: 'current' as const });
      if (fdcTab === 'windows')     setFdc({ ...fdc, windows: [...fdc.windows, osRow('fwin')] });
      else if (fdcTab === 'macos')  setFdc({ ...fdc, macos: [...fdc.macos, osRow('fmac')] });
      else if (fdcTab === 'vdi')    setFdc({ ...fdc, vdi: [...fdc.vdi, osRow('fvdi')] });
      else if (fdcTab === 'office') setFdc({ ...fdc, officeVersions: [...fdc.officeVersions, { id: newMatrixId('fofc'), product: '', versions: '', minAgent: '', status: 'current' }] });
      else if (fdcTab === 'notes')  setFdc({ ...fdc, criticalNotes: [...fdc.criticalNotes, { id: newMatrixId('fcn'), severity: 'medium', title: '', body: '' }] });
      return;
    }
    if (activeTab === 'windows') {
      onChange({ ...matrix, windows: [...matrix.windows, { id: newMatrixId('win'), platform: '', supportedFrom: '', status: 'current' }] });
    } else if (activeTab === 'macos') {
      onChange({ ...matrix, macos: [...matrix.macos, { id: newMatrixId('mac'), platform: '', supportedFrom: '', status: 'current' }] });
    } else if (activeTab === 'vdi') {
      onChange({ ...matrix, vdi: [...matrix.vdi, { id: newMatrixId('vdi'), platform: '', supportedFrom: '', status: 'current' }] });
    } else if (activeTab === 'browsers') {
      onChange({ ...matrix, browsers: [...matrix.browsers, { id: newMatrixId('br'), browser: '', platform: 'Windows', versions: '', minAgent: '' }] });
    } else if (activeTab === 'notes') {
      onChange({ ...matrix, criticalNotes: [...matrix.criticalNotes, { id: newMatrixId('cn'), severity: 'medium', title: '', body: '' }] });
    }
  }

  const ADD_LABEL: Record<TabKey, string> = {
    windows:  'Add Windows row',
    macos:    'Add macOS row',
    vdi:      'Add VDI row',
    browsers: 'Add browser',
    notes:    'Add note',
  };

  function manualSave() {
    /* No-op against state (already persisted by useLocalStorage upstream) —
       this exists as a visible confirmation gesture so the operator gets
       feedback after a batch of edits. */
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function exportJSON() {
    const payload = {
      _format: 'forcepoint-hc-endpoint-matrix',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      matrix,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `endpoint-support-matrix-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function triggerJSONImport() {
    setJsonImportError(null);
    setJsonImportInfo(null);
    jsonInputRef.current?.click();
  }

  async function handleJSONFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setJsonImportError(null);
    setJsonImportInfo(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      /* Accept either a bare matrix or our wrapped export envelope. */
      const candidate: unknown = parsed && typeof parsed === 'object' && 'matrix' in parsed
        ? (parsed as { matrix: unknown }).matrix
        : parsed;
      if (!candidate || typeof candidate !== 'object') {
        throw new Error('JSON payload is not an object.');
      }
      const c = candidate as Partial<EndpointSupportMatrix>;
      /* Shape-check: the five row collections must be arrays. Anything else
         is rejected so we don't blow up the consumer. */
      const arrays: (keyof EndpointSupportMatrix)[] = ['windows', 'macos', 'vdi', 'browsers', 'criticalNotes', 'windowsNotes', 'macosNotes'];
      for (const k of arrays) {
        if (c[k] !== undefined && !Array.isArray(c[k])) {
          throw new Error(`Field "${k}" must be an array.`);
        }
      }
      const normalized: EndpointSupportMatrix = {
        lastUpdated:   typeof c.lastUpdated === 'string' ? c.lastUpdated : '',
        source:        typeof c.source === 'string' ? c.source : '',
        windows:       Array.isArray(c.windows)       ? (c.windows as EndpointMatrixOSRow[])       : [],
        windowsNotes:  Array.isArray(c.windowsNotes)  ? (c.windowsNotes as string[])               : [],
        macos:         Array.isArray(c.macos)         ? (c.macos as EndpointMatrixOSRow[])         : [],
        macosNotes:    Array.isArray(c.macosNotes)    ? (c.macosNotes as string[])                 : [],
        vdi:           Array.isArray(c.vdi)           ? (c.vdi as EndpointMatrixOSRow[])           : [],
        browsers:      Array.isArray(c.browsers)      ? (c.browsers as EndpointMatrixBrowserRow[]) : [],
        criticalNotes: Array.isArray(c.criticalNotes) ? (c.criticalNotes as EndpointMatrixCriticalNote[]) : [],
        fdc: normalizeFdcMatrix(c.fdc),
      };
      /* Re-stamp ids on any rows missing them so downstream React keys stay
         stable after import. */
      const ensureId = (prefix: string) => (r: { id?: string }) => ({ ...r, id: r.id || newMatrixId(prefix) });
      normalized.windows       = normalized.windows.map(ensureId('win')) as EndpointMatrixOSRow[];
      normalized.macos         = normalized.macos.map(ensureId('mac')) as EndpointMatrixOSRow[];
      normalized.vdi           = normalized.vdi.map(ensureId('vdi')) as EndpointMatrixOSRow[];
      normalized.browsers      = normalized.browsers.map(ensureId('br')) as EndpointMatrixBrowserRow[];
      normalized.criticalNotes = normalized.criticalNotes.map(ensureId('cn')) as EndpointMatrixCriticalNote[];
      if (normalized.fdc) {
        normalized.fdc.windows        = normalized.fdc.windows.map(ensureId('fwin')) as EndpointMatrixOSRow[];
        normalized.fdc.macos          = normalized.fdc.macos.map(ensureId('fmac')) as EndpointMatrixOSRow[];
        normalized.fdc.vdi            = normalized.fdc.vdi.map(ensureId('fvdi')) as EndpointMatrixOSRow[];
        normalized.fdc.officeVersions = normalized.fdc.officeVersions.map(ensureId('fofc')) as FdcOfficeVersionRow[];
        normalized.fdc.criticalNotes  = normalized.fdc.criticalNotes.map(ensureId('fcn')) as EndpointMatrixCriticalNote[];
      }

      onChange(normalized);
      const total = normalized.windows.length + normalized.macos.length + normalized.vdi.length + normalized.browsers.length + normalized.criticalNotes.length;
      setJsonImportInfo(`Loaded ${total} row${total === 1 ? '' : 's'} from ${file.name}.`);
    } catch (err) {
      setJsonImportError(`Could not import JSON: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F4F7FB' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#0EA5E9,#0284C7)' }}>
            <MonitorSmartphone size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952', letterSpacing: '-0.01em' }}>
              OS / Browser Support Matrix
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              F1E (DLP / Web) and DSPM + FDC (Data Classification) agent compatibility catalogues used by the HC wizard &amp; report.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {matrix.lastUpdated && (
            <span style={{ fontSize: '11px', color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '4px 9px', fontFamily: 'monospace' }}>
              Last updated: {matrix.lastUpdated}
            </span>
          )}
          {/* Saved flash — appears for ~1.5s after edits or explicit Save. */}
          {savedFlash && (
            <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '5px', padding: '4px 9px' }}>
              <Check size={11} /> Saved
            </span>
          )}
          <input ref={fileRef} type="file" accept=".html,.htm,text/html" onChange={handleFile} className="hidden" />
          <input ref={jsonInputRef} type="file" accept=".json,application/json" onChange={handleJSONFile} className="hidden" />

          <button onClick={addRowForActiveTab}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#0EA5E9', color: '#fff', border: '1px solid #0284C7', cursor: 'pointer' }}
            title={agent === 'fdc' ? `Add ${FDC_TABS.find((t) => t.key === fdcTab)?.label ?? 'FDC'} row` : ADD_LABEL[activeTab]}
          >
            <Plus size={13} /> Add Row
          </button>

          {!empty && (
            <button onClick={manualSave}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
              title="Confirm save — matrix state is auto-persisted to localStorage on every edit"
            >
              <Save size={12} /> Save
            </button>
          )}

          {!empty && (
            <button onClick={exportJSON}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
              title="Download the current matrix as JSON"
            >
              <Download size={12} /> Export JSON
            </button>
          )}

          <button onClick={triggerJSONImport}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Load a previously-exported matrix JSON"
          >
            <FileJson size={12} /> Import JSON
          </button>

          <button onClick={triggerImport}
            className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
            title="Import from the Forcepoint F1E support-matrix HTML page">
            <Upload size={12} /> Import HTML
          </button>

          {!empty && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px',
                background: confirmClear ? '#FEF2F2' : '#FFFFFF',
                color: confirmClear ? '#A30080' : '#475569',
                border: `1px solid ${confirmClear ? '#FECACA' : '#CBD5E1'}`,
                cursor: 'pointer',
              }}>
              <Trash2 size={12} /> {confirmClear ? 'Click again to clear' : 'Clear all'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {importResult && (
          <ImportPreview
            result={importResult}
            fileName={importFileName ?? '(uploaded file)'}
            onConfirm={confirmImport}
            onCancel={cancelImport}
          />
        )}

        {importError && !importResult && (
          <div className="flex items-start gap-2.5 rounded-xl mb-5 px-4 py-3"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertCircle size={16} style={{ color: '#A30080', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12.5px', color: '#7F1D1D' }}>{importError}</div>
          </div>
        )}

        {jsonImportError && (
          <div className="flex items-start gap-2.5 rounded-xl mb-5 px-4 py-3"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertCircle size={16} style={{ color: '#A30080', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12.5px', color: '#7F1D1D' }}>{jsonImportError}</div>
            <button onClick={() => setJsonImportError(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7F1D1D', marginLeft: 'auto' }}>
              <X size={13} />
            </button>
          </div>
        )}

        {jsonImportInfo && (
          <div className="flex items-start gap-2.5 rounded-xl mb-5 px-4 py-3"
            style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <Check size={16} style={{ color: '#16A34A', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12.5px', color: '#15803D' }}>{jsonImportInfo}</div>
            <button onClick={() => setJsonImportInfo(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#15803D', marginLeft: 'auto' }}>
              <X size={13} />
            </button>
          </div>
        )}

        {!importResult && (
          <>
            {/* Agent selector — two distinct Forcepoint endpoint agents:
                F1E (DLP / Web) and DSPM + FDC (Data Classification).
                Always shown so a fresh, empty catalogue can still reach the
                FDC agent to add rows. */}
            <div className="flex items-center gap-2 mb-4">
              {([
                { key: 'f1e' as AgentKey, label: 'F1E Agent',        sub: 'DLP / Web endpoint' },
                { key: 'fdc' as AgentKey, label: 'DSPM + FDC Agent', sub: 'Data Classification endpoint' },
              ]).map((a) => {
                const active = agent === a.key;
                const count = a.key === 'f1e'
                  ? matrix.windows.length + matrix.macos.length + matrix.vdi.length + matrix.browsers.length
                  : fdc.windows.length + fdc.macos.length + fdc.vdi.length + fdc.officeVersions.length;
                return (
                  <button key={a.key} onClick={() => setAgent(a.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                      padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                      background: active ? '#0EA5E9' : '#FFFFFF',
                      color: active ? '#fff' : '#0F2952',
                      border: `1.5px solid ${active ? '#0284C7' : '#E2E8F0'}`,
                      transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>
                      {a.label}
                      {count > 0 && (
                        <span style={{ marginLeft: 7, fontFamily: 'monospace', fontSize: '10px', background: active ? 'rgba(255,255,255,0.22)' : '#E2E8F0', color: active ? '#fff' : '#475569', padding: '1px 6px', borderRadius: 8 }}>
                          {count}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '10px', color: active ? 'rgba(255,255,255,0.8)' : '#94A3B8' }}>{a.sub}</span>
                  </button>
                );
              })}
            </div>

            {agent === 'f1e' ? (
              f1eEmpty ? (
                <EmptyState onImport={triggerImport} />
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                  <div className="flex items-center gap-1 px-2 pt-2 pb-0 border-b" style={{ borderColor: '#EEF0F5' }}>
                    {TABS.map((t) => {
                      const count = tabCount(matrix, t.key);
                      const active = activeTab === t.key;
                      return (
                        <button key={t.key} onClick={() => setActiveTab(t.key)}
                          style={{
                            fontSize: '12px',
                            padding: '8px 14px',
                            borderRadius: '8px 8px 0 0',
                            background: active ? '#F0F9FF' : 'transparent',
                            color: active ? '#0284C7' : '#64748B',
                            borderBottom: active ? '2px solid #0EA5E9' : '2px solid transparent',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {t.label}
                          {count > 0 && (
                            <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '10.5px', background: active ? '#0EA5E9' : '#E2E8F0', color: active ? '#fff' : '#475569', padding: '1px 6px', borderRadius: '8px' }}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-5">
                    {activeTab === 'windows'  && <OSTab kind="windows"  rows={matrix.windows} notes={matrix.windowsNotes} matrix={matrix} onChange={onChange} />}
                    {activeTab === 'macos'    && <OSTab kind="macos"    rows={matrix.macos}   notes={matrix.macosNotes}   matrix={matrix} onChange={onChange} />}
                    {activeTab === 'vdi'      && <OSTab kind="vdi"      rows={matrix.vdi}     notes={[]}                  matrix={matrix} onChange={onChange} />}
                    {activeTab === 'browsers' && <BrowsersTab rows={matrix.browsers} matrix={matrix} onChange={onChange} />}
                    {activeTab === 'notes'    && <NotesTab notes={matrix.criticalNotes} matrix={matrix} onChange={onChange} />}
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                <div className="flex items-center gap-1 px-2 pt-2 pb-0 border-b" style={{ borderColor: '#EEF0F5' }}>
                  {FDC_TABS.map((t) => {
                    const count = fdcTabCount(fdc, t.key);
                    const active = fdcTab === t.key;
                    return (
                      <button key={t.key} onClick={() => setFdcTab(t.key)}
                        style={{
                          fontSize: '12px', padding: '8px 14px', borderRadius: '8px 8px 0 0',
                          background: active ? '#F0F9FF' : 'transparent',
                          color: active ? '#0284C7' : '#64748B',
                          borderBottom: active ? '2px solid #0EA5E9' : '2px solid transparent',
                          fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        {t.label}
                        {count > 0 && (
                          <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '10.5px', background: active ? '#0EA5E9' : '#E2E8F0', color: active ? '#fff' : '#475569', padding: '1px 6px', borderRadius: '8px' }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="p-5">
                  {fdcTab === 'windows' && <FdcOSTab kind="windows" fdc={fdc} onChange={setFdc} />}
                  {fdcTab === 'macos'   && <FdcOSTab kind="macos"   fdc={fdc} onChange={setFdc} />}
                  {fdcTab === 'vdi'     && <FdcOSTab kind="vdi"      fdc={fdc} onChange={setFdc} />}
                  {fdcTab === 'office'  && <OfficeVersionsTab fdc={fdc} onChange={setFdc} />}
                  {fdcTab === 'notes'   && <FdcNotesTab fdc={fdc} onChange={setFdc} />}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function tabCount(m: EndpointSupportMatrix, key: TabKey): number {
  if (key === 'windows')  return m.windows.length;
  if (key === 'macos')    return m.macos.length;
  if (key === 'vdi')      return m.vdi.length;
  if (key === 'browsers') return m.browsers.length;
  return m.criticalNotes.length;
}

/* ═══════════════════════════════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════════════════════════════ */
function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="rounded-xl flex flex-col items-center justify-center text-center px-8 py-16"
      style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1' }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'linear-gradient(135deg,#E0F2FE,#BAE6FD)' }}>
        <FileCode size={28} color="#0284C7" />
      </div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952', marginBottom: '6px' }}>
        No support matrix imported yet
      </div>
      <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '520px', lineHeight: 1.6 }}>
        Import the official Forcepoint F1E Endpoint Support Matrix HTML page to populate
        Windows / macOS / VDI / browser compatibility data. The wizard and HC report will
        reference this catalogue once it's populated — until then the Endpoint Compatibility
        section of the report stays empty.
      </div>
      <button onClick={onImport}
        className="flex items-center gap-2 mt-6 rounded-lg font-semibold transition-all"
        style={{ fontSize: '13px', padding: '10px 18px', background: '#0EA5E9', color: '#fff', border: '1px solid #0284C7', cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,165,233,0.25)' }}>
        <Upload size={14} /> Import HTML
      </button>
      <a
        href="https://support.forcepoint.com/s/article/Endpoint-Solutions-Certified-Product-Matrix"
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 mt-3"
        style={{ fontSize: '11.5px', color: '#0284C7', textDecoration: 'none' }}>
        <ExternalLink size={11} /> Source: Endpoint Solutions Certified Product Matrix
      </a>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   IMPORT PREVIEW
═══════════════════════════════════════════════════════════════════ */
function ImportPreview({
  result, fileName, onConfirm, onCancel,
}: {
  result: MatrixParseResult;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { stats, warnings, matrix } = result;
  return (
    <div className="rounded-xl mb-5"
      style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
      <div className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid #BAE6FD' }}>
        <div className="flex items-center gap-3">
          <FileCode size={18} color="#0284C7" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F2952' }}>
              Preview parsed matrix — {fileName}
            </div>
            <div style={{ fontSize: '11px', color: '#475569' }}>
              {stats.tablesSeen} table{stats.tablesSeen === 1 ? '' : 's'} scanned · {matrix.lastUpdated ? `last updated ${matrix.lastUpdated}` : 'no "last updated" date detected'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel}
            style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'pointer' }}>
            <X size={11} style={{ display: 'inline', marginRight: 4 }} /> Cancel
          </button>
          <button onClick={onConfirm}
            style={{ fontSize: '12px', padding: '6px 13px', background: '#0EA5E9', color: '#fff', border: '1px solid #0284C7', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            <Check size={11} style={{ display: 'inline', marginRight: 4 }} /> Replace catalogue
          </button>
        </div>
      </div>
      <div className="px-5 py-4 grid grid-cols-5 gap-2.5">
        <StatTile label="Windows" value={stats.windowsRows} />
        <StatTile label="macOS"    value={stats.macosRows} />
        <StatTile label="VDI"      value={stats.vdiRows} />
        <StatTile label="Browsers" value={stats.browserRows} />
        <StatTile label="Notes"    value={stats.criticalNotes} />
      </div>
      {warnings.length > 0 && (
        <div className="px-5 pb-4 flex flex-col gap-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2"
              style={{ fontSize: '11.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '6px 10px' }}>
              <Info size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #BAE6FD', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284C7', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   OS / VDI TAB
═══════════════════════════════════════════════════════════════════ */
function OSTab({
  kind, rows, notes, matrix, onChange,
}: {
  kind: 'windows' | 'macos' | 'vdi';
  rows: EndpointMatrixOSRow[];
  notes: string[];
  matrix: EndpointSupportMatrix;
  onChange: (m: EndpointSupportMatrix) => void;
}) {
  function setRows(next: EndpointMatrixOSRow[]) {
    if (kind === 'windows') onChange({ ...matrix, windows: next });
    else if (kind === 'macos') onChange({ ...matrix, macos: next });
    else onChange({ ...matrix, vdi: next });
  }
  function setNotes(next: string[]) {
    if (kind === 'windows') onChange({ ...matrix, windowsNotes: next });
    else if (kind === 'macos') onChange({ ...matrix, macosNotes: next });
  }
  function patch(id: string, p: Partial<EndpointMatrixOSRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function del(id: string) { setRows(rows.filter((r) => r.id !== id)); }

  return (
    <>
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '24%' }} />{/* Platform */}
          <col style={{ width: '22%' }} />{/* Min Agent */}
          <col style={{ width: '22%' }} />{/* Note */}
          <col style={{ width: '20%' }} />{/* Coverage */}
          <col style={{ width: '90px' }} />{/* Status */}
          <col style={{ width: '36px' }} />{/* Delete */}
        </colgroup>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <Th>Platform</Th>
            <Th>Min Agent / Supported From</Th>
            <Th>Note</Th>
            <Th>Coverage</Th>
            <Th>Status</Th>
            <Th>{''}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id} style={{ borderTop: '1px solid #EEF0F5', background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFE' }}>
              <Td valign="top">
                <CellInput value={r.platform} onChange={(v) => patch(r.id, { platform: v })} mono={false} />
              </Td>
              <Td valign="top">
                <CellInput value={r.supportedFrom} onChange={(v) => patch(r.id, { supportedFrom: v })} mono />
              </Td>
              <Td valign="top">
                <CellInput value={r.note ?? ''} onChange={(v) => patch(r.id, { note: v || undefined })} mono={false} placeholder="—" />
              </Td>
              <Td valign="top">
                <CoverageChips value={r.coverage ?? []} onChange={(next) => patch(r.id, { coverage: next.length > 0 ? next : undefined })} />
              </Td>
              <Td valign="top">
                <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value as 'current' | 'eos' })}
                  style={{ width: '100%', fontSize: '11px', padding: '5px 6px', borderRadius: '5px', border: '1px solid #CBD5E1', background: r.status === 'eos' ? '#FEF2F2' : '#F0FDF4', color: r.status === 'eos' ? '#A30080' : '#16A34A', fontWeight: 700, letterSpacing: '0.02em' }}>
                  <option value="current">CURRENT</option>
                  <option value="eos">EOS</option>
                </select>
              </Td>
              <Td valign="top">
                <button onClick={() => del(r.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '6px 2px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
                  title="Remove">
                  <Trash2 size={13} />
                </button>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><Td colSpan={6} center>
              <div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0' }}>No rows. Add one from the toolbar or import the HTML.</div>
            </Td></tr>
          )}
        </tbody>
      </table>

      {(kind === 'windows' || kind === 'macos') && (
        <div className="mt-6">
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            Platform notes
          </div>
          <div className="flex flex-col gap-2">
            {notes.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={n}
                  onChange={(e) => { const c = [...notes]; c[i] = e.target.value; setNotes(c); }}
                  style={{ flex: 1, fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', color: '#1D252C' }}
                />
                <button onClick={() => setNotes(notes.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button onClick={() => setNotes([...notes, ''])}
              className="flex items-center gap-1.5 rounded-lg self-start"
              style={{ fontSize: '11.5px', padding: '5px 11px', background: 'transparent', color: '#64748B', border: '1px dashed #CBD5E1', cursor: 'pointer' }}>
              <Plus size={11} /> Add note
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BROWSERS TAB
═══════════════════════════════════════════════════════════════════ */
function BrowsersTab({
  rows, matrix, onChange,
}: { rows: EndpointMatrixBrowserRow[]; matrix: EndpointSupportMatrix; onChange: (m: EndpointSupportMatrix) => void }) {
  function setRows(next: EndpointMatrixBrowserRow[]) { onChange({ ...matrix, browsers: next }); }
  function patch(id: string, p: Partial<EndpointMatrixBrowserRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function del(id: string) { setRows(rows.filter((r) => r.id !== id)); }

  return (
    <>
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '20%' }} />{/* Browser */}
          <col style={{ width: '100px' }} />{/* Platform */}
          <col style={{ width: '14%' }} />{/* Versions */}
          <col style={{ width: '14%' }} />{/* Min Agent */}
          <col style={{ width: '20%' }} />{/* Notes */}
          <col style={{ width: '20%' }} />{/* Coverage */}
          <col style={{ width: '36px' }} />{/* Delete */}
        </colgroup>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <Th>Browser</Th>
            <Th>Platform</Th>
            <Th>Versions</Th>
            <Th>Min Agent</Th>
            <Th>Notes</Th>
            <Th>Coverage</Th>
            <Th>{''}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id} style={{ borderTop: '1px solid #EEF0F5', background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFE' }}>
              <Td valign="top"><CellInput value={r.browser} onChange={(v) => patch(r.id, { browser: v })} mono={false} /></Td>
              <Td valign="top">
                <select value={r.platform} onChange={(e) => patch(r.id, { platform: e.target.value as 'Windows' | 'macOS' })}
                  style={{ width: '100%', fontSize: '11px', padding: '5px 6px', borderRadius: '5px', border: '1px solid #CBD5E1', background: '#fff', fontWeight: 600 }}>
                  <option>Windows</option>
                  <option>macOS</option>
                </select>
              </Td>
              <Td valign="top"><CellInput value={r.versions} onChange={(v) => patch(r.id, { versions: v })} mono /></Td>
              <Td valign="top"><CellInput value={r.minAgent} onChange={(v) => patch(r.id, { minAgent: v })} mono /></Td>
              <Td valign="top"><CellInput value={r.notes ?? ''} onChange={(v) => patch(r.id, { notes: v || undefined })} mono={false} placeholder="—" /></Td>
              <Td valign="top">
                <CoverageChips value={r.coverage ?? []} onChange={(next) => patch(r.id, { coverage: next.length > 0 ? next : undefined })} />
              </Td>
              <Td valign="top">
                <button onClick={() => del(r.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '6px 2px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#A30080'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
                  title="Remove">
                  <Trash2 size={13} />
                </button>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><Td colSpan={7} center>
              <div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0' }}>No browsers. Add one from the toolbar or import the HTML.</div>
            </Td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CRITICAL NOTES TAB
═══════════════════════════════════════════════════════════════════ */
const SEV_CFG: Record<EndpointMatrixCriticalNote['severity'], { label: string; bg: string; color: string; border: string }> = {
  critical: { label: 'Critical', bg: '#FDF2F8', color: '#A30080', border: '#FBCFE8' },
  high:     { label: 'High',     bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  medium:   { label: 'Medium',   bg: '#FFFBEB', color: '#B58800', border: '#FDE68A' },
};

function NotesTab({
  notes, matrix, onChange,
}: { notes: EndpointMatrixCriticalNote[]; matrix: EndpointSupportMatrix; onChange: (m: EndpointSupportMatrix) => void }) {
  function setNotes(next: EndpointMatrixCriticalNote[]) { onChange({ ...matrix, criticalNotes: next }); }
  function patch(id: string, p: Partial<EndpointMatrixCriticalNote>) {
    setNotes(notes.map((n) => (n.id === id ? { ...n, ...p } : n)));
  }
  function del(id: string) { setNotes(notes.filter((n) => n.id !== id)); }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => {
        const cfg = SEV_CFG[n.severity];
        return (
          <div key={n.id}
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderLeft: `3px solid ${cfg.color}`, borderRadius: '8px', padding: '12px 14px' }}>
            <div className="flex items-center gap-2 mb-2">
              <select value={n.severity} onChange={(e) => patch(n.id, { severity: e.target.value as EndpointMatrixCriticalNote['severity'] })}
                style={{ fontSize: '10.5px', padding: '3px 6px', borderRadius: '4px', border: `1px solid ${cfg.border}`, background: '#fff', color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
              <input value={n.title} onChange={(e) => patch(n.id, { title: e.target.value })}
                placeholder="Note title"
                style={{ flex: 1, fontSize: '12.5px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: '1px solid transparent', background: 'transparent', color: '#1D252C' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = cfg.border; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <button onClick={() => del(n.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
            <textarea value={n.body} onChange={(e) => patch(n.id, { body: e.target.value })}
              placeholder="Note body"
              rows={2}
              style={{ width: '100%', fontSize: '12px', padding: '6px 8px', borderRadius: '5px', border: '1px solid transparent', background: 'transparent', color: '#475569', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = cfg.border; e.currentTarget.style.background = '#fff'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
          </div>
        );
      })}
      {notes.length === 0 && (
        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0', textAlign: 'center' }}>No critical notes. Use "Add note" in the toolbar or import the HTML.</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DSPM + FDC AGENT TABS — structured like F1E (OS tabs) plus an Office
   Versions tab (the FDC analog of the F1E Browsers tab) and Critical Notes.
═══════════════════════════════════════════════════════════════════ */
function fdcTabCount(f: FdcMatrix, key: FdcTabKey): number {
  if (key === 'windows') return f.windows.length;
  if (key === 'macos')   return f.macos.length;
  if (key === 'vdi')     return f.vdi.length;
  if (key === 'office')  return f.officeVersions.length;
  return f.criticalNotes.length;
}

/* OS tab for the FDC agent — same row shape as F1E OS rows but no coverage
   chips (those are an F1E DLP/Direct/Proxy concept). */
function FdcOSTab({ kind, fdc, onChange }: { kind: 'windows' | 'macos' | 'vdi'; fdc: FdcMatrix; onChange: (m: FdcMatrix) => void }) {
  const rows = kind === 'windows' ? fdc.windows : kind === 'macos' ? fdc.macos : fdc.vdi;
  const notes = kind === 'windows' ? fdc.windowsNotes : kind === 'macos' ? fdc.macosNotes : [];
  function setRows(next: EndpointMatrixOSRow[]) {
    if (kind === 'windows') onChange({ ...fdc, windows: next });
    else if (kind === 'macos') onChange({ ...fdc, macos: next });
    else onChange({ ...fdc, vdi: next });
  }
  function setNotes(next: string[]) {
    if (kind === 'windows') onChange({ ...fdc, windowsNotes: next });
    else if (kind === 'macos') onChange({ ...fdc, macosNotes: next });
  }
  function patch(id: string, p: Partial<EndpointMatrixOSRow>) { setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r))); }
  function del(id: string) { setRows(rows.filter((r) => r.id !== id)); }

  return (
    <>
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '34%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '36px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <Th>Platform</Th>
            <Th>Min Agent / Supported From</Th>
            <Th>Note</Th>
            <Th>Status</Th>
            <Th>{''}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id} style={{ borderTop: '1px solid #EEF0F5', background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFE' }}>
              <Td valign="top"><CellInput value={r.platform} onChange={(v) => patch(r.id, { platform: v })} mono={false} /></Td>
              <Td valign="top"><CellInput value={r.supportedFrom} onChange={(v) => patch(r.id, { supportedFrom: v })} mono /></Td>
              <Td valign="top"><CellInput value={r.note ?? ''} onChange={(v) => patch(r.id, { note: v || undefined })} mono={false} placeholder="—" /></Td>
              <Td valign="top">
                <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value as 'current' | 'eos' })}
                  style={{ width: '100%', fontSize: '11px', padding: '5px 6px', borderRadius: '5px', border: '1px solid #CBD5E1', background: r.status === 'eos' ? '#FEF2F2' : '#F0FDF4', color: r.status === 'eos' ? '#A30080' : '#16A34A', fontWeight: 700 }}>
                  <option value="current">CURRENT</option>
                  <option value="eos">EOS</option>
                </select>
              </Td>
              <Td valign="top">
                <button onClick={() => del(r.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '6px 2px' }} title="Remove"><Trash2 size={13} /></button>
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><Td colSpan={5} center><div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0' }}>No rows. Add one from the toolbar.</div></Td></tr>
          )}
        </tbody>
      </table>

      {(kind === 'windows' || kind === 'macos') && (
        <div className="mt-6">
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Platform notes</div>
          <div className="flex flex-col gap-2">
            {notes.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={n} onChange={(e) => { const c = [...notes]; c[i] = e.target.value; setNotes(c); }}
                  style={{ flex: 1, fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', color: '#1D252C' }} />
                <button onClick={() => setNotes(notes.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}><Trash2 size={13} /></button>
              </div>
            ))}
            <button onClick={() => setNotes([...notes, ''])} className="flex items-center gap-1.5 rounded-lg self-start"
              style={{ fontSize: '11.5px', padding: '5px 11px', background: 'transparent', color: '#64748B', border: '1px dashed #CBD5E1', cursor: 'pointer' }}>
              <Plus size={11} /> Add note
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* Office Versions tab — the FDC analog of the F1E Browsers tab. Lists the
   Microsoft Office flavours the classification add-in supports. */
function OfficeVersionsTab({ fdc, onChange }: { fdc: FdcMatrix; onChange: (m: FdcMatrix) => void }) {
  const rows = fdc.officeVersions;
  function setRows(next: FdcOfficeVersionRow[]) { onChange({ ...fdc, officeVersions: next }); }
  function patch(id: string, p: Partial<FdcOfficeVersionRow>) { setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r))); }
  function del(id: string) { setRows(rows.filter((r) => r.id !== id)); }

  return (
    <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '26%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '90px' }} />
        <col style={{ width: '36px' }} />
      </colgroup>
      <thead>
        <tr style={{ background: '#F8FAFC' }}>
          <Th>Office Product</Th>
          <Th>Versions</Th>
          <Th>Min Agent / Supported From</Th>
          <Th>Note</Th>
          <Th>Status</Th>
          <Th>{''}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r.id} style={{ borderTop: '1px solid #EEF0F5', background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFE' }}>
            <Td valign="top"><CellInput value={r.product} onChange={(v) => patch(r.id, { product: v })} mono={false} placeholder="e.g. Microsoft 365" /></Td>
            <Td valign="top"><CellInput value={r.versions} onChange={(v) => patch(r.id, { versions: v })} mono placeholder="version range" /></Td>
            <Td valign="top"><CellInput value={r.minAgent} onChange={(v) => patch(r.id, { minAgent: v })} mono placeholder="agent / version" /></Td>
            <Td valign="top"><CellInput value={r.note ?? ''} onChange={(v) => patch(r.id, { note: v || undefined })} mono={false} placeholder="—" /></Td>
            <Td valign="top">
              <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value as 'current' | 'eos' })}
                style={{ width: '100%', fontSize: '11px', padding: '5px 6px', borderRadius: '5px', border: '1px solid #CBD5E1', background: r.status === 'eos' ? '#FEF2F2' : '#F0FDF4', color: r.status === 'eos' ? '#A30080' : '#16A34A', fontWeight: 700 }}>
                <option value="current">CURRENT</option>
                <option value="eos">EOS</option>
              </select>
            </Td>
            <Td valign="top">
              <button onClick={() => del(r.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '6px 2px' }} title="Remove"><Trash2 size={13} /></button>
            </Td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><Td colSpan={6} center><div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0' }}>No Office versions. Add one from the toolbar.</div></Td></tr>
        )}
      </tbody>
    </table>
  );
}

/* FDC critical notes — same editor as the F1E NotesTab, writing to fdc.criticalNotes. */
function FdcNotesTab({ fdc, onChange }: { fdc: FdcMatrix; onChange: (m: FdcMatrix) => void }) {
  const notes = fdc.criticalNotes;
  function setNotes(next: EndpointMatrixCriticalNote[]) { onChange({ ...fdc, criticalNotes: next }); }
  function patch(id: string, p: Partial<EndpointMatrixCriticalNote>) { setNotes(notes.map((n) => (n.id === id ? { ...n, ...p } : n))); }
  function del(id: string) { setNotes(notes.filter((n) => n.id !== id)); }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => {
        const cfg = SEV_CFG[n.severity];
        return (
          <div key={n.id} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderLeft: `3px solid ${cfg.color}`, borderRadius: '8px', padding: '12px 14px' }}>
            <div className="flex items-center gap-2 mb-2">
              <select value={n.severity} onChange={(e) => patch(n.id, { severity: e.target.value as EndpointMatrixCriticalNote['severity'] })}
                style={{ fontSize: '10.5px', padding: '3px 6px', borderRadius: '4px', border: `1px solid ${cfg.border}`, background: '#fff', color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
              <input value={n.title} onChange={(e) => patch(n.id, { title: e.target.value })} placeholder="Note title"
                style={{ flex: 1, fontSize: '12.5px', fontWeight: 700, padding: '4px 8px', borderRadius: '5px', border: '1px solid transparent', background: 'transparent', color: '#1D252C' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = cfg.border; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} />
              <button onClick={() => del(n.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }} title="Remove"><Trash2 size={13} /></button>
            </div>
            <textarea value={n.body} onChange={(e) => patch(n.id, { body: e.target.value })} placeholder="Note body" rows={2}
              style={{ width: '100%', fontSize: '12px', padding: '6px 8px', borderRadius: '5px', border: '1px solid transparent', background: 'transparent', color: '#475569', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = cfg.border; e.currentTarget.style.background = '#fff'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} />
          </div>
        );
      })}
      {notes.length === 0 && (
        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '24px 0', textAlign: 'center' }}>No critical notes. Use "Add Row" in the toolbar.</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════════════════════════════ */
function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.09em', textTransform: 'uppercase', whiteSpace: 'nowrap', width }}>
      {children}
    </th>
  );
}

function Td({
  children, colSpan, center, valign,
}: { children: React.ReactNode; colSpan?: number; center?: boolean; valign?: 'top' | 'middle' }) {
  return (
    <td colSpan={colSpan} style={{ padding: '7px 10px', fontSize: '12px', verticalAlign: valign ?? 'middle', textAlign: center ? 'center' : 'left' }}>
      {children}
    </td>
  );
}

/* Coverage chips — 3-way multi-select per row indicating which Forcepoint
   endpoint product(s) this matrix entry applies to (DLP / Direct / Proxy).
   Renders as small toggle pills; clicking flips membership. */
function CoverageChips({
  value, onChange,
}: { value: EndpointCoverage[]; onChange: (next: EndpointCoverage[]) => void }) {
  const opts: EndpointCoverage[] = ['dlp', 'direct', 'proxy'];
  function toggle(k: EndpointCoverage) {
    const has = value.includes(k);
    onChange(has ? value.filter((x) => x !== k) : [...value, k]);
  }
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((k) => {
        const on = value.includes(k);
        const color = COVERAGE_COLORS[k];
        return (
          <button key={k} onClick={() => toggle(k)}
            title={COVERAGE_FULL_NAMES[k]}
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${on ? color : '#E2E8F0'}`,
              background: on ? color : '#F8FAFC',
              color: on ? '#FFFFFF' : '#64748B',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
          >
            {on ? '✓ ' : ''}{COVERAGE_LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}

function CellInput({
  value, onChange, mono, placeholder,
}: { value: string; onChange: (v: string) => void; mono: boolean; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        fontSize: '12px',
        padding: '5px 8px',
        borderRadius: '5px',
        border: '1px solid #E2E8F0',
        background: '#FFFFFF',
        color: '#0F2952',
        fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
        outline: 'none',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#0EA5E9'; e.currentTarget.style.background = '#F0F9FF'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#FFFFFF'; }}
    />
  );
}


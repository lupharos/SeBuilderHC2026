import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, Download, Upload, AlertCircle, Save, FileJson, Layers, FileCode, ExternalLink } from 'lucide-react';
import {
  ALL_CATEGORIES,
  SOFTWARE_CATEGORIES,
  SOFTWARE_COLUMNS,
  HARDWARE_COLUMNS,
  INITIAL_VERSION_DATA,
  type CategoryKey,
  type VersionDataStore,
  type SoftwareEntry,
  type HardwareEntry,
} from '../constants/versionData';
import {
  parseForcepointLifecycleHtml,
  mergeIntoStore,
  computeMergeImpact,
  type ParseResult,
  type MergeImpact,
} from '../utils/forcepointHtmlImporter';

interface VersionDataPageProps {
  data: VersionDataStore;
  onChange: (data: VersionDataStore) => void;
}

type AnyEntry = SoftwareEntry | HardwareEntry;

const TODAY = new Date().toISOString().slice(0, 10);

function isExpired(date: string | null): boolean {
  if (!date) return false;
  return date < TODAY;
}

function isSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 180;
}

function DateBadge({ value }: { value: string | number | null }) {
  const str = value == null ? null : String(value);
  if (!str) return <span style={{ color: '#CBD5E1', fontSize: '11px' }}>—</span>;

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
  if (!dateStr) return <span style={{ fontSize: '12px', color: '#475569' }}>{str}</span>;

  const expired = isExpired(dateStr);
  const soon = isSoon(dateStr);

  const color = expired ? '#EF4444' : soon ? '#F59E0B' : '#10B981';
  const bg = expired ? '#FEF2F2' : soon ? '#FFFBEB' : '#F0FDF4';
  const border = expired ? '#FECACA' : soon ? '#FDE68A' : '#BBF7D0';

  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'monospace',
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '5px',
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {dateStr}
    </span>
  );
}

interface EditableCellProps {
  value: string | number | null;
  onChange: (v: string) => void;
  isEditing: boolean;
  isKey?: boolean;
}

function EditableCell({ value, onChange, isEditing, isKey }: EditableCellProps) {
  const str = value == null ? '' : String(value);
  if (!isEditing) {
    if (isKey) {
      return (
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>
          {str || <span style={{ color: '#CBD5E1' }}>—</span>}
        </span>
      );
    }
    return <DateBadge value={value} />;
  }
  return (
    <input
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      style={{
        width: '100%',
        fontSize: '11.5px',
        fontFamily: 'monospace',
        padding: '2px 6px',
        borderRadius: '5px',
        border: '1px solid #BFDBFE',
        outline: 'none',
        background: '#F0F9FF',
        color: '#0F172A',
        minWidth: isKey ? '120px' : '90px',
      }}
    />
  );
}

function isSoftwareCategory(cat: CategoryKey): boolean {
  return (SOFTWARE_CATEGORIES as readonly string[]).includes(cat);
}

export function VersionDataPage({ data, onChange }: VersionDataPageProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(ALL_CATEGORIES[0]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<AnyEntry | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [importImpact, setImportImpact] = useState<MergeImpact[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  /* JSON import + saved-flash state — mirrors the Endpoint Matrix page so
     the two global-catalogue pages feel identical. */
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportInfo, setJsonImportInfo] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, [data]);

  const isSoftware = isSoftwareCategory(activeCategory);
  const columns = isSoftware ? SOFTWARE_COLUMNS : HARDWARE_COLUMNS;
  const rows = data[activeCategory] as AnyEntry[];

  /* Catalogue-wide empty check: when no category holds any entry, the page
     renders an Import-HTML CTA instead of the tabs+table chrome, mirroring
     the OS / Browser Support Matrix empty state. */
  const totalEntries = ALL_CATEGORIES.reduce(
    (sum, k) => sum + (data[k] as AnyEntry[]).length,
    0,
  );
  const allEmpty = totalEntries === 0;

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditBuffer({ ...rows[index] });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditBuffer(null);
  }

  function commitEdit() {
    if (editBuffer == null || editingIndex == null) return;
    const updated = [...rows];
    updated[editingIndex] = editBuffer as never;
    onChange({ ...data, [activeCategory]: updated });
    setEditingIndex(null);
    setEditBuffer(null);
  }

  function deleteRow(index: number) {
    const updated = rows.filter((_, i) => i !== index);
    onChange({ ...data, [activeCategory]: updated as never });
    if (editingIndex === index) cancelEdit();
  }

  function addRow() {
    const empty = isSoftware
      ? ({ Version: '', 'General Availability': null, 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': null } as SoftwareEntry)
      : ({ 'Model/Version': '', 'General Availability': null, 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null } as HardwareEntry);
    const updated = [...rows, empty] as never[];
    onChange({ ...data, [activeCategory]: updated });
    setTimeout(() => startEdit(rows.length), 0);
  }

  function handleCellChange(col: string, value: string) {
    if (!editBuffer) return;
    setEditBuffer({ ...editBuffer, [col]: value === '' ? null : value });
  }

  function handleClearAll() {
    if (!confirmReset) { setConfirmReset(true); return; }
    /* Wipes every category to an empty array — matches the OS / Browser
       Support Matrix page's "Clear all" semantics. The bundled defaults in
       INITIAL_VERSION_DATA are NOT re-applied; the operator can re-import
       from HTML or JSON to repopulate. */
    const empty = ALL_CATEGORIES.reduce(
      (acc, k) => ({ ...acc, [k]: [] }),
      {} as VersionDataStore,
    );
    onChange(empty);
    setConfirmReset(false);
    setEditingIndex(null);
    setEditBuffer(null);
  }

  function exportJSON() {
    const payload = {
      _format: 'forcepoint-hc-version-data',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      data,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-lifecycle-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function manualSave() {
    /* useLocalStorage upstream auto-persists every edit — this is a visible
       confirmation gesture for the operator. */
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
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
      /* Accept either a bare VersionDataStore or our wrapped export envelope.
         Pre-export files (`exportJSON` v0) wrote the bare store, so unwrap is
         best-effort: if `data` exists on the envelope, use that; otherwise
         treat the payload as the store directly. */
      const candidate: unknown = parsed && typeof parsed === 'object' && 'data' in parsed
        ? (parsed as { data: unknown }).data
        : parsed;
      if (!candidate || typeof candidate !== 'object') {
        throw new Error('JSON payload is not an object.');
      }
      const c = candidate as Partial<VersionDataStore>;
      /* Build a normalised store from whichever categories the file provided.
         Unknown keys are ignored. Missing arrays default to empty. */
      const normalized: VersionDataStore = { ...INITIAL_VERSION_DATA };
      for (const cat of ALL_CATEGORIES) {
        const v = c[cat];
        if (v === undefined) { normalized[cat] = [] as never; continue; }
        if (!Array.isArray(v)) {
          throw new Error(`Field "${cat}" must be an array of entries.`);
        }
        normalized[cat] = v as never;
      }
      onChange(normalized);
      const total = ALL_CATEGORIES.reduce((s, k) => s + (normalized[k] as AnyEntry[]).length, 0);
      setJsonImportInfo(`Loaded ${total} ${total === 1 ? 'entry' : 'entries'} from ${file.name}.`);
    } catch (err) {
      setJsonImportError(`Could not import JSON: ${(err as Error).message}`);
    }
  }

  function triggerImport() {
    setImportError(null);
    importInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportError(null);
    try {
      const text = await file.text();
      const result = parseForcepointLifecycleHtml(text);
      if (result.rows.length === 0 && result.parsedProducts.length === 0) {
        setImportError('No recognizable Forcepoint product sections found in this HTML.');
        setImportResult(null);
        setImportImpact([]);
        return;
      }
      setImportResult(result);
      setImportImpact(computeMergeImpact(data, result));
    } catch (err) {
      setImportError(`Failed to read HTML file: ${(err as Error).message}`);
      setImportResult(null);
      setImportImpact([]);
    }
  }

  function confirmImport() {
    if (!importResult) return;
    const merged = mergeIntoStore(data, importResult);
    onChange(merged);
    setImportResult(null);
    setImportImpact([]);
    setImportFileName(null);
  }

  function cancelImport() {
    setImportResult(null);
    setImportImpact([]);
    setImportFileName(null);
    setImportError(null);
  }

  const categoryGroups: { label: string; items: CategoryKey[] }[] = [
    { label: 'Software', items: ['Forcepoint Email Security', 'Forcepoint Web Security', 'Forcepoint Data Security', 'DLP + Web Endpoint Agent', 'AMDP'] },
    { label: 'Hardware', items: ['V Series Appliances', 'NGFW Appliances'] },
  ];

  const colLabel = (col: string) => {
    const map: Record<string, string> = {
      'Version': 'Version',
      'Model/Version': 'Model / Version',
      'General Availability': 'GA',
      'End of Sale': 'EoSale',
      'End Of Maintenance': 'EoM',
      'End Of Support': 'EoSupport',
      'Last Supported Release': 'Last SW',
      'Last Date for Warranty Extension': 'Warranty Ext.',
      'End of Life': 'EoL',
      'Migration Path': 'Migration',
    };
    return map[col] ?? col;
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#F4F7FB' }}>
      {/* Left: category tabs — hidden while the catalogue is empty so the
          Empty-state CTA stays the focus. */}
      {!allEmpty && (
      <div
        className="flex flex-col flex-shrink-0 overflow-y-auto py-5 px-3 gap-1"
        style={{
          width: '200px',
          background: '#FFFFFF',
          borderRight: '1px solid #EEF0F5',
        }}
      >
        <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: '#94A3B8', marginBottom: '8px', paddingLeft: '6px' }}>
          PRODUCT LIFECYCLE
        </div>
        {categoryGroups.map((group) => (
          <div key={group.label} className="mb-2">
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#CBD5E1', letterSpacing: '0.1em', paddingLeft: '8px', marginBottom: '4px', textTransform: 'uppercase' }}>
              {group.label}
            </div>
            {group.items.map((cat) => {
              const active = cat === activeCategory;
              const count = (data[cat] as AnyEntry[]).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); cancelEdit(); setConfirmReset(false); }}
                  className="w-full text-left px-2.5 py-2 rounded-lg transition-all"
                  style={{
                    fontSize: '11.5px',
                    fontWeight: active ? 600 : 500,
                    color: active ? '#2563EB' : '#475569',
                    background: active ? 'rgba(37,99,235,0.07)' : 'transparent',
                    border: active ? '1px solid rgba(37,99,235,0.18)' : '1px solid transparent',
                    marginBottom: '1px',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{cat}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: active ? '#2563EB' : '#94A3B8',
                        background: active ? 'rgba(37,99,235,0.1)' : '#F1F5F9',
                        borderRadius: '4px',
                        padding: '1px 5px',
                        flexShrink: 0,
                        marginLeft: '4px',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      )}

      {/* Right: table area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header bar — mirrors the OS / Browser Support Matrix page so the
            two global-catalogue pages feel coherent. Add Row is the primary
            (blue) action in the leading position. */}
        <div className="flex items-center justify-between px-8 py-5 flex-shrink-0"
          style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)' }}>
              <Layers size={20} color="#fff" />
            </div>
            <div className="min-w-0">
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952', letterSpacing: '-0.01em' }}>
                Product Lifecycle
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }} className="truncate">
                {activeCategory} &middot; {rows.length} {rows.length === 1 ? 'entry' : 'entries'} &middot; click a row to edit inline
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <input
              ref={importInputRef}
              type="file"
              accept=".html,.htm,text/html"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleJSONFile}
            />
            {savedFlash && (
              <span className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '5px', padding: '4px 9px' }}>
                <Check size={11} /> Saved
              </span>
            )}

            <button onClick={addRow}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px', background: '#0EA5E9', color: '#fff', border: '1px solid #0284C7', cursor: 'pointer' }}
              title="Add a new entry to this category">
              <Plus size={13} /> Add Row
            </button>

            {!allEmpty && (
              <button onClick={manualSave}
                className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
                style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
                title="Confirm save — catalogue is auto-persisted to localStorage on every edit">
                <Save size={12} /> Save
              </button>
            )}

            {!allEmpty && (
              <button onClick={exportJSON}
                className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
                style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
                title="Download the current catalogue as JSON">
                <Download size={12} /> Export JSON
              </button>
            )}

            <button onClick={triggerJSONImport}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
              title="Load a previously-exported lifecycle JSON">
              <FileJson size={12} /> Import JSON
            </button>

            <button onClick={triggerImport}
              className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
              style={{ fontSize: '12px', padding: '7px 13px', background: '#FFFFFF', color: '#0F2952', border: '1px solid #CBD5E1', cursor: 'pointer' }}
              title="Import from a saved Forcepoint Product Support Lifecycle HTML page">
              <Upload size={12} /> Import HTML
            </button>

            {!allEmpty && (
              <button onClick={handleClearAll}
                onBlur={() => setConfirmReset(false)}
                className="flex items-center gap-1.5 rounded-lg font-semibold transition-all"
                style={{
                  fontSize: '12px', padding: '7px 13px',
                  background: confirmReset ? '#FEF2F2' : '#FFFFFF',
                  color: confirmReset ? '#A30080' : '#475569',
                  border: `1px solid ${confirmReset ? '#FECACA' : '#CBD5E1'}`,
                  cursor: 'pointer',
                }}
                title="Clear every category — leaves an empty catalogue">
                <Trash2 size={12} /> {confirmReset ? 'Click again to clear' : 'Clear all'}
              </button>
            )}
          </div>
        </div>

        {/* Empty state — shown when no category holds any entry. Mirrors the
            OS / Browser Support Matrix page's empty CTA so the two global
            catalogue pages feel coherent. */}
        {allEmpty && (
          <div className="flex-1 overflow-auto px-8 py-8">
            <div className="rounded-xl flex flex-col items-center justify-center text-center px-8 py-16 max-w-[860px] mx-auto"
              style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg,#DBEAFE,#C7D2FE)' }}>
                <FileCode size={28} color="#2563EB" />
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952', marginBottom: '6px' }}>
                No product lifecycle data imported yet
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '560px', lineHeight: 1.6 }}>
                Import the official Forcepoint Product Support Lifecycle HTML page to populate version, EoSale,
                EoM, EoSupport, and migration-path data for every Forcepoint product line. The wizard's
                Version &amp; EoS step and the HC report's lifecycle tables will reference this catalogue once
                it's populated — until then they show as empty.
              </div>
              <button onClick={triggerImport}
                className="flex items-center gap-2 mt-6 rounded-lg font-semibold transition-all"
                style={{ fontSize: '13px', padding: '10px 18px', background: '#0EA5E9', color: '#fff', border: '1px solid #0284C7', cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,165,233,0.25)' }}>
                <Upload size={14} /> Import HTML
              </button>
              <a
                href="https://support.forcepoint.com/s/productsupportlifecycle"
                target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 mt-3"
                style={{ fontSize: '11.5px', color: '#0284C7', textDecoration: 'none' }}>
                <ExternalLink size={11} /> Source: Forcepoint Product Support Lifecycle
              </a>
              <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: 14, lineHeight: 1.5 }}>
                Alternatively, use <strong>Import JSON</strong> in the toolbar to load a previously-exported catalogue.
              </div>
            </div>
          </div>
        )}

        {/* Table — only when at least one category has entries. */}
        {!allEmpty && (
        <div ref={tableRef} className="flex-1 overflow-auto px-6 py-4">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      color: '#94A3B8',
                      textTransform: 'uppercase',
                      padding: '0 10px 8px',
                      borderBottom: '1px solid #E2E8F0',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      background: '#F4F7FB',
                      zIndex: 1,
                      minWidth: ci === 0 ? '160px' : '90px',
                    }}
                  >
                    {colLabel(col)}
                  </th>
                ))}
                <th
                  style={{
                    width: '60px',
                    position: 'sticky',
                    top: 0,
                    background: '#F4F7FB',
                    zIndex: 1,
                    borderBottom: '1px solid #E2E8F0',
                  }}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const isRowEditing = editingIndex === ri;
                const displayRow = isRowEditing && editBuffer ? editBuffer : row;
                const keyCol = isSoftware ? 'Version' : 'Model/Version';
                const keyVal = String((displayRow as Record<string, unknown>)[keyCol] ?? '');
                const isEos =
                  !isRowEditing &&
                  isExpired((row as Record<string, unknown>)['End Of Support'] as string | null ?? (row as Record<string, unknown>)['End of Life'] as string | null);
                const isSoonWarning =
                  !isRowEditing && !isEos &&
                  (isSoon((row as Record<string, unknown>)['End Of Support'] as string | null) ||
                    isSoon((row as Record<string, unknown>)['End of Life'] as string | null));

                return (
                  <tr
                    key={ri}
                    onClick={() => !isRowEditing && startEdit(ri)}
                    style={{
                      cursor: isRowEditing ? 'default' : 'pointer',
                      background: isRowEditing
                        ? '#EFF6FF'
                        : isEos
                        ? '#FFF5F5'
                        : isSoonWarning
                        ? '#FFFBEB'
                        : ri % 2 === 0
                        ? '#FFFFFF'
                        : '#FAFBFD',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isRowEditing) (e.currentTarget as HTMLTableRowElement).style.background = '#F0F7FF';
                    }}
                    onMouseLeave={(e) => {
                      if (!isRowEditing)
                        (e.currentTarget as HTMLTableRowElement).style.background = isEos
                          ? '#FFF5F5'
                          : isSoonWarning
                          ? '#FFFBEB'
                          : ri % 2 === 0
                          ? '#FFFFFF'
                          : '#FAFBFD';
                    }}
                  >
                    {(columns as string[]).map((col, ci) => {
                      const cellVal = (displayRow as Record<string, unknown>)[col] as string | number | null;
                      return (
                        <td
                          key={col}
                          style={{
                            padding: '6px 10px',
                            borderBottom: '1px solid #F1F5F9',
                            verticalAlign: 'middle',
                          }}
                          onClick={(e) => isRowEditing && e.stopPropagation()}
                        >
                          <EditableCell
                            value={cellVal}
                            isEditing={isRowEditing}
                            isKey={ci === 0}
                            onChange={(v) => handleCellChange(col, v)}
                          />
                        </td>
                      );
                    })}
                    <td
                      style={{ padding: '6px 8px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isRowEditing ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={commitEdit}
                            className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                            style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}
                            title="Save"
                          >
                            <Check size={12} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                            style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}
                            title="Cancel"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        /* Edit + Delete are now visible on every row by default —
                           the previous opacity-0 / group-hover:opacity-100 wrapper
                           hid them entirely on touch devices and was easy to miss
                           on desktop too. */
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(ri); }}
                            className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                            style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#DBEAFE'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#EFF6FF'; }}
                            title={`Edit ${keyVal}`}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteRow(ri); }}
                            className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                            style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
                            title={`Delete ${keyVal}`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: '#94A3B8' }}>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>No entries yet</div>
              <button
                onClick={addRow}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg"
                style={{ fontSize: '12px', fontWeight: 600, color: '#2563EB', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}
              >
                <Plus size={13} /> Add first entry
              </button>
            </div>
          )}
        </div>
        )}

        {/* Legend — hidden when the catalogue is empty so the empty-state CTA isn't visually competing. */}
        {!allEmpty && (
        <div
          className="flex items-center gap-4 px-6 py-2.5 flex-shrink-0"
          style={{ borderTop: '1px solid #EEF0F5', background: '#FFFFFF' }}
        >
          {[
            { color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', label: 'Expired' },
            { color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', label: 'Expires within 6 months' },
            { color: '#10B981', bg: '#F0FDF4', border: '#BBF7D0', label: 'Active' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: item.bg,
                  border: `1px solid ${item.border}`,
                }}
              />
              <span style={{ fontSize: '10.5px', color: '#64748B' }}>{item.label}</span>
            </div>
          ))}
          <div className="flex-1" />
          <span style={{ fontSize: '10px', color: '#CBD5E1', fontFamily: 'monospace' }}>
            Click any row to edit · Dates: YYYY-MM-DD
          </span>
        </div>
        )}
      </div>

      {importError && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            maxWidth: '420px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          }}
        >
          <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#991B1B', marginBottom: '2px' }}>Import failed</div>
            <div style={{ fontSize: '11.5px', color: '#7F1D1D' }}>{importError}</div>
          </div>
          <button
            onClick={() => setImportError(null)}
            style={{ background: 'transparent', border: 'none', color: '#991B1B', cursor: 'pointer', padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {jsonImportError && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px', maxWidth: '420px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
          <AlertCircle size={16} style={{ color: '#991B1B', marginTop: '1px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#991B1B', marginBottom: '2px' }}>JSON import failed</div>
            <div style={{ fontSize: '11.5px', color: '#7F1D1D' }}>{jsonImportError}</div>
          </div>
          <button onClick={() => setJsonImportError(null)}
            style={{ background: 'transparent', border: 'none', color: '#991B1B', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {jsonImportInfo && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px', maxWidth: '420px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
          <Check size={16} style={{ color: '#16A34A', marginTop: '1px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803D', marginBottom: '2px' }}>JSON imported</div>
            <div style={{ fontSize: '11.5px', color: '#166534' }}>{jsonImportInfo}</div>
          </div>
          <button onClick={() => setJsonImportInfo(null)}
            style={{ background: 'transparent', border: 'none', color: '#15803D', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {importResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={cancelImport}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #EEF0F5' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                Import preview
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px', fontFamily: 'monospace' }}>
                {importFileName ?? 'uploaded file'} · {importResult.rows.length} row{importResult.rows.length === 1 ? '' : 's'} parsed
              </div>
            </div>

            <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Changes by category
              </div>
              {importImpact.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>No changes to apply.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                  {importImpact.map((imp) => (
                    <div
                      key={imp.category}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{imp.category}</span>
                      <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {imp.added > 0 && (
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: '5px', padding: '2px 6px', fontFamily: 'monospace' }}>
                            +{imp.added} new
                          </span>
                        )}
                        {imp.updated > 0 && (
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: '5px', padding: '2px 6px', fontFamily: 'monospace' }}>
                            ~{imp.updated} updated
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Matched products
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '18px' }}>
                {importResult.parsedProducts.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569', padding: '4px 0' }}>
                    <span style={{ flex: 1, paddingRight: '8px' }}>{p.productName}</span>
                    <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '10.5px' }}>→ {p.category}</span>
                    <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '10.5px', color: '#0F172A', fontWeight: 600 }}>{p.count}</span>
                  </div>
                ))}
              </div>

              {importResult.skipped.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Skipped ({importResult.skipped.length})
                  </div>
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px', maxHeight: '120px', overflowY: 'auto' }}>
                    {importResult.skipped.map((s, i) => (
                      <div key={i} style={{ fontSize: '11px', color: '#92400E', padding: '2px 0' }}>
                        <span style={{ fontWeight: 600 }}>{s.productName}</span>
                        <span style={{ color: '#B45309', marginLeft: '6px' }}>— {s.reason}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF0F5', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#FAFBFD' }}>
              <button
                onClick={cancelImport}
                className="px-4 py-2 rounded-lg"
                style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importResult.rows.length === 0}
                className="px-4 py-2 rounded-lg"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: importResult.rows.length === 0 ? '#94A3B8' : 'linear-gradient(135deg,#2563EB,#7C3AED)',
                  border: 'none',
                  cursor: importResult.rows.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Merge {importResult.rows.length} row{importResult.rows.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

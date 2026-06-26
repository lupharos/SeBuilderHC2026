/* Forcepoint F1E DLP Endpoint — OS, VDI, and Browser Support Matrix.

   No data is bundled here. The matrix is populated by the operator from the
   global "OS / Browser Support Matrix" page (left-rail menu), which imports
   the official Forcepoint support-matrix HTML and stores the parsed result
   under the `hc_endpoint_support_matrix` localStorage key. When the catalog
   is empty, the report's Endpoint Compatibility section renders as empty too. */

/* Which Forcepoint endpoint agent product(s) a given matrix row applies to.
   A single OS / browser / VDI row can support more than one — e.g. macOS
   Sonoma covers both DLP Endpoint and Web Endpoint Direct Connect — so this
   is modelled as a multi-select bitmask of string ids. */
export type EndpointCoverage = 'dlp' | 'direct' | 'proxy';

export const COVERAGE_LABELS: Record<EndpointCoverage, string> = {
  dlp:    'DLP',
  direct: 'Direct',
  proxy:  'Proxy',
};

export const COVERAGE_FULL_NAMES: Record<EndpointCoverage, string> = {
  dlp:    'F1E DLP Endpoint',
  direct: 'F1E Web Endpoint Direct Connect',
  proxy:  'F1E Web Endpoint Proxy Connect',
};

export const COVERAGE_COLORS: Record<EndpointCoverage, string> = {
  dlp:    '#0EA5E9',
  direct: '#16A34A',
  proxy:  '#7C3AED',
};

export interface EndpointMatrixOSRow {
  id: string;
  platform: string;
  supportedFrom: string;
  status: 'current' | 'eos';
  note?: string;
  /* Pre-existing rows imported before this field was added will hydrate with
     `undefined`; treat it as "unknown / not yet classified" and render an
     empty coverage cell. */
  coverage?: EndpointCoverage[];
}

export interface EndpointMatrixBrowserRow {
  id: string;
  browser: string;
  platform: 'Windows' | 'macOS';
  versions: string;
  minAgent: string;
  notes?: string;
  coverage?: EndpointCoverage[];
}

export interface EndpointMatrixCriticalNote {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  body: string;
}

/* ─────────────────────────────────────────────────────────────────────
   FDC (Forcepoint Data Classification) endpoint agent — a SEPARATE agent
   from F1E. For FDC the things that matter are which OS is supported and
   which Microsoft Office flavour is supported, so each OS row carries a
   fixed set of Office-app support flags.
   ───────────────────────────────────────────────────────────────────── */
export const FDC_OFFICE_APPS = ['m365', 'office2024', 'office2021', 'office2019', 'office2016'] as const;
export type FdcOfficeApp = (typeof FDC_OFFICE_APPS)[number];

export const FDC_OFFICE_LABELS: Record<FdcOfficeApp, string> = {
  m365:       'Microsoft 365',
  office2024: 'Office 2024',
  office2021: 'Office 2021',
  office2019: 'Office 2019',
  office2016: 'Office 2016',
};

/* One-line description used as a tooltip / help text on the column. */
export const FDC_OFFICE_DESCRIPTIONS: Record<FdcOfficeApp, string> = {
  m365:       'Cloud subscription (monthly/yearly) — Word, Excel, PowerPoint, Outlook; always updated; multi-device.',
  office2024: 'Perpetual one-time-purchase licence; no feature updates.',
  office2021: 'Perpetual legacy version.',
  office2019: 'Perpetual legacy version.',
  office2016: 'Perpetual legacy version.',
};

export interface FdcOSRow {
  id: string;
  platform: string;
  supportedFrom: string;
  status: 'current' | 'eos';
  note?: string;
  /* Which Office flavours the FDC agent supports on this OS. Missing key =
     not supported / unknown. Pre-existing rows hydrate with undefined. */
  office?: Partial<Record<FdcOfficeApp, boolean>>;
}

export interface FdcMatrix {
  os: FdcOSRow[];
  notes: string[];
}

export const EMPTY_FDC_MATRIX: FdcMatrix = { os: [], notes: [] };

export interface EndpointSupportMatrix {
  lastUpdated: string;
  source?: string;
  windows: EndpointMatrixOSRow[];
  windowsNotes: string[];
  macos: EndpointMatrixOSRow[];
  macosNotes: string[];
  vdi: EndpointMatrixOSRow[];
  browsers: EndpointMatrixBrowserRow[];
  criticalNotes: EndpointMatrixCriticalNote[];
  /* Forcepoint Data Classification agent matrix. Optional so payloads
     saved before the FDC agent was added hydrate cleanly (treated as
     empty); normalise on read with `m.fdc ?? EMPTY_FDC_MATRIX`. */
  fdc?: FdcMatrix;
}

export const EMPTY_ENDPOINT_MATRIX: EndpointSupportMatrix = {
  lastUpdated: '',
  source: '',
  windows: [],
  windowsNotes: [],
  macos: [],
  macosNotes: [],
  vdi: [],
  browsers: [],
  criticalNotes: [],
  fdc: { os: [], notes: [] },
};

/* F1E side empty-check — unchanged semantics so the existing F1E wizard
   assessment keeps working exactly as before. */
export function isMatrixEmpty(m: EndpointSupportMatrix | null | undefined): boolean {
  if (!m) return true;
  /* Defensive against partially-shaped objects from older localStorage payloads
     — falls through cleanly even if a field is undefined or non-array. */
  const len = (arr: unknown): number => (Array.isArray(arr) ? arr.length : 0);
  return len(m.windows) === 0
    && len(m.macos) === 0
    && len(m.vdi) === 0
    && len(m.browsers) === 0
    && len(m.criticalNotes) === 0;
}

export function isFdcMatrixEmpty(m: EndpointSupportMatrix | null | undefined): boolean {
  const os = m?.fdc?.os;
  return !Array.isArray(os) || os.length === 0;
}

export function newMatrixId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

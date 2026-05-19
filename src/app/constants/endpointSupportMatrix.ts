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
};

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

export function newMatrixId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

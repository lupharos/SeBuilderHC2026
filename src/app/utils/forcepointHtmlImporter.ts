import type {
  SoftwareEntry,
  HardwareEntry,
  VersionDataStore,
  CategoryKey,
} from '../constants/versionData';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeWs(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalizeWs(raw);
  if (!s || /^[—\-–]$/.test(s) || /^n\/?a$/i.test(s) || /^tba$/i.test(s) || /^tbd$/i.test(s)) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;

  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;

  return null;
}

function cellText(el: Element | null | undefined): string {
  if (!el) return '';
  return normalizeWs(el.textContent || '');
}

function emptyOrText(v: string): string | null {
  if (!v) return null;
  if (/^[—\-–]$/.test(v)) return null;
  if (/^n\/?a$/i.test(v)) return null;
  return v;
}

function detectCategory(productName: string): CategoryKey | null {
  const n = productName.toLowerCase();
  if (/forcepoint\s+web\s+security/.test(n)) return 'Forcepoint Web Security';
  if (/forcepoint\s+email\s+security/.test(n)) return 'Forcepoint Email Security';
  if (/forcepoint\s+dlp\s+endpoint/.test(n)) return 'Forcepoint Data Security';
  if (/\bf1e\b/.test(n) || /forcepoint\s+one\s+endpoint/.test(n)) return 'DLP + Web Endpoint Agent';
  if (/\bamdp\b/.test(n) || /advanced\s+malware\s+detection/.test(n)) return 'AMDP';
  if (/ngfw/.test(n)) return 'NGFW Appliances';
  if (/v\s*series/.test(n) || /\bv(10000|20000|5000)\b/.test(n)) return 'V Series Appliances';
  return null;
}

function normalizeHeader(h: string): string {
  const x = h.toLowerCase().trim();
  if (/general availability|^ga$/.test(x)) return 'ga';
  if (/end of sale|^eosale$/.test(x)) return 'eosale';
  if (/end of maintenance|^eom$/.test(x)) return 'eom';
  if (/end of support|^eos$/.test(x)) return 'eos';
  if (/end of life|^eol$/.test(x)) return 'eol';
  if (/last supported release|^lsr$/.test(x)) return 'lsr';
  if (/last date for warranty extension|warranty extension|^warranty$/.test(x)) return 'warranty';
  if (/current maintenance release|^cmr$/.test(x)) return 'cmr';
  if (/migration path|^migration$/.test(x)) return 'migration';
  if (/^model\s*\/?\s*version$|^model$/.test(x)) return 'model';
  if (/^version$/.test(x)) return 'version';
  return x;
}

export interface ParsedRow {
  category: CategoryKey;
  entry: SoftwareEntry | HardwareEntry;
}

export interface ParsedProductSummary {
  productName: string;
  category: CategoryKey;
  count: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  parsedProducts: ParsedProductSummary[];
  skipped: { productName: string; reason: string }[];
}

export function parseForcepointLifecycleHtml(html: string): ParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const rows: ParsedRow[] = [];
  const parsedProducts: ParsedProductSummary[] = [];
  const skipped: { productName: string; reason: string }[] = [];

  const titles = Array.from(doc.querySelectorAll('.productName1'));

  for (const titleEl of titles) {
    const productName = cellText(titleEl);
    if (!productName) continue;

    const category = detectCategory(productName);
    if (!category) {
      skipped.push({ productName, reason: 'not in GUI category list' });
      continue;
    }

    const container =
      titleEl.closest('c-product-life-cycle-product-page') ||
      titleEl.closest('article') ||
      titleEl.closest('section') ||
      titleEl.closest('div.product') ||
      titleEl.parentElement?.parentElement?.parentElement ||
      null;

    const table = container?.querySelector('table');
    if (!table) {
      skipped.push({ productName, reason: 'no table found' });
      continue;
    }

    const headerCells = table.querySelectorAll('thead th, thead td');
    let headers: string[] = [];
    let bodyRows: Element[] = [];
    if (headerCells.length > 0) {
      headers = Array.from(headerCells).map((c) => normalizeHeader(cellText(c)));
      bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      if (bodyRows.length === 0) {
        bodyRows = Array.from(table.querySelectorAll('tr')).slice(1);
      }
    } else {
      const allRows = Array.from(table.querySelectorAll('tr'));
      if (allRows.length < 2) {
        skipped.push({ productName, reason: 'table has no rows' });
        continue;
      }
      headers = Array.from(allRows[0].children).map((c) => normalizeHeader(cellText(c)));
      bodyRows = allRows.slice(1);
    }

    const colIdx = new Map<string, number>();
    headers.forEach((h, i) => {
      if (!colIdx.has(h)) colIdx.set(h, i);
    });

    const get = (cells: Element[], key: string): string | null => {
      const idx = colIdx.get(key);
      if (idx == null || idx >= cells.length) return null;
      return emptyOrText(cellText(cells[idx]));
    };

    const isHardware = category === 'V Series Appliances' || category === 'NGFW Appliances';
    let added = 0;

    for (const tr of bodyRows) {
      const cells = Array.from(tr.children);
      if (cells.length === 0) continue;

      if (isHardware) {
        const modelRaw = get(cells, 'model') || get(cells, 'version');
        if (!modelRaw) continue;
        const entry: HardwareEntry = {
          'Model/Version': modelRaw,
          'General Availability': parseDate(get(cells, 'ga')),
          'End of Sale': parseDate(get(cells, 'eosale')),
          'Last Supported Release': get(cells, 'lsr'),
          'End Of Maintenance': parseDate(get(cells, 'eom')),
          'Last Date for Warranty Extension': parseDate(get(cells, 'warranty')),
          'End of Life': parseDate(get(cells, 'eol')),
          'Migration Path': get(cells, 'migration'),
        };
        rows.push({ category, entry });
        added++;
      } else {
        const versionRaw = get(cells, 'version') || get(cells, 'model');
        if (!versionRaw) continue;
        const entry: SoftwareEntry = {
          Version: versionRaw,
          'General Availability': parseDate(get(cells, 'ga')),
          'End of Sale': parseDate(get(cells, 'eosale')),
          'End Of Maintenance': parseDate(get(cells, 'eom')),
          'End Of Support': parseDate(get(cells, 'eos')),
        };
        rows.push({ category, entry });
        added++;
      }
    }

    if (added > 0) {
      parsedProducts.push({ productName, category, count: added });
    } else {
      skipped.push({ productName, reason: 'no data rows extracted' });
    }
  }

  return { rows, parsedProducts, skipped };
}

export function mergeIntoStore(
  store: VersionDataStore,
  result: ParseResult,
): VersionDataStore {
  const next: VersionDataStore = {
    'Forcepoint Email Security': [...store['Forcepoint Email Security']],
    'Forcepoint Web Security': [...store['Forcepoint Web Security']],
    'Forcepoint Data Security': [...store['Forcepoint Data Security']],
    'DLP + Web Endpoint Agent': [...store['DLP + Web Endpoint Agent']],
    'AMDP': [...store['AMDP']],
    'V Series Appliances': [...store['V Series Appliances']],
    'NGFW Appliances': [...store['NGFW Appliances']],
  };

  for (const { category, entry } of result.rows) {
    const isHardware = category === 'V Series Appliances' || category === 'NGFW Appliances';
    const keyField = isHardware ? 'Model/Version' : 'Version';
    const keyVal = String((entry as Record<string, unknown>)[keyField]);
    const list = next[category] as (SoftwareEntry | HardwareEntry)[];
    const existingIdx = list.findIndex(
      (e) => String((e as Record<string, unknown>)[keyField]) === keyVal,
    );
    if (existingIdx >= 0) {
      list[existingIdx] = entry as never;
    } else {
      list.push(entry as never);
    }
  }
  return next;
}

export interface MergeImpact {
  category: CategoryKey;
  added: number;
  updated: number;
}

export function computeMergeImpact(
  store: VersionDataStore,
  result: ParseResult,
): MergeImpact[] {
  const impact = new Map<CategoryKey, { added: number; updated: number }>();
  for (const { category, entry } of result.rows) {
    const isHardware = category === 'V Series Appliances' || category === 'NGFW Appliances';
    const keyField = isHardware ? 'Model/Version' : 'Version';
    const keyVal = String((entry as Record<string, unknown>)[keyField]);
    const list = store[category] as (SoftwareEntry | HardwareEntry)[];
    const exists = list.some(
      (e) => String((e as Record<string, unknown>)[keyField]) === keyVal,
    );
    const cur = impact.get(category) ?? { added: 0, updated: 0 };
    if (exists) cur.updated++;
    else cur.added++;
    impact.set(category, cur);
  }
  return Array.from(impact.entries()).map(([category, v]) => ({ category, ...v }));
}

import {
  type EndpointSupportMatrix,
  type EndpointMatrixOSRow,
  type EndpointMatrixBrowserRow,
  type EndpointMatrixCriticalNote,
  newMatrixId,
} from '../constants/endpointSupportMatrix';

/* Parser for the Forcepoint F1E Endpoint Support Matrix HTML.

   The official HTML comes from
   https://support.forcepoint.com/s/article/Endpoint-Solutions-Certified-Product-Matrix
   and its structure can drift between revisions. This parser is intentionally
   permissive: it walks every <table> in the document and classifies each into
   one of five buckets (Windows / macOS / VDI / Browsers / Critical Notes)
   based on the nearest preceding heading and the table's column headers.
   Anything that can't be classified is dropped silently so a partial parse
   still produces usable data — the operator can hand-edit gaps afterwards. */

export interface MatrixParseResult {
  matrix: EndpointSupportMatrix;
  warnings: string[];
  stats: {
    windowsRows: number;
    macosRows: number;
    vdiRows: number;
    browserRows: number;
    criticalNotes: number;
    tablesSeen: number;
  };
}

function normalizeWs(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function textOf(el: Element | null): string {
  if (!el) return '';
  return normalizeWs(el.textContent ?? '');
}

function tableHeaders(table: HTMLTableElement): string[] {
  const ths = table.querySelectorAll('thead th, tr:first-child th');
  if (ths.length > 0) return Array.from(ths).map((th) => textOf(th).toLowerCase());
  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  return Array.from(firstRow.querySelectorAll('td')).map((td) => textOf(td).toLowerCase());
}

function tableBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const tbodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  if (tbodyRows.length > 0) return tbodyRows;
  const all = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  return all.length > 1 ? all.slice(1) : all;
}

function precedingHeading(table: Element): string {
  let el: Element | null = table.previousElementSibling;
  while (el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return textOf(el);
    el = el.previousElementSibling;
  }
  const parent = table.parentElement;
  if (parent) {
    let p: Element | null = parent.previousElementSibling;
    while (p) {
      const tag = p.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return textOf(p);
      p = p.previousElementSibling;
    }
  }
  return '';
}

function classifyTable(table: HTMLTableElement): 'windows' | 'macos' | 'vdi' | 'browsers' | 'critical' | null {
  const headers = tableHeaders(table).join(' ');
  const ctx = precedingHeading(table).toLowerCase();

  if (/browser/.test(headers) || /browser/.test(ctx)) return 'browsers';
  if (/vdi|virtual desktop|citrix|horizon|workspace/.test(headers + ' ' + ctx)) return 'vdi';
  if (/windows/.test(ctx) && !/mac/.test(ctx)) return 'windows';
  if (/mac\s*os|macos/.test(ctx)) return 'macos';

  /* Fall back to first-cell content sniffing when the heading isn't helpful. */
  const firstRow = tableBodyRows(table)[0];
  const firstCell = firstRow ? textOf(firstRow.querySelector('td')).toLowerCase() : '';
  if (/windows/.test(firstCell)) return 'windows';
  if (/mac\s*os|macos/.test(firstCell)) return 'macos';
  if (/citrix|horizon|workspace|vdi/.test(firstCell)) return 'vdi';
  if (/edge|chrome|firefox|safari|outlook/.test(firstCell)) return 'browsers';

  return null;
}

function parseOSRow(row: HTMLTableRowElement, prefix: string): EndpointMatrixOSRow | null {
  const cells = Array.from(row.querySelectorAll('td')).map((td) => textOf(td));
  if (cells.length === 0 || !cells[0]) return null;
  const platform = cells[0];
  const supportedFrom = cells.slice(1).filter(Boolean).join(' · ') || '—';
  /* EOS detection: any "no longer supported" / "last supported" / "OS support
     ended" wording flips the row's status. */
  const blob = cells.join(' ').toLowerCase();
  const status: 'current' | 'eos' = /no longer supported|last supported|support ended|end of support|eos/.test(blob)
    ? 'eos' : 'current';
  return { id: newMatrixId(prefix), platform, supportedFrom, status };
}

function parseBrowserRow(row: HTMLTableRowElement, headers: string[]): EndpointMatrixBrowserRow | null {
  const cells = Array.from(row.querySelectorAll('td')).map((td) => textOf(td));
  if (cells.length === 0 || !cells[0]) return null;

  const idxOf = (...needles: string[]): number =>
    headers.findIndex((h) => needles.some((n) => h.includes(n)));

  const iBrowser  = Math.max(0, idxOf('browser'));
  const iPlatform = idxOf('platform', 'os');
  const iVersions = idxOf('version', 'supported');
  const iMinAgent = idxOf('min agent', 'minimum agent', 'agent', 'endpoint');
  const iNotes    = idxOf('note', 'remark');

  const browser = cells[iBrowser] ?? cells[0];
  const platRaw = iPlatform >= 0 ? cells[iPlatform] : '';
  const platform: 'Windows' | 'macOS' = /mac/i.test(platRaw) ? 'macOS' : 'Windows';
  const versions = (iVersions >= 0 ? cells[iVersions] : '') || '—';
  const minAgent = (iMinAgent >= 0 ? cells[iMinAgent] : cells[cells.length - 1]) || '—';
  const notes = iNotes >= 0 ? cells[iNotes] : '';

  return {
    id: newMatrixId('br'),
    browser,
    platform,
    versions,
    minAgent,
    notes: notes || undefined,
  };
}

function extractListAfter(heading: Element): string[] {
  const items: string[] = [];
  let el: Element | null = heading.nextElementSibling;
  while (el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) break;
    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li) => {
        const t = textOf(li);
        if (t) items.push(t);
      });
    }
    el = el.nextElementSibling;
  }
  return items;
}

function parseCriticalNotes(doc: Document): EndpointMatrixCriticalNote[] {
  /* Critical notes can appear as an unordered list under a heading like
     "Critical Compatibility Notes" / "Notes", or as a free-form paragraph
     block. We extract every <li> in such regions and tag each as 'medium' by
     default — the operator can re-classify in the UI. */
  const out: EndpointMatrixCriticalNote[] = [];
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5'));
  for (const h of headings) {
    const ht = textOf(h).toLowerCase();
    if (!/note|warning|caveat|known issue|critical/.test(ht)) continue;
    for (const item of extractListAfter(h)) {
      const lower = item.toLowerCase();
      let severity: 'critical' | 'high' | 'medium' = 'medium';
      if (/manifest v2|mv2|deprecated|no longer supported|critical/.test(lower)) severity = 'critical';
      else if (/cannot|must be|will not|disable|fail|gap/.test(lower)) severity = 'high';

      const splitAt = item.indexOf(':');
      const title = splitAt > 0 && splitAt < 80 ? item.slice(0, splitAt).trim() : item.slice(0, 80);
      const body  = splitAt > 0 && splitAt < 80 ? item.slice(splitAt + 1).trim() : item;
      out.push({ id: newMatrixId('cn'), severity, title, body });
    }
  }
  return out;
}

function extractLastUpdated(doc: Document): string {
  /* Grab text like "Last Updated: April 24, 2026" from anywhere in the doc. */
  const body = textOf(doc.body || doc.documentElement);
  const m = body.match(/last\s*updated[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  return m ? m[1] : '';
}

function extractSource(doc: Document): string {
  const link = doc.querySelector('a[href*="forcepoint"], a[href*="support"]');
  return link ? (link.getAttribute('href') ?? '') : '';
}

export function parseEndpointMatrixHtml(html: string): MatrixParseResult {
  const warnings: string[] = [];
  const matrix: EndpointSupportMatrix = {
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

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (e) {
    warnings.push(`Could not parse HTML: ${(e as Error).message}`);
    return {
      matrix,
      warnings,
      stats: { windowsRows: 0, macosRows: 0, vdiRows: 0, browserRows: 0, criticalNotes: 0, tablesSeen: 0 },
    };
  }

  matrix.lastUpdated = extractLastUpdated(doc);
  matrix.source = extractSource(doc);

  const tables = Array.from(doc.querySelectorAll('table')) as HTMLTableElement[];
  for (const t of tables) {
    const cls = classifyTable(t);
    if (!cls) continue;
    const headers = tableHeaders(t);
    const rows = tableBodyRows(t);
    for (const row of rows) {
      if (cls === 'browsers') {
        const r = parseBrowserRow(row, headers);
        if (r) matrix.browsers.push(r);
      } else {
        const r = parseOSRow(row, cls);
        if (!r) continue;
        if (cls === 'windows') matrix.windows.push(r);
        else if (cls === 'macos') matrix.macos.push(r);
        else if (cls === 'vdi') matrix.vdi.push(r);
      }
    }
  }

  /* Notes lists under the Windows / macOS sections. */
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5'));
  for (const h of headings) {
    const ht = textOf(h).toLowerCase();
    if (/windows/.test(ht) && !/mac/.test(ht)) {
      matrix.windowsNotes.push(...extractListAfter(h));
    } else if (/mac\s*os|macos/.test(ht)) {
      matrix.macosNotes.push(...extractListAfter(h));
    }
  }
  /* Dedup notes (some doc structures repeat). */
  matrix.windowsNotes = Array.from(new Set(matrix.windowsNotes));
  matrix.macosNotes   = Array.from(new Set(matrix.macosNotes));

  matrix.criticalNotes = parseCriticalNotes(doc);

  if (tables.length === 0) warnings.push('No <table> elements found in the document.');
  if (matrix.windows.length === 0 && matrix.macos.length === 0 && matrix.vdi.length === 0 && matrix.browsers.length === 0) {
    warnings.push('No OS, VDI, or browser rows could be classified. Tables may use a layout this parser does not recognise — paste-edit the rows manually after import.');
  }

  return {
    matrix,
    warnings,
    stats: {
      windowsRows: matrix.windows.length,
      macosRows: matrix.macos.length,
      vdiRows: matrix.vdi.length,
      browserRows: matrix.browsers.length,
      criticalNotes: matrix.criticalNotes.length,
      tablesSeen: tables.length,
    },
  };
}

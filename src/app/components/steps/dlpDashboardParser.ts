/* Forcepoint DLP customer dashboard PDF parser.
   Input: a PDF export from the DLP Manager "Report" UI.
   Output: a bounded summary suitable for the HC report. Individual user
   names and per-incident PII are intentionally aggregated to department
   level (or dropped entirely) to keep customer-facing reports clean. */

import * as pdfjsLib from 'pdfjs-dist';
// Vite-aware worker import — bundled with the app, no CDN fetch at runtime.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface ActionRow {
  action: string;
  count: number;
  pct: number;
}

export interface ChannelRow {
  channel: string;
  count: number;
  pct: number;
}

export interface PolicyRow {
  policy: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface UrlCategoryRow {
  category: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DestinationRow {
  destination: string;
  total: number;
}

export interface DepartmentRow {
  department: string;
  total: number;
}

export interface DlpDashboardSummary {
  fileName: string;
  importedAt: string;             // ISO timestamp when this app parsed it
  reportCreatedAt: string;        // "15 May. 2026, 11:46:38 AM" — verbatim
  dateRange: string;              // "Last 7 Days"
  ignoredFilter: string;          // e.g. "Exclude ignored incidents"
  totalIncidents: number;
  severity: SeverityCounts;
  actions: ActionRow[];
  topChannels: ChannelRow[];
  topPolicies: PolicyRow[];
  topUrlCategories: UrlCategoryRow[];
  topDestinations: DestinationRow[];
  topDepartments: DepartmentRow[];   // anonymized roll-up (no individual names)
  topRiskFindings: string[];         // auto-derived business observations
}

/* ─── PDF text extraction ───────────────────────────────────── */

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const Y_ROW_TOLERANCE = 5; // items within 5 PDF units of each other share a visual row

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    /* Collect every non-empty text item with its (x, y) coordinates,
       then group into visual rows via 1-D clustering on Y.

       Why clustering instead of rounded buckets: the previous
       `Math.round(y / 4) * 4` approach was sensitive to a row's items
       straddling a bucket boundary (e.g. Y=100 and Y=102 round to 100
       and 104). Clustering with a fixed tolerance is boundary-free —
       items at Y=100 and Y=102 cluster together, items at Y=100 and
       Y=108 do not. */
    type Item = { str: string; transform?: number[]; hasEOL?: boolean };
    const items: Array<{ x: number; y: number; str: string }> = [];
    for (const it of content.items as Item[]) {
      const str = (it.str ?? '').trim();
      if (!str) continue;
      const y = it.transform?.[5];
      const x = it.transform?.[4] ?? 0;
      if (y === undefined) continue;
      items.push({ x, y, str });
    }

    // Sort by Y descending (PDF Y grows upward) then cluster.
    items.sort((a, b) => b.y - a.y);
    const rows: Array<{ refY: number; cells: Array<{ x: number; str: string }> }> = [];
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.refY - it.y) <= Y_ROW_TOLERANCE) {
        last.cells.push({ x: it.x, str: it.str });
        // Keep refY anchored to the first item of the row so a slow
        // drift of small Y differences doesn't accumulate across many
        // items and silently merge two distinct rows.
      } else {
        rows.push({ refY: it.y, cells: [{ x: it.x, str: it.str }] });
      }
    }
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x);
      parts.push(row.cells.map((c) => c.str).join(' '));
    }
    parts.push('\n');
  }
  return parts
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

/* ─── Helpers ───────────────────────────────────────────────── */

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function asInt(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Pull a department label out of a Forcepoint user/source field.
   Examples we accept:
     "Resul Kurtulmuşlu (Ödeme Sistemleri Teknolojileri Bölümü)" → "Ödeme Sistemleri Teknolojileri Bölümü"
     "Emre Kara" (no parens) → "Unattributed" (so we don't leak names)
*/
function extractDepartment(raw: string): string {
  const m = raw.match(/\(([^)]+)\)\s*$/);
  if (m) return m[1].trim();
  return 'Unattributed';
}

/** Find a region of text between a header marker and the next known marker. */
function sliceBetween(text: string, startMarker: RegExp, stopMarkers: RegExp[]): string {
  const startMatch = text.match(startMarker);
  if (!startMatch || startMatch.index === undefined) return '';
  const startIdx = startMatch.index + startMatch[0].length;
  let endIdx = text.length;
  for (const stop of stopMarkers) {
    const m = text.slice(startIdx).match(stop);
    if (m && m.index !== undefined && startIdx + m.index < endIdx) {
      endIdx = startIdx + m.index;
    }
  }
  return text.slice(startIdx, endIdx);
}

/* ─── Section parsers ──────────────────────────────────────── */

function parseSeverity(text: string): SeverityCounts {
  // Look for lines: "High <num>", "Medium <num>", "Low <num>" near "Incidents by Severity"
  const block = sliceBetween(
    text,
    /Incidents by Severity/i,
    [/Incidents by Action/i, /Top 5/i],
  );
  const find = (label: string): number => {
    /* Primary: label followed by a digit run (whitespace or newline between).
       \s matches newlines, so this works whether the digit is on the same
       extracted line or the next one. */
    const direct = block.match(new RegExp(`\\b${label}\\b\\s+([0-9][0-9,]*)`));
    if (direct) return asInt(direct[1]);
    /* Fallback: tokenize block, find the label token, take the next pure-digit
       token (skipping pie-chart percentages like "4.6%", legend artifacts,
       and bullet chars). Handles PDFs where headers/bullets/icons sit
       between the label and its count in extraction order. */
    const tokens = block.split(/[\s|]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].toLowerCase() !== label.toLowerCase()) continue;
      for (let j = i + 1; j < Math.min(tokens.length, i + 10); j++) {
        const t = tokens[j].replace(/[,]/g, '');
        if (/^[0-9]+$/.test(t)) return asInt(t);
        // bail out if we hit another severity label — prevents High→Medium count bleed
        if (/^(high|medium|low|severity|incidents)$/i.test(tokens[j])) break;
      }
    }
    return 0;
  };
  const high = find('High');
  const medium = find('Medium');
  const low = find('Low');
  return { high, medium, low, total: high + medium + low };
}

function parseActions(text: string, total: number): ActionRow[] {
  const block = sliceBetween(text, /Incidents by Action/i, [/Top 5/i]);
  const rows: ActionRow[] = [];
  /* Action labels seen in DLP Manager exports across customer versions.
     Order matters — longest/most-specific FIRST so e.g. "Encrypted with
     user password" wins over a bare "Encrypted" suffix on another row.
     `(confirmed)` is a parenthetical that DLP attaches to Continued and
     Denied in newer exports — escaped in the regex below. */
  const labels = [
    'Encrypted with user password',
    'Continued (confirmed)',
    'Denied (confirmed)',
    'Monitor Mode',
    'Audit only',
    'Notify only',
    'Blocked',
    'Quarantined',
    'Released',
    'Permitted',
  ];
  /* Search the whole block (not line-by-line). PDF row reconstruction
     sometimes still splits "Blocked" and "241" across two lines if the
     icon glyph nudges the Y, so look across the block for the next
     digit-run following each label. */
  for (const label of labels) {
    const escaped = label.replace(/[()]/g, (c) => `\\${c}`);
    const re = new RegExp(`\\b${escaped}\\b[^0-9]*?([0-9][0-9,\\s]*)`, 'i');
    const m = block.match(re);
    if (m) {
      rows.push({ action: label, count: asInt(m[1]), pct: 0 });
    }
  }
  for (const r of rows) r.pct = pct(r.count, total);
  return rows.sort((a, b) => b.count - a.count);
}

/** Parse a "Top 5 X" section that has rows: <label> <count>. Lines are
    terminated by either a number followed by EOL or by the next known header.
    Fallback: if line-by-line matching produces nothing (label and count
    landed on separate extracted lines because the channel icon glyph
    interleaved with the label text), pair adjacent non-empty lines and
    match label+count across them. */
function parseTopChannels(text: string, total: number): ChannelRow[] {
  const block = sliceBetween(text, /Top 5 Channels/i, [/Top 5 Policies/i]);
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: ChannelRow[] = [];
  for (const line of lines) {
    if (/^Channel\s+Incidents$/i.test(line)) continue;
    const m = line.match(/^(.+?)\s+([0-9][0-9,\s]*)$/);
    if (m) {
      const count = asInt(m[2]);
      if (count > 0) out.push({ channel: m[1].trim(), count, pct: pct(count, total) });
    }
    if (out.length >= 5) break;
  }
  if (out.length === 0) {
    /* Cross-line pairing fallback. Walk lines two at a time; if line N
       is a label (non-numeric) and line N+1 is a bare digit string,
       treat as one row. */
    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i];
      const next = lines[i + 1];
      if (/^Channel\s+Incidents$/i.test(label)) continue;
      if (!/^[0-9][0-9,\s]*$/.test(next)) continue;
      if (/^[0-9]/.test(label)) continue;
      const count = asInt(next);
      if (count > 0) out.push({ channel: label, count, pct: pct(count, total) });
      i++;
      if (out.length >= 5) break;
    }
  }
  return out;
}

function parseTop5WithSeverity(
  text: string,
  startRe: RegExp,
  stopRes: RegExp[],
  headerWord: string,
): Array<{ name: string; high: number; medium: number; low: number; total: number }> {
  const block = sliceBetween(text, startRe, stopRes);
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: Array<{ name: string; high: number; medium: number; low: number; total: number }> = [];
  for (const line of lines) {
    if (new RegExp(`^${headerWord}\\s+High\\s+Medium\\s+Low\\s+Total$`, 'i').test(line)) continue;
    // Pattern: "<name> <h> <m> <l> <total>"  — name may include spaces / parens
    const m = line.match(/^(.+?)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s*$/);
    if (m) {
      out.push({
        name: m[1].trim(),
        high: asInt(m[2]),
        medium: asInt(m[3]),
        low: asInt(m[4]),
        total: asInt(m[5]),
      });
    }
    if (out.length >= 5) break;
  }
  return out;
}

function parseTopPolicies(text: string): PolicyRow[] {
  const rows = parseTop5WithSeverity(text, /Top 5 Policies/i, [/Top 5 Destination/i, /Top 5 Sources/i], 'Policy');
  return rows.map((r) => ({ policy: r.name, high: r.high, medium: r.medium, low: r.low, total: r.total }));
}

function parseTopUrlCategories(text: string): UrlCategoryRow[] {
  const rows = parseTop5WithSeverity(text, /Top 5 Destination URL-Categories/i, [/Top 5 Sources/i, /Top 5 Users/i], 'URL Category');
  return rows.map((r) => ({ category: r.name, high: r.high, medium: r.medium, low: r.low, total: r.total }));
}

/** Anonymise Top 5 Sources + Top 5 Users into department-level rollups. */
function parseTopDepartments(text: string): DepartmentRow[] {
  const sourcesBlock = sliceBetween(text, /Top 5 Sources/i, [/Top 5 Users/i, /Top 5 Destinations/i, /Top Incidents/i]);
  const usersBlock   = sliceBetween(text, /Top 5 Users/i,   [/Top 5 Destinations/i, /Top Incidents/i]);
  const byDept = new Map<string, number>();
  const pickRows = (block: string) => {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Skip header rows
      if (/^Sources\s+High\s+Medium\s+Low\s+Total$/i.test(line)) continue;
      if (/^User\s+/i.test(line)) continue;
      const m = line.match(/^(.+?)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s*$/);
      if (m) {
        const dept = extractDepartment(m[1]);
        const total = asInt(m[5]);
        byDept.set(dept, (byDept.get(dept) ?? 0) + total);
      }
    }
  };
  pickRows(sourcesBlock);
  pickRows(usersBlock);
  return Array.from(byDept.entries())
    .map(([department, total]) => ({ department, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function parseTopDestinations(text: string): DestinationRow[] {
  const block = sliceBetween(text, /Top 5 Destinations/i, [/Top Incidents/i, /Top 5 Users/i]);
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: DestinationRow[] = [];
  for (const line of lines) {
    if (/^Destinations\s+High\s+Medium\s+Low\s+Total$/i.test(line)) continue;
    const m = line.match(/^(.+?)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s+(\d[\d,\s]*)\s*$/);
    if (m) {
      out.push({ destination: m[1].trim(), total: asInt(m[5]) });
    }
    if (out.length >= 5) break;
  }
  return out;
}

function parseMetadata(text: string): { reportCreatedAt: string; dateRange: string; ignoredFilter: string } {
  const created = text.match(/Created on:\s*([^\n]+?)(?:\s+Generated by|\n)/i);
  const range   = text.match(/Date Range:\s*([^\n]+?)(?:\n|$)/i);
  const ignored = text.match(/Ignored Incident:\s*([^\n]+?)(?:\n|$)/i);
  return {
    reportCreatedAt: created ? created[1].trim() : '—',
    dateRange:       range   ? range[1].trim()   : '—',
    ignoredFilter:   ignored ? ignored[1].trim() : '—',
  };
}

/* ─── Public entry point ──────────────────────────────────── */

export async function parseDlpDashboardPdf(file: File): Promise<DlpDashboardSummary> {
  const text = await extractPdfText(file);
  const meta = parseMetadata(text);
  const severity = parseSeverity(text);
  const total = severity.total;

  const actions = parseActions(text, total);
  const topChannels = parseTopChannels(text, total);
  const topPolicies = parseTopPolicies(text);
  const topUrlCategories = parseTopUrlCategories(text);
  const topDepartments = parseTopDepartments(text);
  const topDestinations = parseTopDestinations(text);

  /* When nothing meaningful came out, dump the extracted text so the SE
     can paste it into a support thread. We only log on failure so happy
     paths don't spam the console with customer data. */
  if (total === 0 && actions.length === 0 && topChannels.length === 0) {
    console.warn(
      '[dlpDashboardParser] Parsed 0 incidents, 0 actions, 0 channels from PDF — extracted text dump:\n' + text,
    );
  }

  /* Risk findings — auto-generated, never names individuals */
  const findings: string[] = [];
  if (total > 0) findings.push(`${total.toLocaleString()} DLP incidents observed in the ${meta.dateRange.toLowerCase()} window.`);
  if (severity.high > 0) findings.push(`${severity.high.toLocaleString()} high-severity incidents (${pct(severity.high, total)}%) require investigation.`);
  const blocked = actions.find((a) => /^blocked$/i.test(a.action));
  const permitted = actions.find((a) => /^permitted$/i.test(a.action));
  if (blocked) findings.push(`Enforcement action: ${blocked.count.toLocaleString()} incidents were blocked (${blocked.pct}% of total) — policy engine is actively enforcing.`);
  if (permitted && total > 0 && permitted.pct > 90) {
    findings.push(`${permitted.pct}% of incidents were permitted — review whether policies are tuned correctly or if monitor-only mode is too broad.`);
  }
  if (topChannels.length > 0) {
    findings.push(`Highest-volume channel is ${topChannels[0].channel} (${topChannels[0].count.toLocaleString()} incidents, ${topChannels[0].pct}% of total).`);
  }
  if (topPolicies.length > 0 && topPolicies[0].total > 0) {
    findings.push(`Most-triggered policy is "${topPolicies[0].policy}" with ${topPolicies[0].total.toLocaleString()} incidents.`);
  }
  if (topUrlCategories.length > 0) {
    const aiCat = topUrlCategories.find((c) => /generative ai|ai - text/i.test(c.category));
    if (aiCat && aiCat.total > 1000) {
      findings.push(`Significant Generative AI activity: "${aiCat.category}" generated ${aiCat.total.toLocaleString()} incidents — review AI data-exposure guard-rails.`);
    }
  }
  if (findings.length === 0) findings.push('No DLP activity recorded in the reporting window.');

  return {
    fileName: file.name,
    importedAt: new Date().toISOString(),
    reportCreatedAt: meta.reportCreatedAt,
    dateRange: meta.dateRange,
    ignoredFilter: meta.ignoredFilter,
    totalIncidents: total,
    severity,
    actions,
    topChannels,
    topPolicies,
    topUrlCategories,
    topDestinations,
    topDepartments,
    topRiskFindings: findings,
  };
}

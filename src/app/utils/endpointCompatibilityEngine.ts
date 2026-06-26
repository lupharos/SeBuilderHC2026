import type {
  EndpointSupportMatrix,
  EndpointMatrixOSRow,
  EndpointMatrixBrowserRow,
  EndpointCoverage,
  FdcOfficeVersionRow,
} from '../constants/endpointSupportMatrix';
import { normalizeFdcMatrix } from '../constants/endpointSupportMatrix';

/* ═══════════════════════════════════════════════════════════════════
   DOMAIN TYPES
═══════════════════════════════════════════════════════════════════ */

export type CompatibilityStatus = 'SUPPORTED' | 'AT_RISK' | 'CRITICAL';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Urgency = 'IMMEDIATE' | 'SHORT_TERM' | 'PLANNED';

export interface EndpointCompatibilityInput {
  /** Currently deployed F1E agent build, e.g. "25.09.5741" — pulled
      automatically from Step 6 endpoint-agent telemetry; not editable
      in Step 7 anymore. */
  agentVersion: string;
  /** Total endpoints in the customer fleet — auto-filled from Step 6. */
  totalEndpoints: number;
  /** Which Forcepoint endpoint products the customer's agent provides.
      Drives which matrix rows are considered relevant during assessment. */
  solutions?: EndpointCoverage[];
  /** OS versions in use (multi). Matches `platform` from matrix.windows
      + matrix.macos rows. */
  osEnvironment: string[];
  /** Server OSes in use (multi). New plural form replacing single `serverOS`. */
  serverOSes?: string[];
  /** Browsers in use (multi). New plural form replacing single `primaryBrowser`. */
  browsers?: string[];
  /** VDI platforms in use (multi). New plural form replacing single `vdiPlatform`. */
  vdiPlatforms?: string[];

  /* ── Legacy singletons kept so saved sessions hydrate without loss. The
       engine falls back to these only when the corresponding plural array
       is undefined. ── */
  /** @deprecated use serverOSes[] */
  serverOS?: string;
  /** @deprecated use browsers[] */
  primaryBrowser?: string;
  /** @deprecated use vdiPlatforms[] */
  vdiPlatform?: string;
  /** @deprecated — macOS presence is now derived from osEnvironment[]. */
  hasMac?: boolean;

  /* ── FDC (Data Classification) agent — separate from F1E. Only used when
       DSPM / Classification is in scope. Selections are matched against
       matrix.fdc on Step 7. Optional so existing sessions hydrate cleanly. ── */
  /** Customer OS versions the FDC agent runs on (matches FDC matrix Windows/macOS/VDI platforms). */
  fdcOSEnvironment?: string[];
  /** Microsoft Office products the customer uses (matches FDC matrix Office Versions products). */
  fdcOfficeVersions?: string[];
  /** @deprecated old per-OS Office flag model — kept so old sessions hydrate. */
  fdcOfficeApps?: string[];
}

export const EMPTY_COMPAT_INPUT: EndpointCompatibilityInput = {
  agentVersion: '',
  totalEndpoints: 0,
  solutions: [],
  osEnvironment: [],
  serverOSes: [],
  browsers: [],
  vdiPlatforms: [],
  fdcOSEnvironment: [],
  fdcOfficeVersions: [],
};

/* ═══════════════════════════════════════════════════════════════════
   FDC (DATA CLASSIFICATION) AGENT ANALYSIS
   Pure helper shared by Step 7 (wizard panel) and the report HTML so both
   show identical results. Matches the customer's selected OS + Office
   flavours against matrix.fdc and surfaces findings.
═══════════════════════════════════════════════════════════════════ */
export interface FdcOSAnalysisRow {
  os: string;
  match: EndpointMatrixOSRow | undefined;
}
export interface FdcOfficeAnalysisRow {
  product: string;
  match: FdcOfficeVersionRow | undefined;
}
export interface FdcFinding {
  sev: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  text: string;
}
export interface FdcAnalysis {
  osRows: FdcOSAnalysisRow[];
  officeRows: FdcOfficeAnalysisRow[];
  findings: FdcFinding[];
}

export function computeFdcAnalysis(
  matrix: EndpointSupportMatrix,
  osEnvironment: string[],
  officeProducts: string[],
): FdcAnalysis {
  const fdc = normalizeFdcMatrix(matrix.fdc);
  const allOS = [...fdc.windows, ...fdc.macos, ...fdc.vdi];
  const osRows: FdcOSAnalysisRow[] = osEnvironment.map((os) => ({
    os,
    match: allOS.find((r) => r.platform === os),
  }));
  const officeRows: FdcOfficeAnalysisRow[] = officeProducts.map((product) => ({
    product,
    match: fdc.officeVersions.find((r) => r.product === product),
  }));

  const findings: FdcFinding[] = [];
  for (const { os, match } of osRows) {
    if (!match) { findings.push({ sev: 'HIGH', text: `${os} is not in the DSPM + FDC agent support matrix — not certified.` }); continue; }
    if (match.status === 'eos') findings.push({ sev: 'CRITICAL', text: `${os} is End-of-Support for the DSPM + FDC agent — plan migration.` });
  }
  for (const { product, match } of officeRows) {
    if (!match) { findings.push({ sev: 'MEDIUM', text: `${product} is not listed as supported by the DSPM + FDC agent.` }); continue; }
    if (match.status === 'eos') findings.push({ sev: 'MEDIUM', text: `${product} is End-of-Support for the DSPM + FDC agent.` });
  }
  return { osRows, officeRows, findings };
}

export interface CompatibilityFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  affectedComponents: string[];
  affectedEndpoints: number;
  affectedPct: string;
  recommendation: string;
}

export interface OSCompatibilityRow {
  os: string;
  minAgentRequired: string;
  customerAgentCompatible: boolean;
  status: 'SUPPORTED' | 'AT_RISK' | 'EOS';
  note: string;
}

export interface BrowserCompatibilityRow {
  browser: string;
  platform: 'Windows' | 'macOS';
  minAgentRequired: string;
  mv3Required: boolean;
  customerAgentCompatible: boolean;
  status: CompatibilityStatus;
  note: string;
}

export interface CriticalNoteRow {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  description: string;
  includeInReport: boolean;
}

export interface UpgradeRecommendation {
  targetVersion: string;
  urgency: Urgency;
  rationale: string;
  deploymentNote: string;
}

export interface EndpointCompatibilityAssessment {
  customerAgentVersion: string;
  compatibilityStatus: CompatibilityStatus;
  minimumRequiredAgent: string;
  upgradeRequired: boolean;
  findings: CompatibilityFinding[];
  osCompatibility: OSCompatibilityRow[];
  browserCompatibility: BrowserCompatibilityRow[];
  criticalNotes: CriticalNoteRow[];
  upgradeRecommendation: UpgradeRecommendation | null;
  /** ISO timestamp — when the assessment was last computed. */
  computedAt: string;
}

/* ═══════════════════════════════════════════════════════════════════
   VERSION PARSING
   F1E agent builds use the YY.MM.BUILD format (e.g. "25.09.5741"). We
   compare by (YY, MM) so 26.02 > 25.09 > 25.02 etc. Build number is the
   tie-breaker. Free-form strings like "v25.02.5708+" are stripped of
   leading non-digits before comparison.
═══════════════════════════════════════════════════════════════════ */

export interface ParsedVersion {
  year: number;
  month: number;
  build: number;
  /** Original string, retained for display purposes. */
  raw: string;
}

export function parseAgentVersion(s: string): ParsedVersion | null {
  if (!s) return null;
  const cleaned = s.replace(/^[vV]\s*/, '').replace(/[+\s]+$/, '').trim();
  const m = cleaned.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{1,6}))?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const build = m[3] ? parseInt(m[3], 10) : 0;
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return { year, month, build, raw: s };
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.build - b.build;
}

/* Customer agent satisfies the matrix row's "min agent" if it is ≥ the
   first parseable version in the row. Rows often list multiple stream
   minimums ("v25.02.5708+, v26.02.5749") — we keep the LOWEST so a
   newer customer build can still validate against any of them. */
export function minVersionFromRow(supportedFrom: string): ParsedVersion | null {
  if (!supportedFrom) return null;
  const tokens = supportedFrom.split(/[,;·]/).map((t) => t.trim()).filter(Boolean);
  let lowest: ParsedVersion | null = null;
  for (const tok of tokens) {
    const p = parseAgentVersion(tok);
    if (!p) continue;
    if (!lowest || compareVersions(p, lowest) < 0) lowest = p;
  }
  return lowest;
}

export function customerMeetsMin(customer: ParsedVersion | null, min: ParsedVersion | null): boolean {
  if (!min) return true;        // No requirement parseable → assume compatible
  if (!customer) return false;  // Requirement exists but customer unknown → not compatible
  return compareVersions(customer, min) >= 0;
}

/* ═══════════════════════════════════════════════════════════════════
   BROWSER HEURISTICS
═══════════════════════════════════════════════════════════════════ */

/* Forcepoint's "current GA" floor — the highest-tier agent stream cited in
   the support matrix. NOT a hard MV3 gate (older agents — 25.02+, 25.03+,
   24.06+ — already include MV3-capable browser extensions). This constant
   is used solely to surface a soft "latest recommended" advisory when the
   customer is supported but on a non-current stream. */
const FORCEPOINT_LATEST_FLOOR: ParsedVersion = { year: 26, month: 2, build: 0, raw: 'v26.02' };

function browserNeedsMV3Coverage(browser: string): boolean {
  const b = browser.toLowerCase();
  return /chrome|edge|chromium/.test(b);
}

/* ═══════════════════════════════════════════════════════════════════
   ASSESSMENT ENGINE
═══════════════════════════════════════════════════════════════════ */

function newFindingId(seed: number): string {
  return `f-${Date.now().toString(36)}-${seed}`;
}

/* Returns true when a matrix row's coverage[] intersects the customer's
   selected solutions. Rows with no coverage flagged are treated as
   in-scope (universal) so legacy / partially-imported matrices behave. */
function rowMatchesSolutions(rowCoverage: EndpointCoverage[] | undefined, customerSolutions: EndpointCoverage[]): boolean {
  if (!customerSolutions || customerSolutions.length === 0) return true;
  if (!rowCoverage || rowCoverage.length === 0) return true;
  return rowCoverage.some((c) => customerSolutions.includes(c));
}

export function runCompatibilityAssessment(
  input: EndpointCompatibilityInput,
  matrix: EndpointSupportMatrix,
): EndpointCompatibilityAssessment {
  const customer = parseAgentVersion(input.agentVersion);
  const findings: CompatibilityFinding[] = [];
  const osRows: OSCompatibilityRow[] = [];
  const brRows: BrowserCompatibilityRow[] = [];
  let nextId = 1;

  /* Resolve plural inputs with fallback to legacy singletons so older
     saved sessions still produce meaningful output. */
  const solutions: EndpointCoverage[] = input.solutions ?? [];
  const serverOSes: string[] = input.serverOSes ?? (input.serverOS ? [input.serverOS] : []);
  const vdiPlatforms: string[] = input.vdiPlatforms ?? (input.vdiPlatform ? [input.vdiPlatform] : []);
  const browsers: string[] = input.browsers ?? (input.primaryBrowser ? [input.primaryBrowser] : []);

  /* ── OS compatibility ─────────────────────────────────────────── */
  const osMatrixRows: { row: EndpointMatrixOSRow; family: 'Windows' | 'macOS' | 'VDI' }[] = [
    ...matrix.windows.filter((r) => rowMatchesSolutions(r.coverage, solutions)).map((r) => ({ row: r, family: 'Windows' as const })),
    ...matrix.macos.filter((r) => rowMatchesSolutions(r.coverage, solutions)).map((r) => ({ row: r, family: 'macOS' as const })),
    ...matrix.vdi.filter((r) => rowMatchesSolutions(r.coverage, solutions)).map((r) => ({ row: r, family: 'VDI' as const })),
  ];

  const selectedOSes = new Set([
    ...input.osEnvironment,
    ...serverOSes,
    ...vdiPlatforms,
  ].filter(Boolean));

  for (const os of selectedOSes) {
    /* Loose match: row.platform contains the user's selected OS or vice-versa. */
    const match = osMatrixRows.find(({ row }) =>
      row.platform.toLowerCase().includes(os.toLowerCase())
      || os.toLowerCase().includes(row.platform.toLowerCase())
    );
    if (!match) {
      osRows.push({
        os,
        minAgentRequired: '—',
        customerAgentCompatible: true,
        status: 'SUPPORTED',
        note: 'Not in the imported support matrix — verify manually with Forcepoint support.',
      });
      continue;
    }
    const min = minVersionFromRow(match.row.supportedFrom);
    const eos = match.row.status === 'eos';
    const meets = customerMeetsMin(customer, min);

    let status: 'SUPPORTED' | 'AT_RISK' | 'EOS';
    let note: string;
    if (eos) {
      status = 'EOS';
      note = match.row.note || `OS support ended — last supported agent ${match.row.supportedFrom}.`;
      findings.push({
        id: newFindingId(nextId++),
        severity: 'CRITICAL',
        title: `${match.row.platform} is past End-of-Support`,
        description: `Customer is running ${match.row.platform}, which Forcepoint no longer supports on the endpoint. Agents will continue to function but receive no fixes, and any new defect is out of scope for vendor remediation.`,
        affectedComponents: [match.row.platform],
        affectedEndpoints: input.totalEndpoints,
        affectedPct: '100%',
        recommendation: `Migrate endpoints off ${match.row.platform} to a supported OS, or accept the documented compatibility risk in writing.`,
      });
    } else if (!meets) {
      status = 'AT_RISK';
      note = `Minimum agent ${match.row.supportedFrom} required; customer is on ${input.agentVersion || 'unknown'}.`;
      findings.push({
        id: newFindingId(nextId++),
        severity: 'HIGH',
        title: `Endpoint agent below minimum for ${match.row.platform}`,
        description: `The deployed F1E agent (${input.agentVersion || 'not specified'}) sits below the floor Forcepoint certifies for ${match.row.platform}. New OS features may not be inspected correctly until the agent is upgraded.`,
        affectedComponents: [match.row.platform],
        affectedEndpoints: input.totalEndpoints,
        affectedPct: '100%',
        recommendation: `Upgrade endpoints to F1E ${match.row.supportedFrom.split(/[,;·]/)[0].trim() || '26.02'} or later.`,
      });
    } else {
      status = 'SUPPORTED';
      note = match.row.note || `Supported with F1E ${match.row.supportedFrom}.`;
    }
    osRows.push({
      os: match.row.platform,
      minAgentRequired: match.row.supportedFrom || '—',
      customerAgentCompatible: meets && !eos,
      status,
      note,
    });
  }

  /* ── Browser compatibility ──────────────────────────────────────
     Only the browsers the analyst actually selected on the left panel
     are checked. With nothing selected, the Browser Compatibility card
     stays empty — no findings, no rows. Each selected browser is matched
     against the matrix by case-insensitive contains in either direction. */
  const browserKeywords = browsers.map((b) => b.toLowerCase()).filter(Boolean);
  const browsersToAssess: EndpointMatrixBrowserRow[] = browserKeywords.length === 0
    ? []
    : matrix.browsers
        .filter((b) => rowMatchesSolutions(b.coverage, solutions))
        .filter((b) => {
          const bn = b.browser.toLowerCase();
          return browserKeywords.some((kw) => bn.includes(kw) || kw.includes(bn));
        });

  /* Track whether we already surfaced the "latest recommended" advisory for
     Chromium-family browsers — emit it once, not per-row, to keep the
     findings list tight. */
  let mv3AdvisoryEmitted = false;

  /* MV3 is a DLP-endpoint concern only — the F1E browser extension that
     mediates clipboard / upload inspection is DLP-side. Web Security Hybrid
     mode does not surface MV3 as a gap, so we suppress both the row badge
     and the soft advisory finding when DLP isn't in scope. */
  const dlpInScope = solutions.includes('dlp');

  for (const b of browsersToAssess) {
    const min = minVersionFromRow(b.minAgent);
    const meets = customerMeetsMin(customer, min);
    const needsMV3 = dlpInScope && browserNeedsMV3Coverage(b.browser);
    /* MV3 is shipped in the agent streams already cited as compatible by
       the support matrix (25.02+, 25.03+, 24.06+ all carry MV3-capable
       browser extensions). The "current floor" check below produces only
       a soft advisory, never a critical gap — agents on a non-current
       stream still deliver MV3 inspection, the latest stream is just the
       most stable. */
    const belowCurrentFloor = needsMV3 && customer && compareVersions(customer, FORCEPOINT_LATEST_FLOOR) < 0;

    let status: CompatibilityStatus;
    let note: string;
    if (!meets) {
      status = 'AT_RISK';
      note = `Minimum agent ${b.minAgent} required; customer is on ${input.agentVersion || 'unknown'}.`;
      findings.push({
        id: newFindingId(nextId++),
        severity: 'HIGH',
        title: `${b.browser} (${b.platform}) requires a newer F1E agent`,
        description: `The customer's deployed agent is below the certified minimum for ${b.browser} ${b.versions}. Browser-channel DLP may behave unpredictably until the agent is brought to v${b.minAgent}.`,
        affectedComponents: [`${b.browser} (${b.platform})`],
        affectedEndpoints: input.totalEndpoints,
        affectedPct: '100%',
        recommendation: `Schedule a coordinated F1E upgrade to ${b.minAgent} ahead of the next browser refresh cycle.`,
      });
    } else {
      status = 'SUPPORTED';
      note = b.notes || `Supported on F1E ${b.minAgent}.`;
    }

    /* Soft advisory — single MEDIUM finding the first time we see a
       Chromium browser while the customer is on a pre-26.02 stream.
       Communicates "supported now, but latest is more stable" without
       inflating the CRITICAL list. */
    if (belowCurrentFloor && !mv3AdvisoryEmitted && meets) {
      mv3AdvisoryEmitted = true;
      findings.push({
        id: newFindingId(nextId++),
        severity: 'MEDIUM',
        title: 'Plan upgrade to F1E v26.02+ for the most stable MV3 coverage',
        description: `The customer's agent (${input.agentVersion}) carries an MV3-capable browser extension and is fully supported for Chromium browsers. Forcepoint's latest stream (v26.02+) is the recommended baseline going forward — it includes additional MV3 hardening and is the version Forcepoint will prioritise for incident fixes.`,
        affectedComponents: ['Chromium-family browsers'],
        affectedEndpoints: input.totalEndpoints,
        affectedPct: '100%',
        recommendation: 'Plan a phased upgrade to F1E v26.02+ during the next maintenance window — no urgency, this is a stability improvement, not a coverage gap.',
      });
    }

    brRows.push({
      browser: b.browser,
      platform: b.platform,
      minAgentRequired: b.minAgent,
      mv3Required: needsMV3,
      customerAgentCompatible: meets,
      status,
      note,
    });
  }

  /* ── Critical notes from matrix ───────────────────────────────── */
  /* Carry matrix-level notes into the assessment. The operator can toggle
     `includeInReport` per note; default is on for CRITICAL/HIGH only as
     the user specified. */
  const sevMap: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM'> = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
  };
  const criticalNotes: CriticalNoteRow[] = matrix.criticalNotes.map((n) => ({
    severity: sevMap[n.severity] ?? 'MEDIUM',
    title: n.title,
    description: n.body,
    includeInReport: n.severity === 'critical' || n.severity === 'high',
  }));

  /* ── Aggregate compatibility status ───────────────────────────── */
  const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
  const hasHigh = findings.some((f) => f.severity === 'HIGH');
  let compatibilityStatus: CompatibilityStatus;
  if (hasCritical) compatibilityStatus = 'CRITICAL';
  else if (hasHigh) compatibilityStatus = 'AT_RISK';
  else compatibilityStatus = 'SUPPORTED';

  /* Agent already on the current GA floor → SUPPORTED regardless of soft
     advisory MEDIUM notes. Only real evidence (HIGH / CRITICAL findings)
     can flip the verdict back. */
  if (customer && compareVersions(customer, FORCEPOINT_LATEST_FLOOR) >= 0 && !hasCritical && !hasHigh) {
    compatibilityStatus = 'SUPPORTED';
  }

  /* ── Upgrade recommendation ───────────────────────────────────── */
  const minimumRequiredAgent = '26.02';
  let upgradeRequired = false;
  let upgradeRec: UpgradeRecommendation | null = null;

  if (customer && compareVersions(customer, FORCEPOINT_LATEST_FLOOR) < 0) {
    /* Customer is below the current GA floor — recommend an upgrade.
       Urgency is driven by ACTUAL findings, not by the floor distance
       (a supported-but-old agent isn't urgent; an EoS OS is). */
    upgradeRequired = true;
    const urgency: Urgency = hasCritical ? 'IMMEDIATE' : hasHigh ? 'SHORT_TERM' : 'PLANNED';
    upgradeRec = {
      targetVersion: '26.02',
      urgency,
      rationale: hasCritical
        ? 'Customer fleet has at least one critical compatibility gap (EoS OS or below the minimum agent for a deployed browser). Upgrading the F1E agent is on the critical path to closing that gap.'
        : hasHigh
          ? 'Customer fleet sits below the minimum agent stream certified for at least one OS / browser combination. Upgrading aligns the fleet with the supported baseline.'
          : 'The deployed agent is fully compatible with the current customer environment. Upgrading to v26.02+ is a stability improvement — it is Forcepoint\'s current GA stream and the version prioritised for incident fixes and MV3 hardening.',
      deploymentNote: 'Plan a phased rollout (pilot 5%, broad deployment after 1 week of telemetry). v26.02 deployments do not require an endpoint restart on Windows; macOS requires Full Disk Access to be reconfirmed after install.',
    };
  } else if (!customer) {
    upgradeRequired = true;
    upgradeRec = {
      targetVersion: '26.02',
      urgency: 'PLANNED',
      rationale: 'Agent version could not be parsed from telemetry. Verify the deployed build and confirm it sits on a supported stream (v24.06+, v25.02+, or v26.02).',
      deploymentNote: 'Capture agent version from the F1E management server before planning an upgrade.',
    };
  }

  return {
    customerAgentVersion: input.agentVersion,
    compatibilityStatus,
    minimumRequiredAgent,
    upgradeRequired,
    findings,
    osCompatibility: osRows,
    browserCompatibility: brRows,
    criticalNotes,
    upgradeRecommendation: upgradeRec,
    computedAt: new Date().toISOString(),
  };
}

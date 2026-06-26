import { useState, useCallback, useEffect, useRef } from 'react';
import { NavigationRail, type ActiveView } from './NavigationRail';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { SidePanel } from './SidePanel';
import { TemplateManager, initialTemplates } from './TemplateManager';
import { SessionsPage } from './SessionsPage';
import { BottomPanel } from './BottomPanel';
import { VersionDataPage } from './VersionDataPage';
import { EndpointMatrixPage } from './EndpointMatrixPage';
import { DestinationPatternsPage } from './DestinationPatternsPage';
import { VersionUpgradeCatalogPage } from './VersionUpgradeCatalogPage';
import { HelpGuidePage } from './HelpGuidePage';
import { UserManagementPage } from './UserManagementPage';
import { CancelSessionModal } from './CancelSessionModal';
import type { Template } from './types/templates';
import type { QuestionAnswer, TemplateAnswers } from './rules/ruleEngine';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STEP_COLORS, STEP_TITLES, TOTAL_STEPS, isStepSkipped, nextVisibleStep } from '../constants/steps';
import { INITIAL_VERSION_DATA, type VersionDataStore } from '../constants/versionData';
import { EMPTY_ENDPOINT_MATRIX, type EndpointSupportMatrix } from '../constants/endpointSupportMatrix';
import type { VersionEntry } from './steps/Step4VersionCheck';
import { DEFAULT_SERVERS, type ServerEntry } from './steps/StepServerDetails';
import type { Recommendation } from './steps/Step8Recommendations';
import type { ActionItem } from './steps/Step9NextSteps';
import type { FeatureRequest } from './steps/Step10FeatureRequests';
import { DEFAULT_SQL_CONFIG, DEFAULT_API_CONNECTORS, type SqlConfig, type ApiConnectorsConfig } from './steps/Step3DataCollectors';
import type { DlpServerBundle } from './steps/dlpServerInfoParser';
import type { ParsedCertificate } from './steps/certificateParser';
import type { EndpointAgentSummary } from './steps/endpointAgentParser';
import type { DlpDashboardSummary } from './steps/dlpDashboardParser';
import type { DlpAllLogReport } from './steps/dlpAllLogParser';
import type { AuditSystemLogsReport } from './steps/auditSystemLogsParser';
import type { ServiceLogsReport } from './steps/dlpServiceLogsParser';
import { type DlpPostureSummary, type DlpPostureBlockId, type DestinationPatterns, DEFAULT_POSTURE_SECTIONS, DEFAULT_DESTINATION_PATTERNS } from './steps/dlpPosture';
import { type CustomerConnectorConfig, DEFAULT_CUSTOMER_CONNECTOR } from './steps/customerConnector';
import type { VersionUpgradeProposal } from './steps/StepVersionUpgrades';
import { EMPTY_COMPAT_INPUT, type EndpointCompatibilityInput, type EndpointCompatibilityAssessment } from '../utils/endpointCompatibilityEngine';
import type { ReportRunResult } from '../constants/reportDefinitions';
/* `ALL_REPORT_IDS` no longer imported here — the default for `selectedReports`
   is now an empty array. Analysts opt-in reports per session. */

export interface LicenseItem {
  id: string;
  product: string;
  productCode?: string;       // SW-WB-OP-S-WSPA, FDLPEIP, etc.
  quantity: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  expiry: string;
  startDate?: string;          // ISO YYYY-MM-DD
  deploymentType?: string;     // Hybrid, On-Premise, Cloud, N/A
  supportLevel?: string;       // Essential, Enhanced, Enterprise
}

export interface EntitlementItem {
  id: string;
  name: string;                // e.g. "Enhanced-Akbank"
  type: string;                // e.g. "Phone Support"
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  startDate: string;           // ISO YYYY-MM-DD
  endDate: string;             // ISO YYYY-MM-DD
}

export interface CaseItem {
  id: string;
  caseNumber: string;
  severity: 'S1' | 'S2' | 'S3' | 'S4';
  title: string;
  date: string;
  product: string;
  statusLabel: string;
  openedBy?: string;     // Customer-side contact who raised the case
  caseOwner?: string;    // Forcepoint engineer assigned
  origin?: string;       // e.g. Self Service, Portal, Phone
}

export interface FeatureRequestItem {
  id: string;
  title: string;
  product: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  votes: number;
  reference?: string;          // e.g. AFR2229
  productFamily?: string;      // e.g. "On-prem / Hybrid Web"
  status?: string;             // Salesforce status: "New", "Reviewed", "Planned", "Delivered"
  disposition?: string;        // "Plan to implement", "Won't fix", etc.
  customerStatus?: string;
  createdDate?: string;
}

export interface HardwareItem {
  id: string;
  model: string;
  serial: string;
  purchased: string;
  units: number;
  productCode?: string;     // e.g. V20KG1, V20KEHW12
  warranty?: string;        // e.g. "36 months onsite" or warranty expiry date
  status?: string;          // Active / Decommissioned
  warrantyStatus?: string;  // Active / Expired
  hardwareEol?: string;     // EoL date if known
}

export interface LicenseGapItem {
  id: string;
  product: string;
  productCode?: string;
  currentQuantity?: string;       // existing entitlement count (free text)
  recommendedAdditional: string;  // how many additional licenses to add
  priority?: 'critical' | 'high' | 'medium' | 'low';
  rationale?: string;
}

/* Compliance Framework selection for the Part 0 · Compliance Exposure section.
   Auto-suggested from country/industry on first visit, then user can toggle,
   edit content, add custom frameworks, or remove. Empty array = "no entries
   yet" — the user should run Auto-suggest to populate. */
export interface ComplianceFrameworkItem {
  id: string;
  code: string;        // e.g. KVKK, BDDK, GDPR
  name: string;        // Full descriptive name
  relevance: string;   // Why this applies to the customer
  pillar: string;      // Category badge: Data Protection / Sectoral · Banking / Universal
  enabled: boolean;    // Appears in report when true
  isCustom?: boolean;  // User-added (not from the auto-suggest catalogue)
  /** Analyst's assessment of whether the customer's Forcepoint DLP deployment
      satisfies this framework. 'unassessed' (or undefined) renders neutral. */
  complianceStatus?: 'compliant' | 'partial' | 'non_compliant' | 'unassessed';
}

/* Per-session content overrides for Recommended Enhancements.
   Keys are enhancement IDs; only the fields the user changed are stored — the
   rest still come from the ENHANCEMENTS catalogue at render time. */
export interface EnhancementOverride {
  name?: string;
  tagline?: string;
  whyWeRecommendIt?: string;
  businessValue?: string;
}

export interface SessionData {
  customerName: string;
  forcepointId: string;
  industry: string;
  country: string;
  csm: string;
  accountOwner: string;
  salesEngineer: string;
  partner: string;
  licenses: LicenseItem[];
  cases: CaseItem[];
  featureRequests: FeatureRequestItem[];
  hardware: HardwareItem[];
  // Extended customer profile fields (populated by the Salesforce JSON import)
  city?: string;
  theatre?: string;                  // e.g. EMEA, APAC, AMER
  region?: string;                   // e.g. META, NEMEA, etc.
  supportLevel?: string;             // Current contract level
  recommendedSupportLevel?: string;  // Suggested upgrade level
  channelAccountManager?: string;    // Forcepoint CAM
  distributor?: string;              // Separate from reseller
  entitlements?: EntitlementItem[];  // Non-license support entitlements
}

export interface HCSession {
  id: string;
  customerName: string;
  forcepointId: string;
  sessionData: SessionData;
  currentStep: number;
  selectedProducts: Record<string, boolean>;
  checklistAnswers: TemplateAnswers;
  versionEntries: Record<string, VersionEntry>;
  serverDetails: ServerEntry[];
  recommendations: Recommendation[];
  actionItems: ActionItem[];
  featureRequests: FeatureRequest[];
  sqlConfig: SqlConfig;
  apiConnectors: ApiConnectorsConfig;
  selectedReports: string[];
  dlpBundles: DlpServerBundle[];
  certificates: ParsedCertificate[];
  selectedEnhancements: string[];
  licenseGaps: LicenseGapItem[];
  endpointAgentSummary: EndpointAgentSummary | null;
  dlpDashboardSummary: DlpDashboardSummary | null;
  /* Parsed result of `\Data Security\tomcat\logs\dlp\dlp-all.log`
     analyzer (Step 3 → DLP Server Info card). */
  dlpAllLogReport: DlpAllLogReport | null;
  /* Parsed result of `\SQL queries\AUDIT_SYSTEM_LOGS.csv` analyzer. */
  auditLogReport: AuditSystemLogsReport | null;
  /* Cross-correlated analyzer over `\Data Security\Logs\` service logs
     (FPR/EndPointServer/PolicyEngine/mgmtd/HealthCheck/WorkScheduler/...). */
  serviceLogsReport: ServiceLogsReport | null;
  /* Star + dismiss state for log findings — keys are `${scope}:${id}`. */
  starredLogIssues: Record<string, true>;
  dismissedLogIssues: Record<string, true>;
  dlpPostureSummary: DlpPostureSummary | null;
  /* Per-block visibility map driving which posture cards make it into
     the report. Replaces the old `includeDlpPostureInReport` master
     switch — at least one block must be true for the section to render. */
  dlpPostureSections: Record<DlpPostureBlockId, boolean>;
  customerConnector: CustomerConnectorConfig;
  customerLogo: string | null;
  complianceFrameworks: ComplianceFrameworkItem[];
  enhancementOverrides: Record<string, EnhancementOverride>;
  versionUpgrades: VersionUpgradeProposal[];
  endpointCompatInput: EndpointCompatibilityInput;
  endpointCompatAssessment: EndpointCompatibilityAssessment | null;
  savedAt: Date;
  /* Set when the operator clicks Done on the final wizard step. Sessions
     reached the last step but never explicitly closed retain this as null
     (so the list can tell "drafting" apart from "shipped"). */
  completedAt: Date | null;
}

const EMPTY_SESSION_DATA: SessionData = {
  customerName: '', forcepointId: '', industry: '', country: '',
  csm: '', accountOwner: '', salesEngineer: '', partner: '',
  licenses: [], cases: [], featureRequests: [], hardware: [],
  city: '', theatre: '', region: '',
  supportLevel: '', recommendedSupportLevel: '',
  channelAccountManager: '', distributor: '',
  entitlements: [],
};

function deserializeSessions(raw: unknown[]): HCSession[] {
  return raw.map((s: unknown) => {
    const session = s as HCSession & { savedAt: string | Date; completedAt?: string | Date | null };
    return {
      ...session,
      savedAt: new Date(session.savedAt),
      completedAt: session.completedAt ? new Date(session.completedAt) : null,
      checklistAnswers: session.checklistAnswers ?? {},
      versionEntries: session.versionEntries ?? {},
      serverDetails: session.serverDetails ?? DEFAULT_SERVERS,
      recommendations: session.recommendations ?? [],
      actionItems: session.actionItems ?? [],
      featureRequests: session.featureRequests ?? [],
      sqlConfig: session.sqlConfig ?? DEFAULT_SQL_CONFIG,
      apiConnectors: session.apiConnectors ?? DEFAULT_API_CONNECTORS,
      selectedReports: session.selectedReports ?? [],
      dlpBundles: session.dlpBundles ?? [],
      certificates: session.certificates ?? [],
      selectedEnhancements: session.selectedEnhancements ?? [],
      licenseGaps: session.licenseGaps ?? [],
      endpointAgentSummary: session.endpointAgentSummary ?? null,
      dlpDashboardSummary: session.dlpDashboardSummary ?? null,
      dlpAllLogReport: session.dlpAllLogReport ?? null,
      auditLogReport: session.auditLogReport ?? null,
      serviceLogsReport: session.serviceLogsReport ?? null,
      starredLogIssues: session.starredLogIssues ?? {},
      dismissedLogIssues: session.dismissedLogIssues ?? {},
      dlpPostureSummary: session.dlpPostureSummary ?? null,
      /* Merge with defaults so old sessions get the full block set; if the
         legacy `includeDlpPostureInReport` flag was false, leave the
         section map all-false so the report stays hidden until the user
         re-opts-in. */
      dlpPostureSections: session.dlpPostureSections
        ?? ((session as { includeDlpPostureInReport?: boolean }).includeDlpPostureInReport === false
            ? Object.fromEntries(Object.keys(DEFAULT_POSTURE_SECTIONS).map((k) => [k, false])) as Record<DlpPostureBlockId, boolean>
            : { ...DEFAULT_POSTURE_SECTIONS }),
      customerConnector: session.customerConnector ?? { ...DEFAULT_CUSTOMER_CONNECTOR },
      customerLogo: session.customerLogo ?? null,
      complianceFrameworks: session.complianceFrameworks ?? [],
      enhancementOverrides: session.enhancementOverrides ?? {},
      versionUpgrades: session.versionUpgrades ?? [],
      endpointCompatInput: session.endpointCompatInput ?? { ...EMPTY_COMPAT_INPUT },
      endpointCompatAssessment: session.endpointCompatAssessment ?? null,
    };
  });
}

export function Dashboard() {
  /* Default landing view on logon is the Sessions list — operator
     usually wants to either resume an in-progress engagement or start
     a fresh one from there, rather than landing on a half-empty
     wizard. Click "Health Check Wizard" in the nav rail (or the
     "Start new session" button in the Sessions list) to enter the
     wizard explicitly. */
  const [activeView, setActiveView] = useState<ActiveView>('sessions');

  /* ── Wizard state ── */
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionData, setSessionData] = useState<SessionData>(EMPTY_SESSION_DATA);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});

  /* ── Templates state (persisted) ── */
  const [templates, setTemplates] = useLocalStorage<Template[]>('hc_templates', initialTemplates);

  /* ── Checklist answers (persisted across reloads, overwritten on session load) ── */
  const [checklistAnswers, setChecklistAnswers] = useLocalStorage<TemplateAnswers>('hc_checklist_answers', {});

  /* ── Version check entries (persisted across reloads, overwritten on session load) ── */
  const [versionEntries, setVersionEntries] = useLocalStorage<Record<string, VersionEntry>>('hc_version_entries', {});

  /* ── Session-bound data (lifted so save/load/reset all work) ── */
  const [serverDetails,   setServerDetails]   = useLocalStorage<ServerEntry[]>('hc_server_details', DEFAULT_SERVERS);
  const [recommendations, setRecommendations] = useLocalStorage<Recommendation[]>('hc_recommendations', []);
  const [actionItems,     setActionItems]     = useLocalStorage<ActionItem[]>('hc_action_items', []);
  const [featureRequests, setFeatureRequests] = useLocalStorage<FeatureRequest[]>('hc_feature_requests', []);
  const [sqlConfig,       setSqlConfig]       = useLocalStorage<SqlConfig>('hc_sql_config', DEFAULT_SQL_CONFIG);
  const [apiConnectors,   setApiConnectors]   = useLocalStorage<ApiConnectorsConfig>('hc_api_connectors', DEFAULT_API_CONNECTORS);
  const [selectedReports, setSelectedReports] = useLocalStorage<string[]>('hc_selected_reports', []);
  /* Per-report time-window override; persisted alongside selection so a
     reopened session remembers "give me last-7-days for these reports". */
  const [reportWindows, setReportWindows] = useLocalStorage<Record<string, number>>('hc_report_windows', {});
  /* Runtime results of executed report queries — explicitly NOT persisted.
     Held in plain useState so they survive between wizard steps but vanish
     on refresh (matches the user's "runtime only" requirement). */
  const [reportRuns, setReportRuns] = useState<Record<string, ReportRunResult>>({});
  const [dlpBundles,      setDlpBundles]      = useLocalStorage<DlpServerBundle[]>('hc_dlp_bundles', []);
  const [certificates,    setCertificates]    = useLocalStorage<ParsedCertificate[]>('hc_certificates', []);
  const [selectedEnhancements, setSelectedEnhancements] = useLocalStorage<string[]>('hc_enhancements', []);
  const [licenseGaps, setLicenseGaps] = useLocalStorage<LicenseGapItem[]>('hc_license_gaps', []);
  const [endpointAgentSummary, setEndpointAgentSummary] = useLocalStorage<EndpointAgentSummary | null>('hc_endpoint_agents', null);
  const [dlpDashboardSummary, setDlpDashboardSummary] = useLocalStorage<DlpDashboardSummary | null>('hc_dlp_dashboard', null);
  const [dlpAllLogReport, setDlpAllLogReport] = useLocalStorage<DlpAllLogReport | null>('hc_dlp_log_issues', null);
  const [auditLogReport, setAuditLogReport] = useLocalStorage<AuditSystemLogsReport | null>('hc_audit_log_issues', null);
  const [serviceLogsReport, setServiceLogsReport] = useLocalStorage<ServiceLogsReport | null>('hc_service_logs_report', null);
  /* Star/dismiss tracking for log findings. Both are keyed by
     `${scope}:${issueId}` so the same id survives a re-parse — the
     parser emits stable bucket ids by design. */
  const [starredLogIssues, setStarredLogIssues] = useLocalStorage<Record<string, true>>('hc_log_starred', {});
  const [dismissedLogIssues, setDismissedLogIssues] = useLocalStorage<Record<string, true>>('hc_log_dismissed', {});
  const [dlpPostureSummary, setDlpPostureSummary] = useLocalStorage<DlpPostureSummary | null>('hc_dlp_posture', null);
  const [dlpPostureSections, setDlpPostureSections] = useLocalStorage<Record<DlpPostureBlockId, boolean>>('hc_dlp_posture_sections', { ...DEFAULT_POSTURE_SECTIONS });
  /* Destination patterns are GLOBAL (catalogue-style): the operator
     manages the GenAI / SaaS / Webmail substring lists from the
     "GenAI Apps" navigation rail entry, shared across every session. */
  const [destinationPatterns, setDestinationPatterns] = useLocalStorage<DestinationPatterns>('hc_destination_patterns', { ...DEFAULT_DESTINATION_PATTERNS });
  /* Customer Connector — outbound-only agent the customer installs at
     their site. Session-scoped: the token / encryption key are tied to a
     specific HC engagement so a single SE can run two customers in
     parallel without cross-talk. */
  const [customerConnector, setCustomerConnector] = useLocalStorage<CustomerConnectorConfig>('hc_customer_connector', { ...DEFAULT_CUSTOMER_CONNECTOR });
  const [customerLogo, setCustomerLogo] = useLocalStorage<string | null>('hc_customer_logo', null);
  const [complianceFrameworks, setComplianceFrameworks] = useLocalStorage<ComplianceFrameworkItem[]>('hc_compliance_frameworks', []);
  const [enhancementOverrides, setEnhancementOverrides] = useLocalStorage<Record<string, EnhancementOverride>>('hc_enhancement_overrides', {});
  const [versionUpgrades, setVersionUpgrades] = useLocalStorage<VersionUpgradeProposal[]>('hc_version_upgrades', []);
  /* Global catalog of reusable upgrade proposals — independent from any
     session, edited via the "Version & Release Catalog" left-rail page.
     The wizard's Version Upgrade Proposals step reads this catalog to
     offer a one-click "Add from Catalog" picker. */
  const [versionUpgradeCatalog, setVersionUpgradeCatalog] = useLocalStorage<VersionUpgradeProposal[]>('hc_version_upgrade_catalog', []);
  const [endpointCompatInput, setEndpointCompatInput] = useLocalStorage<EndpointCompatibilityInput>('hc_endpoint_compat_input', { ...EMPTY_COMPAT_INPUT });
  const [endpointCompatAssessment, setEndpointCompatAssessment] = useLocalStorage<EndpointCompatibilityAssessment | null>('hc_endpoint_compat_assessment', null);

  /* ── Endpoint OS / Browser support matrix (global catalogue, persisted).
     Populated by the operator from the OS / Browser Support Matrix page;
     the HC report's Endpoint Compatibility section reads from this. Empty
     by default — the report section is suppressed until data is imported. */
  const [rawEndpointMatrix, setEndpointMatrix] = useLocalStorage<EndpointSupportMatrix>('hc_endpoint_support_matrix', EMPTY_ENDPOINT_MATRIX);
  /* Normalise the matrix shape on every read — defends downstream code (the
     report builder, the matrix page) against older payloads that may be
     missing fields the UI now assumes are arrays. */
  const endpointMatrix: EndpointSupportMatrix = {
    lastUpdated:   rawEndpointMatrix?.lastUpdated   ?? '',
    source:        rawEndpointMatrix?.source        ?? '',
    windows:       Array.isArray(rawEndpointMatrix?.windows)       ? rawEndpointMatrix.windows       : [],
    windowsNotes:  Array.isArray(rawEndpointMatrix?.windowsNotes)  ? rawEndpointMatrix.windowsNotes  : [],
    macos:         Array.isArray(rawEndpointMatrix?.macos)         ? rawEndpointMatrix.macos         : [],
    macosNotes:    Array.isArray(rawEndpointMatrix?.macosNotes)    ? rawEndpointMatrix.macosNotes    : [],
    vdi:           Array.isArray(rawEndpointMatrix?.vdi)           ? rawEndpointMatrix.vdi           : [],
    browsers:      Array.isArray(rawEndpointMatrix?.browsers)      ? rawEndpointMatrix.browsers      : [],
    criticalNotes: Array.isArray(rawEndpointMatrix?.criticalNotes) ? rawEndpointMatrix.criticalNotes : [],
  };

  /* ── Version data catalog (persisted) ── */
  const [rawVersionData, setVersionData] = useLocalStorage<VersionDataStore>('hc_version_data', INITIAL_VERSION_DATA);
  const versionData: VersionDataStore = {
    'Forcepoint Email Security': rawVersionData['Forcepoint Email Security'] ?? [],
    'Forcepoint Web Security': rawVersionData['Forcepoint Web Security'] ?? [],
    'Forcepoint Data Security': rawVersionData['Forcepoint Data Security'] ?? [],
    'Forcepoint DSPM': rawVersionData['Forcepoint DSPM'] ?? [],
    'Forcepoint Data Classification (FDC)': rawVersionData['Forcepoint Data Classification (FDC)'] ?? [],
    'DLP + Web Endpoint Agent': rawVersionData['DLP + Web Endpoint Agent'] ?? [],
    'AMDP': rawVersionData['AMDP'] ?? [],
    'V Series Appliances': rawVersionData['V Series Appliances'] ?? [],
    'NGFW Appliances': rawVersionData['NGFW Appliances'] ?? [],
  };

  /* Auto-correct: if the current step has become invisible (e.g. user
     deselected DLP while on the Endpoint Agent Analysis step), advance
     forward to the next visible step. The forward direction is chosen so
     prior work stays "behind" the cursor rather than being walked back over. */
  useEffect(() => {
    if (isStepSkipped(currentStep, selectedProducts)) {
      setCurrentStep((s) => nextVisibleStep(s, 1, selectedProducts));
    }
  }, [selectedProducts, currentStep]);

  /* ── Sessions state (persisted) ── */
  const [rawSessions, setRawSessions] = useLocalStorage<unknown[]>('hc_sessions', []);
  const sessions: HCSession[] = deserializeSessions(rawSessions);

  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  /* Mirror of activeSessionId readable synchronously inside handleSave —
     lets autosave lock the session id the instant the first save fires so
     rapid back-to-back step changes all target one session instead of
     spawning duplicates during the async save window. */
  const activeSessionIdRef = useRef<string | undefined>(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  /* ── Right side-panel (profile) ── */
  const [showProfile, setShowProfile] = useState(false);

  /* ── Cancel-session modal ── */
  const [showCancelModal, setShowCancelModal] = useState(false);

  /* ── Helpers ── */
  const updateSessionData = useCallback((updates: Partial<SessionData>) => {
    setSessionData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleAnswerChange = useCallback((qId: string, answer: QuestionAnswer) => {
    setChecklistAnswers((prev) => ({ ...prev, [qId]: answer }));
  }, [setChecklistAnswers]);

  const handleVersionEntriesChange = useCallback(
    (updater: ((prev: Record<string, VersionEntry>) => Record<string, VersionEntry>) | Record<string, VersionEntry>) => {
      setVersionEntries(updater as Parameters<typeof setVersionEntries>[0]);
    },
    [setVersionEntries],
  );

  const handleSave = (opts?: { complete?: boolean }) => {
    setSaveState('saving');
    /* Resolve + lock the session id synchronously (before the async save
       window) so concurrent autosaves reuse the same id rather than each
       minting a fresh `session-<ts>`. */
    const lockedId = activeSessionIdRef.current && sessions.find((s) => s.id === activeSessionIdRef.current)
      ? activeSessionIdRef.current
      : `session-${Date.now()}`;
    activeSessionIdRef.current = lockedId;
    setActiveSessionId(lockedId);
    setTimeout(() => {
      const id = lockedId;

      /* Preserve an existing completedAt if the user is just re-saving a
         session that was already marked complete. Setting `complete: true`
         stamps it fresh. */
      const existing = sessions.find((s) => s.id === id);
      const completedAt = opts?.complete
        ? new Date()
        : (existing?.completedAt ?? null);

      const newSession: HCSession = {
        id,
        customerName: sessionData.customerName || 'Unnamed Session',
        forcepointId: sessionData.forcepointId || '',
        sessionData: { ...sessionData },
        currentStep,
        selectedProducts: { ...selectedProducts },
        checklistAnswers: { ...checklistAnswers },
        versionEntries: { ...versionEntries },
        serverDetails: [...serverDetails],
        recommendations: [...recommendations],
        actionItems: [...actionItems],
        featureRequests: [...featureRequests],
        sqlConfig: { ...sqlConfig },
        apiConnectors: { ...apiConnectors, dlpApi: { ...apiConnectors.dlpApi }, vSeries: { ...apiConnectors.vSeries }, ngfwSmc: { ...apiConnectors.ngfwSmc } },
        selectedReports: [...selectedReports],
        dlpBundles: [...dlpBundles],
        certificates: [...certificates],
        selectedEnhancements: [...selectedEnhancements],
        licenseGaps: [...licenseGaps],
        endpointAgentSummary: endpointAgentSummary ? { ...endpointAgentSummary } : null,
        dlpDashboardSummary: dlpDashboardSummary ? { ...dlpDashboardSummary } : null,
        dlpAllLogReport: dlpAllLogReport ? { ...dlpAllLogReport } : null,
        auditLogReport: auditLogReport ? { ...auditLogReport } : null,
        serviceLogsReport: serviceLogsReport ? { ...serviceLogsReport } : null,
        starredLogIssues: { ...starredLogIssues },
        dismissedLogIssues: { ...dismissedLogIssues },
        dlpPostureSummary: dlpPostureSummary ? { ...dlpPostureSummary } : null,
        dlpPostureSections: { ...dlpPostureSections },
        customerConnector: { ...customerConnector },
        customerLogo: customerLogo ?? null,
        complianceFrameworks: complianceFrameworks.map((f) => ({ ...f })),
        enhancementOverrides: { ...enhancementOverrides },
        versionUpgrades: versionUpgrades.map((v) => ({ ...v })),
        endpointCompatInput: { ...endpointCompatInput },
        endpointCompatAssessment: endpointCompatAssessment ? { ...endpointCompatAssessment } : null,
        savedAt: new Date(),
        completedAt,
      };

      setRawSessions((prevRaw) => {
        const prev = deserializeSessions(prevRaw);
        const idx = prev.findIndex((s) => s.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = newSession;
          return updated as unknown[];
        }
        return [newSession, ...prev] as unknown[];
      });

      setActiveSessionId(id);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2200);
    }, 650);
  };

  /* ── Autosave on every step transition ──
     Persist the whole wizard to the session store each time the operator
     moves to a different step (Next / Back, sidebar jump, or an auto-skip),
     so progress is never lost between tabs. A ref holds the freshest
     handleSave so this effect fires only on a real step change, not on
     every render. Skipped on the initial mount and while the session is
     still empty (no customer, no products, not yet saved) to avoid
     spawning blank "Unnamed Session" rows. */
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const lastSavedStepRef = useRef(currentStep);
  useEffect(() => {
    if (lastSavedStepRef.current === currentStep) return;
    lastSavedStepRef.current = currentStep;
    const hasContent =
      !!activeSessionId ||
      sessionData.customerName.trim() !== '' ||
      Object.values(selectedProducts).some(Boolean);
    if (!hasContent) return;
    handleSaveRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const handleComplete = () => {
    /* Save with the complete flag, then nudge the operator to the Sessions
       list where the new "COMPLETED" badge is visible. We don't wipe the
       wizard state — the operator can still reopen the session and tweak
       anything; clicking Done is a soft signal, not a hard close. */
    handleSave({ complete: true });
    setTimeout(() => setActiveView('sessions'), 1100);
  };

  const handleLoadSession = (session: HCSession) => {
    setSessionData(session.sessionData);
    setCurrentStep(session.currentStep);
    setSelectedProducts(session.selectedProducts);
    setChecklistAnswers(session.checklistAnswers ?? {});
    setVersionEntries(session.versionEntries ?? {});
    setServerDetails(session.serverDetails ?? DEFAULT_SERVERS);
    setRecommendations(session.recommendations ?? []);
    setActionItems(session.actionItems ?? []);
    setFeatureRequests(session.featureRequests ?? []);
    setSqlConfig(session.sqlConfig ?? DEFAULT_SQL_CONFIG);
    setApiConnectors(session.apiConnectors ?? DEFAULT_API_CONNECTORS);
    setSelectedReports(session.selectedReports ?? []);
    setDlpBundles(session.dlpBundles ?? []);
    setCertificates(session.certificates ?? []);
    setSelectedEnhancements(session.selectedEnhancements ?? []);
    setLicenseGaps(session.licenseGaps ?? []);
    setEndpointAgentSummary(session.endpointAgentSummary ?? null);
    setDlpDashboardSummary(session.dlpDashboardSummary ?? null);
    setDlpAllLogReport(session.dlpAllLogReport ?? null);
    setAuditLogReport(session.auditLogReport ?? null);
    setServiceLogsReport(session.serviceLogsReport ?? null);
    setStarredLogIssues(session.starredLogIssues ?? {});
    setDismissedLogIssues(session.dismissedLogIssues ?? {});
    setDlpPostureSummary(session.dlpPostureSummary ?? null);
    setDlpPostureSections(session.dlpPostureSections ?? { ...DEFAULT_POSTURE_SECTIONS });
    setCustomerConnector(session.customerConnector ?? { ...DEFAULT_CUSTOMER_CONNECTOR });
    setCustomerLogo(session.customerLogo ?? null);
    setComplianceFrameworks(session.complianceFrameworks ?? []);
    setEnhancementOverrides(session.enhancementOverrides ?? {});
    setVersionUpgrades(session.versionUpgrades ?? []);
    setEndpointCompatInput(session.endpointCompatInput ?? { ...EMPTY_COMPAT_INPUT });
    setEndpointCompatAssessment(session.endpointCompatAssessment ?? null);
    setActiveSessionId(session.id);
    setActiveView('wizard');
  };

  const handleNewSession = () => {
    setSessionData(EMPTY_SESSION_DATA);
    setCurrentStep(1);
    setSelectedProducts({});
    setChecklistAnswers({});
    setVersionEntries({});
    setServerDetails(DEFAULT_SERVERS);
    setRecommendations([]);
    setActionItems([]);
    setFeatureRequests([]);
    setSqlConfig(DEFAULT_SQL_CONFIG);
    setApiConnectors(DEFAULT_API_CONNECTORS);
    setSelectedReports([]);
    setDlpBundles([]);
    setCertificates([]);
    setSelectedEnhancements([]);
    setLicenseGaps([]);
    setEndpointAgentSummary(null);
    setDlpDashboardSummary(null);
    setDlpAllLogReport(null);
    setAuditLogReport(null);
    setServiceLogsReport(null);
    setStarredLogIssues({});
    setDismissedLogIssues({});
    setDlpPostureSummary(null);
    setDlpPostureSections({ ...DEFAULT_POSTURE_SECTIONS });
    setCustomerConnector({ ...DEFAULT_CUSTOMER_CONNECTOR });
    setCustomerLogo(null);
    setComplianceFrameworks([]);
    setEnhancementOverrides({});
    setVersionUpgrades([]);
    setEndpointCompatInput({ ...EMPTY_COMPAT_INPUT });
    setEndpointCompatAssessment(null);
    setActiveSessionId(undefined);
    setActiveView('wizard');
  };

  const handleCancel = () => setShowCancelModal(true);

  const confirmCancelSession = () => {
    setShowCancelModal(false);
    setSessionData(EMPTY_SESSION_DATA);
    setCurrentStep(1);
    setSelectedProducts({});
    setChecklistAnswers({});
    setVersionEntries({});
    setServerDetails(DEFAULT_SERVERS);
    setRecommendations([]);
    setActionItems([]);
    setFeatureRequests([]);
    setSqlConfig(DEFAULT_SQL_CONFIG);
    setApiConnectors(DEFAULT_API_CONNECTORS);
    setSelectedReports([]);
    setDlpBundles([]);
    setCertificates([]);
    setSelectedEnhancements([]);
    setLicenseGaps([]);
    setEndpointAgentSummary(null);
    setDlpDashboardSummary(null);
    setDlpAllLogReport(null);
    setAuditLogReport(null);
    setServiceLogsReport(null);
    setStarredLogIssues({});
    setDismissedLogIssues({});
    setDlpPostureSummary(null);
    setDlpPostureSections({ ...DEFAULT_POSTURE_SECTIONS });
    setCustomerConnector({ ...DEFAULT_CUSTOMER_CONNECTOR });
    setCustomerLogo(null);
    setComplianceFrameworks([]);
    setEnhancementOverrides({});
    setVersionUpgrades([]);
    setEndpointCompatInput({ ...EMPTY_COMPAT_INPUT });
    setEndpointCompatAssessment(null);
    setActiveSessionId(undefined);
    setActiveView('sessions');
  };

  /* Star-side-effect bridge: when the operator stars a log finding for
     the first time, this hook spawns a matching Urgent Action item so
     Step 9 already lists "fix this issue" without a manual add. We use
     `linkedLogIssueKey` as a one-to-one bond so re-starring doesn't
     create duplicates. Unstarring intentionally does NOT remove the
     action — the operator may have edited/resolved it independently. */
  const handleStarLogIssue = useCallback(
    (key: string, issue: { title: string; recommendation: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; component: string }) => {
      setActionItems((prev) => {
        if (prev.some((a) => a.linkedLogIssueKey === key)) return prev;
        const priority: 'critical' | 'high' | 'medium' | 'low' =
          issue.severity === 'CRITICAL' ? 'critical'
          : issue.severity === 'HIGH'   ? 'high'
          : issue.severity === 'MEDIUM' ? 'medium'
          : 'low';
        const newAction = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          task: issue.title,
          owner: '',
          dueDate: '',
          priority,
          status: 'not_started' as const,
          product: 'data',
          details: issue.recommendation,
          featured: priority === 'critical' || priority === 'high',
          linkedLogIssueKey: key,
        };
        return [...prev, newAction];
      });
    },
    [setActionItems],
  );

  /* Rough "how much will be lost" count for the modal warning */
  const filledFieldCount = (() => {
    let n = 0;
    if (sessionData.customerName.trim()) n++;
    if (sessionData.forcepointId.trim()) n++;
    if (sessionData.industry.trim()) n++;
    if (sessionData.country.trim()) n++;
    n += sessionData.licenses.length;
    n += sessionData.cases.length;
    n += sessionData.hardware.length;
    n += Object.values(selectedProducts).filter(Boolean).length;
    n += Object.values(checklistAnswers).filter(a => a?.value != null).length;
    n += Object.values(versionEntries).filter(v => v.installedVersion).length;
    n += serverDetails.filter(s => s.applicable).length;
    n += recommendations.length + actionItems.length + featureRequests.length;
    n += dlpBundles.length + certificates.length + selectedEnhancements.length;
    return n;
  })();

  const handleDeleteSession = (id: string) => {
    setRawSessions((prevRaw) => {
      const prev = deserializeSessions(prevRaw);
      return prev.filter((s) => s.id !== id) as unknown[];
    });
    if (activeSessionId === id) setActiveSessionId(undefined);
  };

  const stepColor = STEP_COLORS[currentStep] ?? '#3B82F6';
  const stepTitle = STEP_TITLES[currentStep] ?? '';

  const blockReason: string | undefined = (() => {
    if (currentStep === 1 && !sessionData.customerName.trim())
      return 'Please enter a customer name to continue.';
    if (currentStep === 2 && !Object.values(selectedProducts).some(Boolean))
      return 'Please select at least one product to continue.';
    return undefined;
  })();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F4F7FB' }}>
      <NavigationRail
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenProfile={() => setShowProfile(true)}
        onStartWizardSession={handleNewSession}
      />

      {activeView === 'wizard' && (
        <>
          <Sidebar
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            sessionData={sessionData}
            onNewSession={handleNewSession}
            selectedProducts={selectedProducts}
          />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <MainContent
              currentStep={currentStep}
              sessionData={sessionData}
              updateSessionData={updateSessionData}
              templates={templates}
              selectedProducts={selectedProducts}
              setSelectedProducts={setSelectedProducts}
              checklistAnswers={checklistAnswers}
              onAnswerChange={handleAnswerChange}
              versionData={versionData}
              versionEntries={versionEntries}
              onVersionEntriesChange={handleVersionEntriesChange}
              serverDetails={serverDetails}
              setServerDetails={setServerDetails}
              recommendations={recommendations}
              setRecommendations={setRecommendations}
              actionItems={actionItems}
              setActionItems={setActionItems}
              featureRequests={featureRequests}
              setFeatureRequests={setFeatureRequests}
              sqlConfig={sqlConfig}
              setSqlConfig={setSqlConfig}
              apiConnectors={apiConnectors}
              setApiConnectors={setApiConnectors}
              selectedReports={selectedReports}
              setSelectedReports={setSelectedReports}
              reportWindows={reportWindows}
              setReportWindows={setReportWindows}
              reportRuns={reportRuns}
              setReportRuns={setReportRuns}
              dlpBundles={dlpBundles}
              setDlpBundles={setDlpBundles}
              certificates={certificates}
              setCertificates={setCertificates}
              selectedEnhancements={selectedEnhancements}
              setSelectedEnhancements={setSelectedEnhancements}
              licenseGaps={licenseGaps}
              setLicenseGaps={setLicenseGaps}
              endpointAgentSummary={endpointAgentSummary}
              setEndpointAgentSummary={setEndpointAgentSummary}
              dlpDashboardSummary={dlpDashboardSummary}
              setDlpDashboardSummary={setDlpDashboardSummary}
              dlpAllLogReport={dlpAllLogReport}
              setDlpAllLogReport={setDlpAllLogReport}
              auditLogReport={auditLogReport}
              setAuditLogReport={setAuditLogReport}
              serviceLogsReport={serviceLogsReport}
              setServiceLogsReport={setServiceLogsReport}
              starredLogIssues={starredLogIssues}
              setStarredLogIssues={setStarredLogIssues}
              dismissedLogIssues={dismissedLogIssues}
              setDismissedLogIssues={setDismissedLogIssues}
              onStarLogIssue={handleStarLogIssue}
              dlpPostureSummary={dlpPostureSummary}
              setDlpPostureSummary={setDlpPostureSummary}
              dlpPostureSections={dlpPostureSections}
              setDlpPostureSections={setDlpPostureSections}
              destinationPatterns={destinationPatterns}
              customerConnector={customerConnector}
              setCustomerConnector={setCustomerConnector}
              customerLogo={customerLogo}
              setCustomerLogo={setCustomerLogo}
              complianceFrameworks={complianceFrameworks}
              setComplianceFrameworks={setComplianceFrameworks}
              enhancementOverrides={enhancementOverrides}
              setEnhancementOverrides={setEnhancementOverrides}
              versionUpgrades={versionUpgrades}
              setVersionUpgrades={setVersionUpgrades}
              versionUpgradeCatalog={versionUpgradeCatalog}
              endpointMatrix={endpointMatrix}
              endpointCompatInput={endpointCompatInput}
              setEndpointCompatInput={setEndpointCompatInput}
              endpointCompatAssessment={endpointCompatAssessment}
              setEndpointCompatAssessment={setEndpointCompatAssessment}
              onComplete={handleComplete}
              isComplete={!!sessions.find((s) => s.id === activeSessionId)?.completedAt}
            />
            <BottomPanel
              currentStep={currentStep}
              totalSteps={TOTAL_STEPS}
              stepTitle={stepTitle}
              stepColor={stepColor}
              saveState={saveState}
              onSave={handleSave}
              onCancel={handleCancel}
              onPrev={() => setCurrentStep((s) => nextVisibleStep(s, -1, selectedProducts))}
              onNext={() => setCurrentStep((s) => nextVisibleStep(s, 1, selectedProducts))}
              blockReason={blockReason}
              selectedProducts={selectedProducts}
            />
          </div>
        </>
      )}

      {activeView === 'templates' && (() => {
        /* "Active session" = a not-yet-completed session is currently
           loaded. selectedProducts persists in localStorage past completion,
           so without this gate the Rule Engine would still flag templates
           as "ACTIVE IN STEP 5" after every session is done. */
        const activeSession = activeSessionId
          ? sessions.find((s) => s.id === activeSessionId)
          : undefined;
        const hasActiveSession = !!activeSession && !activeSession.completedAt;
        return (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <TemplateManager
              onClose={() => setActiveView(hasActiveSession ? 'wizard' : 'sessions')}
              templates={templates}
              setTemplates={setTemplates}
              selectedProducts={selectedProducts}
              hasActiveSession={hasActiveSession}
            />
          </div>
        );
      })()}

      {activeView === 'sessions' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <SessionsPage
            sessions={sessions}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
            onNewSession={handleNewSession}
            currentSessionId={activeSessionId}
          />
        </div>
      )}

      {activeView === 'versions' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <VersionDataPage data={versionData} onChange={setVersionData} />
        </div>
      )}

      {activeView === 'endpoint_matrix' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <EndpointMatrixPage matrix={endpointMatrix} onChange={setEndpointMatrix} />
        </div>
      )}

      {activeView === 'destination_patterns' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <DestinationPatternsPage patterns={destinationPatterns} onChange={setDestinationPatterns} />
        </div>
      )}

      {activeView === 'version_upgrade_catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <VersionUpgradeCatalogPage catalog={versionUpgradeCatalog} setCatalog={setVersionUpgradeCatalog} />
        </div>
      )}

      {activeView === 'help_guide' && (
        <HelpGuidePage />
      )}

      {activeView === 'user_management' && (
        <UserManagementPage />
      )}

      {showProfile && (
        <SidePanel
          panelType="profile"
          onClose={() => setShowProfile(false)}
          onNavigate={(step) => {
            setCurrentStep(step);
            setActiveView('wizard');
            setShowProfile(false);
          }}
        />
      )}

      {showCancelModal && (
        <CancelSessionModal
          customerName={sessionData.customerName}
          forcepointId={sessionData.forcepointId}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepTitle={stepTitle}
          filledFieldCount={filledFieldCount}
          onConfirm={confirmCancelSession}
          onCancel={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
}

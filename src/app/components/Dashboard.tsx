import { useState, useCallback } from 'react';
import { NavigationRail, type ActiveView } from './NavigationRail';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { SidePanel } from './SidePanel';
import { TemplateManager, initialTemplates } from './TemplateManager';
import { SessionsPage } from './SessionsPage';
import { BottomPanel } from './BottomPanel';
import { VersionDataPage } from './VersionDataPage';
import { CancelSessionModal } from './CancelSessionModal';
import type { Template } from './types/templates';
import type { QuestionAnswer, TemplateAnswers } from './rules/ruleEngine';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STEP_COLORS, STEP_TITLES, TOTAL_STEPS } from '../constants/steps';
import { INITIAL_VERSION_DATA, type VersionDataStore } from '../constants/versionData';
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
import { ALL_REPORT_IDS } from '../constants/reportDefinitions';

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
  customerLogo: string | null;
  savedAt: Date;
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
    const session = s as HCSession & { savedAt: string | Date };
    return {
      ...session,
      savedAt: new Date(session.savedAt),
      checklistAnswers: session.checklistAnswers ?? {},
      versionEntries: session.versionEntries ?? {},
      serverDetails: session.serverDetails ?? DEFAULT_SERVERS,
      recommendations: session.recommendations ?? [],
      actionItems: session.actionItems ?? [],
      featureRequests: session.featureRequests ?? [],
      sqlConfig: session.sqlConfig ?? DEFAULT_SQL_CONFIG,
      apiConnectors: session.apiConnectors ?? DEFAULT_API_CONNECTORS,
      selectedReports: session.selectedReports ?? ALL_REPORT_IDS,
      dlpBundles: session.dlpBundles ?? [],
      certificates: session.certificates ?? [],
      selectedEnhancements: session.selectedEnhancements ?? [],
      licenseGaps: session.licenseGaps ?? [],
      endpointAgentSummary: session.endpointAgentSummary ?? null,
      dlpDashboardSummary: session.dlpDashboardSummary ?? null,
      customerLogo: session.customerLogo ?? null,
    };
  });
}

export function Dashboard({ onLogout }: { onLogout?: () => void }) {
  const [activeView, setActiveView] = useState<ActiveView>('wizard');

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
  const [selectedReports, setSelectedReports] = useLocalStorage<string[]>('hc_selected_reports', ALL_REPORT_IDS);
  const [dlpBundles,      setDlpBundles]      = useLocalStorage<DlpServerBundle[]>('hc_dlp_bundles', []);
  const [certificates,    setCertificates]    = useLocalStorage<ParsedCertificate[]>('hc_certificates', []);
  const [selectedEnhancements, setSelectedEnhancements] = useLocalStorage<string[]>('hc_enhancements', []);
  const [licenseGaps, setLicenseGaps] = useLocalStorage<LicenseGapItem[]>('hc_license_gaps', []);
  const [endpointAgentSummary, setEndpointAgentSummary] = useLocalStorage<EndpointAgentSummary | null>('hc_endpoint_agents', null);
  const [dlpDashboardSummary, setDlpDashboardSummary] = useLocalStorage<DlpDashboardSummary | null>('hc_dlp_dashboard', null);
  const [customerLogo, setCustomerLogo] = useLocalStorage<string | null>('hc_customer_logo', null);

  /* ── Version data catalog (persisted) ── */
  const [rawVersionData, setVersionData] = useLocalStorage<VersionDataStore>('hc_version_data', INITIAL_VERSION_DATA);
  const versionData: VersionDataStore = {
    'Forcepoint Email Security': rawVersionData['Forcepoint Email Security'] ?? [],
    'Forcepoint Web Security': rawVersionData['Forcepoint Web Security'] ?? [],
    'Forcepoint Data Security': rawVersionData['Forcepoint Data Security'] ?? [],
    'DLP + Web Endpoint Agent': rawVersionData['DLP + Web Endpoint Agent'] ?? [],
    'AMDP': rawVersionData['AMDP'] ?? [],
    'V Series Appliances': rawVersionData['V Series Appliances'] ?? [],
    'NGFW Appliances': rawVersionData['NGFW Appliances'] ?? [],
  };

  /* ── Sessions state (persisted) ── */
  const [rawSessions, setRawSessions] = useLocalStorage<unknown[]>('hc_sessions', []);
  const sessions: HCSession[] = deserializeSessions(rawSessions);

  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
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

  const handleSave = () => {
    setSaveState('saving');
    setTimeout(() => {
      const id = activeSessionId && sessions.find((s) => s.id === activeSessionId)
        ? activeSessionId
        : `session-${Date.now()}`;

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
        customerLogo: customerLogo ?? null,
        savedAt: new Date(),
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
    setSelectedReports(session.selectedReports ?? ALL_REPORT_IDS);
    setDlpBundles(session.dlpBundles ?? []);
    setCertificates(session.certificates ?? []);
    setSelectedEnhancements(session.selectedEnhancements ?? []);
    setLicenseGaps(session.licenseGaps ?? []);
    setEndpointAgentSummary(session.endpointAgentSummary ?? null);
    setDlpDashboardSummary(session.dlpDashboardSummary ?? null);
    setCustomerLogo(session.customerLogo ?? null);
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
    setSelectedReports(ALL_REPORT_IDS);
    setDlpBundles([]);
    setCertificates([]);
    setSelectedEnhancements([]);
    setLicenseGaps([]);
    setEndpointAgentSummary(null);
    setDlpDashboardSummary(null);
    setCustomerLogo(null);
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
    setSelectedReports(ALL_REPORT_IDS);
    setDlpBundles([]);
    setCertificates([]);
    setSelectedEnhancements([]);
    setLicenseGaps([]);
    setEndpointAgentSummary(null);
    setDlpDashboardSummary(null);
    setCustomerLogo(null);
    setActiveSessionId(undefined);
    setActiveView('sessions');
  };

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
      />

      {activeView === 'wizard' && (
        <>
          <Sidebar
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            sessionData={sessionData}
            onNewSession={handleNewSession}
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
              customerLogo={customerLogo}
              setCustomerLogo={setCustomerLogo}
            />
            <BottomPanel
              currentStep={currentStep}
              totalSteps={TOTAL_STEPS}
              stepTitle={stepTitle}
              stepColor={stepColor}
              saveState={saveState}
              onSave={handleSave}
              onCancel={handleCancel}
              onPrev={() => setCurrentStep((s) => Math.max(1, s - 1))}
              onNext={() => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              blockReason={blockReason}
            />
          </div>
        </>
      )}

      {activeView === 'templates' && (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TemplateManager
            onClose={() => setActiveView('wizard')}
            templates={templates}
            setTemplates={setTemplates}
            selectedProducts={selectedProducts}
          />
        </div>
      )}

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

      {showProfile && (
        <SidePanel
          panelType="profile"
          onClose={() => setShowProfile(false)}
          onLogout={onLogout}
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

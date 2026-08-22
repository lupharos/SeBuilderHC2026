import { Step1CustomerInfo } from './steps/Step1CustomerInfo';
import { Step2ProductScope } from './steps/Step2ProductScope';
import { Step3DataCollectors } from './steps/Step3DataCollectors';
import { Step4VersionCheck } from './steps/Step4VersionCheck';
import { StepServerDetails } from './steps/StepServerDetails';
import { StepEndpointAgents } from './steps/StepEndpointAgents';
import type { FdcAgentSummary } from './steps/fdcAgentParser';
import { Step6ProductChecklist } from './steps/Step6ProductChecklist';
import { Step7CertificateAnalysis } from './steps/Step7CertificateAnalysis';
import { Step7ParsingAnalysis } from './steps/Step7ParsingAnalysis';
import { Step8Recommendations } from './steps/Step8Recommendations';
import { Step9NextSteps } from './steps/Step9NextSteps';
import { Step10FeatureRequests } from './steps/Step10FeatureRequests';
import { Step10Summary } from './steps/Step10Summary';
import { Step11Summary } from './steps/Step11Summary';
import { StepRecommendedEnhancements } from './steps/StepRecommendedEnhancements';
import { StepLicenseGap } from './steps/StepLicenseGap';
import { StepVersionUpgrades, type VersionUpgradeProposal } from './steps/StepVersionUpgrades';
import { StepEndpointCompatibility } from './steps/StepEndpointCompatibility';
import type { EndpointSupportMatrix } from '../constants/endpointSupportMatrix';
import type { EndpointCompatibilityInput, EndpointCompatibilityAssessment } from '../utils/endpointCompatibilityEngine';
import type { ReportRunResult } from '../constants/reportDefinitions';
import type { SessionData, LicenseGapItem, ComplianceFrameworkItem, EnhancementOverride } from './Dashboard';
import type { Template } from './types/templates';
import type { QuestionAnswer, TemplateAnswers } from './rules/ruleEngine';
import type { VersionDataStore } from '../constants/versionData';
import type { VersionEntry } from './steps/Step4VersionCheck';
import type { ServerEntry } from './steps/StepServerDetails';
import type { Recommendation } from './steps/Step8Recommendations';
import type { ActionItem } from './steps/Step9NextSteps';
import type { FeatureRequest } from './steps/Step10FeatureRequests';
import type { SqlConfig, ApiConnectorsConfig } from './steps/Step3DataCollectors';
import type { DlpServerBundle } from './steps/dlpServerInfoParser';
import type { ParsedCertificate } from './steps/certificateParser';
import type { EndpointAgentSummary } from './steps/endpointAgentParser';
import type { DlpDashboardSummary } from './steps/dlpDashboardParser';
import type { DlpAllLogReport } from './steps/dlpAllLogParser';
import type { AuditSystemLogsReport } from './steps/auditSystemLogsParser';
import type { ServiceLogsReport } from './steps/dlpServiceLogsParser';
import type { DlpPostureSummary, DlpPostureBlockId, DestinationPatterns } from './steps/dlpPosture';
import type { CustomerConnectorConfig } from './steps/customerConnector';

interface MainContentProps {
  currentStep: number;
  sessionData: SessionData;
  updateSessionData: (updates: Partial<SessionData>) => void;
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  setSelectedProducts: (products: Record<string, boolean>) => void;
  checklistAnswers: TemplateAnswers;
  onAnswerChange: (qId: string, answer: QuestionAnswer) => void;
  versionData: VersionDataStore;
  versionEntries: Record<string, VersionEntry>;
  onVersionEntriesChange: (updater: ((prev: Record<string, VersionEntry>) => Record<string, VersionEntry>) | Record<string, VersionEntry>) => void;
  serverDetails: ServerEntry[];
  setServerDetails: React.Dispatch<React.SetStateAction<ServerEntry[]>>;
  recommendations: Recommendation[];
  setRecommendations: React.Dispatch<React.SetStateAction<Recommendation[]>>;
  actionItems: ActionItem[];
  setActionItems: React.Dispatch<React.SetStateAction<ActionItem[]>>;
  featureRequests: FeatureRequest[];
  setFeatureRequests: React.Dispatch<React.SetStateAction<FeatureRequest[]>>;
  sqlConfig: SqlConfig;
  setSqlConfig: React.Dispatch<React.SetStateAction<SqlConfig>>;
  apiConnectors: ApiConnectorsConfig;
  setApiConnectors: React.Dispatch<React.SetStateAction<ApiConnectorsConfig>>;
  selectedReports: string[];
  setSelectedReports: React.Dispatch<React.SetStateAction<string[]>>;
  reportWindows: Record<string, number>;
  setReportWindows: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  reportTopN: Record<string, number>;
  setReportTopN: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  reportRuns: Record<string, ReportRunResult>;
  setReportRuns: React.Dispatch<React.SetStateAction<Record<string, ReportRunResult>>>;
  dlpBundles: DlpServerBundle[];
  setDlpBundles: React.Dispatch<React.SetStateAction<DlpServerBundle[]>>;
  certificates: ParsedCertificate[];
  setCertificates: React.Dispatch<React.SetStateAction<ParsedCertificate[]>>;
  selectedEnhancements: string[];
  setSelectedEnhancements: React.Dispatch<React.SetStateAction<string[]>>;
  licenseGaps: LicenseGapItem[];
  setLicenseGaps: React.Dispatch<React.SetStateAction<LicenseGapItem[]>>;
  endpointAgentSummary: EndpointAgentSummary | null;
  setEndpointAgentSummary: React.Dispatch<React.SetStateAction<EndpointAgentSummary | null>>;
  fdcAgentSummary: FdcAgentSummary | null;
  setFdcAgentSummary: React.Dispatch<React.SetStateAction<FdcAgentSummary | null>>;
  dlpDashboardSummary: DlpDashboardSummary | null;
  setDlpDashboardSummary: React.Dispatch<React.SetStateAction<DlpDashboardSummary | null>>;
  dlpAllLogReport: DlpAllLogReport | null;
  setDlpAllLogReport: React.Dispatch<React.SetStateAction<DlpAllLogReport | null>>;
  auditLogReport: AuditSystemLogsReport | null;
  setAuditLogReport: React.Dispatch<React.SetStateAction<AuditSystemLogsReport | null>>;
  serviceLogsReport: ServiceLogsReport | null;
  setServiceLogsReport: React.Dispatch<React.SetStateAction<ServiceLogsReport | null>>;
  starredLogIssues: Record<string, true>;
  setStarredLogIssues: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  dismissedLogIssues: Record<string, true>;
  setDismissedLogIssues: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  onStarLogIssue: (key: string, issue: { title: string; recommendation: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; component: string }) => void;
  dlpPostureSummary: DlpPostureSummary | null;
  setDlpPostureSummary: React.Dispatch<React.SetStateAction<DlpPostureSummary | null>>;
  dlpPostureSections: Record<DlpPostureBlockId, boolean>;
  setDlpPostureSections: React.Dispatch<React.SetStateAction<Record<DlpPostureBlockId, boolean>>>;
  destinationPatterns: DestinationPatterns;
  customerConnector: CustomerConnectorConfig;
  setCustomerConnector: React.Dispatch<React.SetStateAction<CustomerConnectorConfig>>;
  customerLogo: string | null;
  setCustomerLogo: React.Dispatch<React.SetStateAction<string | null>>;
  complianceFrameworks: ComplianceFrameworkItem[];
  setComplianceFrameworks: React.Dispatch<React.SetStateAction<ComplianceFrameworkItem[]>>;
  enhancementOverrides: Record<string, EnhancementOverride>;
  setEnhancementOverrides: React.Dispatch<React.SetStateAction<Record<string, EnhancementOverride>>>;
  versionUpgrades: VersionUpgradeProposal[];
  setVersionUpgrades: React.Dispatch<React.SetStateAction<VersionUpgradeProposal[]>>;
  /* Global Version & Release catalog — read-only inside the wizard. The
     "Add from Catalog" picker on Step 9 pulls from this. Catalog edits
     happen on the standalone "Version & Release Catalog" left-rail page. */
  versionUpgradeCatalog: VersionUpgradeProposal[];
  endpointMatrix: EndpointSupportMatrix;
  endpointCompatInput: EndpointCompatibilityInput;
  setEndpointCompatInput: React.Dispatch<React.SetStateAction<EndpointCompatibilityInput>>;
  endpointCompatAssessment: EndpointCompatibilityAssessment | null;
  setEndpointCompatAssessment: React.Dispatch<React.SetStateAction<EndpointCompatibilityAssessment | null>>;
  onComplete: () => void;
  isComplete: boolean;
}

export function MainContent({
  currentStep, sessionData, updateSessionData,
  templates, selectedProducts, setSelectedProducts,
  checklistAnswers, onAnswerChange, versionData,
  versionEntries, onVersionEntriesChange,
  serverDetails, setServerDetails,
  recommendations, setRecommendations,
  actionItems, setActionItems,
  featureRequests, setFeatureRequests,
  sqlConfig, setSqlConfig,
  apiConnectors, setApiConnectors,
  selectedReports, setSelectedReports,
  reportWindows, setReportWindows,
  reportTopN, setReportTopN,
  reportRuns, setReportRuns,
  dlpBundles, setDlpBundles,
  certificates, setCertificates,
  selectedEnhancements, setSelectedEnhancements,
  licenseGaps, setLicenseGaps,
  endpointAgentSummary, setEndpointAgentSummary,
  fdcAgentSummary, setFdcAgentSummary,
  dlpDashboardSummary, setDlpDashboardSummary,
  dlpAllLogReport, setDlpAllLogReport,
  auditLogReport, setAuditLogReport,
  serviceLogsReport, setServiceLogsReport,
  starredLogIssues, setStarredLogIssues,
  dismissedLogIssues, setDismissedLogIssues,
  onStarLogIssue,
  dlpPostureSummary, setDlpPostureSummary,
  dlpPostureSections, setDlpPostureSections,
  destinationPatterns,
  customerConnector, setCustomerConnector,
  customerLogo, setCustomerLogo,
  complianceFrameworks, setComplianceFrameworks,
  enhancementOverrides, setEnhancementOverrides,
  versionUpgrades, setVersionUpgrades,
  versionUpgradeCatalog,
  endpointMatrix,
  endpointCompatInput, setEndpointCompatInput,
  endpointCompatAssessment, setEndpointCompatAssessment,
  onComplete, isComplete,
}: MainContentProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F4F7FB' }}>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 pb-10 w-full">
          {currentStep === 1  && <Step1CustomerInfo sessionData={sessionData} updateSessionData={updateSessionData} versionData={versionData} complianceFrameworks={complianceFrameworks} setComplianceFrameworks={setComplianceFrameworks} />}
          {currentStep === 2  && <Step2ProductScope selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts} />}
          {currentStep === 3  && <Step3DataCollectors sqlConfig={sqlConfig} setSqlConfig={setSqlConfig} apiConnectors={apiConnectors} setApiConnectors={setApiConnectors} selectedReports={selectedReports} setSelectedReports={setSelectedReports} reportWindows={reportWindows} setReportWindows={setReportWindows} reportTopN={reportTopN} setReportTopN={setReportTopN} reportRuns={reportRuns} setReportRuns={setReportRuns} selectedProducts={selectedProducts} dlpBundles={dlpBundles} setDlpBundles={setDlpBundles} dlpDashboardSummary={dlpDashboardSummary} setDlpDashboardSummary={setDlpDashboardSummary} dlpPostureSummary={dlpPostureSummary} setDlpPostureSummary={setDlpPostureSummary} dlpPostureSections={dlpPostureSections} setDlpPostureSections={setDlpPostureSections} destinationPatterns={destinationPatterns} customerConnector={customerConnector} setCustomerConnector={setCustomerConnector} dlpAllLogReport={dlpAllLogReport} setDlpAllLogReport={setDlpAllLogReport} auditLogReport={auditLogReport} setAuditLogReport={setAuditLogReport} serviceLogsReport={serviceLogsReport} setServiceLogsReport={setServiceLogsReport} starredLogIssues={starredLogIssues} setStarredLogIssues={setStarredLogIssues} dismissedLogIssues={dismissedLogIssues} setDismissedLogIssues={setDismissedLogIssues} onStarLogIssue={onStarLogIssue} />}
          {currentStep === 4  && <Step4VersionCheck selectedProducts={selectedProducts} versionData={versionData} versionEntries={versionEntries} onVersionEntriesChange={onVersionEntriesChange} dlpBundles={dlpBundles} />}
          {currentStep === 5  && <StepServerDetails servers={serverDetails} setServers={setServerDetails} dlpBundles={dlpBundles} selectedProducts={selectedProducts} />}
          {currentStep === 6  && <StepEndpointAgents summary={endpointAgentSummary} setSummary={setEndpointAgentSummary} fdcSummary={fdcAgentSummary} setFdcSummary={setFdcAgentSummary} selectedProducts={selectedProducts} />}
          {currentStep === 7  && (
            <StepEndpointCompatibility
              input={endpointCompatInput}
              setInput={setEndpointCompatInput}
              assessment={endpointCompatAssessment}
              setAssessment={setEndpointCompatAssessment}
              matrix={endpointMatrix}
              endpointAgentSummary={endpointAgentSummary}
              fdcAgentSummary={fdcAgentSummary}
              versionEntries={versionEntries}
              selectedProducts={selectedProducts}
            />
          )}
          {currentStep === 8  && (
            <Step6ProductChecklist
              templates={templates}
              selectedProducts={selectedProducts}
              checklistAnswers={checklistAnswers}
              onAnswerChange={onAnswerChange}
            />
          )}
          {currentStep === 9  && (
            <Step7ParsingAnalysis
              checklistAnswers={checklistAnswers}
              templates={templates}
              onAnswerChange={onAnswerChange}
            />
          )}
          {currentStep === 10 && <Step7CertificateAnalysis certificates={certificates} setCertificates={setCertificates} />}
          {currentStep === 11 && <Step8Recommendations recommendations={recommendations} setRecommendations={setRecommendations} />}
          {currentStep === 12 && <StepVersionUpgrades items={versionUpgrades} setItems={setVersionUpgrades} catalog={versionUpgradeCatalog} />}
          {/* Step 13-16 routing follows the operator-validated roadmap order:
                Customer Feature Requests → License Gap → Urgent Actions → Recommended Enhancements.
              The component file names (Step9NextSteps, Step10FeatureRequests, …) reflect
              the historical step IDs from before this reshuffle — kept as-is to avoid
              churning rename diffs across the report and report constants. */}
          {currentStep === 13 && <Step10FeatureRequests items={featureRequests} setItems={setFeatureRequests} />}
          {currentStep === 14 && (
            <StepLicenseGap
              licenseGaps={licenseGaps}
              setLicenseGaps={setLicenseGaps}
              existingLicenses={sessionData.licenses ?? []}
            />
          )}
          {currentStep === 15 && <Step9NextSteps items={actionItems} setItems={setActionItems} />}
          {currentStep === 16 && <StepRecommendedEnhancements selectedEnhancements={selectedEnhancements} setSelectedEnhancements={setSelectedEnhancements} enhancementOverrides={enhancementOverrides} setEnhancementOverrides={setEnhancementOverrides} />}
          {currentStep === 17 && (
            <Step10Summary
              templates={templates}
              selectedProducts={selectedProducts}
              sessionData={sessionData}
              checklistAnswers={checklistAnswers}
              versionEntries={versionEntries}
              recommendations={recommendations}
              actionItems={actionItems}
              featureRequests={featureRequests}
              serverDetails={serverDetails}
              certificates={certificates}
              selectedEnhancements={selectedEnhancements}
              licenseGaps={licenseGaps}
              versionUpgrades={versionUpgrades}
              endpointAgentSummary={endpointAgentSummary}
              dlpBundles={dlpBundles}
              endpointCompatAssessment={endpointCompatAssessment}
              reportRuns={reportRuns}
              selectedReports={selectedReports}
              dlpPostureSummary={dlpPostureSummary}
            />
          )}
          {currentStep === 18 && (
            <Step11Summary
              sessionData={sessionData}
              templates={templates}
              selectedProducts={selectedProducts}
              checklistAnswers={checklistAnswers}
              versionEntries={versionEntries}
              versionData={versionData}
              recommendations={recommendations}
              actionItems={actionItems}
              featureRequests={featureRequests}
              serverDetails={serverDetails}
              selectedReports={selectedReports}
              dlpBundles={dlpBundles}
              certificates={certificates}
              selectedEnhancements={selectedEnhancements}
              licenseGaps={licenseGaps}
              endpointAgentSummary={endpointAgentSummary}
              dlpDashboardSummary={dlpDashboardSummary}
              dlpAllLogReport={dlpAllLogReport}
              auditLogReport={auditLogReport}
              serviceLogsReport={serviceLogsReport}
              starredLogIssues={starredLogIssues}
              dlpPostureSummary={dlpPostureSummary}
              dlpPostureSections={dlpPostureSections}
              customerLogo={customerLogo}
              setCustomerLogo={setCustomerLogo}
              complianceFrameworks={complianceFrameworks}
              enhancementOverrides={enhancementOverrides}
              versionUpgrades={versionUpgrades}
              endpointMatrix={endpointMatrix}
              endpointCompatAssessment={endpointCompatAssessment}
              endpointCompatInput={endpointCompatInput}
              reportRuns={reportRuns}
              onComplete={onComplete}
              isComplete={isComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

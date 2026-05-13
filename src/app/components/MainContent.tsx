import { Step1CustomerInfo } from './steps/Step1CustomerInfo';
import { Step2ProductScope } from './steps/Step2ProductScope';
import { Step3DataCollectors } from './steps/Step3DataCollectors';
import { Step4VersionCheck } from './steps/Step4VersionCheck';
import { StepServerDetails } from './steps/StepServerDetails';
import { Step6ProductChecklist } from './steps/Step6ProductChecklist';
import { Step7CertificateAnalysis } from './steps/Step7CertificateAnalysis';
import { Step7ParsingAnalysis } from './steps/Step7ParsingAnalysis';
import { Step8Recommendations } from './steps/Step8Recommendations';
import { Step9NextSteps } from './steps/Step9NextSteps';
import { Step10FeatureRequests } from './steps/Step10FeatureRequests';
import { Step10Summary } from './steps/Step10Summary';
import { Step11Summary } from './steps/Step11Summary';
import { StepRecommendedEnhancements } from './steps/StepRecommendedEnhancements';
import type { SessionData } from './Dashboard';
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

interface MainContentProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  sessionData: SessionData;
  updateSessionData: (updates: Partial<SessionData>) => void;
  templates: Template[];
  selectedProducts: Record<string, boolean>;
  setSelectedProducts: (products: Record<string, boolean>) => void;
  checklistAnswers: TemplateAnswers;
  onAnswerChange: (qId: string, answer: QuestionAnswer) => void;
  onResetAnswers: () => void;
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
  dlpBundles: DlpServerBundle[];
  setDlpBundles: React.Dispatch<React.SetStateAction<DlpServerBundle[]>>;
  certificates: ParsedCertificate[];
  setCertificates: React.Dispatch<React.SetStateAction<ParsedCertificate[]>>;
  selectedEnhancements: string[];
  setSelectedEnhancements: React.Dispatch<React.SetStateAction<string[]>>;
}

export function MainContent({
  currentStep, onStepChange, sessionData, updateSessionData,
  templates, selectedProducts, setSelectedProducts,
  checklistAnswers, onAnswerChange, onResetAnswers, versionData,
  versionEntries, onVersionEntriesChange,
  serverDetails, setServerDetails,
  recommendations, setRecommendations,
  actionItems, setActionItems,
  featureRequests, setFeatureRequests,
  sqlConfig, setSqlConfig,
  apiConnectors, setApiConnectors,
  selectedReports, setSelectedReports,
  dlpBundles, setDlpBundles,
  certificates, setCertificates,
  selectedEnhancements, setSelectedEnhancements,
}: MainContentProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F4F7FB' }}>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 pb-10 w-full">
          {currentStep === 1  && <Step1CustomerInfo sessionData={sessionData} updateSessionData={updateSessionData} versionData={versionData} />}
          {currentStep === 2  && <Step2ProductScope selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts} />}
          {currentStep === 3  && <Step3DataCollectors sqlConfig={sqlConfig} setSqlConfig={setSqlConfig} apiConnectors={apiConnectors} setApiConnectors={setApiConnectors} selectedReports={selectedReports} setSelectedReports={setSelectedReports} selectedProducts={selectedProducts} dlpBundles={dlpBundles} setDlpBundles={setDlpBundles} />}
          {currentStep === 4  && <Step4VersionCheck selectedProducts={selectedProducts} versionData={versionData} versionEntries={versionEntries} onVersionEntriesChange={onVersionEntriesChange} />}
          {currentStep === 5  && <StepServerDetails servers={serverDetails} setServers={setServerDetails} />}
          {currentStep === 6  && (
            <Step6ProductChecklist
              templates={templates}
              selectedProducts={selectedProducts}
              checklistAnswers={checklistAnswers}
              onAnswerChange={onAnswerChange}
            />
          )}
          {currentStep === 7  && (
            <Step7ParsingAnalysis
              checklistAnswers={checklistAnswers}
              templates={templates}
              onAnswerChange={onAnswerChange}
            />
          )}
          {currentStep === 8  && <Step7CertificateAnalysis certificates={certificates} setCertificates={setCertificates} />}
          {currentStep === 9  && <Step8Recommendations recommendations={recommendations} setRecommendations={setRecommendations} />}
          {currentStep === 10 && <Step9NextSteps items={actionItems} setItems={setActionItems} />}
          {currentStep === 11 && <Step10FeatureRequests items={featureRequests} setItems={setFeatureRequests} />}
          {currentStep === 12 && <StepRecommendedEnhancements selectedEnhancements={selectedEnhancements} setSelectedEnhancements={setSelectedEnhancements} />}
          {currentStep === 13 && (
            <Step10Summary
              templates={templates}
              selectedProducts={selectedProducts}
              sessionData={sessionData}
              checklistAnswers={checklistAnswers}
              versionEntries={versionEntries}
              recommendations={recommendations}
              actionItems={actionItems}
              serverDetails={serverDetails}
            />
          )}
          {currentStep === 14 && (
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
            />
          )}
        </div>
      </div>
    </div>
  );
}

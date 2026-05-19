import type { QuestionSeverity } from '../../types/templates';
import type { CheckData } from './types';

export const PRODUCT_ID_MAP: Record<string, string> = {
  web: 'web', email: 'email', data: 'dlp', ngfw: 'ngfw',
  dspm: 'dspm', cls: 'classification', appl: 'appl', vappl: 'appl',
};

export const SEV_ORDER: QuestionSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const SRV_LABELS: Record<string, string> = {
  fsm: 'FSM Server', sql: 'SQL Server', protector: 'Protector',
  supplemental: 'Supplemental DLP', content_gateway: 'Content Gateway',
  email_gateway: 'Email Gateway', ngfw: 'NGFW Management',
};

/* Mirrors the wizard order in steps.ts. Final Export (the page that renders
   this list) is intentionally omitted — you're always on it. */
export const COMPLETION_STEPS = [
  { step: 1,  label: 'Customer Information',       check: (d: CheckData) => !!d.customerName },
  { step: 2,  label: 'Product Scope',              check: (d: CheckData) => d.productsSelected },
  { step: 3,  label: 'Data Collection',            check: (d: CheckData) => d.dlpBundleCount > 0 },
  { step: 4,  label: 'Version & EoS Check',        check: (d: CheckData) => d.versionCount > 0 },
  { step: 5,  label: 'Server Infrastructure',      check: (d: CheckData) => d.serverCount > 0 },
  { step: 6,  label: 'Endpoint Agent Analysis',    check: (d: CheckData) => d.endpointAgentCount > 0 },
  { step: 7,  label: 'Per-Product Checklist',      check: (d: CheckData) => d.totalAnswered > 0 },
  { step: 8,  label: 'Parsing & Analysis',         check: (d: CheckData) => d.totalAnswered > 0 },
  { step: 9,  label: 'Certificate Analysis',       check: (d: CheckData) => d.certificatesCount > 0 },
  { step: 10, label: 'Recommendations',            check: (d: CheckData) => d.recsCount > 0 },
  { step: 11, label: 'Version Upgrade Proposals',  check: (d: CheckData) => d.versionUpgradeCount > 0 },
  { step: 12, label: 'Next Steps & Roadmap',       check: (d: CheckData) => d.actionsCount > 0 },
  { step: 13, label: 'Customer Feature Requests',  check: (d: CheckData) => d.frsCount > 0 },
  { step: 14, label: 'Recommended Enhancements',   check: (d: CheckData) => d.enhancementsCount > 0 },
  { step: 15, label: 'License Gap',                check: (d: CheckData) => d.licenseGapCount > 0 },
  { step: 16, label: 'Summary & Review',           check: (d: CheckData) => d.productsSelected },
];

export const TOTAL_STEPS = 18;

export const STEP_COLORS: Record<number, string> = {
  1:  '#3B82F6', 2:  '#8B5CF6', 3:  '#0EA5E9', 4:  '#F59E0B',
  5:  '#F97316', 6:  '#06B6D4', 7:  '#0284C7', 8:  '#10B981',
  9:  '#6366F1', 10: '#DB2777', 11: '#EC4899', 12: '#023E8A',
  13: '#14B8A6', 14: '#7C3AED', 15: '#EA580C', 16: '#0891B2',
  17: '#3B82F6', 18: '#16A34A',
};

export const STEP_TITLES: Record<number, string> = {
  1:  'Customer Information',
  2:  'Product Scope',
  3:  'Data Collection',
  4:  'Version & EoS Analysis',
  5:  'Server Infrastructure',
  6:  'Endpoint Agent Analysis',
  7:  'Agent Compatibility',
  8:  'Per-Product Checklist',
  9:  'Parsing & Analysis',
  10: 'Certificate Analysis',
  11: 'Recommendations',
  12: 'Version Upgrade Proposals',
  /* Steps 13-16 reordered: roadmap deliverables now flow as
       Customer Feature Requests → License Gap → Urgent Actions → Recommended Enhancements
     so that "Urgent Actions" lives directly between the licensing decision and
     the enhancement upsell pitch (operator-validated layout). */
  13: 'Customer Feature Requests',
  14: 'License Gap',
  15: 'Urgent Actions',
  16: 'Recommended Enhancements',
  17: 'Summary & Review',
  18: 'Final Export',
};

/* ─── Step visibility rules ──────────────────────────────────────────
   Maps step IDs to predicates that return TRUE when the step should be
   SKIPPED for the given product scope. Rules are keyed on `selectedProducts`
   from Step 2. Additional optional parameters:
     • versionEntries: for checking version summary agent entries
     • endpointAgentData: for checking if endpoint agent CSV was imported

   Step rules:
     • Step 6 (Endpoint Agent Analysis) — skipped if no DLP/DSPM/Classification,
       OR if no endpoint agent CSV data imported.
     • Step 7 (Agent Compatibility) — skipped if no product scope, OR if
       no agent version entries (web_endpoint, dlp_endpoint, cls_agent) exist.
   Add new entries here when a future step becomes product-conditional. */
type VersionEntries = Record<string, any> | undefined;
type EndpointAgentData = any; // EndpointAgentSummary | null

const STEP_SKIP_RULES: Partial<Record<number, (sp: Record<string, boolean>, ve?: VersionEntries, ea?: EndpointAgentData) => boolean>> = {
  6: (sp, ve, ea) => {
    // Skip if no product scope for endpoint agents
    if (!sp.data && !sp.dspm && !sp.cls) return true;
    // Skip if no endpoint agent CSV was imported
    return !ea;
  },
  7: (sp, ve) => {
    // Skip if no product scope matches
    if (!sp.data && !sp.web && !sp.dspm && !sp.cls) return true;
    // Skip if none of the agent entries exist in version data (and not removed)
    const hasAgentEntries = ve && (
      (ve.web_endpoint && !ve.web_endpoint.removed) ||
      (ve.dlp_endpoint && !ve.dlp_endpoint.removed) ||
      (ve.cls_agent && !ve.cls_agent.removed)
    );
    return !hasAgentEntries;
  },
};

export function isStepSkipped(stepId: number, selectedProducts: Record<string, boolean>, versionEntries?: VersionEntries, endpointAgentData?: EndpointAgentData): boolean {
  const rule = STEP_SKIP_RULES[stepId];
  return rule ? rule(selectedProducts, versionEntries, endpointAgentData) : false;
}

/* Returns the next visible step in `direction` (+1 forward, -1 back). Clamps
   to the wizard bounds; if no visible step exists in the requested direction
   the caller's current step is returned unchanged. */
export function nextVisibleStep(from: number, direction: 1 | -1, selectedProducts: Record<string, boolean>, versionEntries?: VersionEntries, endpointAgentData?: EndpointAgentData): number {
  let s = from + direction;
  while (s >= 1 && s <= TOTAL_STEPS) {
    if (!isStepSkipped(s, selectedProducts, versionEntries, endpointAgentData)) return s;
    s += direction;
  }
  return from;
}

export const STEP_LABELS: Record<number, string> = {
  1:  'Customer Info',
  2:  'Product Scope',
  3:  'Data Collection',
  4:  'Version & EoS',
  5:  'Server Details',
  6:  'Endpoint Agents',
  7:  'Agent Compatibility',
  8:  'Product Checklist',
  9:  'Parsing & Analysis',
  10: 'Certificates',
  11: 'Recommendations',
  12: 'Version Upgrades',
  13: 'Customer FRs',
  14: 'License Gap',
  15: 'Urgent Actions',
  16: 'Enhancements',
  17: 'Summary & Review',
  18: 'Final Export',
};

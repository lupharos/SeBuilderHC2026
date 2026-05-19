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
  13: 'Next Steps & Roadmap',
  14: 'Customer Feature Requests',
  15: 'Recommended Enhancements',
  16: 'License Gap',
  17: 'Summary & Review',
  18: 'Final Export',
};

/* ─── Step visibility rules ──────────────────────────────────────────
   Maps step IDs to predicates that return TRUE when the step should be
   SKIPPED for the given product scope. Rules are keyed on `selectedProducts`
   from Step 2.
     • Step 6 (Endpoint Agent Analysis — CSV ingest) is DLP-only — the CSV
       only ships with DLP deployments.
     • Step 7 (Agent Compatibility) runs for either DLP or Web; in Web-only
       scope it falls back to the "Endpoint Agent (Hybrid Web)" installed
       version from Step 4's Version & EoS list (no Step 6 CSV available).
   Add new entries here when a future step becomes product-conditional. */
const STEP_SKIP_RULES: Partial<Record<number, (sp: Record<string, boolean>) => boolean>> = {
  6: (sp) => !sp.data,
  7: (sp) => !sp.data && !sp.web,
};

export function isStepSkipped(stepId: number, selectedProducts: Record<string, boolean>): boolean {
  const rule = STEP_SKIP_RULES[stepId];
  return rule ? rule(selectedProducts) : false;
}

/* Returns the next visible step in `direction` (+1 forward, -1 back). Clamps
   to the wizard bounds; if no visible step exists in the requested direction
   the caller's current step is returned unchanged. */
export function nextVisibleStep(from: number, direction: 1 | -1, selectedProducts: Record<string, boolean>): number {
  let s = from + direction;
  while (s >= 1 && s <= TOTAL_STEPS) {
    if (!isStepSkipped(s, selectedProducts)) return s;
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
  13: 'Next Steps',
  14: 'Customer FRs',
  15: 'Enhancements',
  16: 'License Gap',
  17: 'Summary & Review',
  18: 'Final Export',
};

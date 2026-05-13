// Match a customer-installed hardware row against the Product Lifecycle
// catalog (V-Series / NGFW). Customer device names usually carry vendor &
// suffix words (e.g. "Forcepoint V20000 G1 Appliance"), while the catalog
// uses bare model strings ("V20000 G1"), so we do a longest-substring match.

import type { HardwareEntry, VersionDataStore } from '../constants/versionData';

const LIFECYCLE_CATEGORIES: Array<keyof VersionDataStore> = ['V Series Appliances', 'NGFW Appliances'];

export function lookupHardwareLifecycle(
  versionData: VersionDataStore,
  deviceName: string | undefined,
  productCode?: string,
): HardwareEntry | null {
  if (!deviceName && !productCode) return null;

  const haystack = `${deviceName ?? ''} ${productCode ?? ''}`.toLowerCase();
  let best: HardwareEntry | null = null;
  let bestLen = 0;

  for (const cat of LIFECYCLE_CATEGORIES) {
    const entries = versionData[cat] as HardwareEntry[] | undefined;
    if (!entries) continue;
    for (const entry of entries) {
      const model = entry['Model/Version'];
      if (!model) continue;
      const needle = model.toLowerCase();
      if (haystack.includes(needle) && needle.length > bestLen) {
        best = entry;
        bestLen = needle.length;
      }
    }
  }

  return best;
}

// Convenience: compact "GA → EoS → EoM → EoL" timeline as a string array.
export function lifecycleMilestones(entry: HardwareEntry): Array<{ label: string; value: string }> {
  const fmt = (v: string | number | null | undefined) => v == null || v === '' ? '—' : String(v);
  return [
    { label: 'GA',                 value: fmt(entry['General Availability']) },
    { label: 'End of Sale',        value: fmt(entry['End of Sale']) },
    { label: 'Last Supp. Release', value: fmt(entry['Last Supported Release']) },
    { label: 'End of Maintenance', value: fmt(entry['End Of Maintenance']) },
    { label: 'Warranty Ext.',      value: fmt(entry['Last Date for Warranty Extension']) },
    { label: 'End of Life',        value: fmt(entry['End of Life']) },
    { label: 'Migration Path',     value: fmt(entry['Migration Path']) },
  ];
}

// Classify how urgent attention is for a matched hardware row.
// "EOL"     — End of Life date has passed.
// "EOS"     — End of Sale or End of Maintenance has passed (still supported but no new sales/patches).
// "OK"      — All listed milestones are in the future.
// "UNKNOWN" — No date metadata available.
export function lifecycleStatus(entry: HardwareEntry): 'OK' | 'EOS' | 'EOL' | 'UNKNOWN' {
  const now = Date.now();
  const past = (v: string | null | undefined) => {
    if (!v) return false;
    const t = Date.parse(v);
    return !isNaN(t) && t < now;
  };
  if (past(entry['End of Life'])) return 'EOL';
  if (past(entry['End Of Maintenance']) || past(entry['End of Sale'])) return 'EOS';
  if (entry['General Availability'] || entry['End of Sale'] || entry['End of Life']) return 'OK';
  return 'UNKNOWN';
}

export function lifecycleStatusColor(status: ReturnType<typeof lifecycleStatus>): string {
  switch (status) {
    case 'OK':      return '#16a34a';
    case 'EOS':     return '#d97706';
    case 'EOL':     return '#dc2626';
    default:        return '#64748b';
  }
}

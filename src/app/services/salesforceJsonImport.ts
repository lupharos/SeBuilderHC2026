// Maps a Salesforce-exported customer JSON file (customerx_hc.json style) into the
// SessionData shape used across the wizard. The JSON is treated as a snapshot
// from Salesforce — we don't hit the network, just read what the user uploads.

import type { SessionData, LicenseItem, CaseItem, FeatureRequestItem, HardwareItem, EntitlementItem } from '../components/Dashboard';

// ── Input JSON schema (mirrors the example file structure) ──────────────────
export interface SalesforceJson {
  customer?: {
    customer_name?: string;
    forcepoint_id_wbsn?: string;
    salesforce_account_id?: string;
    country_region?: string;
    city?: string;
    theatre?: string;
    region?: string;
    industry?: string;
    support_level?: string;
    recommended_support_level?: string;
    account_team?: {
      account_owner_sales_manager?: string;
      customer_success_manager?: string;
      primary_sales_engineer?: string;
      channel_account_manager?: string;
      sales_engineer?: string;
    };
    partner?: {
      reseller?: string;
      distributor?: string;
    };
  };
  entitlements?: Array<{
    name?: string;
    type?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  }>;
  licenses?: Array<{
    product?: string;
    product_code?: string | null;
    quantity?: number | string;
    status?: string;
    start_date?: string | null;
    expiry_date?: string | null;
    deployment_type?: string;
    support_level?: string;
  }>;
  hardware?: Array<{
    device_name?: string;
    product_code?: string | null;
    quantity?: number | string;
    status?: string;
    warranty?: string | null;
    warranty_status?: string;
    warranty_expiry?: string | null;
    hardware_eol?: string | null;
    serial_number?: string | null;
  }>;
  active_cases_last5?: Array<{
    case_number?: string;
    subject?: string;
    status?: string;
    open_date?: string;
    case_owner?: string;
    opened_by?: string;
    origin?: string;
    severity?: string;
    product?: string;
  }>;
  feature_requests?: Array<{
    title?: string;
    product?: string;
    priority?: string;
    votes?: number;
    reference?: string;
    product_family?: string;
    status?: string;
    disposition?: string;
    severity?: string | null;
    customer_status?: string | null;
    created_date?: string;
  }>;
}

// ── Utilities ───────────────────────────────────────────────────────────────
const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function normaliseStatus(s: string | undefined): LicenseItem['status'] {
  const v = (s || '').toLowerCase();
  if (v.startsWith('exp')) return 'EXPIRED';
  if (v.startsWith('pend')) return 'PENDING';
  return 'ACTIVE';
}

// Salesforce sometimes leaves status as "Active" even when expiry is years in the
// past. Treat the date as authoritative — if it's before today, override to EXPIRED.
function resolveLicenseStatus(rawStatus: string | undefined, expiry: string | null | undefined): LicenseItem['status'] {
  const declared = normaliseStatus(rawStatus);
  if (declared === 'EXPIRED' || declared === 'PENDING') return declared;
  if (!expiry) return declared;
  const t = Date.parse(expiry);
  if (isNaN(t)) return declared;
  return t < Date.now() ? 'EXPIRED' : 'ACTIVE';
}

function normaliseSeverity(input: string | undefined, status: string | undefined): CaseItem['severity'] {
  const sev = (input || '').toUpperCase();
  if (sev === 'S1' || sev === 'S2' || sev === 'S3' || sev === 'S4') return sev;
  // Salesforce JSON often omits severity; infer from status verbs.
  const st = (status || '').toLowerCase();
  if (st.includes('critical') || st.includes('p1')) return 'S1';
  if (st.includes('high') || st.includes('p2')) return 'S2';
  if (st.includes('medium') || st.includes('p3')) return 'S3';
  return 'S4';
}

function normalisePriority(p: string | undefined): FeatureRequestItem['priority'] {
  const v = (p || '').toUpperCase();
  if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v;
  return 'MEDIUM';
}

// Try to extract a Forcepoint product slug from a free-text subject like
// "DLP API" or "Best Practices for Managing Network Saturation …".
function inferProductFromText(...texts: Array<string | undefined>): string {
  const blob = texts.filter(Boolean).join(' ').toLowerCase();
  if (/\bdlp\b|data security|fingerprint/.test(blob))    return 'Forcepoint DLP';
  if (/web security|content gateway|wcg|csg/.test(blob)) return 'Forcepoint Web Security';
  if (/email security|esg/.test(blob))                   return 'Forcepoint Email Security';
  if (/ngfw|smc|stonesoft/.test(blob))                   return 'Forcepoint NGFW';
  if (/dspm/.test(blob))                                 return 'Forcepoint DSPM';
  if (/casb/.test(blob))                                 return 'Forcepoint CASB';
  return '';
}

// ── Public entry point ─────────────────────────────────────────────────────
export interface MapResult {
  partial: Partial<SessionData>;
  summary: {
    customerName: string;
    forcepointId: string;
    licenseCount: number;
    caseCount: number;
    hardwareCount: number;
    featureRequestCount: number;
    entitlementCount: number;
    expiredLicenseCount: number;
    supportLevel: string;
    recommendedSupportLevel: string;
  };
}

export function mapSalesforceJsonToSession(raw: unknown): MapResult {
  if (!raw || typeof raw !== 'object') throw new Error('Uploaded file is not a JSON object.');
  const json = raw as SalesforceJson;

  const c = json.customer ?? {};
  const team = c.account_team ?? {};
  const partner = c.partner ?? {};

  // Reseller goes into the existing `partner` field; distributor gets its own field below.
  const partnerStr = partner.reseller ?? '';

  // Compose the country / region — prefer "Country (Region)" if both present.
  const country = c.country_region
    ? (c.region ? `${c.country_region} (${c.region})` : c.country_region)
    : (c.region || '');

  const licenses: LicenseItem[] = (json.licenses ?? []).map(l => ({
    id: uid(),
    product: l.product ?? '',
    productCode: l.product_code ?? '',
    quantity: l.quantity != null ? String(l.quantity) : '',
    status: resolveLicenseStatus(l.status, l.expiry_date),
    expiry: l.expiry_date ?? '',
    startDate: l.start_date ?? '',
    deploymentType: l.deployment_type ?? '',
    supportLevel: l.support_level ?? '',
  }));

  const hardware: HardwareItem[] = (json.hardware ?? []).map(h => ({
    id: uid(),
    model: h.device_name ?? '',
    serial: h.serial_number ?? '—',
    // "purchased" is shown as a date column in the UI — fall back to warranty expiry if no explicit purchase date.
    purchased: h.warranty_expiry ?? '',
    units: typeof h.quantity === 'number' ? h.quantity : parseInt(String(h.quantity ?? '1'), 10) || 1,
    productCode: h.product_code ?? '',
    warranty: h.warranty ?? (h.warranty_expiry ? `Expires ${h.warranty_expiry}` : ''),
    status: h.status ?? '',
    warrantyStatus: h.warranty_status ?? '',
    hardwareEol: h.hardware_eol ?? '',
  }));

  const cases: CaseItem[] = (json.active_cases_last5 ?? []).map(k => ({
    id: uid(),
    caseNumber: k.case_number ?? '',
    severity: normaliseSeverity(k.severity, k.status),
    title: k.subject ?? '',
    date: k.open_date ?? '',
    product: k.product || inferProductFromText(k.subject),
    statusLabel: k.status ?? '',
    openedBy: k.opened_by ?? '',
    caseOwner: k.case_owner ?? '',
    origin: k.origin ?? '',
  }));

  const featureRequests: FeatureRequestItem[] = (json.feature_requests ?? []).map(f => ({
    id: uid(),
    title: f.title ?? '',
    // Map product_family → product so existing UI label stays meaningful when the JSON uses the newer field.
    product: f.product ?? f.product_family ?? '',
    priority: normalisePriority(f.priority ?? f.severity ?? undefined),
    votes: typeof f.votes === 'number' ? f.votes : 0,
    reference: f.reference ?? '',
    productFamily: f.product_family ?? '',
    status: f.status ?? '',
    disposition: f.disposition ?? '',
    customerStatus: f.customer_status ?? '',
    createdDate: f.created_date ?? '',
  }));

  // Skip already-expired entitlements during import — the user only wants active support contracts.
  const entitlements: EntitlementItem[] = (json.entitlements ?? [])
    .map(e => ({
      id: uid(),
      name: e.name ?? '',
      type: e.type ?? '',
      // Same date-aware status logic as licenses — JSON sometimes says "Active" on a past end date.
      status: resolveLicenseStatus(e.status, e.end_date) as EntitlementItem['status'],
      startDate: e.start_date ?? '',
      endDate: e.end_date ?? '',
    }))
    .filter(e => e.status !== 'EXPIRED');

  // Choose the strongest "primary contact" for the SE field — Primary SE wins,
  // then the plain SE field, then Account Owner as last resort.
  const salesEngineer = team.primary_sales_engineer || team.sales_engineer || '';
  const accountOwner = team.account_owner_sales_manager || '';
  const csm = team.customer_success_manager || '';

  const partial: Partial<SessionData> = {
    customerName: c.customer_name ?? '',
    forcepointId: c.forcepoint_id_wbsn ?? c.salesforce_account_id ?? '',
    industry: c.industry ?? '',
    country,
    csm,
    accountOwner,
    salesEngineer,
    partner: partnerStr,
    licenses,
    cases,
    featureRequests,
    hardware,
    // Extended customer profile
    city: c.city ?? '',
    theatre: c.theatre ?? '',
    region: c.region ?? '',
    supportLevel: c.support_level ?? '',
    recommendedSupportLevel: c.recommended_support_level ?? '',
    channelAccountManager: team.channel_account_manager ?? '',
    distributor: partner.distributor ?? '',
    entitlements,
  };

  return {
    partial,
    summary: {
      customerName: partial.customerName ?? '',
      forcepointId: partial.forcepointId ?? '',
      licenseCount: licenses.length,
      caseCount: cases.length,
      hardwareCount: hardware.length,
      featureRequestCount: featureRequests.length,
      entitlementCount: entitlements.length,
      expiredLicenseCount: licenses.filter(l => l.status === 'EXPIRED').length,
      supportLevel: c.support_level ?? '',
      recommendedSupportLevel: c.recommended_support_level ?? '',
    },
  };
}

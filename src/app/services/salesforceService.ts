import type { SessionData, LicenseItem, CaseItem } from '../components/Dashboard';

const CLAUDE_CONFIG = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  model: 'claude-opus-4-5',
  mcpServerUrl: 'https://mcp.cloud.cdata.com/mcp',
  apiUrl: 'https://api.anthropic.com/v1/messages',
};

export interface SalesforceAccount {
  id: string;
  name: string;
  industry?: string;
  billingCountry?: string;
  type?: string;
  website?: string;
  annualRevenue?: number;
  numberOfEmployees?: number;
}

export interface SalesforceIntelligence {
  accountId: string;
  accountName: string;
  csm?: string;
  accountOwner?: string;
  salesEngineer?: string;
  partner?: string;
  licenses: {
    product: string;
    quantity: string;
    status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
    expiry: string;
  }[];
  cases: {
    caseNumber: string;
    severity: 'S1' | 'S2' | 'S3' | 'S4';
    title: string;
    date: string;
    product: string;
    statusLabel: string;
  }[];
}

function extractJSON<T>(text: string): T | null {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]) as T; } catch { /* fall through */ }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T; } catch { /* fall through */ }
  }
  return null;
}

async function callClaudeAPI(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(CLAUDE_CONFIG.apiUrl, {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': CLAUDE_CONFIG.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_CONFIG.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      mcp_servers: [{ type: 'url', url: CLAUDE_CONFIG.mcpServerUrl, name: 'cdata-salesforce' }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { content?: { type: string; text?: string }[] };
  const textBlock = data.content?.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

const SEARCH_SYSTEM = `You are a Salesforce data assistant for Forcepoint. Use the CData Salesforce MCP tools to search for customer accounts.

When asked to search for an account, query the Salesforce Account object and return results as a JSON array:
{
  "accounts": [
    {
      "id": "001...",
      "name": "Acme Corp",
      "industry": "Financial Services",
      "billingCountry": "Turkey",
      "type": "Customer",
      "website": "https://acme.com",
      "annualRevenue": 0,
      "numberOfEmployees": 0
    }
  ]
}

Return ONLY the JSON wrapped in a \`\`\`json code block. Limit to 10 results. If no accounts found, return { "accounts": [] }.`;

const INTEL_SYSTEM = `You are a Salesforce intelligence agent for Forcepoint. Use the CData Salesforce MCP to pull complete account data.

Given an account ID and name, retrieve:
1. Account owner, CSM, and primary Sales Engineer from the account team or related contacts
2. Active Opportunities or Contracts for licensed products, quantities, and expiry dates
3. Last 5 open or recently closed support Cases (case number, severity S1–S4, title, date, product, status)
4. Partner information from the account hierarchy

Return a single JSON object in this exact shape (wrapped in a \`\`\`json block):
{
  "accountId": "...",
  "accountName": "...",
  "csm": "Full Name",
  "accountOwner": "Full Name",
  "salesEngineer": "Full Name",
  "partner": "Partner company name or empty string",
  "licenses": [
    { "product": "Forcepoint Web Security", "quantity": "20,000 users", "status": "ACTIVE", "expiry": "Oct 2026" }
  ],
  "cases": [
    { "caseNumber": "00000001", "severity": "S2", "title": "Policy sync issue", "date": "15 Apr 2025", "product": "Web Security", "statusLabel": "In Progress" }
  ]
}

Use empty strings or empty arrays when data is unavailable. Return ONLY the JSON block.`;

export async function searchSalesforceAccounts(
  term: string,
  signal?: AbortSignal,
): Promise<SalesforceAccount[]> {
  const text = await callClaudeAPI(
    SEARCH_SYSTEM,
    `Search Salesforce for accounts matching: "${term}"`,
    signal,
  );
  const result = extractJSON<{ accounts: SalesforceAccount[] }>(text);
  return result?.accounts ?? [];
}

export async function loadSalesforceAccount(
  account: SalesforceAccount,
  signal?: AbortSignal,
): Promise<SalesforceIntelligence> {
  const text = await callClaudeAPI(
    INTEL_SYSTEM,
    `Load full intelligence for Salesforce account: ID="${account.id}", Name="${account.name}"`,
    signal,
  );
  const result = extractJSON<SalesforceIntelligence>(text);
  if (!result) throw new Error('Failed to parse account intelligence from Claude response');
  return result;
}

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function mapToSessionData(
  account: SalesforceAccount,
  intel: SalesforceIntelligence,
): Partial<SessionData> {
  const licenses: LicenseItem[] = intel.licenses.map((l) => ({
    id: uid(),
    product: l.product,
    quantity: l.quantity,
    status: l.status,
    expiry: l.expiry,
  }));

  const cases: CaseItem[] = intel.cases.map((c) => ({
    id: uid(),
    caseNumber: c.caseNumber,
    severity: c.severity,
    title: c.title,
    date: c.date,
    product: c.product,
    statusLabel: c.statusLabel,
  }));

  return {
    customerName: account.name,
    forcepointId: account.id,
    industry: account.industry ?? '',
    country: account.billingCountry ?? '',
    csm: intel.csm ?? '',
    accountOwner: intel.accountOwner ?? '',
    salesEngineer: intel.salesEngineer ?? '',
    partner: intel.partner ?? '',
    licenses,
    cases,
  };
}

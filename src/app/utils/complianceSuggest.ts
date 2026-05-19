/* Suggest a compliance-framework starter set based on customer jurisdiction.
   Used by Step 1 (the "Auto-suggest" button) and by Step11Summary as a
   FALLBACK when the user hasn't curated their own list yet. The shared
   logic keeps Part 0 · Compliance Exposure consistent in both places. */

import type { ComplianceFrameworkItem } from '../components/Dashboard';

interface SuggestInputs {
  country?: string;
  region?: string;
  industry?: string;
}

interface FrameworkSeed {
  code: string;
  name: string;
  relevance: string;
  pillar: string;
}

const TR_KVKK: FrameworkSeed = {
  code: 'KVKK',
  name: 'Kişisel Verilerin Korunması Kanunu',
  relevance: 'Personal data protection — Turkish equivalent of GDPR. Applies to any organisation processing personal data of Turkish residents.',
  pillar: 'Data Protection',
};
const TR_BDDK: FrameworkSeed = {
  code: 'BDDK',
  name: 'Bankacılık Düzenleme ve Denetleme Kurumu',
  relevance: 'Turkish banking regulator — IT governance, data localisation, mandatory incident reporting timelines.',
  pillar: 'Sectoral · Banking',
};
const GDPR_FW: FrameworkSeed = {
  code: 'GDPR',
  name: 'General Data Protection Regulation',
  relevance: 'EU data subject rights — applies to any processing of EU personal data, including cross-border transfers.',
  pillar: 'Data Protection',
};
const HIPAA_FW: FrameworkSeed = {
  code: 'HIPAA',
  name: 'Health Insurance Portability and Accountability Act',
  relevance: 'Protected health information safeguards — Privacy, Security, and Breach Notification Rules.',
  pillar: 'Sectoral · Healthcare',
};
const SOX_FW: FrameworkSeed = {
  code: 'SOX',
  name: 'Sarbanes-Oxley Act',
  relevance: 'Financial reporting controls — applies to US public companies; affects IT general controls over financial systems.',
  pillar: 'Sectoral · Financial',
};
const PCI_DSS: FrameworkSeed = {
  code: 'PCI-DSS',
  name: 'Payment Card Industry Data Security Standard',
  relevance: 'Cardholder data protection — universal for any organisation processing, storing, or transmitting payment cards.',
  pillar: 'Sectoral · Payments',
};
const ISO_27001: FrameworkSeed = {
  code: 'ISO 27001',
  name: 'Information Security Management Systems',
  relevance: 'Globally recognised baseline for information security governance and risk management certification.',
  pillar: 'Universal',
};
const NIS2_FW: FrameworkSeed = {
  code: 'NIS2',
  name: 'EU Network and Information Security Directive',
  relevance: 'Strengthened cybersecurity obligations for EU-based essential and important entities; effective from October 2024.',
  pillar: 'Sectoral · Cybersecurity',
};
const DORA_FW: FrameworkSeed = {
  code: 'DORA',
  name: 'Digital Operational Resilience Act',
  relevance: 'EU financial services digital operational resilience — applies from January 2025 to banks, insurers, and ICT third-party providers.',
  pillar: 'Sectoral · Financial Resilience',
};

function asFrameworkItem(seed: FrameworkSeed, idx: number): ComplianceFrameworkItem {
  return {
    id: `cf-${Date.now()}-${idx}-${seed.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    code: seed.code,
    name: seed.name,
    relevance: seed.relevance,
    pillar: seed.pillar,
    enabled: true,
    isCustom: false,
  };
}

export function suggestComplianceFrameworks({ country, region, industry }: SuggestInputs): ComplianceFrameworkItem[] {
  const co = (country || '').toLowerCase();
  const re = (region  || '').toLowerCase();
  const id = (industry || '').toLowerCase();
  const isTR     = /turkey|türkiye|tr\b/.test(co) || /turkey|türkiye/.test(re);
  const isEU     = /germany|france|spain|italy|netherlands|poland|belgium|sweden|austria|portugal|finland|ireland|denmark|emea/.test(co) || /emea|nemea/.test(re);
  const isUS     = /united states|usa|us\b/.test(co);
  const isBank   = /bank|financ|insur/.test(id);
  const isHealth = /health|hospital|pharma|medical/.test(id);
  const isRetail = /retail|payment|merchant|e[- ]?commerce/.test(id);

  const seeds: FrameworkSeed[] = [];
  if (isTR) {
    seeds.push(TR_KVKK);
    if (isBank) seeds.push(TR_BDDK);
  }
  if (isEU || isTR) {
    seeds.push(GDPR_FW);
    if (isEU) seeds.push(NIS2_FW);
    if (isEU && isBank) seeds.push(DORA_FW);
  }
  if (isUS && isHealth) seeds.push(HIPAA_FW);
  if (isUS) seeds.push(SOX_FW);
  if (isBank || isRetail || seeds.length === 0) seeds.push(PCI_DSS);
  seeds.push(ISO_27001);

  /* De-duplicate by code while preserving order */
  const seen = new Set<string>();
  return seeds
    .filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)))
    .map(asFrameworkItem);
}

export const ALL_FRAMEWORK_SEEDS: FrameworkSeed[] = [
  TR_KVKK, TR_BDDK, GDPR_FW, NIS2_FW, DORA_FW, HIPAA_FW, SOX_FW, PCI_DSS, ISO_27001,
];

export function blankFramework(): ComplianceFrameworkItem {
  return {
    id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: '',
    name: '',
    relevance: '',
    pillar: 'Custom',
    enabled: true,
    isCustom: true,
  };
}

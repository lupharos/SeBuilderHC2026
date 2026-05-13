// Recommended Enhancements — Forcepoint product suggestions surfaced in the
// executive report. Selected entries appear at the end of the PDF, full text.

export interface Enhancement {
  id: string;
  name: string;
  shortName: string;
  category: string;        // grouping badge ("Licensing", "Cloud", "DLP", "Email", "Web", "Web/Email")
  emoji: string;
  accent: string;          // hex accent color
  tagline: string;         // one-line summary for the card
  whyWeRecommendIt: string;
  businessValue: string;
}

export const ENHANCEMENTS: Enhancement[] = [
  {
    id: 'license-expansion',
    name: 'License Expansion',
    shortName: 'License Expansion',
    category: 'Licensing',
    emoji: '👥',
    accent: '#0EA5E9',
    tagline: 'Close coverage gaps across new hires, remote workers, and contractors.',
    whyWeRecommendIt:
      'As your organization grows, unprotected users represent an increasing compliance and data security risk. Gaps in coverage — whether from new hires, remote workers, or contractors — leave the organization exposed to policy violations and regulatory liability.',
    businessValue:
      'Full workforce coverage ensures consistent enforcement of security policies across every user, device, and location. It also optimizes the per-seat cost structure and strengthens the organization\'s overall compliance posture under applicable regional and international data protection regulations and industry frameworks.',
  },
  {
    id: 'dspm',
    name: 'Data Security Posture Management (DSPM)',
    shortName: 'DSPM',
    category: 'Cloud',
    emoji: '☁️',
    accent: '#7C3AED',
    tagline: 'Continuously discover, classify, and govern sensitive data across cloud platforms.',
    whyWeRecommendIt:
      'Cloud adoption has accelerated the sprawl of sensitive data across environments that are difficult to inventory and govern. Misconfigured storage, shadow data repositories, and over-permissioned access are among the leading causes of cloud-native data breaches.',
    businessValue:
      'Forcepoint DSPM continuously discovers, classifies, and monitors sensitive data across cloud platforms — providing leadership with a clear, real-time view of where critical data resides, who has access, and where risk exposure exists. This enables proactive remediation before incidents occur rather than reactive response after the fact, supporting compliance with applicable data sovereignty and protection requirements.',
  },
  {
    id: 'data-classification',
    name: 'Data Classification',
    shortName: 'Data Classification',
    category: 'DLP',
    emoji: '🏷️',
    accent: '#16A34A',
    tagline: 'Automate sensitive-content labeling to strengthen DLP accuracy and reduce noise.',
    whyWeRecommendIt:
      'DLP effectiveness is only as strong as the accuracy of data classification. Without consistent, automated labeling, security policies are applied inconsistently — increasing both false positives that disrupt business operations and false negatives that allow sensitive data to leave undetected.',
    businessValue:
      'Forcepoint Classification automates the identification and labeling of sensitive content based on context and content analysis — not manual user judgment. This directly strengthens DLP policy enforcement, reduces operational noise, and provides auditable evidence of data handling practices required by applicable regulatory and compliance frameworks.',
  },
  {
    id: 'email-security',
    name: 'Email Security — Secure Email Delivery & Advanced Logs',
    shortName: 'Email Security',
    category: 'Email',
    emoji: '✉️',
    accent: '#DB2777',
    tagline: 'Outbound encryption + granular telemetry for audit, compliance, and SOC integration.',
    whyWeRecommendIt:
      'Email remains the highest-risk channel for both inbound threats and outbound data loss. Many organizations rely on baseline filtering without addressing outbound encryption or the audit visibility needed for incident investigation and compliance reporting.',
    businessValue:
      'Secure Email Delivery ensures that emails containing sensitive or regulated content are automatically encrypted at the point of transmission — protecting the organization from inadvertent disclosure and demonstrating compliance to regulators and auditors across all operating jurisdictions. Advanced Logs provide granular, structured telemetry for every email transaction, enabling faster incident response, deeper SOC integration, and a complete audit trail for legal and compliance purposes.',
  },
  {
    id: 'rbi',
    name: 'Remote Browser Isolation (RBI)',
    shortName: 'RBI',
    category: 'Web / Email',
    emoji: '🛡️',
    accent: '#F97316',
    tagline: 'Detonate all active web content in a remote container — web and email URLs alike.',
    whyWeRecommendIt:
      'Traditional web filtering forces a binary decision: allow or block. This approach either leaves users exposed to risky but legitimate sites or creates friction that reduces productivity. As web-borne threats grow in sophistication, this limitation poses an unacceptable risk across both web browsing and web-based email access channels.',
    businessValue:
      'RBI minimizes risk by executing all web content — whether accessed through the browser or embedded within email links — in a secure, isolated cloud container. No active code ever reaches the user\'s endpoint. Threats delivered via malicious websites or email-borne URLs are neutralized before they can execute, while users retain full, seamless access to the content they need. This protection applies consistently across web and email security channels, safeguarding all user groups regardless of location or operating region.',
  },
  {
    id: 'amdp',
    name: 'Advanced Malware Detection & Prevention (AMDP)',
    shortName: 'AMDP',
    category: 'Web / Email',
    emoji: '🦠',
    accent: '#DC2626',
    tagline: 'Real-time behavioural sandbox covering both web downloads and email attachments.',
    whyWeRecommendIt:
      'Signature-based defenses are no longer sufficient against modern, evasive threats. Polymorphic malware, zero-day exploits, and targeted file-based attacks are specifically engineered to bypass conventional security controls across both web and email channels — and increasingly succeed in doing so.',
    businessValue:
      'AMDP minimizes risk by extending your Forcepoint security stack with real-time behavioural sandbox analysis across both web and email vectors. Suspicious files — whether downloaded from the web or delivered as email attachments — are detonated in an isolated environment before reaching users. This dual-channel coverage ensures that no unverified content enters the organization\'s environment, providing a critical last line of defense that operates seamlessly within your existing infrastructure without adding complexity for end users or the security team.',
  },
];

export const ENHANCEMENT_IDS = ENHANCEMENTS.map(e => e.id);

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
  /** Optional structured comparison/SLA table rendered inside the report card. */
  extraTable?: {
    title: string;
    headers: string[];
    rows: string[][];
    note?: string;
  };
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
    id: 'dlp',
    name: 'Data Loss Prevention (DLP)',
    shortName: 'DLP',
    category: 'DLP / On-prem / Cloud',
    emoji: '🛡️',
    accent: '#0891B2',
    tagline:
      'Continuously monitor, control, and protect sensitive data in motion — across endpoints, networks, email, web, and cloud channels.',
    whyWeRecommendIt:
      'Sensitive data does not stay within authorised boundaries. It moves through email, web uploads, USB devices, cloud sync clients, collaboration platforms, and printing — often without the security team knowing what was sent, by whom, or whether it was intentional. Insider threats, accidental oversharing, misconfigured cloud integrations, and policy gaps are among the leading causes of data exfiltration events in both public sector and enterprise environments. Without continuous, policy-driven control over data in motion, data protection programmes can see where sensitive data lives but cannot stop it from leaving.',
    businessValue:
      'Forcepoint DLP continuously monitors and controls sensitive data as it moves — across endpoints, email, web, cloud storage, collaboration tools, and removable media — giving security teams real-time visibility into how critical data is being used, transferred, or exfiltrated, and the ability to enforce policy automatically before a breach occurs. This enables proactive prevention rather than reactive investigation after the fact. For organisations running Forcepoint DSPM, DLP directly extends the existing investment by consuming accurate, up-to-date data classification from DSPM and applying it as enforceable policy at every data movement channel — improving detection precision, reducing false positives, and closing the gap between data-at-rest visibility and data-in-motion enforcement. Together, DLP and DSPM provide a complete data security posture that covers sensitive data at every stage of its lifecycle, supporting compliance with internationally recognised frameworks such as GDPR, HIPAA, PCI-DSS, SOX, and ISO 27001 as well as applicable data sovereignty and protection requirements.',
  },
  {
    id: 'dspm',
    name: 'Data Security Posture Management (DSPM)',
    shortName: 'DSPM',
    category: 'Cloud / On-prem',
    emoji: '☁️',
    accent: '#7C3AED',
    tagline: 'Continuously discover, classify, and govern sensitive data across your entire data estate — on-premises, cloud, and hybrid environments.',
    whyWeRecommendIt:
      'Sensitive data does not stay in one place. It spreads across file servers, databases, cloud storage, SaaS platforms, and data warehouses — often without the security team knowing where it has landed, who has access to it, or whether it is adequately protected. Misconfigured storage, shadow data repositories, stale access permissions, and unclassified sensitive data are among the leading causes of both cloud-native and on-premises data breaches. Without continuous visibility into where sensitive data lives across the full environment, data protection programmes are defending a perimeter they cannot fully see.',
    businessValue:
      'Forcepoint DSPM continuously discovers, classifies, and monitors sensitive data wherever it resides — across on-premises file servers, databases, private cloud infrastructure, public cloud platforms, and hybrid environments — providing leadership with a clear, real-time view of where critical data lives, who has access to it, and where risk exposure exists. This enables proactive remediation before incidents occur rather than reactive response after the fact. For organisations running Forcepoint DLP, DSPM directly strengthens the existing investment by feeding accurate, up-to-date data classification into the DLP policy engine — improving detection precision, reducing false positives, and closing the gap between data-at-rest visibility and data-in-motion enforcement. Together, DSPM and DLP provide a complete data security posture that covers sensitive data at every stage of its lifecycle, supporting compliance with internationally recognised frameworks such as GDPR, HIPAA, PCI-DSS, SOX, and ISO 27001 as well as applicable data sovereignty and protection requirements.',
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
      'Forcepoint Classification automates the identification and labeling of sensitive content based on context and content analysis — not manual user judgment. This directly strengthens DLP policy enforcement, reduces operational noise, and provides auditable evidence of data handling practices required by international regulatory and compliance frameworks including GDPR, HIPAA, PCI-DSS, and ISO 27001.',
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
    id: 'cloud-dlp-casb',
    name: 'Cloud DLP & Inline/API Cloud Application Control',
    shortName: 'Cloud DLP / CASB',
    category: 'Cloud',
    emoji: '☁️',
    accent: '#2563EB',
    tagline: 'Real-time and out-of-band data security across Microsoft 365, Google Workspace, and beyond — natively unified with Forcepoint DLP.',
    whyWeRecommendIt:
      'Cloud adoption has moved sensitive data out of the perimeter and into SaaS platforms where traditional controls don\'t reach. Most organizations rely on basic access controls without inspecting what data is actually flowing into — or out of — Microsoft 365, Google Workspace, Salesforce, or Box. Without Cloud DLP, a user can share a file containing regulated data via a public OneDrive link or upload it to an unsanctioned app — and no policy fires.',
    businessValue:
      'Inline & API-Based Enforcement delivers two complementary coverage layers: API mode scans and remediates sensitive content already at rest in sanctioned cloud apps without any network redirection, while inline mode enforces real-time upload blocking, adaptive access control, and Shadow IT governance at the point of transmission — before data reaches the cloud. Native DLP Integration is the decisive architectural advantage. Forcepoint CASB enforces the same classification engine, fingerprints, and policy framework as Forcepoint DLP — extended natively to the cloud channel. No re-authoring policies, no siloed incident queues, no integration overhead. A violation detected on SharePoint surfaces in the same workflow as an endpoint or network DLP event. For organizations subject to GDPR, KVKK, PDPL, or BDDK, CASB Cloud DLP provides auditable evidence that data protection controls follow the data — into every cloud environment.',
  },
  {
    id: 'web-security',
    name: 'Web Security — SSL Inspection, Advanced Reporting & Native DLP Integration',
    shortName: 'Web Security',
    category: 'Web',
    emoji: '🌐',
    accent: '#0EA5E9',
    tagline: 'Encrypted traffic visibility + granular telemetry + inline data loss prevention — without the complexity of third-party stacks.',
    whyWeRecommendIt:
      'Web remains the primary vector for both inbound malware delivery and outbound data exfiltration. Most organizations apply URL filtering and category controls without enabling SSL/TLS inspection — leaving the majority of today\'s encrypted web traffic completely unexamined. Without Advanced Reporting, security teams lack the structured telemetry needed for incident reconstruction, compliance evidence, and SIEM/SOC correlation. And critically: organizations running a separate, bolt-on DLP solution face policy fragmentation, coverage gaps at the web channel, and the operational overhead of managing two disconnected enforcement points.',
    businessValue:
      'SSL/TLS Inspection ensures that encrypted web sessions are fully decoded and inspected at the gateway — eliminating the blind spot that attackers and malicious insiders exploit to bypass standard controls, and providing consistent policy enforcement regardless of whether traffic is plain or encrypted. Advanced Reporting delivers granular, structured logs for every web transaction — user, URL, category, action, bytes transferred, and policy match — enabling faster incident response, complete audit trails for regulatory and legal purposes, and seamless integration into SOC workflows and SIEM platforms across all operating jurisdictions. Native DLP Integration is where Forcepoint\'s architecture creates a decisive advantage over point solutions. Rather than routing web traffic through a separate DLP engine — introducing latency, sync complexity, and policy drift — Forcepoint Web Security enforces DLP policies inline, at the web channel, using the same classification engine and policy framework as Forcepoint DLP. A single policy defined once, enforced everywhere — web upload, cloud sync, HTTP/S POST, and file transfer channels covered natively. No gap between what the DLP policy intends and what the web gateway actually enforces. Unified incident management: web-channel DLP violations appear in the same console and workflow as endpoint and network DLP events. Significantly lower total cost and operational complexity vs. stitching together a third-party web proxy with a standalone DLP platform. For organizations already running or evaluating Forcepoint DLP, the web gateway is not an add-on — it is the web enforcement arm of the same data security architecture.',
  },
  {
    id: 'rbi',
    name: 'Remote Browser Isolation (RBI)',
    shortName: 'RBI',
    category: 'Web / Email',
    emoji: '🌐',
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
  {
    id: 'protector-api',
    name: 'Protector API — DLP Policy Enforcement for Custom and AI-Powered Applications',
    shortName: 'Protector API',
    category: 'DLP',
    emoji: '🔌',
    accent: '#6366F1',
    tagline: 'Extend your existing DLP investment to cover internally developed applications, AI tools, and third-party platforms outside native channel coverage.',
    whyWeRecommendIt:
      'As organisations build custom applications — including AI-powered tools, internal enterprise platforms, and third-party integrations — these applications handle sensitive data outside the reach of standard DLP channel inspection. Email, web, and endpoint agents cannot see what happens inside a custom application. Without API-level integration, data processed, generated, or transmitted by these applications is invisible to the DLP policy engine, creating a growing blind spot that expands with every new application deployed.',
    businessValue:
      'The Protector API allows any custom or third-party application to submit data to the Forcepoint DLP policy engine in real time — before that data is saved, shared, or transmitted — and receive a policy decision consistent with the organisation\'s existing DLP ruleset. The API supports a rich set of DLP actions including allowing, blocking, encrypting, or quarantining data, and integrates with both internal custom applications and third-party services that operate outside standard DLP protocols such as SMTP, HTTP, or FTP. For organisations actively developing AI-powered applications, this means every internally built AI tool is subject to the same data protection controls as any other channel — ensuring that sensitive customer data, financial records, and regulated information cannot be exfiltrated through a custom application that sits outside the traditional DLP boundary. A single unified policy covers every channel, every application, and every data flow — without building separate security controls for each new tool.',
  },
  {
    id: 'professional-support',
    name: 'Forcepoint Professional Support',
    shortName: 'Professional Support',
    category: 'Support / Success',
    emoji: '🤝',
    accent: '#36B0C9',
    tagline: 'Premium technical support & success services — maximise the protection, performance, and longevity of your Forcepoint investment with dedicated expert support.',
    whyWeRecommendIt:
      'Deploying an enterprise data security platform is not a one-time event — it is a continuous operational commitment. Policies require tuning as business processes evolve. New data sources, cloud platforms, and user workflows introduce unforeseen edge cases. Software updates bring new capabilities that demand configuration review. Incident investigations require rapid, expert-level guidance. Without direct access to Forcepoint-certified engineers who understand both the product architecture and your specific deployment, resolution times extend, misconfigurations persist, and the full protective potential of the platform goes unrealised. The gap between a functioning deployment and a fully optimised one is almost always a support and expertise gap — not a technology gap.',
    businessValue:
      'Forcepoint Professional Support provides your security and IT teams with priority access to senior Forcepoint engineers, ensuring that critical issues are escalated and resolved rapidly — minimising business disruption and maintaining continuous protection. Beyond break-fix resolution, the service delivers proactive health monitoring, policy review guidance, and product update advisory, enabling your team to stay ahead of configuration drift and emerging threat vectors rather than responding to them after impact. For organisations that have made a significant investment in Forcepoint DLP, Web Security, Email Security, or DSPM, Professional Support directly protects the return on that investment — reducing mean time to resolution, accelerating the adoption of new capabilities, and ensuring that platform performance does not degrade over time as the environment grows and changes. This is particularly relevant for regulated environments operating under international compliance frameworks such as GDPR, HIPAA, PCI-DSS, SOX, and ISO 27001, where sustained, demonstrable platform effectiveness is not optional — it is an audit requirement.',
  },
  {
    id: 'enhanced-enterprise-support',
    name: 'Forcepoint Enhanced / Enterprise Support',
    shortName: 'Enhanced / Enterprise Support',
    category: 'Support / Success',
    emoji: '🎯',
    accent: '#023E8A',
    tagline: 'Premium Support & Customer Success Program — guaranteed response times, dedicated Success Management, and proactive strategic guidance.',
    whyWeRecommendIt:
      'A security platform is only as effective as the operational capability surrounding it. Policies drift as environments change. New user behaviours, cloud workloads, and data flows introduce edge cases that standard configurations do not anticipate. Software updates bring new capabilities that require deliberate tuning to deliver their full protective value. When a critical incident occurs — a data exfiltration attempt, a policy engine failure, a misconfigured enforcement node — the difference between a one-hour resolution and a four-hour resolution is not a technical question; it is a support tier question. Organisations operating under Essential Support accept standard response windows and queue prioritisation that places them behind Enhanced and Enterprise subscribers at precisely the moments when speed matters most. For environments subject to international regulatory regimes such as GDPR, HIPAA, PCI-DSS, SOX, or ISO 27001, extended exposure windows during critical incidents are not merely an operational inconvenience — they carry direct regulatory and reputational risk.',
    businessValue:
      'Upgrading to Forcepoint Enhanced or Enterprise Support transforms the support relationship from reactive case management into a proactive success partnership. A designated Customer Success Manager builds a structured understanding of your Forcepoint deployment, creates a tailored Customer Success Plan, and conducts quarterly — or with Enterprise, monthly — progress reviews to ensure the platform continues to deliver against your evolving security objectives. For complex enterprise environments, the Customer Success Architect layer adds highly skilled technical and domain advisory, translating Forcepoint capabilities directly into operational improvements and best practice guidance specific to your architecture. Enhanced Support additionally extends 24/7 coverage to Severity 2 issues — ensuring that business-impacting problems outside standard working hours receive the same urgency as Severity 1 cases, without waiting for the next business day. The annual Value Review (semi-annual under Enterprise) provides a formal mechanism to measure platform effectiveness, identify configuration improvement areas, and surface system health findings — directly complementing the Health Check programme and ensuring that findings are acted upon with expert guidance rather than left to internal teams to interpret and prioritise alone.',
    extraTable: {
      title: 'Response Time Targets by Support Tier',
      headers: ['Severity', 'Essential', 'Enhanced', 'Enterprise'],
      rows: [
        ['Severity 1', '1 hour', '45 minutes', '30 minutes'],
        ['Severity 2', '4 business hours', '2 hours', '2 hours'],
        ['Severity 3', '8 business hours', '6 business hours', '4 business hours'],
        ['Severity 4', '2 business days', '2 business days', '1 business day'],
      ],
      note: 'Enhanced extends 24/7 coverage to Severity 2. Enterprise adds dedicated Customer Success Architect and monthly progress reviews.',
    },
  },
  {
    id: 'v-series-appliances',
    name: 'Forcepoint V Series Appliances',
    shortName: 'V Series Appliances',
    category: 'Hardware Refresh',
    emoji: '🖥️',
    accent: '#0F766E',
    tagline: 'Hardware refresh & extended warranty programme — protect the performance, reliability, and supportability of your Forcepoint deployment with purpose-built appliance hardware.',
    whyWeRecommendIt:
      'Enterprise security appliances carry a hidden lifecycle risk that is rarely visible until it becomes critical. As hardware ages, the gap between what the platform was sized to handle at deployment and what it is asked to process today quietly widens — traffic volumes grow, policy complexity increases, inspection depth expands, and logged event rates climb. Appliances that were correctly sized three or four years ago may now be operating closer to their throughput ceiling than the monitoring dashboards reveal, introducing latency in enforcement, delays in log delivery, and increased risk of dropped inspection under peak load conditions. Beyond performance degradation, out-of-warranty hardware exposes the organisation to unmitigated component failure risk: a storage, network interface, or power supply failure on an unprotected appliance translates directly into an enforcement gap with no guaranteed resolution timeline. For environments where data protection continuity is a compliance requirement, that exposure is unacceptable.',
    businessValue:
      'The Forcepoint V Series appliance portfolio is purpose-built for enterprise data security workloads, incorporating Forcepoint\'s proprietary Advanced Classification Engine (ACE) technology for real-time threat identification and classification at line rate — ensuring that policy enforcement keeps pace with traffic without sacrificing inspection fidelity. All V Series models ship with redundant storage and network interfaces as standard on mid-range and flagship configurations, directly eliminating the single points of failure that represent the most common cause of unplanned enforcement downtime. Refreshing to a current-generation V Series appliance simultaneously resolves capacity headroom concerns, resets the hardware lifecycle, and delivers the full five-year warranty coverage included as standard — making the refresh decision a consolidation of performance, reliability, and risk management into a single investment.',
    extraTable: {
      title: 'V Series Model Selection Guide',
      headers: ['Model', 'Target Environment', '10GbE Support', 'Warranty (Included)'],
      rows: [
        ['V5000',  'Branch office / entry-level',     '—',                                 '5 years · Next Business Day'],
        ['V10000', 'Medium enterprise',                'Up to 10GbE (fiber NIC add-on)',    '5 years · 4-hour on-site'],
        ['V20000', 'Large enterprise / flagship',      '10GbE default (fiber or DAC)',      '5 years · 4-hour on-site'],
      ],
      note: 'For appliances approaching or past standard warranty, the Extended Warranty Programme provides continued on-site hardware support beyond the standard term — preserving the 4-hour on-site SLA that enterprise environments depend on. Combined with Enhanced or Enterprise Support, appliance warranty and software support lifecycles align to provide a unified, fully covered infrastructure platform with no gaps in either hardware or software protection.',
    },
  },
];

export const ENHANCEMENT_IDS = ENHANCEMENTS.map(e => e.id);

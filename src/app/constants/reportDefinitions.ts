export interface ReportDef {
  id: string;
  title: string;
  product: 'web' | 'dlp' | 'email';
  sqlKey: string;
}

export const WEB_REPORTS: ReportDef[] = [
  { id: 'web_high_risk_sites',        title: 'Top 5 Users Accessing High-Risk Websites',                               product: 'web', sqlKey: 'web_high_risk_sites' },
  { id: 'web_malware_phishing',       title: 'Top 5 Users Triggering Malware or Phishing Alerts',                     product: 'web', sqlKey: 'web_malware_phishing' },
  { id: 'web_risky_categories',       title: 'Users Allowed to Access Risky Web Categories',                          product: 'web', sqlKey: 'web_risky_categories' },
  { id: 'web_block_recommendations',  title: 'Recommended Web Categories for Blocking',                               product: 'web', sqlKey: 'web_block_recommendations' },
  { id: 'web_rbi_candidates',         title: 'Users Recommended for Remote Browser Isolation (RBI)',                  product: 'web', sqlKey: 'web_rbi_candidates' },
  { id: 'web_cloud_upload',           title: 'Top 5 Users Uploading Data to Unsanctioned Cloud Applications',         product: 'web', sqlKey: 'web_cloud_upload' },
  { id: 'web_policy_bypass',          title: 'Top 5 Users Bypassing Web Security Policies',                           product: 'web', sqlKey: 'web_policy_bypass' },
  { id: 'web_high_risk_categories',   title: 'Most Accessed High-Risk Web Categories',                                product: 'web', sqlKey: 'web_high_risk_categories' },
  { id: 'web_new_domains',            title: 'Top 5 Users Accessing Newly Registered or Uncategorized Domains',       product: 'web', sqlKey: 'web_new_domains' },
  { id: 'web_excessive_incidents',    title: 'Top 5 Users Generating Excessive Web Security Incidents',               product: 'web', sqlKey: 'web_excessive_incidents' },
  { id: 'web_c2_domains',             title: 'Top 5 Devices Communicating with Potential C2 Domains',                 product: 'web', sqlKey: 'web_c2_domains' },
  { id: 'web_proxy_services',         title: 'Users Frequently Accessing Encrypted or Anonymous Proxy Services',      product: 'web', sqlKey: 'web_proxy_services' },
  { id: 'web_suspicious_files',       title: 'Top 5 Users Downloading Executable or Suspicious Files',                product: 'web', sqlKey: 'web_suspicious_files' },
  { id: 'web_phishing_targets',       title: 'Most Targeted Users by Phishing Attempts',                             product: 'web', sqlKey: 'web_phishing_targets' },
  { id: 'web_ai_filesharing',         title: 'Top 5 Users Accessing Suspicious AI or File-Sharing Platforms',        product: 'web', sqlKey: 'web_ai_filesharing' },
];

export const DLP_REPORTS: ReportDef[] = [
  { id: 'dlp_policy_violations',      title: 'Top 5 Users Triggering DLP Policy Violations',                         product: 'dlp', sqlKey: 'dlp_policy_violations' },
  { id: 'dlp_frequent_policies',      title: 'Most Frequently Violated DLP Policies',                                product: 'dlp', sqlKey: 'dlp_frequent_policies' },
  { id: 'dlp_sensitive_categories',   title: 'Top 5 Sensitive Data Categories Detected in Outbound Traffic',         product: 'dlp', sqlKey: 'dlp_sensitive_categories' },
  { id: 'dlp_exfiltration',           title: 'Users with Repeated Data Exfiltration Attempts',                       product: 'dlp', sqlKey: 'dlp_exfiltration' },
  { id: 'dlp_external_storage',       title: 'Top 5 Users Attempting to Transfer Files to External Storage',         product: 'dlp', sqlKey: 'dlp_external_storage' },
  { id: 'dlp_email_outbound',         title: 'Top 5 Users Sending Sensitive Data via Outbound Email',                product: 'dlp', sqlKey: 'dlp_email_outbound' },
  { id: 'dlp_classification_labels',  title: 'Most Common Data Classification Labels on Intercepted Files',          product: 'dlp', sqlKey: 'dlp_classification_labels' },
  { id: 'dlp_cloud_upload',           title: 'Top 5 Cloud Applications Used for Unauthorized Data Upload',           product: 'dlp', sqlKey: 'dlp_cloud_upload' },
  { id: 'dlp_removable_media',        title: 'Users Attempting to Copy Sensitive Data to Removable Media',           product: 'dlp', sqlKey: 'dlp_removable_media' },
  { id: 'dlp_dept_violations',        title: 'Top 5 Departments with Highest DLP Policy Violation Rates',            product: 'dlp', sqlKey: 'dlp_dept_violations' },
  { id: 'dlp_rules_by_category',      title: 'Most Triggered DLP Rules by Category',                                 product: 'dlp', sqlKey: 'dlp_rules_by_category' },
  { id: 'dlp_pending_review',         title: 'Users with Pending DLP Incident Review',                               product: 'dlp', sqlKey: 'dlp_pending_review' },
  { id: 'dlp_policy_override',        title: 'Top 5 Users Requesting Policy Override or Bypass',                     product: 'dlp', sqlKey: 'dlp_policy_override' },
  { id: 'dlp_print_screenshot',       title: 'Sensitive Data Detected in Print or Screenshot Activity',              product: 'dlp', sqlKey: 'dlp_print_screenshot' },
  { id: 'dlp_critical_alerts',        title: 'Top 5 Users Generating Critical-Severity DLP Alerts',                  product: 'dlp', sqlKey: 'dlp_critical_alerts' },
];

export const EMAIL_REPORTS: ReportDef[] = [
  { id: 'email_phishing_received',    title: 'Top 5 Users Receiving Phishing Emails',                                product: 'email', sqlKey: 'email_phishing_received' },
  { id: 'email_suspicious_outbound',  title: 'Top 5 Users Sending Suspicious Outbound Emails',                       product: 'email', sqlKey: 'email_suspicious_outbound' },
  { id: 'email_malware_threats',      title: 'Top 5 Email-Borne Malware or Ransomware Threats Detected',             product: 'email', sqlKey: 'email_malware_threats' },
  { id: 'email_phishing_vectors',     title: 'Most Common Phishing Attack Vectors and Lures',                        product: 'email', sqlKey: 'email_phishing_vectors' },
  { id: 'email_malicious_domains',    title: 'Top 5 External Domains Sending Malicious Emails',                      product: 'email', sqlKey: 'email_malicious_domains' },
  { id: 'email_spam_volume',          title: 'Users with Highest Inbound Spam or Threat Volume',                     product: 'email', sqlKey: 'email_spam_volume' },
  { id: 'email_bec',                  title: 'Business Email Compromise (BEC) Indicators',                           product: 'email', sqlKey: 'email_bec' },
  { id: 'email_attachment_threats',   title: 'Email Attachment Threat Analysis by File Type',                        product: 'email', sqlKey: 'email_attachment_threats' },
  { id: 'email_malicious_links',      title: 'Top 5 Users Clicking on Malicious Email Links',                        product: 'email', sqlKey: 'email_malicious_links' },
  { id: 'email_spoofed_domains',      title: 'Spoofed or Impersonated Domain Detection',                             product: 'email', sqlKey: 'email_spoofed_domains' },
  { id: 'email_policy_bypass',        title: 'Top 5 Users Bypassing Email Security Policies',                        product: 'email', sqlKey: 'email_policy_bypass' },
  { id: 'email_blocked_senders',      title: 'Most Frequently Blocked Senders and Domains',                          product: 'email', sqlKey: 'email_blocked_senders' },
  { id: 'email_dlp_violations',       title: 'Top 5 Users with Outbound Email DLP Policy Violations',                product: 'email', sqlKey: 'email_dlp_violations' },
  { id: 'email_threat_categories',    title: 'Most Common Email Threat Categories Over Time',                         product: 'email', sqlKey: 'email_threat_categories' },
  { id: 'email_alert_generators',     title: 'Top 5 Internal Users Generating Email Security Alerts',                product: 'email', sqlKey: 'email_alert_generators' },
];

export const ALL_REPORTS: ReportDef[] = [...WEB_REPORTS, ...DLP_REPORTS, ...EMAIL_REPORTS];

export const ALL_REPORT_IDS = ALL_REPORTS.map(r => r.id);

export const REPORT_GROUPS: { label: string; emoji: string; product: 'web' | 'dlp' | 'email'; color: string; bg: string; border: string; reports: ReportDef[] }[] = [
  { label: 'Web Security',   emoji: '🌐', product: 'web',   color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd', reports: WEB_REPORTS   },
  { label: 'Data Security',  emoji: '🛡️', product: 'dlp',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', reports: DLP_REPORTS   },
  { label: 'Email Security', emoji: '✉️',  product: 'email', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3', reports: EMAIL_REPORTS },
];

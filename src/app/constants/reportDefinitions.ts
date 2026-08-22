/* Runtime result of executing a report's SQL template against the live
   customer DB via the local companion server. Not persisted — held in
   Dashboard `useState` so it survives between wizard steps but disappears
   on refresh. */
export interface ReportRunResult {
  state: 'idle' | 'running' | 'ok' | 'error';
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  latencyMs?: number;
  windowDays?: number;
  error?: string;
  ranAt?: string;
}

export interface ReportDef {
  id: string;
  title: string;
  product: 'web' | 'dlp' | 'email';
  sqlKey: string;
  /* Time window (days) used when the operator hasn't overridden it.
     Default: 7 days (tactical); advanced analytics use 100. */
  defaultWindowDays?: number;
  /* TOP N rows returned by the query (default: 5).
     When true, the report uses a hard-coded window (e.g. the 7-vs-100
     spike detector). The wizard hides the window selector for it. */
  defaultTopN?: number;
  /* When true, the report uses a hard-coded window (e.g. the 7-vs-100
     spike detector). The wizard hides the window selector for it. */
  fixedWindow?: boolean;
}

export const WEB_REPORTS: ReportDef[] = [
  /* Web Security Usage Analysis — Kemal's query pack (parametrized window + TOP N) */
  { id: 'web_top_value_classes',      title: 'Top Risk Classes (Value Classes)',                                      product: 'web', sqlKey: 'web_top_value_classes',      defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_value_class_breakdown',  title: 'Risk Class → Category Breakdown',                                        product: 'web', sqlKey: 'web_value_class_breakdown',  defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_disposition_analysis',   title: 'Allow/Block Policy Effectiveness',                                      product: 'web', sqlKey: 'web_disposition_analysis',   defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_top_categories',         title: 'Top Categories Overall',                                                product: 'web', sqlKey: 'web_top_categories',         defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_user_time_analysis',     title: 'User Time Usage by Category',                                           product: 'web', sqlKey: 'web_user_time_analysis',     defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_top_users',              title: 'Top Users by Activity',                                                 product: 'web', sqlKey: 'web_top_users',              defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_ai_top_urls',            title: '🤖 Shadow AI Tools Detection',                                          product: 'web', sqlKey: 'web_ai_top_urls',            defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_ai_top_users',           title: '🤖 Top AI Tool Users',                                                  product: 'web', sqlKey: 'web_ai_top_users',           defaultWindowDays: 7, defaultTopN: 5 },

  /* Advanced: Row-level log detail queries */
  { id: 'web_bot_networks',           title: 'Bot Networks Activity (Detail)',                                         product: 'web', sqlKey: 'web_bot_networks',           defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_malicious_sites',        title: 'Malicious Web Sites (Detail)',                                           product: 'web', sqlKey: 'web_malicious_sites',        defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_security_category',      title: 'Security Category Access (Detail)',                                      product: 'web', sqlKey: 'web_security_category',      defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'web_amt_logs',               title: 'Advanced Malware Threat Logs',                                           product: 'web', sqlKey: 'web_amt_logs',               defaultWindowDays: 7, defaultTopN: 5 },
];

/* Data Security report queries are partition-aware. Each one looks up the
   currently ONLINE_ACTIVE partition in PA_EVENT_PARTITION_CATALOG and runs
   a templated dynamic SQL against PA_EVENTS_<partition>. Templates live
   server-side in `server/queries.mjs` keyed by `sqlKey` below.

   `defaultWindowDays` seeds the per-row window selector in Step 3.
   `fixedWindow: true` hides the selector (the analysis is bound to a
   specific window, e.g. the 7-vs-100 spike comparison). */
export const DLP_REPORTS: ReportDef[] = [
  { id: 'dlp_top_violators',     title: 'Top Users Triggering DLP Policy Violations',         product: 'dlp', sqlKey: 'dlp_top_violators',     defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_top_policies',      title: 'Most Frequently Violated DLP Policies',              product: 'dlp', sqlKey: 'dlp_top_policies',      defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_sensitive_data',    title: 'Top Sensitive Data Categories Detected',             product: 'dlp', sqlKey: 'dlp_sensitive_data',    defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_repeated_exfil',    title: 'Users with Repeated Exfiltration Attempts',          product: 'dlp', sqlKey: 'dlp_repeated_exfil',    defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_cloud_uploads',     title: 'Top Cloud Applications Used for Upload Attempts',    product: 'dlp', sqlKey: 'dlp_cloud_uploads',     defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_critical_users',    title: 'Top Critical Severity Users',                        product: 'dlp', sqlKey: 'dlp_critical_users',    defaultWindowDays: 7, defaultTopN: 5 },

  /* Advanced analytics — broader default window. Window selector remains
     available so the analyst can shorten the view per assessment. */
  { id: 'dlp_user_risk_profile', title: 'User Risk + Activity Profile',                       product: 'dlp', sqlKey: 'dlp_user_risk_profile', defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_user_anomaly',      title: 'User Anomaly Detection (7 vs 100-day spike)',        product: 'dlp', sqlKey: 'dlp_user_anomaly',      defaultWindowDays: 7,   fixedWindow: true },
  { id: 'dlp_domain_cluster',    title: 'Domain Risk & Behavior Cluster',                     product: 'dlp', sqlKey: 'dlp_domain_cluster',    defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_ai_usage',          title: 'AI / GenAI Usage + User Mapping',                    product: 'dlp', sqlKey: 'dlp_ai_usage',          defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_genai_leaks',       title: 'GenAI & Cloud Destinations — Leak Incident Counts',  product: 'dlp', sqlKey: 'dlp_genai_leaks',       defaultWindowDays: 7, defaultTopN: 5 },
  { id: 'dlp_false_positive',    title: 'False Positive Signal Engine',                       product: 'dlp', sqlKey: 'dlp_false_positive',    defaultWindowDays: 7, defaultTopN: 5 },
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

/* ═══════════════════════════════════════════════════════════════
   FORCEPOINT HC — RULE ENGINE
   Each rule maps to a YES/NO health-check question.
   Answering "NO" (or triggering numeric thresholds) fires the rule.
═══════════════════════════════════════════════════════════════ */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AnswerValue = 'yes' | 'no' | 'na' | null;
export type ChecklistAnswers = Record<string, AnswerValue>;

/* ── Template checklist types (new) ── */
export interface QuestionAnswer {
  value: AnswerValue;
  note?: string;
}
export type TemplateAnswers = Record<string, QuestionAnswer>;

export interface Rule {
  id: string;
  severity: Severity;
  product: ProductCategory;
  title: string;
  description: string;
  remediation: string;
  /** The question key in ChecklistAnswers */
  questionId: string;
  /** The human-readable question text */
  questionText: string;
  /** Which answer fires the rule ('no' = most common, 'yes' = for reversed logic) */
  triggerOn: 'no' | 'yes';
}

export type ProductCategory =
  | 'Hardware & OS'
  | 'Web Security'
  | 'DLP'
  | 'Email Security'
  | 'NGFW'
  | 'DSPM'
  | 'Classification';

export interface Finding {
  rule: Rule;
  firedAt: Date;
}

/* ─────────────────────────────────────────────────────────────
   RULE DEFINITIONS
───────────────────────────────────────────────────────────── */
export const ALL_RULES: Rule[] = [

  /* ── Hardware & OS ── */
  {
    id: 'HW-01', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Fan/thermal alerts not checked',
    description: 'iDRAC/IPMI thermal alerts not reviewed. Hardware failure risk elevated.',
    remediation: '→ Check iDRAC → System → Thermal. Configure SNMP/email alert forwarding immediately.',
    questionId: 'hw_thermal_ok',
    questionText: 'iDRAC/IPMI thermal alerts reviewed and all clear?',
    triggerOn: 'no',
  },
  {
    id: 'HW-06', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'RAID disk health issue',
    description: 'Disk health not confirmed. RAID degradation risk.',
    remediation: '→ Check RAID status via iDRAC. Replace failed/degraded disks immediately.',
    questionId: 'hw_raid_ok',
    questionText: 'RAID disk health confirmed healthy (no degraded/failed disks)?',
    triggerOn: 'no',
  },
  {
    id: 'HW-09', severity: 'HIGH', product: 'Hardware & OS',
    title: 'Appliance warranty expired',
    description: 'Warranty expired — hardware replacement costs fall on customer.',
    remediation: '→ Renew Forcepoint hardware support or plan appliance refresh.',
    questionId: 'hw_warranty_active',
    questionText: 'Appliance hardware support contract active (not expired)?',
    triggerOn: 'no',
  },
  {
    id: 'HW-10', severity: 'HIGH', product: 'Hardware & OS',
    title: 'Appliance reached End-of-Sale',
    description: 'EoS reached — no new licenses or hardware replacements available.',
    remediation: '→ Plan migration to current-gen appliance.',
    questionId: 'hw_not_eos',
    questionText: 'Appliance model still within sales lifecycle (not End-of-Sale)?',
    triggerOn: 'no',
  },
  {
    id: 'HW-11', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Appliance reached End-of-Life',
    description: 'EoL passed — no security patches or support available.',
    remediation: '→ Initiate hardware refresh. Upgrade to current-gen V-Series or cloud equivalent.',
    questionId: 'hw_not_eol',
    questionText: 'Appliance model still supported (not End-of-Life)?',
    triggerOn: 'no',
  },
  {
    id: 'OS-01', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'CPU utilization exceeds 80%',
    description: 'Sustained high CPU causes proxy slowdowns and policy enforcement failures.',
    remediation: '→ Review proxy logs for traffic spikes. Consider adding capacity.',
    questionId: 'os_cpu_ok',
    questionText: 'Current CPU utilization below 80%?',
    triggerOn: 'no',
  },
  {
    id: 'OS-02', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'RAM utilization exceeds 85%',
    description: 'High memory pressure causes OOM kills and service instability.',
    remediation: '→ Restart affected services. Consider appliance upgrade.',
    questionId: 'os_ram_ok',
    questionText: 'Current RAM utilization below 85%?',
    triggerOn: 'no',
  },
  {
    id: 'OS-03', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Disk usage critical',
    description: 'High disk on /var, /opt or /tmp — log rotation failure imminent.',
    remediation: '→ Clear old logs, increase disk or reconfigure log rotation.',
    questionId: 'os_disk_ok',
    questionText: 'Disk usage on /var, /opt and /tmp below critical threshold?',
    triggerOn: 'no',
  },
  {
    id: 'SW-04', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Critical hotfixes not applied',
    description: 'Unpatched CVEs leave appliance exposed to known exploits.',
    remediation: '→ Apply all critical hotfixes. Check Forcepoint HotFix tracker.',
    questionId: 'sw_hotfixes_applied',
    questionText: 'All critical hotfixes applied (HotFix tracker verified)?',
    triggerOn: 'no',
  },
  {
    id: 'NET-03', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'DNS resolution failing',
    description: 'Proxy cannot resolve URLs — browsing blocked or bypassing policy.',
    remediation: '→ Check DNS server config and firewall rules to port 53.',
    questionId: 'net_dns_ok',
    questionText: 'DNS resolution functioning correctly from appliance?',
    triggerOn: 'no',
  },
  {
    id: 'HA-01', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'HA nodes not in expected state',
    description: 'No redundancy — single point of failure active.',
    remediation: '→ Investigate HA node status. Re-sync configuration and heartbeat links.',
    questionId: 'ha_nodes_ok',
    questionText: 'HA cluster nodes all in expected healthy state?',
    triggerOn: 'no',
  },
  {
    id: 'SEC-01', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Default admin password not changed',
    description: 'Factory default credentials allow full appliance takeover.',
    remediation: '→ Change admin password immediately.',
    questionId: 'sec_password_changed',
    questionText: 'Default admin password changed from factory default?',
    triggerOn: 'no',
  },
  {
    id: 'SEC-02', severity: 'CRITICAL', product: 'Hardware & OS',
    title: 'Management UI not IP-restricted',
    description: 'Appliance admin UI accessible from any network.',
    remediation: '→ Restrict management access to approved admin IPs/subnets.',
    questionId: 'sec_mgmt_restricted',
    questionText: 'Management UI access restricted to approved IP subnets?',
    triggerOn: 'no',
  },

  /* ── Web Security ── */
  {
    id: 'WS-LIC-01', severity: 'CRITICAL', product: 'Web Security',
    title: 'Web Security license expiring',
    description: 'License within 30 days of expiry — service disruption imminent.',
    remediation: '→ Renew subscription immediately. Contact CSM.',
    questionId: 'ws_license_ok',
    questionText: 'Web Security license valid for more than 30 days?',
    triggerOn: 'no',
  },
  {
    id: 'WS-SSL-01', severity: 'HIGH', product: 'Web Security',
    title: 'SSL inspection not enabled',
    description: 'Encrypted traffic not inspected — threats in HTTPS undetected.',
    remediation: '→ Enable HTTPS inspection in FSM → SSL Settings.',
    questionId: 'ws_ssl_enabled',
    questionText: 'HTTPS/SSL inspection enabled in FSM?',
    triggerOn: 'no',
  },
  {
    id: 'WS-SSL-02', severity: 'CRITICAL', product: 'Web Security',
    title: 'Root CA not deployed to endpoints',
    description: 'SSL inspection enabled but CA cert missing — browsers show cert errors.',
    remediation: '→ Push CA cert via GPO/MDM to all managed endpoints.',
    questionId: 'ws_ca_deployed',
    questionText: 'Root CA certificate deployed to all managed endpoints?',
    triggerOn: 'no',
  },
  {
    id: 'WS-SSL-07', severity: 'CRITICAL', product: 'Web Security',
    title: 'Root CA certificate expired',
    description: 'Expired CA causes mass TLS errors for all inspected traffic.',
    remediation: '→ Renew CA certificate and re-deploy to all endpoints.',
    questionId: 'ws_ca_valid',
    questionText: 'SSL/TLS root CA certificate within validity period (not expired)?',
    triggerOn: 'no',
  },
  {
    id: 'WS-THREAT-01', severity: 'CRITICAL', product: 'Web Security',
    title: 'Anti-malware engine not active',
    description: 'HTTP/HTTPS traffic passes without malware scanning.',
    remediation: '→ Enable anti-malware in FSM → Policy → Content Scanning.',
    questionId: 'ws_antimalware_active',
    questionText: 'Anti-malware engine active on HTTP/HTTPS traffic?',
    triggerOn: 'no',
  },
  {
    id: 'WS-THREAT-02', severity: 'HIGH', product: 'Web Security',
    title: 'AMDP sandbox not integrated',
    description: 'Suspicious files not sent for deep analysis.',
    remediation: '→ Enable AMDP in FSM → Advanced Malware.',
    questionId: 'ws_amdp_enabled',
    questionText: 'AMDP (Advanced Malware Detection & Protection) sandbox integration enabled?',
    triggerOn: 'no',
  },
  {
    id: 'WS-POL-01', severity: 'HIGH', product: 'Web Security',
    title: 'URL category database outdated',
    description: 'Stale category data — new malicious domains not blocked.',
    remediation: '→ Check FSM → Configuration → Subscription.',
    questionId: 'ws_urldb_current',
    questionText: 'URL category database up-to-date (subscription current)?',
    triggerOn: 'no',
  },
  {
    id: 'WS-INF-04', severity: 'CRITICAL', product: 'Web Security',
    title: 'Hybrid connector broken',
    description: 'Policy Server cannot reach Forcepoint Cloud — hybrid users get no policy.',
    remediation: '→ Check hybrid connector in FSM → General. Verify firewall rules.',
    questionId: 'ws_hybrid_ok',
    questionText: 'Hybrid connector healthy and reaching Forcepoint Cloud?',
    triggerOn: 'no',
  },

  /* ── DLP ── */
  {
    id: 'DS-LIC-01', severity: 'CRITICAL', product: 'DLP',
    title: 'DLP subscription expiring',
    description: 'License expiry — endpoint agents stop enforcing policy.',
    remediation: '→ Renew DLP subscription immediately.',
    questionId: 'ds_license_ok',
    questionText: 'DLP subscription valid for more than 30 days?',
    triggerOn: 'no',
  },
  {
    id: 'DS-INF-02', severity: 'CRITICAL', product: 'DLP',
    title: 'DLP Management Server unreachable',
    description: 'DLP Manager offline — no policy enforcement.',
    remediation: '→ Restore DLP Manager service. Check server health and DB connectivity.',
    questionId: 'ds_mgmt_server_ok',
    questionText: 'DLP Management Server reachable and healthy?',
    triggerOn: 'no',
  },
  {
    id: 'DS-INF-03', severity: 'CRITICAL', product: 'DLP',
    title: 'DLP Endpoint Server not healthy',
    description: 'Endpoint server failure — agents cannot receive policy updates.',
    remediation: '→ Restart DLP Endpoint Server. Check event logs.',
    questionId: 'ds_endpoint_server_ok',
    questionText: 'DLP Endpoint Server healthy and running?',
    triggerOn: 'no',
  },
  {
    id: 'DS-INF-05', severity: 'CRITICAL', product: 'DLP',
    title: 'Endpoint agent heartbeat lost',
    description: 'Agents not checking in — policy out of date.',
    remediation: '→ Check network connectivity and agent service status.',
    questionId: 'ds_agent_heartbeat_ok',
    questionText: 'Endpoint agents checking in (heartbeat active within last 24h)?',
    triggerOn: 'no',
  },
  {
    id: 'DS-INC-02', severity: 'CRITICAL', product: 'DLP',
    title: 'Critical incidents not alerting SOC',
    description: 'Real-time alerting disabled — SOC blind to active exfiltration.',
    remediation: '→ Configure SIEM integration and real-time alert rules.',
    questionId: 'ds_soc_alerts_ok',
    questionText: 'Critical DLP incidents configured to alert SOC in real-time?',
    triggerOn: 'no',
  },
  {
    id: 'DS-POL-07', severity: 'HIGH', product: 'DLP',
    title: 'High false positive rate in DLP',
    description: 'Alert fatigue causes SOC to ignore incidents.',
    remediation: '→ Tune policies using FSM analytics.',
    questionId: 'ds_fp_rate_ok',
    questionText: 'DLP false positive rate within acceptable range (no alert fatigue)?',
    triggerOn: 'no',
  },
  {
    id: 'DS-CHAN-01', severity: 'HIGH', product: 'DLP',
    title: 'Email DLP channel not integrated',
    description: 'Outbound email not inspected — exfiltration via email undetected.',
    remediation: '→ Integrate DLP with MTA in FSM → Channels → Email.',
    questionId: 'ds_email_channel_ok',
    questionText: 'Email DLP channel integrated with MTA/mail server?',
    triggerOn: 'no',
  },

  /* ── Email Security ── */
  {
    id: 'ES-LIC-01', severity: 'CRITICAL', product: 'Email Security',
    title: 'Email Security subscription expiring',
    description: 'License expiry stops mail scanning and DLP.',
    remediation: '→ Renew subscription immediately.',
    questionId: 'es_license_ok',
    questionText: 'Email Security subscription valid for more than 30 days?',
    triggerOn: 'no',
  },
  {
    id: 'ES-INF-02', severity: 'CRITICAL', product: 'Email Security',
    title: 'Email Security Gateway unreachable',
    description: 'ESG offline — mail flow stopped or bypassing security.',
    remediation: '→ Restore ESG service. Check MX records.',
    questionId: 'es_gw_reachable',
    questionText: 'Email Security Gateway reachable and mail flowing normally?',
    triggerOn: 'no',
  },
  {
    id: 'ES-INF-04', severity: 'CRITICAL', product: 'Email Security',
    title: 'MX records not pointing to Forcepoint',
    description: 'Inbound mail bypassing security gateway.',
    remediation: '→ Update MX records to point to Forcepoint ESG.',
    questionId: 'es_mx_ok',
    questionText: 'MX records pointing to Forcepoint ESG (not bypassed)?',
    triggerOn: 'no',
  },
  {
    id: 'ES-PERF-01', severity: 'CRITICAL', product: 'Email Security',
    title: 'Mail queue backlog growing',
    description: 'Deferred messages accumulating — delivery delays.',
    remediation: '→ Check ESG queue monitor. Investigate root cause.',
    questionId: 'es_queue_ok',
    questionText: 'Mail queue backlog within normal limits?',
    triggerOn: 'no',
  },
  {
    id: 'ES-THREAT-01', severity: 'CRITICAL', product: 'Email Security',
    title: 'Anti-spam engine not active',
    description: 'All inbound mail accepted without spam filtering.',
    remediation: '→ Enable anti-spam in ESG → Anti-Spam Settings.',
    questionId: 'es_antispam_active',
    questionText: 'Anti-spam engine active and scanning all inbound mail?',
    triggerOn: 'no',
  },
  {
    id: 'ES-THREAT-02', severity: 'CRITICAL', product: 'Email Security',
    title: 'Anti-malware scanning not active',
    description: 'Email attachments not scanned — malware delivery undetected.',
    remediation: '→ Enable AV scanning in ESG → Anti-Virus Settings.',
    questionId: 'es_antimalware_active',
    questionText: 'Anti-malware scanning active on email attachments?',
    triggerOn: 'no',
  },
  {
    id: 'ES-AUTH-01', severity: 'CRITICAL', product: 'Email Security',
    title: 'SPF not published or enforced',
    description: 'No SPF enforcement — email spoofing undetected.',
    remediation: '→ Publish SPF record in DNS. Set ESG to reject SPF failures.',
    questionId: 'es_spf_ok',
    questionText: 'SPF record published in DNS and ESG enforcing rejections?',
    triggerOn: 'no',
  },
  {
    id: 'ES-AUTH-02', severity: 'HIGH', product: 'Email Security',
    title: 'DKIM not signing outbound mail',
    description: 'Outbound mail may be rejected by receiving servers.',
    remediation: '→ Configure DKIM keys in ESG. Publish DKIM selector in DNS.',
    questionId: 'es_dkim_ok',
    questionText: 'DKIM signing active for all outbound mail domains?',
    triggerOn: 'no',
  },
  {
    id: 'ES-AUTH-03', severity: 'HIGH', product: 'Email Security',
    title: 'DMARC policy not published',
    description: 'No DMARC — domain spoofing attacks unreported.',
    remediation: '→ Publish DMARC record (p=quarantine minimum).',
    questionId: 'es_dmarc_ok',
    questionText: 'DMARC policy published (minimum p=quarantine)?',
    triggerOn: 'no',
  },

  /* ── NGFW ── */
  {
    id: 'FW-SMC-01', severity: 'CRITICAL', product: 'NGFW',
    title: 'SMC not on supported release',
    description: 'Unsupported SMC — no patches, compatibility issues.',
    remediation: '→ Upgrade SMC to current supported release.',
    questionId: 'fw_smc_supported',
    questionText: 'SMC running on a currently supported release version?',
    triggerOn: 'no',
  },
  {
    id: 'FW-SMC-04', severity: 'CRITICAL', product: 'NGFW',
    title: 'SMC database backup not running',
    description: 'No backup — SMC failure requires full rebuild.',
    remediation: '→ Enable scheduled SMC backup. Test restore procedure.',
    questionId: 'fw_smc_backup_ok',
    questionText: 'Scheduled SMC database backups running successfully?',
    triggerOn: 'no',
  },
  {
    id: 'FW-SMC-05', severity: 'CRITICAL', product: 'NGFW',
    title: 'SMC Log Server not healthy',
    description: 'NGFW events not logged — compliance failure.',
    remediation: '→ Restore Log Server. Check disk space and connectivity.',
    questionId: 'fw_logserver_ok',
    questionText: 'SMC Log Server healthy and receiving NGFW events?',
    triggerOn: 'no',
  },
  {
    id: 'FW-ENG-01', severity: 'CRITICAL', product: 'NGFW',
    title: 'NGFW engines not connected to SMC',
    description: 'Disconnected engines running last-known policy.',
    remediation: '→ Restore engine-SMC connectivity.',
    questionId: 'fw_engines_connected',
    questionText: 'All NGFW engines connected and synced to SMC?',
    triggerOn: 'no',
  },
  {
    id: 'FW-ENG-03', severity: 'CRITICAL', product: 'NGFW',
    title: 'NGFW engine CPU above 80%',
    description: 'High CPU degrades throughput and may drop packets.',
    remediation: '→ Review traffic mix or add engine capacity.',
    questionId: 'fw_engine_cpu_ok',
    questionText: 'NGFW engine CPU utilization below 80%?',
    triggerOn: 'no',
  },
  {
    id: 'FW-IPS-01', severity: 'CRITICAL', product: 'NGFW',
    title: 'IPS engine not active',
    description: 'Traffic not inspected for threats.',
    remediation: '→ Enable IPS inspection on all NGFW traffic flows.',
    questionId: 'fw_ips_active',
    questionText: 'IPS inspection engine active on all traffic flows?',
    triggerOn: 'no',
  },
  {
    id: 'FW-IPS-02', severity: 'CRITICAL', product: 'NGFW',
    title: 'IPS signatures outdated',
    description: 'Stale signatures miss recent CVEs.',
    remediation: '→ Apply latest Dynamic Update Package in SMC.',
    questionId: 'fw_ips_signatures_ok',
    questionText: 'IPS signatures current (latest Dynamic Update Package applied)?',
    triggerOn: 'no',
  },
  {
    id: 'FW-VPN-01', severity: 'CRITICAL', product: 'NGFW',
    title: 'Site-to-site IPsec tunnels down',
    description: 'VPN tunnels not passing traffic — site connectivity broken.',
    remediation: '→ Check tunnel status in SMC → Monitoring.',
    questionId: 'fw_vpn_tunnels_ok',
    questionText: 'All configured site-to-site IPsec VPN tunnels passing traffic?',
    triggerOn: 'no',
  },
  {
    id: 'FW-POL-03', severity: 'HIGH', product: 'NGFW',
    title: 'Overly permissive rules detected',
    description: 'Any-to-any rules contradict least-privilege.',
    remediation: '→ Audit rule base. Remove overly permissive rules.',
    questionId: 'fw_no_any_rules',
    questionText: 'Firewall rule base reviewed — no any-to-any permissive rules?',
    triggerOn: 'no',
  },
  {
    id: 'FW-SEC-01', severity: 'CRITICAL', product: 'NGFW',
    title: 'Default admin credentials not changed',
    description: 'Default credentials allow full firewall takeover.',
    remediation: '→ Change all admin credentials immediately.',
    questionId: 'fw_creds_changed',
    questionText: 'All firewall/SMC admin credentials changed from defaults?',
    triggerOn: 'no',
  },

  /* ── DSPM ── */
  {
    id: 'DSPM-LIC-01', severity: 'CRITICAL', product: 'DSPM',
    title: 'DSPM subscription expiring',
    description: 'License expiry stops all scans and risk monitoring.',
    remediation: '→ Renew DSPM subscription immediately.',
    questionId: 'dspm_license_ok',
    questionText: 'DSPM subscription valid for more than 30 days?',
    triggerOn: 'no',
  },
  {
    id: 'DSPM-INF-03', severity: 'CRITICAL', product: 'DSPM',
    title: 'Cloud connectors not authorized',
    description: 'Major cloud repositories not scanned — large data blind spots.',
    remediation: '→ Re-authorize connectors. Check OAuth/service account expiry.',
    questionId: 'dspm_connectors_ok',
    questionText: 'All cloud connectors authorized and active (OAuth/service accounts valid)?',
    triggerOn: 'no',
  },
  {
    id: 'DSPM-DISC-01', severity: 'CRITICAL', product: 'DSPM',
    title: 'Discovery scan schedule not active',
    description: 'No continuous data visibility — posture data stale.',
    remediation: '→ Configure scan schedules in DSPM for all repositories.',
    questionId: 'dspm_scan_schedule_ok',
    questionText: 'Discovery scan schedules configured and running for all repositories?',
    triggerOn: 'no',
  },
  {
    id: 'DSPM-CLASS-01', severity: 'CRITICAL', product: 'DSPM',
    title: 'AI Mesh classification engine not active',
    description: 'No AI classification — sensitive data completely unlabeled.',
    remediation: '→ Enable AI Mesh engine in DSPM.',
    questionId: 'dspm_ai_mesh_ok',
    questionText: 'AI Mesh classification engine active and processing in DSPM?',
    triggerOn: 'no',
  },
  {
    id: 'DSPM-RISK-02', severity: 'CRITICAL', product: 'DSPM',
    title: 'Over-permissioned sensitive data found',
    description: 'Publicly shared sensitive files — active breach risk.',
    remediation: '→ Immediately restrict access. Launch remediation workflow.',
    questionId: 'dspm_no_overperm',
    questionText: 'No over-permissioned sensitive data found (public shares reviewed and restricted)?',
    triggerOn: 'no',
  },

  /* ── Classification ── */
  {
    id: 'CL-LIC-01', severity: 'CRITICAL', product: 'Classification',
    title: 'Classification subscription expiring',
    description: 'License expiry stops classification engine.',
    remediation: '→ Renew subscription immediately.',
    questionId: 'cl_license_ok',
    questionText: 'Classification subscription valid for more than 30 days?',
    triggerOn: 'no',
  },
  {
    id: 'CL-INF-03', severity: 'CRITICAL', product: 'Classification',
    title: 'Endpoint agents not deployed',
    description: 'Files on endpoints not classified.',
    remediation: '→ Deploy classification agents to all target endpoints.',
    questionId: 'cl_agents_deployed',
    questionText: 'Classification agents deployed to all target endpoints?',
    triggerOn: 'no',
  },
  {
    id: 'CL-CLASS-01', severity: 'CRITICAL', product: 'Classification',
    title: 'AI Mesh classification engine not active',
    description: 'No AI classification — all files unclassified.',
    remediation: '→ Enable AI Mesh engine. Verify latest model version.',
    questionId: 'cl_ai_mesh_ok',
    questionText: 'AI Mesh classification engine active (latest model verified)?',
    triggerOn: 'no',
  },
  {
    id: 'CL-POL-01', severity: 'CRITICAL', product: 'Classification',
    title: 'Classification taxonomy not defined',
    description: 'No labels defined — DLP and DSPM cannot enforce policy.',
    remediation: '→ Define and approve classification taxonomy.',
    questionId: 'cl_taxonomy_defined',
    questionText: 'Classification taxonomy (label set) defined and approved?',
    triggerOn: 'no',
  },
  {
    id: 'CL-ENF-01', severity: 'CRITICAL', product: 'Classification',
    title: 'DLP not consuming classification labels',
    description: 'Labels not enforced — labeling has no security effect.',
    remediation: '→ Connect DLP policy to classification labels in FSM.',
    questionId: 'cl_dlp_consuming',
    questionText: 'DLP policies consuming and enforcing classification labels?',
    triggerOn: 'no',
  },
  {
    id: 'CL-ENF-02', severity: 'CRITICAL', product: 'Classification',
    title: 'Restricted files not blocked on egress',
    description: 'Confidential files can leave via USB, email, web.',
    remediation: '→ Configure DLP enforcement rules for each label tier.',
    questionId: 'cl_egress_blocked',
    questionText: 'Restricted/Confidential files blocked on all egress channels (USB, email, web)?',
    triggerOn: 'no',
  },
];

/* ─────────────────────────────────────────────────────────────
   PRODUCT CONFIG (colors, icons)
───────────────────────────────────────────────────────────── */
export const PRODUCT_CONFIG: Record<ProductCategory, { color: string; bg: string; border: string; emoji: string }> = {
  'Hardware & OS':    { color: '#0F2952', bg: '#EEF2F8', border: '#C7D4E8', emoji: '🖥️' },
  'Web Security':     { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', emoji: '🌐' },
  'DLP':              { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', emoji: '🔒' },
  'Email Security':   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', emoji: '✉️' },
  'NGFW':             { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', emoji: '🛡️' },
  'DSPM':             { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', emoji: '☁️' },
  'Classification':   { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', emoji: '🏷️' },
};

export const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; label: string; order: number }> = {
  CRITICAL: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'CRITICAL', order: 0 },
  HIGH:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'HIGH',     order: 1 },
  MEDIUM:   { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'MEDIUM',   order: 2 },
  LOW:      { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', label: 'LOW',      order: 3 },
};

/* ─────────────────────────────────────────────────────────────
   EVALUATION FUNCTION
───────────────────────────────────────────────────────────── */
export function evaluateRules(answers: ChecklistAnswers): Finding[] {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    const answer = answers[rule.questionId];
    if (answer === null || answer === undefined || answer === 'na') continue;
    if (answer === rule.triggerOn) {
      findings.push({ rule, firedAt: new Date() });
    }
  }
  // Sort: CRITICAL → HIGH → MEDIUM → LOW
  return findings.sort(
    (a, b) =>
      SEVERITY_CONFIG[a.rule.severity].order - SEVERITY_CONFIG[b.rule.severity].order,
  );
}

/* Group rules by product */
export function groupRulesByProduct(): Map<ProductCategory, Rule[]> {
  const map = new Map<ProductCategory, Rule[]>();
  for (const rule of ALL_RULES) {
    if (!map.has(rule.product)) map.set(rule.product, []);
    map.get(rule.product)!.push(rule);
  }
  return map;
}

HIGH
HW-09
Appliance warranty expired
Warranty expired — hardware replacement costs fall on customer.
→ Renew Forcepoint hardware support or plan appliance refresh.
HIGH
HW-10
Appliance reached End-of-Sale
EoS reached — no new licenses or hardware replacements available.
→ Plan migration to current-gen appliance.
HIGH
WS-SSL-01
SSL inspection not enabled
Encrypted traffic not inspected — threats in HTTPS undetected.
→ Enable HTTPS inspection in FSM → SSL Settings.
HIGH
WS-THREAT-02
AMDP sandbox not integrated
Suspicious files not sent for deep analysis.
→ Enable AMDP in FSM → Advanced Malware.
HIGH
WS-POL-01
URL category database outdated
Stale category data — new malicious domains not blocked.
→ Check FSM → Configuration → Subscription.
HIGH
DS-POL-07
High false positive rate in DLP
Alert fatigue causes SOC to ignore incidents.
→ Tune policies using FSM analytics.
HIGH
DS-CHAN-01
Email DLP channel not integrated
Outbound email not inspected — exfiltration via email undetected.
→ Integrate DLP with MTA in FSM → Channels → Email.
HIGH
ES-AUTH-02
DKIM not signing outbound mail
Outbound mail may be rejected by receiving servers.
→ Configure DKIM keys in ESG. Publish DKIM selector in DNS.
HIGH
ES-AUTH-03
DMARC policy not published
No DMARC — domain spoofing attacks unreported.
→ Publish DMARC record (p=quarantine minimum).
HIGH
FW-POL-03
Overly permissive rules detected
Any-to-any rules contradict least-privilege.
→ Audit rule base. Remove overly permissive rules.
CRITICAL
HW-01
Fan/thermal alerts not checked
iDRAC/IPMI thermal alerts not reviewed. Hardware failure risk elevated.
→ Check iDRAC → System → Thermal. Configure SNMP/email alert forwarding immediately.
CRITICAL
HW-06
RAID disk health issue
Disk health not confirmed. RAID degradation risk.
→ Check RAID status via iDRAC. Replace failed/degraded disks immediately.
CRITICAL
HW-11
Appliance reached End-of-Life
EoL passed — no security patches or support.
→ Initiate hardware refresh. Upgrade to current-gen V-Series or cloud equivalent.
CRITICAL
OS-01
CPU utilization exceeds 80%
Sustained high CPU causes proxy slowdowns and policy enforcement failures.
→ Review proxy logs for traffic spikes. Consider adding capacity.
CRITICAL
OS-02
RAM utilization exceeds 85%
High memory pressure causes OOM kills and service instability.
→ Restart affected services. Consider appliance upgrade.
CRITICAL
OS-03
Disk usage critical
High disk on /var, /opt or /tmp — log rotation failure imminent.
→ Clear old logs, increase disk or reconfigure log rotation.
CRITICAL
SW-04
Critical hotfixes not applied
Unpatched CVEs leave appliance exposed to known exploits.
→ Apply all critical hotfixes. Check Forcepoint HotFix tracker.
CRITICAL
NET-03
DNS resolution failing
Proxy cannot resolve URLs — browsing blocked or bypassing policy.
→ Check DNS server config and firewall rules to port 53.
CRITICAL
HA-01
HA nodes not in expected state
No redundancy — single point of failure active.
→ Investigate HA node status. Re-sync configuration and heartbeat links.
CRITICAL
SEC-01
Default admin password not changed
Factory default credentials allow full appliance takeover.
→ Change admin password immediately.
CRITICAL
SEC-02
Management UI not IP-restricted
Appliance admin UI accessible from any network.
→ Restrict management access to approved admin IPs/subnets.
CRITICAL
WS-INF-04
Hybrid connector broken
Policy Server cannot reach Forcepoint Cloud — hybrid users get no policy.
→ Check hybrid connector in FSM → General. Verify firewall rules.
CRITICAL
WS-SSL-02
Root CA not deployed to endpoints
SSL inspection enabled but CA cert missing — browsers show cert errors.
→ Push CA cert via GPO/MDM to all managed endpoints.
CRITICAL
WS-SSL-07
Root CA certificate expired
Expired CA causes mass TLS errors for all inspected traffic.
→ Renew CA certificate and re-deploy to all endpoints.
CRITICAL
WS-THREAT-01
Anti-malware engine not active
HTTP/HTTPS traffic passes without malware scanning.
→ Enable anti-malware in FSM → Policy → Content Scanning.
CRITICAL
WS-LIC-01
Web Security license expiring
License within 30 days of expiry — service disruption imminent.
→ Renew subscription immediately. Contact CSM.
CRITICAL
DS-INF-02
DLP Management Server unreachable
DLP Manager offline — no policy enforcement.
→ Restore DLP Manager service. Check server health and DB connectivity.
CRITICAL
DS-INF-03
DLP Endpoint Server not healthy
Endpoint server failure — agents cannot receive policy updates.
→ Restart DLP Endpoint Server. Check event logs.
CRITICAL
DS-INF-05
Endpoint agent heartbeat lost
Agents not checking in — policy out of date.
→ Check network connectivity and agent service status.
CRITICAL
DS-INC-02
Critical incidents not alerting SOC
Real-time alerting disabled — SOC blind to active exfiltration.
→ Configure SIEM integration and real-time alert rules.
CRITICAL
DS-LIC-01
DLP subscription expiring
License expiry — endpoint agents stop enforcing policy.
→ Renew DLP subscription immediately.
CRITICAL
ES-INF-02
Email Security Gateway unreachable
ESG offline — mail flow stopped or bypassing security.
→ Restore ESG service. Check MX records.
CRITICAL
ES-INF-04
MX records not pointing to Forcepoint
Inbound mail bypassing security gateway.
→ Update MX records to point to Forcepoint ESG.
CRITICAL
ES-PERF-01
Mail queue backlog growing
Deferred messages accumulating — delivery delays.
→ Check ESG queue monitor. Investigate root cause.
CRITICAL
ES-THREAT-01
Anti-spam engine not active
All inbound mail accepted without spam filtering.
→ Enable anti-spam in ESG → Anti-Spam Settings.
CRITICAL
ES-THREAT-02
Anti-malware scanning not active
Email attachments not scanned — malware delivery undetected.
→ Enable AV scanning in ESG → Anti-Virus Settings.
CRITICAL
ES-AUTH-01
SPF not published or enforced
No SPF enforcement — email spoofing undetected.
→ Publish SPF record in DNS. Set ESG to reject SPF failures.
CRITICAL
ES-LIC-01
Email Security subscription expiring
License expiry stops mail scanning and DLP.
→ Renew subscription immediately.
CRITICAL
FW-SMC-01
SMC not on supported release
Unsupported SMC — no patches, compatibility issues.
→ Upgrade SMC to current supported release.
CRITICAL
FW-SMC-04
SMC database backup not running
No backup — SMC failure requires full rebuild.
→ Enable scheduled SMC backup. Test restore procedure.
CRITICAL
FW-SMC-05
SMC Log Server not healthy
NGFW events not logged — compliance failure.
→ Restore Log Server. Check disk space and connectivity.
CRITICAL
FW-ENG-01
NGFW engines not connected to SMC
Disconnected engines running last-known policy.
→ Restore engine-SMC connectivity.
CRITICAL
FW-ENG-03
NGFW engine CPU above 80%
High CPU degrades throughput and may drop packets.
→ Review traffic mix or add engine capacity.
CRITICAL
FW-IPS-01
IPS engine not active
Traffic not inspected for threats.
→ Enable IPS inspection on all NGFW traffic flows.
CRITICAL
FW-IPS-02
IPS signatures outdated
Stale signatures miss recent CVEs.
→ Apply latest Dynamic Update Package in SMC.
CRITICAL
FW-VPN-01
Site-to-site IPsec tunnels down
VPN tunnels not passing traffic — site connectivity broken.
→ Check tunnel status in SMC → Monitoring.
CRITICAL
FW-SEC-01
Default admin credentials not changed
Default credentials allow full firewall takeover.
→ Change all admin credentials immediately.
CRITICAL
DSPM-INF-03
Cloud connectors not authorized
Major cloud repositories not scanned — large data blind spots.
→ Re-authorize connectors. Check OAuth/service account expiry.
CRITICAL
DSPM-DISC-01
Discovery scan schedule not active
No continuous data visibility — posture data stale.
→ Configure scan schedules in DSPM for all repositories.
CRITICAL
DSPM-CLASS-01
AI Mesh classification engine not active
No AI classification — sensitive data completely unlabeled.
→ Enable AI Mesh engine in DSPM.
CRITICAL
DSPM-RISK-02
Over-permissioned sensitive data found
Publicly shared sensitive files — active breach risk.
→ Immediately restrict access. Launch remediation workflow.
CRITICAL
DSPM-LIC-01
DSPM subscription expiring
License expiry stops all scans and risk monitoring.
→ Renew DSPM subscription immediately.
CRITICAL
CL-INF-03
Endpoint agents not deployed
Files on endpoints not classified.
→ Deploy classification agents to all target endpoints.
CRITICAL
CL-CLASS-01
AI Mesh classification engine not active
No AI classification — all files unclassified.
→ Enable AI Mesh engine. Verify latest model version.
CRITICAL
CL-POL-01
Classification taxonomy not defined
No labels defined — DLP and DSPM cannot enforce policy.
→ Define and approve classification taxonomy.
CRITICAL
CL-ENF-01
DLP not consuming classification labels
Labels not enforced — labeling has no security effect.
→ Connect DLP policy to classification labels in FSM.
CRITICAL
CL-ENF-02
Restricted files not blocked on egress
Confidential files can leave via USB, email, web.
→ Configure DLP enforcement rules for each label tier.
CRITICAL
CL-LIC-01
Classification subscription expiring
License expiry stops classification engine.
→ Renew subscription immediately.
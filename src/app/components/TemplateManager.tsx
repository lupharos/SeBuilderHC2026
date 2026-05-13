import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, FolderPlus, Shield, CheckCircle2, ArrowLeft, Layers, Download, Upload, Check, AlertCircle, X, FolderOpen, RefreshCw } from 'lucide-react';
import type { Template, Question, QuestionSeverity } from './types/templates';
import {
  saveTemplates, autoLoad, requestAndLoad, clearStoredHandle, isSupported,
  type LoadResult,
} from '../utils/templateFileSystem';
import type { FSFileHandle } from '../utils/templateFileSystem';

const _rawTemplates: Template[] = [
  {
    id: 'appl',
    name: 'Appliance HC',
    productCode: 'V-SERIES',
    color: '#0F2952',
    icon: '🖥',
    sections: ['Hardware', 'Network', 'Performance', 'Security', 'Backup', 'Monitoring'],
    questions: [
      { id: 'q1', text: 'Is the appliance firmware up to date?', section: 'Hardware' },
      { id: 'q2', text: 'Are hardware diagnostics showing any errors?', section: 'Hardware' },
      { id: 'q3', text: 'Is the appliance running on supported hardware?', section: 'Hardware' },
      { id: 'q4', text: 'Are power supplies redundant and functional?', section: 'Hardware' },
      { id: 'q5', text: 'Is storage capacity within acceptable limits (<80%)?', section: 'Hardware' },
      { id: 'q6', text: 'Are all cooling fans operational?', section: 'Hardware' },
      { id: 'q7', text: 'Is hardware warranty still valid?', section: 'Hardware' },
      { id: 'q8', text: 'Has End-of-Sale date been checked?', section: 'Hardware' },
      { id: 'q9', text: 'Are all network interfaces properly configured?', section: 'Network' },
      { id: 'q10', text: 'Is network bonding/teaming configured correctly?', section: 'Network' },
      { id: 'q11', text: 'Are VLANs configured as per network design?', section: 'Network' },
      { id: 'q12', text: 'Is network throughput meeting requirements?', section: 'Network' },
      { id: 'q13', text: 'Are routing tables configured correctly?', section: 'Network' },
      { id: 'q14', text: 'Is DNS resolution working properly?', section: 'Network' },
      { id: 'q15', text: 'Are static routes documented and verified?', section: 'Network' },
      { id: 'q16', text: 'Is network latency within acceptable range?', section: 'Network' },
      { id: 'q17', text: 'Is CPU usage within acceptable limits (<80%)?', section: 'Performance' },
      { id: 'q18', text: 'Is memory utilization within normal range (<85%)?', section: 'Performance' },
      { id: 'q19', text: 'Are disk I/O operations performing adequately?', section: 'Performance' },
      { id: 'q20', text: 'Is network throughput optimized?', section: 'Performance' },
      { id: 'q21', text: 'Are performance baselines documented?', section: 'Performance' },
      { id: 'q22', text: 'Is load balancing configured and working?', section: 'Performance' },
      { id: 'q23', text: 'Are performance alerts configured?', section: 'Performance' },
      { id: 'q24', text: 'Is connection pooling optimized?', section: 'Performance' },
      { id: 'q25', text: 'Is management access secured with strong authentication?', section: 'Security' },
      { id: 'q26', text: 'Are administrative accounts following least privilege?', section: 'Security' },
      { id: 'q27', text: 'Is SSH key-based authentication enabled?', section: 'Security' },
      { id: 'q28', text: 'Are security patches up to date?', section: 'Security' },
      { id: 'q29', text: 'Is audit logging enabled and retained?', section: 'Security' },
      { id: 'q30', text: 'Are unused services disabled?', section: 'Security' },
      { id: 'q31', text: 'Is SNMP v3 configured (not v1/v2)?', section: 'Security' },
      { id: 'q32', text: 'Are firewall rules restrictive and documented?', section: 'Security' },
      { id: 'q33', text: 'Is configuration backup scheduled and automated?', section: 'Backup' },
      { id: 'q34', text: 'Are backups stored in separate location?', section: 'Backup' },
      { id: 'q35', text: 'Has backup restoration been tested?', section: 'Backup' },
      { id: 'q36', text: 'Is backup retention policy defined?', section: 'Backup' },
      { id: 'q37', text: 'Are backup logs reviewed regularly?', section: 'Backup' },
      { id: 'q38', text: 'Is backup encryption enabled?', section: 'Backup' },
      { id: 'q39', text: 'Are disaster recovery procedures documented?', section: 'Backup' },
      { id: 'q40', text: 'Is SNMP monitoring configured?', section: 'Monitoring' },
      { id: 'q41', text: 'Are syslog events being collected?', section: 'Monitoring' },
      { id: 'q42', text: 'Is health monitoring integrated with NOC?', section: 'Monitoring' },
      { id: 'q43', text: 'Are critical alerts configured and tested?', section: 'Monitoring' },
      { id: 'q44', text: 'Is uptime tracking in place?', section: 'Monitoring' },
      { id: 'q45', text: 'Are performance metrics being collected?', section: 'Monitoring' },
      { id: 'q46', text: 'Is monitoring dashboard accessible to operations?', section: 'Monitoring' },
      { id: 'q47', text: 'Are monitoring agents up to date?', section: 'Monitoring' },
      { id: 'q48', text: 'Is monitoring data retained per compliance requirements?', section: 'Monitoring' },
    ],
  },
  {
    id: 'web',
    name: 'Web Security HC',
    productCode: 'WEB',
    color: '#2563EB',
    icon: '🌐',
    sections: ['Policies', 'SSL Inspection', 'Authentication', 'Logging', 'Performance', 'Integrations'],
    questions: [
      { id: 'q1', text: 'Are web filtering policies configured correctly?', section: 'Policies' },
      { id: 'q2', text: 'Is URL categorization database up to date?', section: 'Policies' },
      { id: 'q3', text: 'Are policy exceptions documented and justified?', section: 'Policies' },
      { id: 'q4', text: 'Is malware scanning enabled on downloads?', section: 'Policies' },
      { id: 'q5', text: 'Are high-risk categories blocked?', section: 'Policies' },
      { id: 'q6', text: 'Is policy applied consistently across all users?', section: 'Policies' },
      { id: 'q7', text: 'Are safe search enforcement rules active?', section: 'Policies' },
      { id: 'q8', text: 'Is SSL inspection enabled and working?', section: 'SSL Inspection' },
      { id: 'q9', text: 'Are SSL certificates trusted by endpoints?', section: 'SSL Inspection' },
      { id: 'q10', text: 'Is SSL inspection bypass list minimal and documented?', section: 'SSL Inspection' },
      { id: 'q11', text: 'Are cipher suites configured securely?', section: 'SSL Inspection' },
      { id: 'q12', text: 'Is SSL inspection applied to all traffic?', section: 'SSL Inspection' },
      { id: 'q13', text: 'Are SSL errors being logged and reviewed?', section: 'SSL Inspection' },
      { id: 'q14', text: 'Is certificate pinning handled properly?', section: 'SSL Inspection' },
      { id: 'q15', text: 'Is Active Directory integration configured?', section: 'Authentication' },
      { id: 'q16', text: 'Are user authentication logs being collected?', section: 'Authentication' },
      { id: 'q17', text: 'Is transparent authentication working?', section: 'Authentication' },
      { id: 'q18', text: 'Are guest/unauthenticated users handled correctly?', section: 'Authentication' },
      { id: 'q19', text: 'Is multi-factor authentication considered for admin access?', section: 'Authentication' },
      { id: 'q20', text: 'Are authentication failures being monitored?', section: 'Authentication' },
      { id: 'q21', text: 'Is Kerberos/NTLM configured properly?', section: 'Authentication' },
      { id: 'q22', text: 'Are web access logs being retained?', section: 'Logging' },
      { id: 'q23', text: 'Is log retention period compliant with policy?', section: 'Logging' },
      { id: 'q24', text: 'Are logs being sent to SIEM?', section: 'Logging' },
      { id: 'q25', text: 'Is log storage capacity sufficient?', section: 'Logging' },
      { id: 'q26', text: 'Are logs protected from tampering?', section: 'Logging' },
      { id: 'q27', text: 'Is log review performed regularly?', section: 'Logging' },
      { id: 'q28', text: 'Are sensitive data fields masked in logs?', section: 'Logging' },
      { id: 'q29', text: 'Is proxy performance meeting SLA requirements?', section: 'Performance' },
      { id: 'q30', text: 'Are connection limits configured appropriately?', section: 'Performance' },
      { id: 'q31', text: 'Is caching enabled and optimized?', section: 'Performance' },
      { id: 'q32', text: 'Are performance baselines documented?', section: 'Performance' },
      { id: 'q33', text: 'Is bandwidth utilization monitored?', section: 'Performance' },
      { id: 'q34', text: 'Are performance alerts configured?', section: 'Performance' },
      { id: 'q35', text: 'Is load balancing configured if needed?', section: 'Performance' },
      { id: 'q36', text: 'Is DLP integration configured?', section: 'Integrations' },
      { id: 'q37', text: 'Is CASB integration working?', section: 'Integrations' },
      { id: 'q38', text: 'Are ICAP servers configured and responding?', section: 'Integrations' },
      { id: 'q39', text: 'Is sandboxing integration active?', section: 'Integrations' },
      { id: 'q40', text: 'Are third-party threat feeds integrated?', section: 'Integrations' },
      { id: 'q41', text: 'Is authentication integrated with identity provider?', section: 'Integrations' },
      { id: 'q42', text: 'Are integration points monitored for availability?', section: 'Integrations' },
    ],
  },
  {
    id: 'email',
    name: 'Email Security HC',
    productCode: 'EMAIL',
    color: '#7C3AED',
    icon: '✉️',
    sections: ['Gateway Config', 'Anti-Spam', 'Anti-Malware', 'DLP', 'Quarantine', 'Reporting'],
    questions: [
      { id: 'q1', text: 'Are email gateway connectors properly configured?', section: 'Gateway Config' },
      { id: 'q2', text: 'Is MX record pointing to email gateway?', section: 'Gateway Config' },
      { id: 'q3', text: 'Are relay settings configured correctly?', section: 'Gateway Config' },
      { id: 'q4', text: 'Is TLS encryption enabled for email transport?', section: 'Gateway Config' },
      { id: 'q5', text: 'Are accepted domains configured?', section: 'Gateway Config' },
      { id: 'q6', text: 'Is email routing working correctly?', section: 'Gateway Config' },
      { id: 'q7', text: 'Are SPF, DKIM, and DMARC configured?', section: 'Gateway Config' },
      { id: 'q8', text: 'Is anti-spam filtering effective?', section: 'Anti-Spam' },
      { id: 'q9', text: 'Are spam thresholds configured appropriately?', section: 'Anti-Spam' },
      { id: 'q10', text: 'Is RBL (Real-time Blackhole List) enabled?', section: 'Anti-Spam' },
      { id: 'q11', text: 'Are sender reputation checks active?', section: 'Anti-Spam' },
      { id: 'q12', text: 'Is greylisting configured if needed?', section: 'Anti-Spam' },
      { id: 'q13', text: 'Are false positives being monitored?', section: 'Anti-Spam' },
      { id: 'q14', text: 'Is spam signature database updated regularly?', section: 'Anti-Spam' },
      { id: 'q15', text: 'Are malware detection engines updated?', section: 'Anti-Malware' },
      { id: 'q16', text: 'Is attachment scanning enabled?', section: 'Anti-Malware' },
      { id: 'q17', text: 'Are dangerous file types blocked?', section: 'Anti-Malware' },
      { id: 'q18', text: 'Is sandboxing enabled for suspicious files?', section: 'Anti-Malware' },
      { id: 'q19', text: 'Are archive files being scanned?', section: 'Anti-Malware' },
      { id: 'q20', text: 'Is URL rewriting for click-time protection enabled?', section: 'Anti-Malware' },
      { id: 'q21', text: 'Are malware detection rates monitored?', section: 'Anti-Malware' },
      { id: 'q22', text: 'Is DLP scanning enabled for outbound email?', section: 'DLP' },
      { id: 'q23', text: 'Are DLP policies aligned with organizational policy?', section: 'DLP' },
      { id: 'q24', text: 'Is sensitive data detection working correctly?', section: 'DLP' },
      { id: 'q25', text: 'Are DLP incidents being reviewed?', section: 'DLP' },
      { id: 'q26', text: 'Is encryption enforced for sensitive emails?', section: 'DLP' },
      { id: 'q27', text: 'Are attachment restrictions configured?', section: 'DLP' },
      { id: 'q28', text: 'Is user quarantine accessible?', section: 'Quarantine' },
      { id: 'q29', text: 'Are quarantine policies configured correctly?', section: 'Quarantine' },
      { id: 'q30', text: 'Is quarantine retention period appropriate?', section: 'Quarantine' },
      { id: 'q31', text: 'Are users notified of quarantined emails?', section: 'Quarantine' },
      { id: 'q32', text: 'Is admin quarantine review performed regularly?', section: 'Quarantine' },
      { id: 'q33', text: 'Are quarantine release procedures documented?', section: 'Quarantine' },
      { id: 'q34', text: 'Are email security reports generated regularly?', section: 'Reporting' },
      { id: 'q35', text: 'Is management receiving executive summaries?', section: 'Reporting' },
      { id: 'q36', text: 'Are threat trends being tracked?', section: 'Reporting' },
      { id: 'q37', text: 'Is reporting data being retained?', section: 'Reporting' },
      { id: 'q38', text: 'Are compliance reports available?', section: 'Reporting' },
      { id: 'q39', text: 'Is reporting integrated with security dashboard?', section: 'Reporting' },
      { id: 'q40', text: 'Are custom reports configured for stakeholders?', section: 'Reporting' },
    ],
  },
  {
    id: 'dlp',
    name: 'Data Security (DLP) HC',
    productCode: 'DLP',
    color: '#0D9488',
    icon: '🔒',
    sections: ['Policies', 'Endpoints', 'Network', 'Cloud', 'Incidents', 'Classification'],
    questions: [
      { id: 'q1', text: 'Are DLP policies aligned with data classification?', section: 'Policies' },
      { id: 'q2', text: 'Is policy coverage comprehensive across channels?', section: 'Policies' },
      { id: 'q3', text: 'Are policy rules tested before enforcement?', section: 'Policies' },
      { id: 'q4', text: 'Is policy review performed regularly?', section: 'Policies' },
      { id: 'q5', text: 'Are false positives being addressed?', section: 'Policies' },
      { id: 'q6', text: 'Is policy documentation up to date?', section: 'Policies' },
      { id: 'q7', text: 'Are exception processes defined?', section: 'Policies' },
      { id: 'q8', text: 'Are all endpoints reporting to the manager?', section: 'Endpoints' },
      { id: 'q9', text: 'Is endpoint agent version current?', section: 'Endpoints' },
      { id: 'q10', text: 'Are offline endpoints identified and managed?', section: 'Endpoints' },
      { id: 'q11', text: 'Is endpoint coverage complete across organization?', section: 'Endpoints' },
      { id: 'q12', text: 'Are endpoint policies deployed correctly?', section: 'Endpoints' },
      { id: 'q13', text: 'Is device control configured appropriately?', section: 'Endpoints' },
      { id: 'q14', text: 'Are endpoint incidents being reviewed?', section: 'Endpoints' },
      { id: 'q15', text: 'Is network DLP monitoring critical channels?', section: 'Network' },
      { id: 'q16', text: 'Are network sensors positioned correctly?', section: 'Network' },
      { id: 'q17', text: 'Is SMTP traffic being monitored?', section: 'Network' },
      { id: 'q18', text: 'Is HTTP/HTTPS traffic being inspected?', section: 'Network' },
      { id: 'q19', text: 'Are file transfer protocols monitored?', section: 'Network' },
      { id: 'q20', text: 'Is network DLP performance adequate?', section: 'Network' },
      { id: 'q21', text: 'Are network policies synchronized with endpoints?', section: 'Network' },
      { id: 'q22', text: 'Is cloud DLP configured for SaaS applications?', section: 'Cloud' },
      { id: 'q23', text: 'Are cloud storage platforms monitored?', section: 'Cloud' },
      { id: 'q24', text: 'Is API integration working with cloud apps?', section: 'Cloud' },
      { id: 'q25', text: 'Are cloud policies consistent with on-prem?', section: 'Cloud' },
      { id: 'q26', text: 'Is CASB integration configured?', section: 'Cloud' },
      { id: 'q27', text: 'Are cloud discovery findings being addressed?', section: 'Cloud' },
      { id: 'q28', text: 'Is incident workflow defined and followed?', section: 'Incidents' },
      { id: 'q29', text: 'Are incidents being reviewed in timely manner?', section: 'Incidents' },
      { id: 'q30', text: 'Is incident escalation process defined?', section: 'Incidents' },
      { id: 'q31', text: 'Are incident metrics being tracked?', section: 'Incidents' },
      { id: 'q32', text: 'Is incident data retained per policy?', section: 'Incidents' },
      { id: 'q33', text: 'Are repeat incidents being analyzed?', section: 'Incidents' },
      { id: 'q34', text: 'Is user notification configured for incidents?', section: 'Incidents' },
      { id: 'q35', text: 'Is data classification schema defined?', section: 'Classification' },
      { id: 'q36', text: 'Are classification labels applied consistently?', section: 'Classification' },
      { id: 'q37', text: 'Is automatic classification working?', section: 'Classification' },
      { id: 'q38', text: 'Are users trained on classification?', section: 'Classification' },
      { id: 'q39', text: 'Is classification integrated with DLP policies?', section: 'Classification' },
      { id: 'q40', text: 'Are classification labels visible to users?', section: 'Classification' },
      { id: 'q41', text: 'Is MIP integration configured?', section: 'Classification' },
    ],
  },
  {
    id: 'ngfw',
    name: 'NGFW HC',
    productCode: 'NGFW',
    color: '#D97706',
    icon: '🛡',
    sections: ['Firewall Rules', 'IPS', 'VPN', 'NAT', 'HA Config', 'Logging', 'Management', 'Updates'],
    questions: [
      { id: 'q1', text: 'Are firewall rules reviewed regularly?', section: 'Firewall Rules' },
      { id: 'q2', text: 'Is rule base optimized for performance?', section: 'Firewall Rules' },
      { id: 'q3', text: 'Are unused rules identified and removed?', section: 'Firewall Rules' },
      { id: 'q4', text: 'Is rule documentation complete?', section: 'Firewall Rules' },
      { id: 'q5', text: 'Are rules following least privilege principle?', section: 'Firewall Rules' },
      { id: 'q6', text: 'Is rule shadowing checked?', section: 'Firewall Rules' },
      { id: 'q7', text: 'Are temporary rules tracked and removed?', section: 'Firewall Rules' },
      { id: 'q8', text: 'Is implicit deny rule at the bottom?', section: 'Firewall Rules' },
      { id: 'q9', text: 'Are rule hit counts monitored?', section: 'Firewall Rules' },
      { id: 'q10', text: 'Is change management followed for rules?', section: 'Firewall Rules' },
      { id: 'q11', text: 'Is IPS signature database up to date?', section: 'IPS' },
      { id: 'q12', text: 'Are IPS policies configured correctly?', section: 'IPS' },
      { id: 'q13', text: 'Is IPS in prevention mode (not just detection)?', section: 'IPS' },
      { id: 'q14', text: 'Are critical vulnerabilities signatures enabled?', section: 'IPS' },
      { id: 'q15', text: 'Is IPS bypass configured appropriately?', section: 'IPS' },
      { id: 'q16', text: 'Are IPS alerts being reviewed?', section: 'IPS' },
      { id: 'q17', text: 'Is IPS performance impact acceptable?', section: 'IPS' },
      { id: 'q18', text: 'Are custom IPS signatures configured if needed?', section: 'IPS' },
      { id: 'q19', text: 'Is automatic signature updates enabled?', section: 'IPS' },
      { id: 'q20', text: 'Are false positives tuned?', section: 'IPS' },
      { id: 'q21', text: 'Are VPN tunnels configured correctly?', section: 'VPN' },
      { id: 'q22', text: 'Is VPN encryption strong (AES-256)?', section: 'VPN' },
      { id: 'q23', text: 'Are VPN tunnels monitored for availability?', section: 'VPN' },
      { id: 'q24', text: 'Is remote access VPN configured securely?', section: 'VPN' },
      { id: 'q25', text: 'Are VPN client software versions current?', section: 'VPN' },
      { id: 'q26', text: 'Is multi-factor authentication required for VPN?', section: 'VPN' },
      { id: 'q27', text: 'Are VPN logs being reviewed?', section: 'VPN' },
      { id: 'q28', text: 'Is split tunneling disabled or controlled?', section: 'VPN' },
      { id: 'q29', text: 'Are dead peer detection configured?', section: 'VPN' },
      { id: 'q30', text: 'Is VPN capacity sufficient?', section: 'VPN' },
      { id: 'q31', text: 'Are NAT policies documented?', section: 'NAT' },
      { id: 'q32', text: 'Is source NAT configured correctly?', section: 'NAT' },
      { id: 'q33', text: 'Is destination NAT working as expected?', section: 'NAT' },
      { id: 'q34', text: 'Are NAT pools sized appropriately?', section: 'NAT' },
      { id: 'q35', text: 'Is NAT traversal configured for VPN?', section: 'NAT' },
      { id: 'q36', text: 'Are port forwarding rules minimal and documented?', section: 'NAT' },
      { id: 'q37', text: 'Is NAT logging enabled?', section: 'NAT' },
      { id: 'q38', text: 'Is high availability configured?', section: 'HA Config' },
      { id: 'q39', text: 'Are HA interfaces dedicated?', section: 'HA Config' },
      { id: 'q40', text: 'Is state synchronization working?', section: 'HA Config' },
      { id: 'q41', text: 'Are failover tests performed regularly?', section: 'HA Config' },
      { id: 'q42', text: 'Is HA monitoring configured?', section: 'HA Config' },
      { id: 'q43', text: 'Are both nodes at same software version?', section: 'HA Config' },
      { id: 'q44', text: 'Is split-brain scenario prevented?', section: 'HA Config' },
      { id: 'q45', text: 'Are heartbeat intervals configured properly?', section: 'HA Config' },
      { id: 'q46', text: 'Is preemption configured as intended?', section: 'HA Config' },
      { id: 'q47', text: 'Are firewall logs being collected?', section: 'Logging' },
      { id: 'q48', text: 'Is log retention meeting compliance requirements?', section: 'Logging' },
      { id: 'q49', text: 'Are logs being sent to SIEM?', section: 'Logging' },
      { id: 'q50', text: 'Is log storage capacity sufficient?', section: 'Logging' },
      { id: 'q51', text: 'Are critical events generating alerts?', section: 'Logging' },
      { id: 'q52', text: 'Is log review performed regularly?', section: 'Logging' },
      { id: 'q53', text: 'Are logs protected from tampering?', section: 'Logging' },
      { id: 'q54', text: 'Is log time synchronization configured (NTP)?', section: 'Logging' },
      { id: 'q55', text: 'Are denied traffic logs being analyzed?', section: 'Logging' },
      { id: 'q56', text: 'Is SMC (Security Management Center) accessible?', section: 'Management' },
      { id: 'q57', text: 'Are administrative accounts secured?', section: 'Management' },
      { id: 'q58', text: 'Is role-based access control configured?', section: 'Management' },
      { id: 'q59', text: 'Are management interfaces on dedicated network?', section: 'Management' },
      { id: 'q60', text: 'Is management access logged?', section: 'Management' },
      { id: 'q61', text: 'Are policy backups automated?', section: 'Management' },
      { id: 'q62', text: 'Is change control process followed?', section: 'Management' },
      { id: 'q63', text: 'Are policy deployments tested before production?', section: 'Management' },
      { id: 'q64', text: 'Is multi-factor authentication required for admins?', section: 'Management' },
      { id: 'q65', text: 'Are session timeouts configured?', section: 'Management' },
      { id: 'q66', text: 'Is firewall software up to date?', section: 'Updates' },
      { id: 'q67', text: 'Are security patches applied regularly?', section: 'Updates' },
      { id: 'q68', text: 'Is patch testing performed before deployment?', section: 'Updates' },
      { id: 'q69', text: 'Are update schedules documented?', section: 'Updates' },
      { id: 'q70', text: 'Is automatic update enabled for signatures?', section: 'Updates' },
      { id: 'q71', text: 'Are End-of-Life dates tracked?', section: 'Updates' },
      { id: 'q72', text: 'Is rollback plan available for updates?', section: 'Updates' },
      { id: 'q73', text: 'Are update notifications configured?', section: 'Updates' },
      { id: 'q74', text: 'Is maintenance window defined for updates?', section: 'Updates' },
      { id: 'q75', text: 'Are firmware updates tested in non-production first?', section: 'Updates' },
      { id: 'q76', text: 'Is application control enabled?', section: 'Firewall Rules' },
      { id: 'q77', text: 'Are geo-blocking rules configured if needed?', section: 'Firewall Rules' },
      { id: 'q78', text: 'Is certificate inspection configured?', section: 'IPS' },
      { id: 'q79', text: 'Are threat intelligence feeds integrated?', section: 'IPS' },
      { id: 'q80', text: 'Is anti-malware scanning enabled?', section: 'IPS' },
      { id: 'q81', text: 'Are sandboxing capabilities utilized?', section: 'IPS' },
      { id: 'q82', text: 'Is URL filtering integrated?', section: 'IPS' },
      { id: 'q83', text: 'Are botnet C&C signatures active?', section: 'IPS' },
      { id: 'q84', text: 'Is SSL/TLS inspection configured?', section: 'VPN' },
      { id: 'q85', text: 'Are VPN performance metrics monitored?', section: 'VPN' },
    ],
  },
  {
    id: 'dspm',
    name: 'DSPM HC',
    productCode: 'DSPM',
    color: '#EA580C',
    icon: '☁️',
    sections: ['Cloud Scanning', 'Data Discovery', 'Risk Assessment', 'Compliance', 'Remediation', 'Integrations'],
    questions: [
      { id: 'q1', text: 'Are all cloud storage locations being scanned?', section: 'Cloud Scanning' },
      { id: 'q2', text: 'Is scanning frequency appropriate?', section: 'Cloud Scanning' },
      { id: 'q3', text: 'Are multi-cloud environments covered?', section: 'Cloud Scanning' },
      { id: 'q4', text: 'Is scan performance acceptable?', section: 'Cloud Scanning' },
      { id: 'q5', text: 'Are scanning errors being addressed?', section: 'Cloud Scanning' },
      { id: 'q6', text: 'Is incremental scanning configured?', section: 'Cloud Scanning' },
      { id: 'q7', text: 'Are shadow IT repositories discovered?', section: 'Cloud Scanning' },
      { id: 'q8', text: 'Is sensitive data discovery working correctly?', section: 'Data Discovery' },
      { id: 'q9', text: 'Are data classifiers accurate?', section: 'Data Discovery' },
      { id: 'q10', text: 'Is PII detection configured?', section: 'Data Discovery' },
      { id: 'q11', text: 'Are financial data patterns identified?', section: 'Data Discovery' },
      { id: 'q12', text: 'Is health data (PHI) detection active?', section: 'Data Discovery' },
      { id: 'q13', text: 'Are custom data patterns configured?', section: 'Data Discovery' },
      { id: 'q14', text: 'Is false positive rate acceptable?', section: 'Data Discovery' },
      { id: 'q15', text: 'Are discovery results being reviewed?', section: 'Data Discovery' },
      { id: 'q16', text: 'Is data inventory complete?', section: 'Data Discovery' },
      { id: 'q17', text: 'Are risk scores calculated correctly?', section: 'Risk Assessment' },
      { id: 'q18', text: 'Is access risk being evaluated?', section: 'Risk Assessment' },
      { id: 'q19', text: 'Are publicly accessible data identified?', section: 'Risk Assessment' },
      { id: 'q20', text: 'Is data sharing risk assessed?', section: 'Risk Assessment' },
      { id: 'q21', text: 'Are high-risk findings prioritized?', section: 'Risk Assessment' },
      { id: 'q22', text: 'Is risk trending being tracked?', section: 'Risk Assessment' },
      { id: 'q23', text: 'Are orphaned data identified?', section: 'Risk Assessment' },
      { id: 'q24', text: 'Is stale data risk calculated?', section: 'Risk Assessment' },
      { id: 'q25', text: 'Are compliance policies configured?', section: 'Compliance' },
      { id: 'q26', text: 'Is GDPR compliance being monitored?', section: 'Compliance' },
      { id: 'q27', text: 'Is HIPAA compliance tracked (if applicable)?', section: 'Compliance' },
      { id: 'q28', text: 'Are PCI-DSS controls verified (if applicable)?', section: 'Compliance' },
      { id: 'q29', text: 'Is data residency compliance checked?', section: 'Compliance' },
      { id: 'q30', text: 'Are compliance reports generated?', section: 'Compliance' },
      { id: 'q31', text: 'Is audit trail maintained?', section: 'Compliance' },
      { id: 'q32', text: 'Are violations being remediated?', section: 'Compliance' },
      { id: 'q33', text: 'Is automated remediation configured?', section: 'Remediation' },
      { id: 'q34', text: 'Are remediation workflows defined?', section: 'Remediation' },
      { id: 'q35', text: 'Is access revocation automated when needed?', section: 'Remediation' },
      { id: 'q36', text: 'Are data owners notified of issues?', section: 'Remediation' },
      { id: 'q37', text: 'Is remediation tracking in place?', section: 'Remediation' },
      { id: 'q38', text: 'Are SLAs defined for remediation?', section: 'Remediation' },
      { id: 'q39', text: 'Is data deletion/archival automated?', section: 'Remediation' },
      { id: 'q40', text: 'Are remediation reports available?', section: 'Remediation' },
      { id: 'q41', text: 'Is DLP integration configured?', section: 'Integrations' },
      { id: 'q42', text: 'Is SIEM integration working?', section: 'Integrations' },
      { id: 'q43', text: 'Are ticketing systems integrated?', section: 'Integrations' },
      { id: 'q44', text: 'Is API access secured?', section: 'Integrations' },
      { id: 'q45', text: 'Are cloud provider APIs connected?', section: 'Integrations' },
      { id: 'q46', text: 'Is identity provider integration active?', section: 'Integrations' },
    ],
  },
  {
    id: 'classification',
    name: 'Classification HC',
    productCode: 'CLASSIFICATION',
    color: '#16A34A',
    icon: '🏷',
    sections: ['AI Engine', 'Labels', 'MIP Integration', 'DLP Integration', 'User Training', 'Reporting'],
    questions: [
      { id: 'q1', text: 'Is the AI classification engine trained properly?', section: 'AI Engine' },
      { id: 'q2', text: 'Are classification models up to date?', section: 'AI Engine' },
      { id: 'q3', text: 'Is machine learning accuracy acceptable?', section: 'AI Engine' },
      { id: 'q4', text: 'Are false positives being addressed?', section: 'AI Engine' },
      { id: 'q5', text: 'Is model retraining scheduled?', section: 'AI Engine' },
      { id: 'q6', text: 'Are custom classifiers configured?', section: 'AI Engine' },
      { id: 'q7', text: 'Is AI engine performance monitored?', section: 'AI Engine' },
      { id: 'q8', text: 'Are confidence thresholds configured?', section: 'AI Engine' },
      { id: 'q9', text: 'Is automatic classification working?', section: 'AI Engine' },
      { id: 'q10', text: 'Are classification labels aligned with organizational policy?', section: 'Labels' },
      { id: 'q11', text: 'Is label taxonomy defined clearly?', section: 'Labels' },
      { id: 'q12', text: 'Are labels visible in applications?', section: 'Labels' },
      { id: 'q13', text: 'Is manual labeling enabled?', section: 'Labels' },
      { id: 'q14', text: 'Are default labels configured?', section: 'Labels' },
      { id: 'q15', text: 'Is label inheritance working?', section: 'Labels' },
      { id: 'q16', text: 'Are label colors/icons configured?', section: 'Labels' },
      { id: 'q17', text: 'Is label downgrade prevented or controlled?', section: 'Labels' },
      { id: 'q18', text: 'Are mandatory labeling policies enforced?', section: 'Labels' },
      { id: 'q19', text: 'Is Microsoft Information Protection (MIP) integrated?', section: 'MIP Integration' },
      { id: 'q20', text: 'Are MIP labels synchronized?', section: 'MIP Integration' },
      { id: 'q21', text: 'Is label mapping configured correctly?', section: 'MIP Integration' },
      { id: 'q22', text: 'Are Office 365 apps showing labels?', section: 'MIP Integration' },
      { id: 'q23', text: 'Is Azure Information Protection integrated?', section: 'MIP Integration' },
      { id: 'q24', text: 'Are protection templates configured?', section: 'MIP Integration' },
      { id: 'q25', text: 'Is encryption tied to labels?', section: 'MIP Integration' },
      { id: 'q26', text: 'Are label policies synced from MIP?', section: 'MIP Integration' },
      { id: 'q27', text: 'Is DLP policy enforcement based on labels?', section: 'DLP Integration' },
      { id: 'q28', text: 'Are classified documents monitored by DLP?', section: 'DLP Integration' },
      { id: 'q29', text: 'Is label-based blocking configured?', section: 'DLP Integration' },
      { id: 'q30', text: 'Are DLP incidents correlated with labels?', section: 'DLP Integration' },
      { id: 'q31', text: 'Is classification data sent to DLP system?', section: 'DLP Integration' },
      { id: 'q32', text: 'Are label changes triggering DLP re-evaluation?', section: 'DLP Integration' },
      { id: 'q33', text: 'Is automated remediation based on labels?', section: 'DLP Integration' },
      { id: 'q34', text: 'Are users trained on classification?', section: 'User Training' },
      { id: 'q35', text: 'Is training material available and current?', section: 'User Training' },
      { id: 'q36', text: 'Are classification guidelines published?', section: 'User Training' },
      { id: 'q37', text: 'Is user adoption being measured?', section: 'User Training' },
      { id: 'q38', text: 'Are classification examples provided?', section: 'User Training' },
      { id: 'q39', text: 'Is help desk trained on classification questions?', section: 'User Training' },
      { id: 'q40', text: 'Are refresher trainings scheduled?', section: 'User Training' },
      { id: 'q41', text: 'Is user feedback collected?', section: 'User Training' },
      { id: 'q42', text: 'Are classification reports generated?', section: 'Reporting' },
      { id: 'q43', text: 'Is label usage being tracked?', section: 'Reporting' },
      { id: 'q44', text: 'Are classification trends monitored?', section: 'Reporting' },
      { id: 'q45', text: 'Is reporting data exported to analytics?', section: 'Reporting' },
      { id: 'q46', text: 'Are compliance reports available?', section: 'Reporting' },
      { id: 'q47', text: 'Is executive dashboard configured?', section: 'Reporting' },
      { id: 'q48', text: 'Are misclassification incidents tracked?', section: 'Reporting' },
      { id: 'q49', text: 'Is ROI of classification being measured?', section: 'Reporting' },
      { id: 'q50', text: 'Are audit reports generated?', section: 'Reporting' },
      { id: 'q51', text: 'Is data coverage reporting available?', section: 'Reporting' },
    ],
  },
];

export const initialTemplates: Template[] = _rawTemplates.map((t) => ({
  ...t,
  questions: t.questions.map((q) => ({
    ...q,
    id: `${t.id}_${q.id}`,
  })),
}));

const SEV_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'rgba(220,38,38,0.08)', text: '#DC2626', border: 'rgba(220,38,38,0.22)' },
  HIGH:     { bg: 'rgba(217,119,6,0.08)',  text: '#D97706', border: 'rgba(217,119,6,0.22)' },
  MEDIUM:   { bg: 'rgba(37,99,235,0.08)', text: '#2563EB', border: 'rgba(37,99,235,0.22)' },
  LOW:      { bg: 'rgba(16,185,129,0.08)', text: '#059669', border: 'rgba(16,185,129,0.22)' },
};

interface TemplateManagerProps {
  onClose: () => void;
  templates: Template[];
  setTemplates: (templates: Template[]) => void;
  selectedProducts: Record<string, boolean>;
}

export function TemplateManager({ onClose, templates, setTemplates, selectedProducts }: TemplateManagerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingQuestionData, setEditingQuestionData] = useState<Partial<Question>>({});
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionSection, setNewQuestionSection] = useState('');
  const [newQuestionSeverity, setNewQuestionSeverity] = useState<string>('');
  const [newQuestionTriggerOn, setNewQuestionTriggerOn] = useState<'yes' | 'no'>('no');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importState, setImportState] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<'checking' | 'linked' | 'needs-permission' | 'none'>('checking');
  const [linkedFilename, setLinkedFilename] = useState<string | null>(null);
  const [pendingHandle, setPendingHandle] = useState<import('../utils/templateFileSystem').FSFileHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productIdMap: Record<string, string> = {
    web: 'web', email: 'email', data: 'dlp', ngfw: 'ngfw',
    dspm: 'dspm', cls: 'classification', appl: 'appl', vappl: 'appl',
  };

  const activeTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(selectedProducts).forEach(([productId, isSelected]) => {
      if (isSelected) {
        const templateId = productIdMap[productId];
        if (templateId) ids.add(templateId);
      }
    });
    return ids;
  }, [selectedProducts]);

  const totalQuestions = templates.reduce((sum, t) => sum + t.questions.length, 0);
  const activeQuestions = templates
    .filter((t) => activeTemplateIds.has(t.id))
    .reduce((sum, t) => sum + t.questions.length, 0);

  const handleAddQuestion = () => {
    if (!newQuestionText.trim() || !newQuestionSection) return;

    const newQuestion: Question = {
      id: `${selectedTemplate.id}_q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      text: newQuestionText,
      section: newQuestionSection,
      ...(newQuestionSeverity ? {
        severity: newQuestionSeverity as QuestionSeverity,
        triggerOn: newQuestionTriggerOn,
      } : {}),
    };

    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id ? { ...t, questions: [...t.questions, newQuestion] } : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setNewQuestionText('');
    setNewQuestionSection('');
    setNewQuestionSeverity('');
    setNewQuestionTriggerOn('no');
  };

  const handleDeleteQuestion = (questionId: string) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, questions: t.questions.filter((q) => q.id !== questionId) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
  };

  const handleUpdateQuestion = (questionId: string, updates: Partial<Question>) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, questions: t.questions.map((q) => (q.id === questionId ? { ...q, ...updates } : q)) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setEditingQuestion(null);
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestion(q.id);
    setEditingQuestionData({
      text: q.text,
      severity: q.severity,
      triggerOn: q.triggerOn,
      description: q.description,
      remediation: q.remediation,
    });
  };


  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportState('importing');
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        const parsed: unknown[] = Array.isArray(raw) ? raw : raw?.templates;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('JSON must contain a "templates" array.');
        }
        const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const validated: Template[] = parsed.map((t: unknown, i: number) => {
          const tmpl = t as Record<string, unknown>;
          if (typeof tmpl.id !== 'string' || !tmpl.id) throw new Error(`Template[${i}]: missing "id".`);
          if (typeof tmpl.name !== 'string' || !tmpl.name) throw new Error(`Template[${i}]: missing "name".`);
          if (!Array.isArray(tmpl.questions)) throw new Error(`Template[${i}]: "questions" must be an array.`);
          if (!Array.isArray(tmpl.sections)) throw new Error(`Template[${i}]: "sections" must be an array.`);

          const questions = (tmpl.questions as unknown[]).map((q: unknown, qi: number) => {
            const qobj = q as Record<string, unknown>;
            if (typeof qobj.id !== 'string' || !qobj.id) throw new Error(`Template[${i}] Question[${qi}]: missing "id".`);
            if (typeof qobj.text !== 'string' || !qobj.text) throw new Error(`Template[${i}] Question[${qi}]: missing "text".`);
            if (typeof qobj.section !== 'string') throw new Error(`Template[${i}] Question[${qi}]: missing "section".`);
            return {
              id: qobj.id,
              text: qobj.text,
              section: qobj.section,
              ...(typeof qobj.severity === 'string' && validSeverities.includes(qobj.severity)
                ? { severity: qobj.severity as QuestionSeverity } : {}),
              ...(typeof qobj.triggerOn === 'string' && (qobj.triggerOn === 'yes' || qobj.triggerOn === 'no')
                ? { triggerOn: qobj.triggerOn as 'yes' | 'no' } : {}),
              ...(typeof qobj.description === 'string' && qobj.description ? { description: qobj.description } : {}),
              ...(typeof qobj.remediation === 'string' && qobj.remediation ? { remediation: qobj.remediation } : {}),
            } as Question;
          });

          return {
            id: tmpl.id as string,
            name: tmpl.name as string,
            productCode: (tmpl.productCode as string) || '',
            color: (tmpl.color as string) || '#3B82F6',
            icon: (tmpl.icon as string) || '📋',
            sections: tmpl.sections as string[],
            questions,
          } satisfies Template;
        });

        setTemplates(validated);
        setSelectedTemplate(validated[0]);
        setImportState('success');
        setTimeout(() => setImportState('idle'), 2500);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file.');
        setImportState('error');
        setTimeout(() => { setImportState('idle'); setImportError(null); }, 4000);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id ? { ...t, sections: [...t.sections, newSectionName] } : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setNewSectionName('');
  };

  const handleDeleteSection = (sectionName: string) => {
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, sections: t.sections.filter((s) => s !== sectionName), questions: t.questions.filter((q) => q.section !== sectionName) }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
  };

  const handleRenameSection = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) { setEditingSection(null); return; }
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplate.id
        ? {
            ...t,
            sections: t.sections.map((s) => (s === oldName ? newName : s)),
            questions: t.questions.map((q) => (q.section === oldName ? { ...q, section: newName } : q)),
          }
        : t
    );
    setTemplates(updatedTemplates);
    const updated = updatedTemplates.find((t) => t.id === selectedTemplate.id)!;
    setSelectedTemplate(updated);
    setEditingSection(null);
  };

  // ── Auto-load on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported()) { setFileState('none'); return; }
    autoLoad().then((result: LoadResult) => {
      if (result.status === 'loaded') {
        setTemplates(result.templates);
        setSelectedTemplate(result.templates[0]);
        setLinkedFilename(result.filename);
        setFileState('linked');
      } else if (result.status === 'needs-permission') {
        setPendingHandle(result.handle);
        setFileState('needs-permission');
      } else {
        setFileState('none');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadPermission = async () => {
    if (!pendingHandle) return;
    const result = await requestAndLoad(pendingHandle);
    if (result.status === 'loaded') {
      setTemplates(result.templates);
      setSelectedTemplate(result.templates[0]);
      setLinkedFilename(result.filename);
      setFileState('linked');
      setPendingHandle(null);
    } else {
      setFileState('none');
    }
  };

  const handleUnlinkFile = async () => {
    await clearStoredHandle();
    setFileState('none');
    setLinkedFilename(null);
    setPendingHandle(null);
  };

  // ── Save Config (File System Access API) ─────────────────────────────────
  const handleSaveJSON = async () => {
    setSaveState('saving');
    setSaveError(null);
    const result = await saveTemplates(templates);
    if (result.ok) {
      setLinkedFilename(result.filename);
      setFileState('linked');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } else if ('cancelled' in result && result.cancelled) {
      setSaveState('idle');
    } else {
      setSaveError('error' in result ? result.error : null);
      setSaveState('error');
      setTimeout(() => { setSaveState('idle'); setSaveError(null); }, 4000);
    }
  };

  const questionsBySection = selectedTemplate.sections.map((section) => ({
    section,
    questions: selectedTemplate.questions.filter((q) => q.section === section),
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F4F7FB' }}>

      {/* Page Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-8 py-0"
        style={{ height: '64px', background: '#FFFFFF', borderBottom: '1.5px solid #EEF0F5', boxShadow: '0 1px 4px rgba(15,41,82,0.05)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.12))' }}>
            <Shield size={15} style={{ color: '#2563EB' }} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>HC Rule Engine</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>Manage checklist templates per product</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatPill label="Templates" value={String(templates.length)} color="#3B82F6" />
          <StatPill label="Total Questions" value={String(totalQuestions)} color="#8B5CF6" />
          {activeTemplateIds.size > 0 ? (
            <StatPill label={`${activeTemplateIds.size} Active · ${activeQuestions}Q`} value="LIVE" color="#10B981" dot />
          ) : (
            <StatPill label="No products selected" value="—" color="#F59E0B" />
          )}
          <div style={{ width: '1px', height: '28px', background: '#E2E8F0', margin: '0 4px' }} />
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all"
            style={{ fontSize: '12.5px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <ArrowLeft size={14} />
            Back to Wizard
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: '280px', background: '#FFFFFF', borderRight: '1px solid #EEF0F5' }}>
          <div className="p-4">
            <div className="mb-3 px-1" style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.12em' }}>
              PRODUCT TEMPLATES ({templates.length})
            </div>
            <div className="space-y-1.5">
              {templates.map((tmpl) => {
                const isActive = activeTemplateIds.has(tmpl.id);
                const isSelected = selectedTemplate.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all relative"
                    style={{
                      background: isSelected ? `${tmpl.color}10` : '#F8FAFC',
                      border: isSelected ? `1.5px solid ${tmpl.color}38` : '1.5px solid #EEF0F5',
                    }}
                  >
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
                        <CheckCircle2 size={10} className="text-white" />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${tmpl.color}18` }}>
                      {tmpl.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>{tmpl.name}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>{tmpl.questions.length}Q · {tmpl.sections.length} sec</div>
                      {isActive && <div style={{ fontSize: '9px', color: '#10B981', fontWeight: 700, letterSpacing: '0.06em', marginTop: '2px' }}>● ACTIVE IN STEP 5</div>}
                    </div>
                    {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r" style={{ background: tmpl.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {/* Template Title */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl relative" style={{ background: `${selectedTemplate.color}18` }}>
                {selectedTemplate.icon}
                {activeTemplateIds.has(selectedTemplate.id) && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
                    <CheckCircle2 size={11} className="text-white" />
                  </div>
                )}
              </div>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>{selectedTemplate.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="px-2 py-0.5 rounded-md" style={{ fontSize: '9.5px', fontWeight: 700, fontFamily: 'monospace', background: `${selectedTemplate.color}14`, color: selectedTemplate.color, border: `1px solid ${selectedTemplate.color}28` }}>
                    {selectedTemplate.productCode}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{selectedTemplate.questions.length} Questions · {selectedTemplate.sections.length} Sections</span>
                </div>
              </div>
            </div>

            {/* File link status banner */}
            {fileState === 'linked' && linkedFilename && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)' }}>
                <FolderOpen size={14} style={{ color: '#059669', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#065F46', flex: 1 }}>
                  Linked to <strong style={{ fontFamily: 'monospace' }}>{linkedFilename}</strong> — changes save automatically.
                </span>
                <button onClick={handleUnlinkFile}
                  style={{ fontSize: '11px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                  Unlink
                </button>
              </div>
            )}
            {fileState === 'needs-permission' && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <RefreshCw size={14} style={{ color: '#D97706', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#92400E', flex: 1 }}>
                  A saved config file was found. Click to reload it.
                </span>
                <button onClick={handleLoadPermission}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: '11.5px', background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <FolderOpen size={12} /> Load File
                </button>
                <button onClick={handleUnlinkFile}
                  style={{ fontSize: '11px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                  Dismiss
                </button>
              </div>
            )}

            {/* Live sync info */}
            <div className="flex items-start gap-3 p-4 rounded-xl mb-6" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#2563EB' }}>
                <span style={{ fontSize: '12px' }}>💡</span>
              </div>
              <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: 1.65 }}>
                <strong>Live Sync:</strong> Changes here reflect immediately in <strong>Step 5 — Per-Product Checklist</strong>.
                {activeTemplateIds.has(selectedTemplate.id)
                  ? <span style={{ color: '#059669', fontWeight: 600 }}> ✓ This template is currently active.</span>
                  : <span style={{ color: '#64748B' }}> Select the corresponding product in Step 2 to activate.</span>
                }
                <span style={{ color: '#64748B' }}> Set <strong>severity</strong> on questions to surface findings in Step 6 — Parsing &amp; Analysis.</span>
              </div>
            </div>

            {/* Add Section + Add Question */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Add Section */}
              <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.12)' }}>
                    <Layers size={13} style={{ color: '#7C3AED' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Add New Section</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g. Advanced Configuration"
                    className="flex-1 px-3 rounded-lg outline-none transition-all"
                    style={{ fontSize: '12.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '36px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid #BFDBFE')}
                    onBlur={(e) => (e.currentTarget.style.border = '1.5px solid #E2E8F0')}
                  />
                  <button onClick={handleAddSection} disabled={!newSectionName.trim()}
                    className="flex items-center gap-1.5 px-4 rounded-lg font-semibold"
                    style={{ fontSize: '12px', height: '36px', background: '#7C3AED', color: '#FFF', opacity: !newSectionName.trim() ? 0.4 : 1, cursor: !newSectionName.trim() ? 'not-allowed' : 'pointer' }}
                  >
                    <FolderPlus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Add Question */}
              <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <Plus size={13} style={{ color: '#10B981' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Add New Question</span>
                </div>
                {/* Row 1: section + text + add */}
                <div className="flex gap-2 items-center mb-2">
                  <select value={newQuestionSection} onChange={(e) => setNewQuestionSection(e.target.value)}
                    className="px-3 rounded-lg outline-none flex-shrink-0"
                    style={{ fontSize: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '34px', width: '130px' }}
                  >
                    <option value="">Section…</option>
                    {selectedTemplate.sections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" value={newQuestionText} onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Question text…"
                    className="flex-1 px-3 rounded-lg outline-none"
                    style={{ fontSize: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#0F172A', height: '34px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
                    onFocus={(e) => (e.currentTarget.style.border = '1.5px solid #BFDBFE')}
                    onBlur={(e) => (e.currentTarget.style.border = '1.5px solid #E2E8F0')}
                  />
                  <button onClick={handleAddQuestion} disabled={!newQuestionText.trim() || !newQuestionSection}
                    className="flex items-center gap-1.5 px-4 rounded-lg font-semibold flex-shrink-0"
                    style={{ fontSize: '12px', height: '34px', background: '#3B82F6', color: '#FFF', opacity: (!newQuestionText.trim() || !newQuestionSection) ? 0.4 : 1, cursor: (!newQuestionText.trim() || !newQuestionSection) ? 'not-allowed' : 'pointer' }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                {/* Row 2: severity + triggerOn */}
                <div className="flex gap-2 items-center">
                  <select value={newQuestionSeverity} onChange={(e) => setNewQuestionSeverity(e.target.value)}
                    style={{ fontSize: '11.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: newQuestionSeverity ? SEV_BADGE[newQuestionSeverity]?.text : '#94A3B8', height: '30px', borderRadius: '8px', padding: '0 8px', width: '135px', outline: 'none' }}
                  >
                    <option value="">No severity</option>
                    <option value="CRITICAL">⚠ CRITICAL</option>
                    <option value="HIGH">▲ HIGH</option>
                    <option value="MEDIUM">● MEDIUM</option>
                    <option value="LOW">○ LOW</option>
                  </select>
                  {newQuestionSeverity ? (
                    <select value={newQuestionTriggerOn} onChange={(e) => setNewQuestionTriggerOn(e.target.value as 'yes' | 'no')}
                      style={{ fontSize: '11.5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', color: '#475569', height: '30px', borderRadius: '8px', padding: '0 8px', width: '140px', outline: 'none' }}
                    >
                      <option value="no">Flag when: NO</option>
                      <option value="yes">Flag when: YES</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#CBD5E1' }}>Set severity to track in analysis</span>
                  )}
                </div>
              </div>
            </div>

            {/* Questions by Section */}
            <div className="grid grid-cols-2 gap-4">
              {questionsBySection.map(({ section, questions }) => (
                <div key={section} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
                  <div className="flex items-center gap-3 px-5 py-3" style={{ background: '#F8FAFC', borderBottom: '1px solid #EEF0F5' }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${selectedTemplate.color}18`, fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', color: selectedTemplate.color }}>
                      {questions.length}
                    </div>
                    {editingSection === section ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input type="text" defaultValue={section}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSection(section, e.currentTarget.value);
                            else if (e.key === 'Escape') setEditingSection(null);
                          }}
                          className="flex-1 px-2.5 rounded-lg outline-none"
                          style={{ height: '28px', fontSize: '13px', fontWeight: 600, background: '#FFF', border: '1.5px solid #3B82F6' }}
                          autoFocus
                        />
                        <button onClick={(e) => { const input = (e.currentTarget.previousElementSibling as HTMLInputElement); handleRenameSection(section, input.value); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#3B82F6', color: '#FFF' }}
                        ><Save size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1" style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{section}</span>
                        <button onClick={() => setEditingSection(section)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF0F5'; e.currentTarget.style.color = '#3B82F6'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                        ><Edit2 size={12} /></button>
                        <button onClick={() => handleDeleteSection(section)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                        ><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    {questions.length === 0 ? (
                      <div className="py-5 text-center" style={{ fontSize: '12px', color: '#94A3B8' }}>No questions in this section yet.</div>
                    ) : questions.map((question, qi) => (
                      <div key={question.id} className="flex items-start gap-3 p-3 rounded-xl transition-all" style={{ background: '#F8FAFC', border: '1px solid #EEF0F5' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#BFDBFE')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#EEF0F5')}
                      >
                        <span className="flex-shrink-0 mt-0.5" style={{ fontSize: '10px', fontFamily: 'monospace', color: '#CBD5E1', fontWeight: 600, minWidth: '20px' }}>
                          {String(qi + 1).padStart(2, '0')}
                        </span>
                        {editingQuestion === question.id ? (
                          <div className="flex-1 flex flex-col gap-1.5">
                            {/* Row 1: text + severity + triggerOn + save + cancel */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input type="text"
                                value={editingQuestionData.text ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, text: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateQuestion(question.id, editingQuestionData);
                                  else if (e.key === 'Escape') setEditingQuestion(null);
                                }}
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '30px', fontSize: '12.5px', background: '#FFF', border: '1.5px solid #3B82F6', minWidth: '120px' }}
                                autoFocus
                              />
                              <select
                                value={editingQuestionData.severity ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, severity: (e.target.value || undefined) as QuestionSeverity | undefined }))}
                                style={{ height: '30px', fontSize: '11px', background: '#FFF', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '0 6px', color: editingQuestionData.severity ? SEV_BADGE[editingQuestionData.severity]?.text : '#94A3B8', outline: 'none', flexShrink: 0 }}
                              >
                                <option value="">No sev</option>
                                <option value="CRITICAL">CRITICAL</option>
                                <option value="HIGH">HIGH</option>
                                <option value="MEDIUM">MEDIUM</option>
                                <option value="LOW">LOW</option>
                              </select>
                              {editingQuestionData.severity && (
                                <select
                                  value={editingQuestionData.triggerOn ?? 'no'}
                                  onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, triggerOn: e.target.value as 'yes' | 'no' }))}
                                  style={{ height: '30px', fontSize: '11px', background: '#FFF', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '0 6px', color: '#475569', outline: 'none', flexShrink: 0 }}
                                >
                                  <option value="no">Flag: NO</option>
                                  <option value="yes">Flag: YES</option>
                                </select>
                              )}
                              <button onClick={() => handleUpdateQuestion(question.id, editingQuestionData)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#3B82F6', color: '#FFF' }}
                              ><Save size={13} /></button>
                              <button onClick={() => setEditingQuestion(null)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}
                              ><X size={13} /></button>
                            </div>
                            {/* Row 2: description + remediation */}
                            <div className="flex gap-1.5">
                              <input type="text"
                                value={editingQuestionData.description ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, description: e.target.value || undefined }))}
                                placeholder="Description (optional)"
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '28px', fontSize: '11.5px', background: '#FFF', border: '1.5px solid #E2E8F0', color: '#475569' }}
                              />
                              <input type="text"
                                value={editingQuestionData.remediation ?? ''}
                                onChange={(e) => setEditingQuestionData((prev) => ({ ...prev, remediation: e.target.value || undefined }))}
                                placeholder="Remediation (optional)"
                                className="flex-1 px-2.5 rounded-lg outline-none"
                                style={{ height: '28px', fontSize: '11.5px', background: '#FFF', border: '1.5px solid #E2E8F0', color: '#475569' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 flex items-start gap-2 min-w-0">
                              <span className="flex-1" style={{ fontSize: '12.5px', color: '#0F172A', lineHeight: 1.55 }}>{question.text}</span>
                              {question.severity && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded mt-0.5"
                                  style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'monospace', background: SEV_BADGE[question.severity].bg, color: SEV_BADGE[question.severity].text, border: `1px solid ${SEV_BADGE[question.severity].border}` }}
                                >
                                  {question.severity}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => startEditQuestion(question)} className="w-6 h-6 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF0F5'; e.currentTarget.style.color = '#3B82F6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                              ><Edit2 size={11} /></button>
                              <button onClick={() => handleDeleteQuestion(question.id)} className="w-6 h-6 rounded-lg flex items-center justify-center transition-all" style={{ color: '#94A3B8' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                              ><Trash2 size={11} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-8 py-3"
        style={{ background: '#FFFFFF', borderTop: '1.5px solid #EEF0F5', boxShadow: '0 -4px 16px rgba(15,41,82,0.06)' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: `${selectedTemplate.color}18` }}>
              {selectedTemplate.icon}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{selectedTemplate.name}</span>
          </div>
          <div style={{ width: '1px', height: '18px', background: '#E2E8F0' }} />
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {templates.reduce((s, t) => s + t.questions.length, 0)} total questions &nbsp;·&nbsp; {templates.length} templates
          </span>
        </div>

        <div className="flex items-center gap-3">
          {importState === 'error' && importError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA', maxWidth: '260px' }}>
              <AlertCircle size={13} color="#DC2626" className="flex-shrink-0" />
              <span style={{ fontSize: '11px', color: '#DC2626', lineHeight: 1.4 }}>{importError}</span>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportJSON} />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importState === 'importing'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '13px',
              background: importState === 'success' ? '#DCFCE7' : importState === 'error' ? '#FEF2F2' : importState === 'importing' ? '#F8FAFC' : '#F1F5F9',
              color: importState === 'success' ? '#16A34A' : importState === 'error' ? '#DC2626' : importState === 'importing' ? '#94A3B8' : '#475569',
              border: importState === 'success' ? '1.5px solid #BBF7D0' : importState === 'error' ? '1.5px solid #FECACA' : '1.5px solid #E2E8F0',
              minWidth: '150px', justifyContent: 'center',
              cursor: importState === 'importing' ? 'not-allowed' : 'pointer',
            }}
          >
            {importState === 'importing' ? (
              <><div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#CBD5E1', borderTopColor: '#64748B' }} />Reading…</>
            ) : importState === 'success' ? (
              <><Check size={14} />Imported!</>
            ) : importState === 'error' ? (
              <><AlertCircle size={14} />Try Again</>
            ) : (
              <><Upload size={14} />Import Config</>
            )}
          </button>

          <div style={{ width: '1px', height: '28px', background: '#E2E8F0' }} />

          <button
            onClick={handleSaveJSON}
            disabled={saveState === 'saving'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold transition-all"
            style={{
              fontSize: '13px',
              background: saveState === 'saved'  ? '#DCFCE7'
                        : saveState === 'error'  ? '#FEF2F2'
                        : saveState === 'saving' ? '#F8FAFC'
                        : 'linear-gradient(135deg, #2563EB, #7C3AED)',
              color: saveState === 'saved'  ? '#16A34A'
                   : saveState === 'error'  ? '#DC2626'
                   : saveState === 'saving' ? '#94A3B8'
                   : '#FFFFFF',
              border: saveState === 'saved'  ? '1.5px solid #BBF7D0'
                    : saveState === 'error'  ? '1.5px solid #FECACA'
                    : saveState === 'saving' ? '1.5px solid #E2E8F0'
                    : 'none',
              boxShadow: saveState === 'idle' ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
              minWidth: '150px', justifyContent: 'center',
              cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
            }}
            title={saveError ?? undefined}
          >
            {saveState === 'saving' ? (
              <><div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#CBD5E1', borderTopColor: '#64748B' }} />Saving…</>
            ) : saveState === 'saved' ? (
              <><Check size={14} />{linkedFilename ? 'Saved!' : 'Saved!'}</>
            ) : saveState === 'error' ? (
              <><AlertCircle size={14} />Save Failed</>
            ) : (
              <><Download size={14} />{fileState === 'linked' ? 'Save Config' : 'Save Config…'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color, dot }: { label: string; value: string; color: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: `${color}14`, border: `1px solid ${color}28` }}>
      {dot && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
      <span style={{ fontSize: '10px', color: '#94A3B8', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// Parses a DLPServerInfo bundle — a folder produced by the Forcepoint
// "DLPServerInfo" diagnostic tool. Each file in the bundle is dispatched to
// a dedicated parser by filename; missing files simply leave the corresponding
// section as null.

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface NetworkAdapter {
  name: string;
  connectionName?: string;
  dhcp?: string;
  ipAddresses: string[];
}

export interface SystemInfoData {
  hostName: string;
  osName: string;
  osVersion: string;
  osBuild: string;
  osBuildType: string;
  systemManufacturer: string;
  systemModel: string;
  systemType: string;
  processors: string[];
  processorCount: string;
  biosVersion: string;
  totalPhysicalMemoryMB: number;
  availablePhysicalMemoryMB: number;
  virtualMemoryMaxMB: number;
  virtualMemoryAvailableMB: number;
  virtualMemoryInUseMB: number;
  bootTime: string;
  installDate: string;
  domain: string;
  logonServer: string;
  timeZone: string;
  systemLocale: string;
  hotfixes: string[];
  networkAdapters: NetworkAdapter[];
  hypervisorDetected: boolean;
}

export interface ForcepointProducts {
  eipInfraInstalled: boolean;
  eipInfraVersion: string;
  eipInfraPath: string;
  dlpInstalled: boolean;
  dlpVersion: string;
  dlpPath: string;
  webSecurityInstalled: boolean;
  emailSecurityInstalled: boolean;
}

export interface HardwareInfo {
  cpuCount: number;
  cpuModel: string;
  cpuSpeedMhz: number;
  ramTotalMB: number;
  ramAvailableMB: number;
  ramUsagePercent: number;
  diskCTotalGB: number;
  diskCFreeGB: number;
  diskCUsagePercent: number;
}

export interface Hotfix {
  id: string;
  installedOn: string;       // ISO YYYY-MM-DD when parseable
  installedOnRaw: string;    // original locale-formatted date
  description: string;
}

export interface OsHotfixes {
  totalCount: number;
  hotfixes: Hotfix[];
  latestHotfixId: string;
  latestHotfixDate: string;       // ISO YYYY-MM-DD
  latestHotfixDateRaw: string;
  daysSinceLastPatch: number | null;
  patchStatus: 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
}

export interface ServiceEntry {
  displayName: string;
  name: string;
  state: string;
  status: string;
  startMode: string;
  startName: string;
}

export interface ServicesInfo {
  totalWebsenseServices: number;
  allRunning: boolean;
  notRunning: string[];   // display names where state != Running
  services: ServiceEntry[];
}

export interface CertificateInfo {
  subjectCn: string;
  issuerCn: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  keyBits: number;
  algorithm: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN';
}

export interface CertificatesInfo {
  hostCert: CertificateInfo | null;
  caCert: CertificateInfo | null;
}

export interface SqlServerInfo {
  versionString: string;
  versionShort: string;
  buildNumber: string;
  buildDate: string;
  edition: string;
  editionStatus: 'OK' | 'WARNING';
  patchStatus: 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
}

export interface DatabaseInfo {
  name: string;
  dataFileSizeMB: number;
  logFileSizeMB: number;
  totalSizeMB: number;
}

export interface EventPartition {
  partitionIndex: string;
  fromDate: string;
  toDate: string;
  numOfEvents: string;
  status: string;
}

export interface EventPartitions {
  totalPartitions: number;
  partitions: EventPartition[];
  /* Aggregate metrics computed from the catalogue — optional so older saved
     bundles (no summary field) still hydrate without runtime errors. */
  summary?: EventPartitionsSummary;
}

export interface EventPartitionsSummary {
  archivedPartitionCount: number;
  onlinePartitionCount: number;
  archivedEvents: number;
  onlineEvents: number;
  totalEvents: number;
  dataHistoryStart: string;
  dataHistoryEnd: string;
  activePartitionFrom: string;
  activePartitionTo: string;
  warnings: string[];
}

/* PA_CONFIG_PROPERTIES.csv — key Forcepoint DLP Manager config values pulled
   from the SQL queries dump. Field names follow the user's spec verbatim. */
export interface ConfigPropertyLdapRepo {
  name: string;
  enabled: boolean;
  lastSyncOk: boolean;
}
export interface ConfigProperties {
  webTransactionsTotal: string;
  webSizeTotal: string;
  emailTransactionsTotal: string;
  emailSizeTotal: string;
  discoveryTransactionsTotal: string;
  discoverySizeTotal: string;
  mobileTransactionsTotal: string;
  auditRetentionDays: string;
  activeLdapRepositories: string;
  ldapImportFrequency: string;
  ldapImportTime: string;
  allLdapRepositories: string;
  ldapRepos: ConfigPropertyLdapRepo[];
  policyEngineConfigStatus: string;
  dimPolicyStatus: string;
  darPolicyStatus: string;
  behaviorAnalyticsEnabled: boolean;
  rapEnabled: boolean;
  mipEnabled: boolean;
  linkingServiceEnabled: boolean;
  linkingServiceConfigured: boolean;
  superAdminPasswordResetPending: boolean;
  siemSyslogHost: string;
  siemSyslogPort: string;
  backupPath: string;
  backupCopies: string;
  backupIncludesForensics: boolean;
  policyConcurrencyLevel: string;
  partitionDurationDays: string;
  warnings: string[];
}

/* WS_SM_SITE_ELEMENTS.csv — DLP site-element inventory used for component
   tallies, sync-health and version-mix calculations. */
export interface SiteElementsDisabled { name: string; type: string; status: string }
export interface SiteElementsFailed   { name: string; type: string; reason: string }
export interface SiteElements {
  componentCounts: Record<string, number>;
  syncStatus: {
    synchronized: number;
    unsynchronizedEdit: number;
    markedUnsynchronizedEdit: number;
    total: number;
    syncPercentage: number;
  };
  disabledComponents: SiteElementsDisabled[];
  versionInventory: Record<string, number>;
  failedDeployments: SiteElementsFailed[];
  dlpServerHostnames: string[];
  warnings: string[];
}

export interface EndpointClients {
  syncedCount: number;
  unsyncedCount: number;
  syncedHostnames: string[];
  profileName: string;
  profileEnabled: boolean;
}

export interface ActivePolicies {
  totalRules: number;
  policyNames: string[];
  rulesWithExceptions: string[];
}

export interface InstalledProduct {
  name: string;
  vendor: string;
  version: string;
}

export interface DlpServerBundle {
  bundleId: string;
  bundleName: string;
  uploadedAt: string;
  fileCount: number;

  systemInfo: SystemInfoData | null;
  forcepointProducts: ForcepointProducts | null;
  hardware: HardwareInfo | null;
  osHotfixes: OsHotfixes | null;
  services: ServicesInfo | null;
  certificates: CertificatesInfo;
  sqlServer: SqlServerInfo | null;
  database: DatabaseInfo | null;
  eventPartitions: EventPartitions | null;
  /* PA_CONFIG_PROPERTIES.csv — DLP Manager config snapshot. Optional so
     pre-existing saved bundles keep deserialising. */
  configProperties?: ConfigProperties | null;
  /* WS_SM_SITE_ELEMENTS.csv — site element inventory + sync health. */
  siteElements?: SiteElements | null;
  endpointClients: EndpointClients | null;
  activePolicies: ActivePolicies | null;
  depEnabled: boolean | null;
  installedProducts: InstalledProduct[];

  parsedFiles: string[];
  unrecognizedFiles: string[];
}

// Legacy single-file type — kept so older saved sessions still hydrate.
export interface DlpServerInfo extends SystemInfoData {
  fileName: string;
  raw: string;
}

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

function parseMB(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[,\s]/g, '').replace(/MB$/i, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function getField(text: string, label: string): string {
  const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

function parseDateLocale(raw: string): { iso: string; daysAgo: number | null } {
  // Accepts "8/29/2023", "3/8/2020", "3/23/2021, 9:42:39 AM", "8/29/2023 14:23"
  if (!raw) return { iso: '', daysAgo: null };
  const cleaned = raw.split(',')[0].trim();
  const parts = cleaned.split(/[\/\-]/);
  if (parts.length !== 3) return { iso: '', daysAgo: null };
  const [m, d, y] = parts.map(p => parseInt(p, 10));
  if (!m || !d || !y) return { iso: '', daysAgo: null };
  const yyyy = y < 100 ? 2000 + y : y;
  const iso = `${yyyy.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  const date = new Date(Date.UTC(yyyy, m - 1, d));
  if (isNaN(date.getTime())) return { iso, daysAgo: null };
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return { iso, daysAgo };
}

// Tiny CSV row parser — handles double-quoted fields with embedded commas, quotes, and newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ───────────────────────────────────────────────────────────────────────────────
// Per-file parsers
// ───────────────────────────────────────────────────────────────────────────────

export function parseSystemInfoData(text: string): SystemInfoData | null {
  if (!/Host Name|OS Name/i.test(text)) return null;
  const info: SystemInfoData = {
    hostName: getField(text, 'Host Name'),
    osName: getField(text, 'OS Name'),
    osVersion: getField(text, 'OS Version'),
    osBuild: '',
    osBuildType: getField(text, 'OS Build Type'),
    systemManufacturer: getField(text, 'System Manufacturer'),
    systemModel: getField(text, 'System Model'),
    systemType: getField(text, 'System Type'),
    processors: [],
    processorCount: '',
    biosVersion: getField(text, 'BIOS Version'),
    totalPhysicalMemoryMB: parseMB(getField(text, 'Total Physical Memory')),
    availablePhysicalMemoryMB: parseMB(getField(text, 'Available Physical Memory')),
    virtualMemoryMaxMB: parseMB(getField(text, 'Virtual Memory: Max Size')),
    virtualMemoryAvailableMB: parseMB(getField(text, 'Virtual Memory: Available')),
    virtualMemoryInUseMB: parseMB(getField(text, 'Virtual Memory: In Use')),
    bootTime: getField(text, 'System Boot Time'),
    installDate: getField(text, 'Original Install Date'),
    domain: getField(text, 'Domain'),
    logonServer: getField(text, 'Logon Server'),
    timeZone: getField(text, 'Time Zone'),
    systemLocale: getField(text, 'System Locale'),
    hotfixes: [],
    networkAdapters: [],
    hypervisorDetected: false,
  };

  const buildMatch = /Build\s+(\d+)/i.exec(info.osVersion);
  if (buildMatch) info.osBuild = buildMatch[1];

  const procCountMatch = /Processor\(s\)\s*:\s*(\d+)\s+Processor/i.exec(text);
  info.processorCount = procCountMatch ? procCountMatch[1] : '';
  const procBlock = /Processor\(s\)\s*:[\s\S]*?(?=^[A-Z][^\r\n]+:)/m.exec(text);
  if (procBlock) {
    const procRe = /\[\d+\]:\s*(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = procRe.exec(procBlock[0])) !== null) info.processors.push(m[1].trim());
  }

  const hotfixBlock = /Hotfix\(s\)\s*:[\s\S]*?(?=^[A-Z][^\r\n]+:|$)/m.exec(text);
  if (hotfixBlock) {
    const hfRe = /\[\d+\]:\s*(KB\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = hfRe.exec(hotfixBlock[0])) !== null) info.hotfixes.push(m[1]);
  }

  const netBlock = /Network Card\(s\)\s*:[\s\S]*?(?=^Hyper-V|^\s*$)/m.exec(text);
  if (netBlock) {
    const cardRe = /\[\d+\]:\s*([^\r\n]+)([\s\S]*?)(?=^\s*\[\d+\]:|$)/gm;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(netBlock[0])) !== null) {
      const name = m[1].trim();
      const detail = m[2] || '';
      const connName = /Connection Name:\s*(.+)/i.exec(detail)?.[1].trim();
      const dhcp = /DHCP Enabled:\s*(.+)/i.exec(detail)?.[1].trim();
      const ips: string[] = [];
      const ipRe = /\[\d+\]:\s*([0-9a-fA-F.:]+)/g;
      let im: RegExpExecArray | null;
      while ((im = ipRe.exec(detail)) !== null) ips.push(im[1].trim());
      info.networkAdapters.push({ name, connectionName: connName, dhcp, ipAddresses: ips });
    }
  }

  info.hypervisorDetected = /Hyper-V Requirements[\s\S]*?hypervisor has been detected/i.test(text);
  return info;
}

// Back-compat shim used by old single-file uploads.
export function parseSystemInfo(text: string, fileName: string): DlpServerInfo {
  const sys = parseSystemInfoData(text) ?? {
    hostName: '', osName: '', osVersion: '', osBuild: '', osBuildType: '',
    systemManufacturer: '', systemModel: '', systemType: '', processors: [], processorCount: '',
    biosVersion: '', totalPhysicalMemoryMB: 0, availablePhysicalMemoryMB: 0,
    virtualMemoryMaxMB: 0, virtualMemoryAvailableMB: 0, virtualMemoryInUseMB: 0,
    bootTime: '', installDate: '', domain: '', logonServer: '', timeZone: '', systemLocale: '',
    hotfixes: [], networkAdapters: [], hypervisorDetected: false,
  };
  return { ...sys, fileName, raw: text };
}

export function parseForcepointProducts(text: string): ForcepointProducts | null {
  if (!/Forcepoint|Data Security|Web Security|Email Security/.test(text)) return null;
  const yes = (v: string) => /^YES$/i.test(v.trim());
  return {
    eipInfraInstalled: yes(getField(text, 'Forcepoint infrastructure Server Installed')),
    eipInfraVersion: getField(text, 'Forcepoint infrastructure Server Version'),
    eipInfraPath: getField(text, 'Forcepoint infrastructure Server Installation Path'),
    dlpInstalled: yes(getField(text, 'Data Security Installed')),
    dlpVersion: getField(text, 'Data Security Version'),
    dlpPath: getField(text, 'Data Security Installation Path'),
    webSecurityInstalled: yes(getField(text, 'Web Security Installed')),
    emailSecurityInstalled: yes(getField(text, 'Email Security Installed')),
  };
}

export function parseMemCpuHdd(text: string): HardwareInfo | null {
  const ramTotal = parseMB(getField(text, 'Total Physical Memory'));
  const ramAvail = parseMB(getField(text, 'Available Physical Memory'));

  // CPU blocks: count "Name=" lines, take first as model + first MaxClockSpeed as speed
  const cpuNames: string[] = [];
  const nameRe = /^Name=(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(text)) !== null) cpuNames.push(m[1].trim());
  const speedMatch = /MaxClockSpeed=(\d+)/.exec(text);

  // Disk: parse table where header has DeviceID, FreeSpace, Size
  let diskTotal = 0;
  let diskFree = 0;
  const diskMatch = /DeviceID\s+FreeSpace\s+Size[\s\S]*?\n([\s\S]*?)(?=\n\s*\n|\n\s*$)/i.exec(text);
  if (diskMatch) {
    const lines = diskMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3 && /^C:?/i.test(parts[0])) {
        diskFree = parseInt(parts[1], 10) || 0;
        diskTotal = parseInt(parts[2], 10) || 0;
        break;
      }
    }
  }

  if (!ramTotal && cpuNames.length === 0 && !diskTotal) return null;

  const totalGB = diskTotal / (1024 ** 3);
  const freeGB = diskFree / (1024 ** 3);
  const usedGB = totalGB - freeGB;

  return {
    cpuCount: cpuNames.length,
    cpuModel: cpuNames[0] || '',
    cpuSpeedMhz: speedMatch ? parseInt(speedMatch[1], 10) : 0,
    ramTotalMB: ramTotal,
    ramAvailableMB: ramAvail,
    ramUsagePercent: ramTotal ? Math.round(((ramTotal - ramAvail) / ramTotal) * 100) : 0,
    diskCTotalGB: Math.round(totalGB * 10) / 10,
    diskCFreeGB: Math.round(freeGB * 10) / 10,
    diskCUsagePercent: totalGB ? Math.round((usedGB / totalGB) * 100) : 0,
  };
}

export function parseHotfixes(text: string): OsHotfixes | null {
  // Each hotfix is a block of key=value lines separated by blank lines.
  const idRe = /HotFixID=(KB\d+)/g;
  const dateRe = /InstalledOn=([^\r\n]*)/g;
  const descRe = /Description=([^\r\n]*)/g;
  const ids: string[] = [];
  const dates: string[] = [];
  const descs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(text)) !== null) ids.push(m[1].trim());
  while ((m = dateRe.exec(text)) !== null) dates.push(m[1].trim());
  while ((m = descRe.exec(text)) !== null) descs.push(m[1].trim());

  if (ids.length === 0) return null;

  const hotfixes: Hotfix[] = ids.map((id, i) => {
    const raw = dates[i] || '';
    const { iso } = parseDateLocale(raw);
    return { id, installedOnRaw: raw, installedOn: iso, description: descs[i] || '' };
  });

  // Find latest by ISO date (lexicographic comparison works because of zero-padding)
  let latest: Hotfix | null = null;
  for (const h of hotfixes) {
    if (h.installedOn && (!latest || h.installedOn > latest.installedOn)) latest = h;
  }

  let daysSinceLastPatch: number | null = null;
  if (latest) {
    const { daysAgo } = parseDateLocale(latest.installedOnRaw);
    daysSinceLastPatch = daysAgo;
  }

  let patchStatus: OsHotfixes['patchStatus'] = 'UNKNOWN';
  if (daysSinceLastPatch != null) {
    if (daysSinceLastPatch < 180) patchStatus = 'OK';
    else if (daysSinceLastPatch < 365) patchStatus = 'WARNING';
    else patchStatus = 'CRITICAL';
  }

  return {
    totalCount: hotfixes.length,
    hotfixes,
    latestHotfixId: latest?.id || '',
    latestHotfixDate: latest?.installedOn || '',
    latestHotfixDateRaw: latest?.installedOnRaw || '',
    daysSinceLastPatch,
    patchStatus,
  };
}

export function parseServicesInfo(text: string): ServicesInfo | null {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) return null;
  const header = lines[0];
  if (!/DisplayName|StartMode|State/i.test(header)) return null;

  // Compute fixed-width column ranges from the header.
  // Word-boundary regex is required because plain indexOf("Name") would match the "Name"
  // INSIDE "DisplayName" instead of the standalone "Name" column header.
  const cols = [
    { key: 'displayName', name: 'DisplayName' },
    { key: 'name',        name: 'Name' },
    { key: 'startMode',   name: 'StartMode' },
    { key: 'startName',   name: 'StartName' },
    { key: 'state',       name: 'State' },
    { key: 'status',      name: 'Status' },
  ] as const;

  const positions = cols.map(c => {
    const m = new RegExp(`\\b${c.name}\\b`).exec(header);
    return m ? m.index : -1;
  });

  // Abort if the State column wasn't found — without it we can't tell running from stopped.
  if (positions[4] < 0) return null;

  const services: ServiceEntry[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const entry: ServiceEntry = { displayName: '', name: '', state: '', status: '', startMode: '', startName: '' };
    for (let i = 0; i < cols.length; i++) {
      const start = positions[i];
      if (start < 0) continue;
      // End at the next valid (non-negative) column position, or end-of-line.
      let end = line.length;
      for (let j = i + 1; j < cols.length; j++) {
        if (positions[j] >= 0) { end = positions[j]; break; }
      }
      const value = line.slice(start, end).trim();
      (entry as Record<string, string>)[cols[i].key] = value;
    }
    if (entry.name || entry.displayName) services.push(entry);
  }

  const notRunning = services
    .filter(s => s.state && !/^running$/i.test(s.state))
    .map(s => s.displayName || s.name);

  return {
    totalWebsenseServices: services.length,
    allRunning: notRunning.length === 0 && services.length > 0,
    notRunning,
    services,
  };
}

export function parseAvDep(text: string): boolean | null {
  if (!/DataExecutionPrevention_Available/i.test(text)) return null;
  if (/^\s*TRUE\s*$/im.test(text)) return true;
  if (/^\s*FALSE\s*$/im.test(text)) return false;
  return null;
}

export function parseInstalledApps(text: string): InstalledProduct[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0];
  if (!/Name\s+Vendor\s+Version/i.test(header)) return [];

  const nameStart = 0;
  const vendorStart = header.indexOf('Vendor');
  const versionStart = header.indexOf('Version');
  if (vendorStart < 0 || versionStart < 0) return [];

  const out: InstalledProduct[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const name = line.slice(nameStart, vendorStart).trim();
    const vendor = line.slice(vendorStart, versionStart).trim();
    const version = line.slice(versionStart).trim();
    if (!name) continue;
    if (/^Microsoft Corporation$/i.test(vendor)) continue; // skip MS clutter, per schema spec
    out.push({ name, vendor, version });
  }
  return out;
}

export function parseSqlVersion(text: string): SqlServerInfo | null {
  const rows = parseCsv(text);
  // First cell of the first data row (after the empty-string header) holds the multi-line version string.
  const versionString = rows.find(r => r.length > 0 && r[0] && /Microsoft SQL Server/i.test(r[0]))?.[0]?.trim() ?? '';
  if (!versionString) return null;

  const yearMatch = /SQL Server\s+(\d{4})/.exec(versionString);
  const cuMatch = /\((?:RTM-)?(CU\d+(?:[-_]GDR)?)\)/i.exec(versionString) || /\((SP\d+)\)/i.exec(versionString);
  const buildMatch = /-\s*(\d+\.\d+\.\d+\.\d+)\s*\(/.exec(versionString) || /(\d+\.\d+\.\d+\.\d+)/.exec(versionString);
  const dateMatch = /\b([A-Za-z]{3})\s+\d{1,2}\s+(\d{4})\b/.exec(versionString);
  const editionMatch = /(Developer|Enterprise|Standard|Express|Web|Business Intelligence|Evaluation|Personal)\s+Edition/i.exec(versionString);

  const versionShort = [yearMatch?.[1], cuMatch?.[1]?.toUpperCase()].filter(Boolean).join(' ');
  const monthNames: Record<string, string> = {
    Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
    Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
  };
  const buildDate = dateMatch ? `${monthNames[dateMatch[1]] || dateMatch[1]} ${dateMatch[2]}` : '';
  const edition = editionMatch ? `${editionMatch[1]} Edition` : '';

  // Patch age in days, computed from the build date if available.
  let patchStatus: SqlServerInfo['patchStatus'] = 'UNKNOWN';
  if (dateMatch) {
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(dateMatch[1]);
    if (month >= 0) {
      const dt = new Date(Date.UTC(parseInt(dateMatch[2], 10), month, 1));
      const ageDays = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 365) patchStatus = 'OK';
      else if (ageDays < 365 * 2) patchStatus = 'WARNING';
      else patchStatus = 'CRITICAL';
    }
  }

  const editionStatus: SqlServerInfo['editionStatus'] = /Developer|Express/i.test(edition) ? 'WARNING' : 'OK';

  return {
    versionString,
    versionShort,
    buildNumber: buildMatch?.[1] || '',
    buildDate,
    edition,
    editionStatus,
    patchStatus,
  };
}

export function parseDbSize(text: string): DatabaseInfo | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map(h => h.trim());
  const idx = {
    db: header.indexOf('DatabaseName'),
    phys: header.indexOf('Physical_Name'),
    size: header.indexOf('SizeMB'),
  };
  if (idx.db < 0 || idx.size < 0) return null;

  let name = '';
  let dataMB = 0;
  let logMB = 0;
  for (const row of rows.slice(1)) {
    if (!row[idx.db]) continue;
    name = row[idx.db].trim();
    const physical = (row[idx.phys] || '').toLowerCase();
    const sizeMB = parseInt(row[idx.size], 10) || 0;
    if (physical.endsWith('.mdf')) dataMB += sizeMB;
    else if (physical.endsWith('.ldf')) logMB += sizeMB;
    else dataMB += sizeMB;
  }
  return {
    name,
    dataFileSizeMB: dataMB,
    logFileSizeMB: logMB,
    totalSizeMB: dataMB + logMB,
  };
}

export function parsePartitionCatalog(text: string): EventPartitions | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map(h => h.trim());
  const idx = {
    pi: header.indexOf('PARTITION_INDEX'),
    from: header.indexOf('FROM_DATE'),
    to: header.indexOf('TO_DATE'),
    n: header.indexOf('NUM_OF_EVENTS'),
    s: header.indexOf('STATUS'),
  };
  if (idx.pi < 0) return null;

  const partitions: EventPartition[] = rows.slice(1)
    .filter(r => r[idx.pi])
    .map(r => ({
      partitionIndex: r[idx.pi] || '',
      fromDate: r[idx.from] || '',
      toDate: r[idx.to] || '',
      numOfEvents: idx.n >= 0 ? (r[idx.n] || '') : '',
      status: idx.s >= 0 ? (r[idx.s] || '') : '',
    }));

  /* Aggregate summary — counts, event totals, partition window. The
     MAX_ONLINE threshold (5) follows Forcepoint's documented DB ceiling. */
  let archivedPartitionCount = 0;
  let onlinePartitionCount = 0;
  let archivedEvents = 0;
  let onlineEvents = 0;
  let totalEvents = 0;
  let dataHistoryStart = '';
  let dataHistoryEnd = '';
  let activePartitionFrom = '';
  let activePartitionTo = '';

  for (const p of partitions) {
    const n = parseInt(p.numOfEvents, 10) || 0;
    totalEvents += n;
    const st = (p.status || '').toUpperCase();
    if (st === 'ARCHIVED') {
      archivedPartitionCount++;
      archivedEvents += n;
    } else if (st === 'ONLINE' || st === 'ONLINE_ACTIVE') {
      onlinePartitionCount++;
      onlineEvents += n;
    }
    if (st === 'ONLINE_ACTIVE') {
      activePartitionFrom = p.fromDate;
      activePartitionTo = p.toDate;
    }
    if (p.fromDate && (!dataHistoryStart || p.fromDate < dataHistoryStart)) dataHistoryStart = p.fromDate;
    if (p.toDate && (!dataHistoryEnd || p.toDate > dataHistoryEnd)) dataHistoryEnd = p.toDate;
  }

  const warnings: string[] = [];
  if (onlinePartitionCount > 5) {
    warnings.push(`⚠ Online partition count (${onlinePartitionCount}) exceeds MAX_ONLINE limit of 5`);
  }

  const summary: EventPartitionsSummary = {
    archivedPartitionCount,
    onlinePartitionCount,
    archivedEvents,
    onlineEvents,
    totalEvents,
    dataHistoryStart,
    dataHistoryEnd,
    activePartitionFrom,
    activePartitionTo,
    warnings,
  };

  return { totalPartitions: partitions.length, partitions, summary };
}

/* ──────────────────────────────────────────────────────────────────────
   PA_CONFIG_PROPERTIES.csv — DLP Manager configuration snapshot. The
   CSV has three columns: NAME, GROUP_NAME, VALUE. We pluck a curated
   set of name/group pairs and raise warnings for inconsistent settings.
─────────────────────────────────────────────────────────────────────── */
export function parseConfigProperties(text: string): ConfigProperties | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim());
  const iName  = header.indexOf('NAME');
  const iGroup = header.indexOf('GROUP_NAME');
  const iValue = header.indexOf('VALUE');
  if (iName < 0 || iGroup < 0 || iValue < 0) return null;

  /* Build a map keyed by `<GROUP>::<NAME>` for fast lookups. Some keys are
     duplicated across groups so the composite key avoids collisions. */
  const map = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const name = (r[iName]  || '').trim();
    const grp  = (r[iGroup] || '').trim();
    const val  = (r[iValue] || '').trim();
    if (name && grp) map.set(`${grp}::${name}`, val);
  }
  const lookup = (group: string, name: string): string => map.get(`${group}::${name}`) ?? '';
  const isTrue = (v: string): boolean => /^true|1|yes$/i.test(v.trim());

  const warnings: string[] = [];

  // Audit retention
  const auditRetentionDays = lookup('AUDIT_CONFIGURATION', 'DELETE_AUDIT_RECORDS_OLDER_THAN_DAYS');
  if (auditRetentionDays === '0') warnings.push('⚠ Audit records never deleted — contributes to DB growth');

  // LDAP repositories
  const allRepos = lookup('EXTERNAL_REPOSITORIES', 'ALL_REPOSITORIES');
  const repoNames = allRepos.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const ldapRepos: ConfigPropertyLdapRepo[] = repoNames.map((rname) => {
    const enabled  = isTrue(lookup(rname, 'wbsn.repository.is.enabled'));
    const syncStr  = lookup(rname, 'wbsn.repository.last.sync.status');
    const lastSyncOk = isTrue(syncStr);
    if (enabled && syncStr && !lastSyncOk) {
      warnings.push(`⚠ ${rname} LDAP sync failed`);
    }
    return { name: rname, enabled, lastSyncOk };
  });

  // Deploy policy statuses
  const policyEngineConfigStatus = lookup('DEPLOY_POLICY', 'POLICY_ENGINE_CONFIG_GLOBAL_STATUS');
  const dimPolicyStatus          = lookup('DEPLOY_POLICY', 'DATA_IN_MOTION_POLICY_GLOBAL_STATUS');
  const darPolicyStatus          = lookup('DEPLOY_POLICY', 'DATA_AT_REST_POLICY_GLOBAL_STATUS');
  const checkPolicy = (label: string, status: string) => {
    if (status === 'UNSYNCHRONIZED_EDIT') warnings.push(`⚠ ${label} has pending unsynchronized changes`);
  };
  checkPolicy('Policy Engine config', policyEngineConfigStatus);
  checkPolicy('Data-in-Motion policy', dimPolicyStatus);
  checkPolicy('Data-at-Rest policy',   darPolicyStatus);

  // Linking Service
  const linkingServiceEnabled    = isTrue(lookup('LINKING_SERVICE', 'LinkingService_Enabled'));
  const linkingServiceConfigured = isTrue(lookup('LINKING_SERVICE', 'LinkingService_Configured'));
  if (linkingServiceEnabled && !linkingServiceConfigured) {
    warnings.push('⚠ Linking Service is enabled but not configured');
  }

  // SSO super-admin password reset
  const superAdminPwdRaw = lookup('SSO_CONFIG', 'RESET_SUPER_ADMIN_PASSWED_ON_NEXT_LOGIN');
  const superAdminPasswordResetPending = isTrue(superAdminPwdRaw);
  if (superAdminPasswordResetPending) {
    warnings.push('⚠ Super admin password reset is pending on next login');
  }

  // Backup forensics
  const backupForensicsRaw = lookup('BACKUP_AND_RESTORE', 'INCLUDE_INCIDENT_FORENSICS');
  const backupIncludesForensics = isTrue(backupForensicsRaw);
  if (backupForensicsRaw && !backupIncludesForensics) {
    warnings.push('⚠ Forensics not included in backups');
  }

  return {
    webTransactionsTotal:       lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_WEB_TRANSACTIONS'),
    webSizeTotal:               lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_WEB_SIZE'),
    emailTransactionsTotal:     lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_EMAIL_TRANSACTIONS'),
    emailSizeTotal:             lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_EMAIL_SIZE'),
    discoveryTransactionsTotal: lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_DISCOVERY_TRANSACTIONS'),
    discoverySizeTotal:         lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_DISCOVERY_SIZE'),
    mobileTransactionsTotal:    lookup('EVENT_TRAFFIC', 'AGGREGATION_CHANNEL_MOBILE_TRANSACTIONS'),
    auditRetentionDays,
    activeLdapRepositories:     lookup('USERS_REPOSITORY_GLOBAL_CONFIG', 'ACTIVE_REPOSITORIES'),
    ldapImportFrequency:        lookup('USERS_REPOSITORY_GLOBAL_CONFIG', 'IMPORT_FREQUENCY'),
    ldapImportTime:             lookup('USERS_REPOSITORY_GLOBAL_CONFIG', 'DAILY_IMPORT_AT'),
    allLdapRepositories:        allRepos,
    ldapRepos,
    policyEngineConfigStatus,
    dimPolicyStatus,
    darPolicyStatus,
    behaviorAnalyticsEnabled:   isTrue(lookup('BEHAVIOR_ANALYTIC_CONFIGURATIONS', 'IS_FEATURE_ENABLED')),
    rapEnabled:                 isTrue(lookup('RISK_ADAPTIVE_PROTECTION', 'RAP_ENABLED')),
    mipEnabled:                 isTrue(lookup('MIP_GENERAL_SETTINGS', 'IS_MIP_FEATURE_ENABLED')),
    linkingServiceEnabled,
    linkingServiceConfigured,
    superAdminPasswordResetPending,
    siemSyslogHost:             lookup('INCIDENTS_SYSLOG', 'INCIDENTS_SYSLOG-HOSTNAME'),
    siemSyslogPort:             lookup('INCIDENTS_SYSLOG', 'INCIDENTS_SYSLOG-PORT'),
    backupPath:                 lookup('BACKUP_AND_RESTORE', 'PATH'),
    backupCopies:               lookup('BACKUP_AND_RESTORE', 'NUM_OF_COPIES'),
    backupIncludesForensics,
    policyConcurrencyLevel:     lookup('DEPLOY_POLICY_CONFIGURATIONS', 'POLICIES_PROCESSING_CONCURRENCY_LEVEL'),
    partitionDurationDays:      lookup('PARTITION_ARCHIVE', 'PARTITION_DURATION_DAYS'),
    warnings,
  };
}

/* ──────────────────────────────────────────────────────────────────────
   WS_SM_SITE_ELEMENTS.csv — Forcepoint DLP site element inventory.
   Provides component counts by type, sync-status health, disabled
   components, version mix and any failed deployment results.
─────────────────────────────────────────────────────────────────────── */
const SITE_ELEMENT_FRIENDLY: Record<string, string> = {
  POLICY_ENGINE:             'Policy Engines',
  AGENT_FINGERPRINT_MANAGER: 'Fingerprint Managers',
  CONTENT_MANAGER:           'DLP Application Servers',
  SERVER_ENDPOINT:           'Endpoint Servers',
  AGENT_DISCOVERY_WIN:       'Crawlers',
  OCR_SERVER:                'OCR Servers',
  AGENT_WCG:                 'Web Content Gateway (WCG) Servers',
  AGENT_ESG:                 'Email Security (ESG) Servers',
  ANALYTIC_ENGINE:           'Analytics Engines',
  FORENSICS_REPOSITORY:      'Forensics Repositories',
};

export function parseSiteElements(text: string): SiteElements | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim());
  const iName    = header.indexOf('NAME');
  const iType    = header.indexOf('ELEMENT_TYPE');
  const iStatus  = header.indexOf('ELEMENT_STATUS');
  const iEnabled = header.indexOf('IS_ENABLED');
  const iVersion = header.indexOf('NETWORK_ELEMENT_VERSION');
  const iResult  = header.indexOf('DEPLOYMENT_RESULT_TYPE');
  const iResDesc = header.indexOf('DEPLOYMENT_RESULT_DESC');
  const iHost    = header.indexOf('HOSTNAME');
  if (iType < 0 || iStatus < 0) return null;

  const componentCounts: Record<string, number> = {};
  const versionInventory: Record<string, number> = {};
  const disabledComponents: SiteElementsDisabled[] = [];
  const failedDeployments: SiteElementsFailed[] = [];
  const dlpServerHostnames: string[] = [];
  const warnings: string[] = [];
  let synchronized = 0;
  let unsynchronizedEdit = 0;
  let markedUnsynchronizedEdit = 0;
  let total = 0;

  for (const r of rows.slice(1)) {
    const name    = (r[iName]    || '').trim();
    const type    = (r[iType]    || '').trim();
    const status  = (r[iStatus]  || '').trim();
    const enabled = iEnabled >= 0 ? (r[iEnabled] || '').trim() : '';
    const version = iVersion >= 0 ? (r[iVersion] || '').trim() : '';
    const result  = iResult  >= 0 ? (r[iResult]  || '').trim() : '';
    const resDesc = iResDesc >= 0 ? (r[iResDesc] || '').trim() : '';
    const host    = iHost    >= 0 ? (r[iHost]    || '').trim() : '';

    if (!type) continue;
    total++;

    const friendly = SITE_ELEMENT_FRIENDLY[type] ?? type;
    componentCounts[friendly] = (componentCounts[friendly] ?? 0) + 1;

    if (status === 'SYNCHRONIZED') synchronized++;
    else if (status === 'UNSYNCHRONIZED_EDIT') unsynchronizedEdit++;
    else if (status === 'MARKED_UNSYNCHRONIZED_EDIT') markedUnsynchronizedEdit++;

    if (enabled && !/^true$/i.test(enabled)) {
      disabledComponents.push({ name, type, status });
      warnings.push(`⚠ Component disabled: ${name} (${type})`);
    }

    if (version && version.toLowerCase() !== 'nan') {
      versionInventory[version] = (versionInventory[version] ?? 0) + 1;
    }

    if (result === 'FAILURE') {
      failedDeployments.push({ name, type, reason: resDesc });
    }

    if (type === 'CONTENT_MANAGER' && host) dlpServerHostnames.push(host);
  }

  const offSync = unsynchronizedEdit + markedUnsynchronizedEdit;
  const syncPercentage = total > 0 ? Math.round((synchronized / total) * 1000) / 10 : 0;
  if (total > 0 && offSync / total > 0.3) {
    warnings.push('⚠ More than 30% of components are not synchronized');
  }
  if (Object.keys(versionInventory).length > 2) {
    warnings.push('⚠ Mixed component versions detected — upgrade alignment recommended');
  }

  return {
    componentCounts,
    syncStatus: { synchronized, unsynchronizedEdit, markedUnsynchronizedEdit, total, syncPercentage },
    disabledComponents,
    versionInventory,
    failedDeployments,
    dlpServerHostnames,
    warnings,
  };
}

export function parseSyncEpClients(text: string): { syncedHostnames: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { syncedHostnames: [] };
  const header = rows[0].map(h => h.trim());
  const hostIdx = header.indexOf('Hostname');
  if (hostIdx < 0) return { syncedHostnames: [] };
  const hosts = rows.slice(1).map(r => r[hostIdx]).filter(Boolean) as string[];
  return { syncedHostnames: hosts };
}

export function parseUnsyncEpClients(text: string): number {
  const rows = parseCsv(text);
  if (rows.length < 2) return 0;
  const header = rows[0].map(h => h.trim());
  const idx = header.indexOf('UnsyncCount');
  if (idx < 0) return 0;
  return parseInt(rows[1][idx], 10) || 0;
}

export function parseEndpointProfiles(text: string): { name: string; enabled: boolean } | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map(h => h.trim());
  const nameIdx = header.indexOf('NAME');
  const enIdx = header.indexOf('IS_ENABLED');
  if (nameIdx < 0) return null;
  // Prefer an enabled profile if available.
  const enabledRow = rows.slice(1).find(r => /^true$/i.test((r[enIdx] || '').trim()));
  const row = enabledRow ?? rows[1];
  return {
    name: row[nameIdx] || '',
    enabled: enIdx >= 0 ? /^true$/i.test((row[enIdx] || '').trim()) : false,
  };
}

export function parsePolicies(text: string): ActivePolicies | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const header = rows[0].map(h => h.trim());
  const pIdx = header.indexOf('Policy Name');
  const rIdx = header.indexOf('Rule Name');
  const eIdx = header.indexOf('Exclusion Name');
  if (pIdx < 0 || rIdx < 0) return null;

  const dataRows = rows.slice(1).filter(r => r[pIdx] || r[rIdx]);
  const policyNames = Array.from(new Set(dataRows.map(r => (r[pIdx] || '').trim()).filter(Boolean)));
  const rulesWithExceptions = Array.from(new Set(
    dataRows
      .filter(r => eIdx >= 0 && (r[eIdx] || '').trim())
      .map(r => (r[rIdx] || '').trim())
      .filter(Boolean)
  ));

  return {
    totalRules: dataRows.length,
    policyNames,
    rulesWithExceptions,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Bundle dispatcher
// ───────────────────────────────────────────────────────────────────────────────

type ParseTarget = keyof DlpServerBundle | 'syncedClients' | 'unsyncedClients' | 'endpointProfile';

const DISPATCH: Array<{ pattern: RegExp; target: ParseTarget }> = [
  { pattern: /^systeminfo\.txt$/i,                  target: 'systemInfo' },
  { pattern: /^forcepoint_products\.txt$/i,         target: 'forcepointProducts' },
  { pattern: /^mem_cpu_hdd\.txt$/i,                 target: 'hardware' },
  { pattern: /^installed_hotfixes\.txt$/i,          target: 'osHotfixes' },
  { pattern: /^services_info\.txt$/i,               target: 'services' },
  { pattern: /^av_dep\.txt$/i,                      target: 'depEnabled' },
  { pattern: /^installed_apps\.txt$/i,              target: 'installedProducts' },
  { pattern: /^SQL_VERSION\.csv$/i,                 target: 'sqlServer' },
  { pattern: /^DB_SIZE\.csv$/i,                     target: 'database' },
  { pattern: /^PA_EVENT_PARTITION_CATALOG\.csv$/i,  target: 'eventPartitions' },
  { pattern: /^PA_CONFIG_PROPERTIES\.csv$/i,        target: 'configProperties' },
  { pattern: /^WS_SM_SITE_ELEMENTS\.csv$/i,         target: 'siteElements' },
  { pattern: /^SYNC_EP_CLIENTS\.csv$/i,             target: 'syncedClients' },
  { pattern: /^UNSYNC_EP_CLIENTS_COUNT\.csv$/i,     target: 'unsyncedClients' },
  { pattern: /^WS_ENDPNT_PROFILES\.csv$/i,          target: 'endpointProfile' },
  { pattern: /^POLICIES_RULES_EXCEPTIONS\.csv$/i,   target: 'activePolicies' },
];

function emptyBundle(name: string, fileCount: number): DlpServerBundle {
  return {
    bundleId: `${name}-${Date.now()}`,
    bundleName: name,
    uploadedAt: new Date().toISOString(),
    fileCount,
    systemInfo: null,
    forcepointProducts: null,
    hardware: null,
    osHotfixes: null,
    services: null,
    certificates: { hostCert: null, caCert: null },
    sqlServer: null,
    database: null,
    eventPartitions: null,
    configProperties: null,
    siteElements: null,
    endpointClients: null,
    activePolicies: null,
    depEnabled: null,
    installedProducts: [],
    parsedFiles: [],
    unrecognizedFiles: [],
  };
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export interface UploadedFile {
  name: string;          // base filename
  relativePath: string;  // webkitRelativePath or just the name
  text: string;
}

export function parseDlpBundle(files: UploadedFile[]): DlpServerBundle {
  // Derive bundle name from the deepest common parent folder, or fall back to first file.
  let bundleName = '';
  const firstPath = files[0]?.relativePath || '';
  const firstSegments = firstPath.split(/[\\/]/).filter(Boolean);
  if (firstSegments.length > 1) bundleName = firstSegments[0];
  else bundleName = `bundle-${new Date().toISOString().slice(0, 10)}`;

  const bundle = emptyBundle(bundleName, files.length);
  const synced: { syncedHostnames: string[] } = { syncedHostnames: [] };
  let unsyncedCount = 0;
  let endpointProfile: { name: string; enabled: boolean } | null = null;

  for (const file of files) {
    const fname = basename(file.name);
    const route = DISPATCH.find(r => r.pattern.test(fname));
    if (!route) {
      bundle.unrecognizedFiles.push(file.relativePath || fname);
      continue;
    }
    try {
      switch (route.target) {
        case 'systemInfo':         bundle.systemInfo = parseSystemInfoData(file.text); break;
        case 'forcepointProducts': bundle.forcepointProducts = parseForcepointProducts(file.text); break;
        case 'hardware':           bundle.hardware = parseMemCpuHdd(file.text); break;
        case 'osHotfixes':         bundle.osHotfixes = parseHotfixes(file.text); break;
        case 'services':           bundle.services = parseServicesInfo(file.text); break;
        case 'depEnabled':         bundle.depEnabled = parseAvDep(file.text); break;
        case 'installedProducts':  bundle.installedProducts = parseInstalledApps(file.text); break;
        case 'sqlServer':          bundle.sqlServer = parseSqlVersion(file.text); break;
        case 'database':           bundle.database = parseDbSize(file.text); break;
        case 'eventPartitions':    bundle.eventPartitions = parsePartitionCatalog(file.text); break;
        case 'configProperties':   bundle.configProperties = parseConfigProperties(file.text); break;
        case 'siteElements':       bundle.siteElements = parseSiteElements(file.text); break;
        case 'syncedClients':      synced.syncedHostnames = parseSyncEpClients(file.text).syncedHostnames; break;
        case 'unsyncedClients':    unsyncedCount = parseUnsyncEpClients(file.text); break;
        case 'endpointProfile':    endpointProfile = parseEndpointProfiles(file.text); break;
        case 'activePolicies':     bundle.activePolicies = parsePolicies(file.text); break;
      }
      bundle.parsedFiles.push(file.relativePath || fname);
    } catch {
      bundle.unrecognizedFiles.push(file.relativePath || fname);
    }
  }

  if (synced.syncedHostnames.length || unsyncedCount || endpointProfile) {
    bundle.endpointClients = {
      syncedCount: synced.syncedHostnames.length,
      unsyncedCount,
      syncedHostnames: synced.syncedHostnames,
      profileName: endpointProfile?.name || '',
      profileEnabled: endpointProfile?.enabled || false,
    };
  }

  return bundle;
}

// ───────────────────────────────────────────────────────────────────────────────
// Display formatters (shared by Step3 UI and report)
// ───────────────────────────────────────────────────────────────────────────────

export function formatMemoryGB(mb: number): string {
  if (!mb) return '—';
  const gb = mb / 1024;
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

export function memoryUsagePct(info: { totalPhysicalMemoryMB: number; availablePhysicalMemoryMB: number }): number {
  if (!info.totalPhysicalMemoryMB) return 0;
  const used = info.totalPhysicalMemoryMB - info.availablePhysicalMemoryMB;
  return Math.max(0, Math.min(100, Math.round((used / info.totalPhysicalMemoryMB) * 100)));
}

export function statusColor(s: string): string {
  switch (s) {
    case 'OK':           return '#16a34a';
    case 'WARNING':      return '#d97706';
    case 'CRITICAL':
    case 'EXPIRED':      return '#dc2626';
    case 'EXPIRING_SOON':return '#d97706';
    case 'VALID':        return '#16a34a';
    default:             return '#64748b';
  }
}

/* Plain-text Endpoint Agent analysis report.
   Mirrors the 13-section structure of the analyst spec — output is suitable
   for saving as akbank_endpoint_analysis_report.txt or pasting into Confluence. */

import type { EndpointAgentSummary } from './endpointAgentParser';

function header(title: string): string {
  return `\n=== ${title} ===\n`;
}

function pad(s: string | number, w: number, align: 'L' | 'R' = 'L'): string {
  const str = String(s);
  if (str.length >= w) return str.slice(0, w);
  return align === 'L' ? str + ' '.repeat(w - str.length) : ' '.repeat(w - str.length) + str;
}

function row(cells: { v: string | number; w: number; align?: 'L' | 'R' }[]): string {
  return cells.map((c) => pad(c.v, c.w, c.align)).join('  ');
}

function findingLine(severity: string, msg: string): string {
  return `\n[${severity}] ${msg}`;
}

export function generateEndpointTextReport(s: EndpointAgentSummary): string {
  const lines: string[] = [];
  const total = s.totalRecords;
  const pf = (n: number) => `${n.toLocaleString()} (${total > 0 ? Math.round((n / total) * 1000) / 10 : 0}%)`;

  lines.push('═════════════════════════════════════════════════════════════════════');
  lines.push('  FORCEPOINT DLP ENDPOINT AGENT — TECHNICAL FINDINGS REPORT');
  lines.push('═════════════════════════════════════════════════════════════════════');
  lines.push(`Source file       : ${s.fileName}`);
  lines.push(`Imported at       : ${new Date(s.importedAt).toLocaleString()}`);
  lines.push(`Total endpoints   : ${total.toLocaleString()}`);
  lines.push(`Report generated  : ${new Date().toLocaleString()}`);

  /* ─── SECTION 1 ─── */
  lines.push(header('SECTION 1 — DATASET OVERVIEW'));
  lines.push(`Total rows: ${total.toLocaleString()}`);
  lines.push(`Columns   : ${s.nullCounts.length}`);
  lines.push('');
  lines.push(row([{ v: 'Column', w: 36 }, { v: 'Nulls', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(58));
  for (const c of s.nullCounts) {
    lines.push(row([{ v: c.column, w: 36 }, { v: c.nullCount.toLocaleString(), w: 10, align: 'R' }, { v: c.nullPct + '%', w: 8, align: 'R' }]));
  }
  if (s.unknownColumns.length > 0) {
    lines.push(`\nUnexpected columns: ${s.unknownColumns.join(', ')}`);
    lines.push(findingLine('HIGH', `Unexpected columns detected — schema may have changed.`));
  } else {
    lines.push(findingLine('INFO', `Schema matches the expected 19-column Endpoint Status Log export.`));
  }

  /* ─── SECTION 2 ─── */
  lines.push(header('SECTION 2 — PROFILE BREAKDOWN'));
  lines.push(row([
    { v: 'Profile', w: 32 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' },
    { v: 'Sync%', w: 8, align: 'R' }, { v: 'Stale30', w: 10, align: 'R' }, { v: 'Stale90', w: 10, align: 'R' },
    { v: 'AvgDays', w: 10, align: 'R' },
  ]));
  lines.push('-'.repeat(92));
  for (const p of s.profileBreakdown) {
    lines.push(row([
      { v: p.profile, w: 32 }, { v: p.count.toLocaleString(), w: 10, align: 'R' }, { v: p.pct + '%', w: 8, align: 'R' },
      { v: p.syncRatePct + '%', w: 8, align: 'R' }, { v: p.stale30Count.toLocaleString(), w: 10, align: 'R' },
      { v: p.stale90Count.toLocaleString(), w: 10, align: 'R' },
      { v: p.avgDaysSinceUpdate == null ? '—' : String(p.avgDaysSinceUpdate), w: 10, align: 'R' },
    ]));
  }
  const zeroSyncProfiles = s.profileBreakdown.filter((p) => p.flagZeroSync && p.count > 5);
  if (zeroSyncProfiles.length > 0) {
    lines.push(`\nFlag: ${zeroSyncProfiles.length} profile(s) with 0% sync rate: ${zeroSyncProfiles.map((p) => p.profile).join(', ')}`);
  }
  if (s.unmanagedCount > 0) {
    lines.push(`Flag: ${s.unmanagedCount.toLocaleString()} endpoints with no profile — UNMANAGED (no DLP policy applied)`);
    lines.push(findingLine('CRITICAL', `${s.unmanagedCount.toLocaleString()} endpoints have no Profile Name — no policy is applied to these clients.`));
  } else {
    lines.push(findingLine('INFO', 'Every endpoint is assigned to a profile.'));
  }

  /* ─── SECTION 3 ─── */
  lines.push(header('SECTION 3 — AGENT VERSION ANALYSIS'));
  lines.push('Version Distribution');
  lines.push(row([{ v: 'Version', w: 24 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }, { v: 'Bucket', w: 14 }]));
  lines.push('-'.repeat(60));
  for (const v of s.versionDistribution) {
    lines.push(row([
      { v: v.version, w: 24 }, { v: v.count.toLocaleString(), w: 10, align: 'R' },
      { v: v.pct + '%', w: 8, align: 'R' }, { v: v.bucket, w: 14 },
    ]));
  }
  lines.push('\nBucket Summary');
  lines.push(row([{ v: 'Bucket', w: 32 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(54));
  for (const b of s.versionBuckets) {
    lines.push(row([{ v: b.label, w: 32 }, { v: b.count.toLocaleString(), w: 10, align: 'R' }, { v: b.pct + '%', w: 8, align: 'R' }]));
  }
  const legacyB = s.versionBuckets.find((b) => b.bucket === 'LEGACY');
  const outdatedB = s.versionBuckets.find((b) => b.bucket === 'OUTDATED');
  const orphanB = s.versionBuckets.find((b) => b.bucket === 'ORPHAN');
  if (legacyB && legacyB.count > 0) lines.push(`\nFlag CRITICAL: ${legacyB.count.toLocaleString()} endpoints on LEGACY versions (< 24.x).`);
  if (orphanB && orphanB.count > 0) lines.push(`Flag: ${orphanB.count.toLocaleString()} ORPHAN registrations (no version) — inflates client count.`);
  lines.push(`\nClient vs Policy Engine version mismatches: ${s.policyEngineMismatchCount.toLocaleString()}`);
  if (s.policyEngineMismatchSample.length > 0) {
    lines.push('Sample mismatches (first 10):');
    for (const m of s.policyEngineMismatchSample.slice(0, 10)) {
      lines.push(`  ${pad(m.hostname, 30)} client=${pad(m.client, 14)} engine=${m.engine}`);
    }
  }
  const verdict3 = (legacyB?.count ?? 0) > 0 ? 'CRITICAL' : (outdatedB?.count ?? 0) > 0 ? 'HIGH' : 'INFO';
  lines.push(findingLine(verdict3, `Version posture: ${(legacyB?.count ?? 0).toLocaleString()} legacy · ${(outdatedB?.count ?? 0).toLocaleString()} outdated · ${(orphanB?.count ?? 0).toLocaleString()} orphan.`));

  /* ─── SECTION 4 ─── */
  lines.push(header('SECTION 4 — SYNC STATUS ANALYSIS'));
  lines.push(`Overall: Synced ${pf(s.syncedCount)} · Unsynced ${pf(s.unsyncedCount)}`);
  lines.push('\nPer Endpoint Server (sorted lowest sync rate first):');
  lines.push(row([{ v: 'Server', w: 30 }, { v: 'Synced', w: 10, align: 'R' }, { v: 'Unsynced', w: 10, align: 'R' }, { v: 'Sync%', w: 8, align: 'R' }, { v: 'Tier', w: 10 }]));
  lines.push('-'.repeat(72));
  for (const r of s.syncByServer) {
    lines.push(row([{ v: r.group, w: 30 }, { v: r.syncedCount.toLocaleString(), w: 10, align: 'R' }, { v: r.unsyncedCount.toLocaleString(), w: 10, align: 'R' }, { v: r.syncRatePct + '%', w: 8, align: 'R' }, { v: r.riskTier, w: 10 }]));
  }
  lines.push('\nPer Profile:');
  for (const r of s.syncByProfile) {
    lines.push(`  ${pad(r.group, 32)}  sync=${r.syncRatePct}%  (${r.syncedCount.toLocaleString()} / ${(r.syncedCount + r.unsyncedCount).toLocaleString()})`);
  }
  lines.push('\nPer Version Bucket:');
  for (const r of s.syncByVersionBucket) {
    lines.push(`  ${pad(r.group, 32)}  sync=${r.syncRatePct}%  (${r.syncedCount.toLocaleString()} / ${(r.syncedCount + r.unsyncedCount).toLocaleString()})`);
  }
  if (s.criticalSyncServers.length > 0) lines.push(`\nFlag CRITICAL (sync < 30%): ${s.criticalSyncServers.join(', ')}`);
  if (s.highRiskSyncServers.length > 0) lines.push(`Flag HIGH (sync < 50%): ${s.highRiskSyncServers.join(', ')}`);
  if (s.topUnsyncedServers.length > 0) {
    lines.push('\nServers carrying the most unsynced agents:');
    for (const t of s.topUnsyncedServers) lines.push(`  ${pad(t.server, 32)}  ${t.unsynced.toLocaleString()} unsynced`);
  }
  const syncVerdict = s.syncRatePct < 30 ? 'CRITICAL' : s.syncRatePct < 50 ? 'HIGH' : s.syncRatePct < 80 ? 'MEDIUM' : 'INFO';
  lines.push(findingLine(syncVerdict, `Fleet sync rate ${s.syncRatePct}% — ${s.unsyncedCount.toLocaleString()} agents running stale policy.`));

  /* ─── SECTION 5 ─── */
  lines.push(header('SECTION 5 — STALENESS ANALYSIS'));
  lines.push(row([{ v: 'Bucket', w: 18 }, { v: 'Range', w: 16 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(54));
  for (const b of s.stalenessBuckets) {
    lines.push(row([{ v: b.bucket, w: 18 }, { v: b.label, w: 16 }, { v: b.count.toLocaleString(), w: 10, align: 'R' }, { v: b.pct + '%', w: 8, align: 'R' }]));
  }
  lines.push(`\nLikely decommissioned (> 365 days): ${s.likelyDecommissionedCount.toLocaleString()}`);
  lines.push('\nPer Endpoint Server:');
  lines.push(row([{ v: 'Server', w: 30 }, { v: 'AvgDays', w: 10, align: 'R' }, { v: '>90d', w: 10, align: 'R' }]));
  lines.push('-'.repeat(54));
  for (const r of s.serverStaleness) {
    lines.push(row([{ v: r.server, w: 30 }, { v: r.avgDays == null ? '—' : String(r.avgDays), w: 10, align: 'R' }, { v: r.countOver90.toLocaleString(), w: 10, align: 'R' }]));
  }
  lines.push('\nPer Profile:');
  for (const r of s.profileStaleness) {
    lines.push(`  ${pad(r.profile, 32)}  avg ${r.avgDays == null ? '—' : r.avgDays + ' days'}`);
  }
  const critStale = s.stalenessBuckets.find((b) => b.bucket === 'Critical')?.count ?? 0;
  const verdict5 = critStale > 0 ? 'HIGH' : s.staleCount > 0 ? 'MEDIUM' : 'INFO';
  lines.push(findingLine(verdict5, `${critStale.toLocaleString()} endpoints not seen in > 180 days · ${s.likelyDecommissionedCount.toLocaleString()} likely decommissioned (>365d).`));

  /* ─── SECTION 6 ─── */
  lines.push(header('SECTION 6 — ENDPOINT SERVER LOAD'));
  lines.push(row([{ v: 'Server', w: 30 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(54));
  for (const r of s.serverDistribution) {
    lines.push(row([{ v: r.server, w: 30 }, { v: r.count.toLocaleString(), w: 10, align: 'R' }, { v: r.pct + '%', w: 8, align: 'R' }]));
  }
  lines.push(`\nLoad imbalance score: ${s.loadImbalanceScore}%  ((max - min) / total)`);
  if (s.concentrationRiskServers.length > 0) lines.push(`Flag (concentration risk > 25%): ${s.concentrationRiskServers.join(', ')}`);
  if (s.downServers.length > 0) lines.push(`Flag (0 synced agents — EPServer likely down): ${s.downServers.join(', ')}`);
  if (s.secondaryServers.length > 0) lines.push(`Servers with < 20 agents (likely secondary/test): ${s.secondaryServers.join(', ')}`);
  const verdict6 = s.concentrationRiskServers.length > 0 || s.downServers.length > 0 ? 'HIGH' : s.loadImbalanceScore > 30 ? 'MEDIUM' : 'INFO';
  lines.push(findingLine(verdict6, `Load imbalance ${s.loadImbalanceScore}% · ${s.concentrationRiskServers.length} concentration server(s) · ${s.downServers.length} down server(s).`));

  /* ─── SECTION 7 ─── */
  lines.push(header('SECTION 7 — DISCOVERY STATUS'));
  lines.push(row([{ v: 'Status', w: 20 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(42));
  for (const r of s.discoveryDistribution) {
    lines.push(row([{ v: r.status, w: 20 }, { v: r.count.toLocaleString(), w: 10, align: 'R' }, { v: r.pct + '%', w: 8, align: 'R' }]));
  }
  lines.push(`\nDiscovery Disabled: ${pf(s.discoveryDisabledCount)} — these endpoints have no data-at-rest scanning.`);
  if (s.discoveryRunningPct < 1) lines.push('Flag: active discovery is negligible (< 1% Running).');
  const verdict7 = s.discoveryDisabledPct > 50 ? 'HIGH' : s.discoveryDisabledPct > 0 ? 'MEDIUM' : 'INFO';
  lines.push(findingLine(verdict7, `Discovery disabled on ${s.discoveryDisabledPct}% of fleet.`));

  /* ─── SECTION 8 ─── */
  lines.push(header('SECTION 8 — CLIENT STATUS'));
  lines.push(row([{ v: 'Status', w: 20 }, { v: 'Count', w: 10, align: 'R' }, { v: '%', w: 8, align: 'R' }]));
  lines.push('-'.repeat(42));
  for (const r of s.clientStatusBreakdown) {
    lines.push(row([{ v: r.status, w: 20 }, { v: r.count.toLocaleString(), w: 10, align: 'R' }, { v: r.pct + '%', w: 8, align: 'R' }]));
  }
  lines.push(`\nDisabled clients: ${pf(s.disabledCount)}`);
  lines.push(`Anomaly: Disabled AND Synced=True endpoints = ${s.disabledAndSyncedAnomalyCount.toLocaleString()}`);
  const verdict8 = s.disabledPct > 10 ? 'HIGH' : s.disabledCount > 0 ? 'MEDIUM' : 'INFO';
  lines.push(findingLine(verdict8, `${s.disabledCount.toLocaleString()} endpoints have DLP enforcement disabled (${s.disabledPct}%).`));

  /* ─── SECTION 9 ─── */
  lines.push(header('SECTION 9 — MICROSOFT RMS'));
  lines.push(`RMS Active   : ${s.rmsActiveCount.toLocaleString()}`);
  lines.push(`RMS Inactive : ${s.rmsInactiveCount.toLocaleString()}  (${s.rmsInactivePct}% of RMS-eligible)`);
  lines.push(`Tier         : ${s.rmsTier}`);
  lines.push(findingLine(s.rmsTier === 'CRITICAL' ? 'CRITICAL' : s.rmsTier === 'HIGH' ? 'HIGH' : 'INFO',
    `${s.rmsInactivePct}% of RMS-eligible endpoints have RMS inactive — labels not enforced on these endpoints.`));

  /* ─── SECTION 10 ─── */
  lines.push(header('SECTION 10 — macOS COVERAGE (Safari + Apple Mail)'));
  lines.push('Safari Extension Status:');
  for (const r of s.safariDistribution) lines.push(`  ${pad(r.status, 20)}  ${pad(r.count.toLocaleString(), 10, 'R')}  ${r.pct}%`);
  lines.push('\nApple Mail Plug-in Status:');
  for (const r of s.appleMailDistribution) lines.push(`  ${pad(r.status, 20)}  ${pad(r.count.toLocaleString(), 10, 'R')}  ${r.pct}%`);
  lines.push('\nCross-tab (Safari × Apple Mail) — top 10:');
  for (const r of s.macOSCrossTab.slice(0, 10)) {
    lines.push(`  Safari=${pad(r.safari, 12)} × AppleMail=${pad(r.appleMail, 12)}  count=${r.count.toLocaleString()}`);
  }
  lines.push(findingLine(s.macOSBlindSpot ? 'MEDIUM' : 'INFO',
    s.macOSBlindSpot
      ? 'macOS coverage blind spot: > 20% of fleet has Unknown Safari/Apple Mail status.'
      : 'macOS coverage is reasonably confirmed across the fleet.'));

  /* ─── SECTION 11 ─── */
  lines.push(header('SECTION 11 — MULTI-FACTOR RISK SCORING'));
  lines.push('Tier Distribution:');
  for (const t of s.riskTierDistribution) lines.push(`  ${pad(t.tier, 12)}  ${pad(t.count.toLocaleString(), 10, 'R')}  ${t.pct}%`);
  lines.push('\nTop 20 Highest-Scoring Endpoints:');
  lines.push(row([
    { v: 'Hostname', w: 28 }, { v: 'IP', w: 16 }, { v: 'Score', w: 6, align: 'R' }, { v: 'Tier', w: 9 },
    { v: 'Version', w: 14 }, { v: 'Sync', w: 6 }, { v: 'LastUpd', w: 12 }, { v: 'Profile', w: 18 }, { v: 'Server', w: 18 },
  ]));
  lines.push('-'.repeat(127));
  for (const e of s.topRiskEndpoints) {
    lines.push(row([
      { v: e.hostname, w: 28 }, { v: e.ipAddress || '—', w: 16 }, { v: e.score, w: 6, align: 'R' }, { v: e.tier, w: 9 },
      { v: e.version, w: 14 }, { v: e.synced ? 'TRUE' : 'FALSE', w: 6 }, { v: (e.lastUpdate || '—').slice(0, 10), w: 12 },
      { v: e.profile, w: 18 }, { v: e.endpointServer, w: 18 },
    ]));
  }
  lines.push('\nPer Endpoint Server (avg score + critical count):');
  lines.push(row([{ v: 'Server', w: 30 }, { v: 'AvgScore', w: 10, align: 'R' }, { v: 'Critical', w: 10, align: 'R' }, { v: 'Total', w: 10, align: 'R' }]));
  lines.push('-'.repeat(64));
  for (const r of s.serverRiskDistribution) {
    lines.push(row([{ v: r.server, w: 30 }, { v: r.avgScore.toFixed(1), w: 10, align: 'R' }, { v: r.criticalCount.toLocaleString(), w: 10, align: 'R' }, { v: r.totalCount.toLocaleString(), w: 10, align: 'R' }]));
  }
  lines.push('\nPer Profile (avg score):');
  for (const r of s.profileRiskDistribution) {
    lines.push(`  ${pad(r.profile, 32)}  avgScore=${r.avgScore.toFixed(1)}  (${r.totalCount.toLocaleString()} endpoints)`);
  }
  const critTier = s.riskTierDistribution.find((t) => t.tier === 'CRITICAL')?.count ?? 0;
  lines.push(findingLine(critTier > 0 ? 'CRITICAL' : 'INFO', `${critTier.toLocaleString()} endpoints at CRITICAL risk tier (score ≥ 6).`));

  /* ─── SECTION 12 ─── */
  lines.push(header('SECTION 12 — ANOMALY DETECTION'));
  lines.push(`Duplicate MAC addresses: ${s.duplicateMacCount.toLocaleString()} MAC(s) on multiple hostnames`);
  if (s.duplicateMacs.length > 0) {
    lines.push('Top duplicates (first 10):');
    for (const d of s.duplicateMacs.slice(0, 10)) {
      lines.push(`  ${pad(d.mac, 22)}  count=${d.count}  hosts: ${d.hostnames.slice(0, 3).join(', ')}${d.hostnames.length > 3 ? '…' : ''}`);
    }
  }
  lines.push(`\nNext Scan Time in past > 30 days (scheduler broken): ${s.scanSchedulerBrokenCount.toLocaleString()}`);
  if (s.scanSchedulerBrokenSample.length > 0) {
    lines.push('  Sample:');
    for (const e of s.scanSchedulerBrokenSample.slice(0, 5)) {
      lines.push(`    ${pad(e.hostname, 30)}  next=${e.nextScan}`);
    }
  }
  lines.push(`Scan time corruption (end < start): ${s.scanTimeCorruptionCount.toLocaleString()}`);
  lines.push(`Files Scanned = 0 AND Discovery = Idle: ${s.filesScannedZeroIdleCount.toLocaleString()}`);
  lines.push(`Logged-in user present AND Synced = False: ${s.activeUserUnsyncedCount.toLocaleString()}`);
  const anyAnomaly = s.duplicateMacCount + s.scanSchedulerBrokenCount + s.scanTimeCorruptionCount + s.filesScannedZeroIdleCount + s.activeUserUnsyncedCount;
  lines.push(findingLine(anyAnomaly > 0 ? 'MEDIUM' : 'INFO',
    anyAnomaly > 0 ? `${anyAnomaly.toLocaleString()} anomalous endpoints across 5 anomaly categories.` : 'No anomalies detected in the fleet.'));

  /* ─── SECTION 13 ─── */
  lines.push(header('SECTION 13 — EXECUTIVE SUMMARY'));
  for (const b of s.executiveSummary) {
    lines.push(`[${b.severity}] ${b.finding}`);
    lines.push(`         Impact: ${b.impact}`);
    lines.push(`         Action: ${b.action}`);
    lines.push('');
  }

  lines.push('═════════════════════════════════════════════════════════════════════');
  lines.push('  END OF REPORT');
  lines.push('═════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

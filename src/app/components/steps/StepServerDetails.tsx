import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Server, Database, Shield, HardDrive, Globe, Mail, Network, Plus, Trash2, ChevronDown, ChevronRight, Zap, Cloud, Tag } from 'lucide-react';
import type { DlpServerBundle } from './dlpServerInfoParser';

export type ServerType = 'fsm' | 'sql' | 'protector' | 'supplemental' | 'content_gateway' | 'email_gateway' | 'ngfw' | 'dspm' | 'classification';

export interface DriveInfo {
  id: string;
  label: string;
  totalGB: number;
  usedGB: number;
}

export interface ServerEntry {
  id: string;
  type: ServerType;
  hostname: string;
  applicable: boolean;
  drives: DriveInfo[];
  ramTotalGB: number;
  ramUsedGB: number;
  cpuCores: number;
  cpuUsagePercent: number;
  notes: string;
  osName?: string;     // e.g. "Microsoft Windows Server 2019 Datacenter"
  osVersion?: string;  // e.g. "10.0.17763"
}

const SERVER_CFG: Record<ServerType, { label: string; icon: React.ReactNode; color: string; hint: string }> = {
  fsm:             { label: 'FSM Server',             icon: <Server size={14} />,   color: '#2563EB', hint: 'Forcepoint Security Manager — central policy management UI' },
  sql:             { label: 'SQL Server',              icon: <Database size={14} />, color: '#7C3AED', hint: 'MS SQL Server — database backend for DLP/FSM' },
  protector:       { label: 'Protector',               icon: <Shield size={14} />,   color: '#D97706', hint: 'Network DLP inline/SPAN agent' },
  supplemental:    { label: 'Supplemental DLP Server', icon: <Server size={14} />,   color: '#DC2626', hint: 'Additional DLP processing / fingerprinting server' },
  content_gateway: { label: 'Content Gateway',         icon: <Globe size={14} />,    color: '#0EA5E9', hint: 'Web proxy for URL filtering & SSL inspection' },
  email_gateway:   { label: 'Email Gateway',           icon: <Mail size={14} />,     color: '#059669', hint: 'Email security gateway' },
  ngfw:            { label: 'NGFW Management Server',  icon: <Network size={14} />,  color: '#6366F1', hint: 'NGFW / SMC management console' },
  dspm:            { label: 'DSPM Server',             icon: <Cloud size={14} />,    color: '#0891B2', hint: 'Data Security Posture Management server' },
  classification:  { label: 'Classification Server (FDC)', icon: <Tag size={14} />,  color: '#16A34A', hint: 'Forcepoint Data Classification (FDC) server' },
};

/* Which server types belong to each Step-2 product. The Server Infrastructure
   step shows the default card for a server type only when at least one product
   that uses it is selected; everything stays addable via "Add Additional
   Server Instance". Shared infra (FSM + SQL) is listed under every product
   that relies on it. */
const PRODUCT_SERVERS: Record<string, ServerType[]> = {
  /* FSM + SQL are only meaningful for Web / Email / DLP — they are NOT asked
     for DSPM, FDC or NGFW. */
  web:   ['fsm', 'sql', 'content_gateway'],
  email: ['fsm', 'sql', 'email_gateway'],
  data:  ['fsm', 'sql', 'protector', 'supplemental', 'content_gateway'],
  ngfw:  ['ngfw'],
  dspm:  ['dspm'],
  cls:   ['classification'],
};

export const DEFAULT_SERVERS: ServerEntry[] = (Object.keys(SERVER_CFG) as ServerType[]).map(type => ({
  id: `${type}-default`,
  type,
  hostname: '',
  applicable: false,
  drives: [],
  ramTotalGB: 0,
  ramUsedGB: 0,
  cpuCores: 0,
  cpuUsagePercent: 0,
  notes: '',
}));

function usagePct(used: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function barColor(p: number) {
  if (p >= 85) return '#DC2626';
  if (p >= 70) return '#D97706';
  return '#16A34A';
}

function nv(v: string) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function UsageBar({ used, total, leftLabel }: { used: number; total: number; leftLabel: string }) {
  const p = usagePct(used, total);
  const c = barColor(p);
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span style={{ fontSize: '9.5px', color: '#94A3B8' }}>{leftLabel}</span>
        <span style={{ fontSize: '9.5px', fontFamily: 'monospace', fontWeight: 700, color: c }}>{p}%</span>
      </div>
      <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

const IS: CSSProperties = {
  fontSize: '12px', border: '1.5px solid rgba(15,41,82,0.14)',
  background: '#F8FAFC', color: '#0F172A', borderRadius: '8px',
  padding: '6px 10px', outline: 'none',
};

const NI: CSSProperties = { ...IS, width: '80px', textAlign: 'right', fontFamily: 'monospace' };

export function StepServerDetails({
  servers,
  setServers,
  dlpBundles = [],
  selectedProducts = {},
}: {
  servers: ServerEntry[];
  setServers: React.Dispatch<React.SetStateAction<ServerEntry[]>>;
  dlpBundles?: DlpServerBundle[];
  selectedProducts?: Record<string, boolean>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addType, setAddType] = useState('');
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);

  /* Backfill default cards for any server type missing from a session saved
     before that type existed (e.g. the DSPM / Classification servers added
     later). Runs once; appends N/A defaults so they can be toggled on. */
  useEffect(() => {
    const haveDefaults = new Set(servers.filter(s => s.id === `${s.type}-default`).map(s => s.type));
    const missing = (Object.keys(SERVER_CFG) as ServerType[]).filter(t => !haveDefaults.has(t));
    if (missing.length === 0) return;
    setServers(prev => [
      ...prev,
      ...missing.map(t => ({
        id: `${t}-default`, type: t, hostname: '', applicable: false,
        drives: [], ramTotalGB: 0, ramUsedGB: 0, cpuCores: 0, cpuUsagePercent: 0, notes: '',
      })),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Server types relevant to the selected products. When nothing is selected
     yet, fall back to showing every default card so the page is never blank. */
  const anyProduct = Object.values(selectedProducts).some(Boolean);
  const inScopeTypes = new Set<ServerType>(
    anyProduct
      ? Object.entries(selectedProducts).flatMap(([pid, on]) => (on ? (PRODUCT_SERVERS[pid] ?? []) : []))
      : (Object.keys(SERVER_CFG) as ServerType[]),
  );

  /* Default cards show only for in-scope types; user-added instances always show. */
  const visibleServers = servers.filter(s =>
    s.id === `${s.type}-default` ? inScopeTypes.has(s.type) : true,
  );

  /* Auto-fill FSM Server card from latest DLPServerInfo bundle when the card is empty.
     Only touches empty fields — never overwrites manually-entered data. */
  useEffect(() => {
    if (dlpBundles.length === 0) return;
    const bundle = dlpBundles[0];
    const info = bundle.systemInfo;
    const hw = bundle.hardware;
    if (!info || !hw) return;

    let didFill = false;
    setServers(prev => prev.map(s => {
      if (s.id !== 'fsm-default') return s;
      const isEmpty = !s.hostname && !s.ramTotalGB && !s.cpuCores && s.drives.length === 0;
      if (!isEmpty) return s;

      const ramTotalGB = hw.ramTotalMB > 0 ? Math.round(hw.ramTotalMB / 1024) : 0;
      const ramUsedGB = hw.ramTotalMB > 0 && hw.ramAvailableMB >= 0
        ? Math.max(0, Math.round((hw.ramTotalMB - hw.ramAvailableMB) / 1024))
        : 0;
      const cDriveTotal = Math.round(hw.diskCTotalGB || 0);
      const cDriveUsed = Math.max(0, Math.round((hw.diskCTotalGB || 0) - (hw.diskCFreeGB || 0)));
      const drives = cDriveTotal > 0
        ? [{ id: `d-dlp-${bundle.bundleId}`, label: 'C:', totalGB: cDriveTotal, usedGB: cDriveUsed }]
        : [];

      didFill = true;
      return {
        ...s,
        applicable: true,
        hostname: info.hostName || s.hostname,
        ramTotalGB,
        ramUsedGB,
        cpuCores: hw.cpuCount || 0,
        cpuUsagePercent: 0,
        drives,
        osName: s.osName || info.osName || '',
        osVersion: s.osVersion || info.osVersion || '',
        notes: s.notes
          ? s.notes
          : `Auto-filled from DLP Server Telemetry: ${bundle.bundleName}`,
      };
    }));
    if (didFill) {
      setAutoFillNotice(`FSM Server auto-filled from "${bundle.bundleName}" (hostname, CPU cores, RAM, C: drive). Edit any field to override.`);
      setExpanded(prev => new Set([...prev, 'fsm-default']));
    }
  }, [dlpBundles, setServers]);

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleApplicable = (id: string) => {
    const s = servers.find(x => x.id === id);
    if (!s) return;
    const next = !s.applicable;
    setServers(prev => prev.map(x => x.id === id ? { ...x, applicable: next } : x));
    if (next) setExpanded(prev => new Set([...prev, id]));
    else setExpanded(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const upd = (id: string, patch: Partial<ServerEntry>) =>
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const addDrive = (serverId: string) =>
    setServers(prev => prev.map(s => s.id === serverId
      ? { ...s, drives: [...s.drives, { id: `d-${Date.now()}`, label: '', totalGB: 0, usedGB: 0 }] }
      : s));

  const updDrive = (sId: string, dId: string, patch: Partial<DriveInfo>) =>
    setServers(prev => prev.map(s => s.id === sId
      ? { ...s, drives: s.drives.map(d => d.id === dId ? { ...d, ...patch } : d) }
      : s));

  const delDrive = (sId: string, dId: string) =>
    setServers(prev => prev.map(s => s.id === sId
      ? { ...s, drives: s.drives.filter(d => d.id !== dId) }
      : s));

  const addInstance = () => {
    if (!addType) return;
    const t = addType as ServerType;
    const entry: ServerEntry = {
      id: `${t}-${Date.now()}`, type: t, hostname: '', applicable: true,
      drives: [{ id: `d-${Date.now()}`, label: 'C:', totalGB: 0, usedGB: 0 }],
      ramTotalGB: 0, ramUsedGB: 0, cpuCores: 0, cpuUsagePercent: 0, notes: '',
    };
    setServers(prev => [...prev, entry]);
    setExpanded(prev => new Set([...prev, entry.id]));
    setAddType('');
  };

  const delServer = (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id));
    setExpanded(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const focusStyle = (color: string) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.target.style.borderColor = color; e.target.style.background = '#fff';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.target.style.borderColor = 'rgba(15,41,82,0.14)'; e.target.style.background = '#F8FAFC';
    },
  });

  const applicableCount = visibleServers.filter(s => s.applicable).length;

  return (
    <div className="space-y-[13px]">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[18px_22px]">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.1)' }}>
            <HardDrive size={15} style={{ color: '#F97316' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Server Infrastructure</div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
              {applicableCount === 0
                ? 'Enable each applicable server and fill in disk, RAM and CPU metrics'
                : `${applicableCount} server${applicableCount !== 1 ? 's' : ''} configured — click "Active / N/A" to toggle each server`}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#F97316', fontFamily: 'monospace', lineHeight: 1 }}>
              {String(applicableCount).padStart(2, '0')}
            </div>
            <div style={{ fontSize: '8.5px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.06em', marginTop: '2px' }}>
              ACTIVE
            </div>
          </div>
        </div>
      </div>

      {autoFillNotice && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-[12px_16px]"
          style={{ background: 'rgba(37,99,235,0.05)', border: '1.5px solid rgba(37,99,235,0.2)' }}
        >
          <Zap size={14} style={{ color: '#2563EB', flexShrink: 0, marginTop: '1px' }} />
          <div className="flex-1">
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A8A', letterSpacing: '0.04em', marginBottom: '2px' }}>
              AUTO-FILLED FROM DLP BUNDLE
            </div>
            <div style={{ fontSize: '11px', color: '#1E40AF', lineHeight: 1.5 }}>{autoFillNotice}</div>
          </div>
          <button
            onClick={() => setAutoFillNotice(null)}
            style={{
              fontSize: '10px', fontWeight: 600, color: '#2563EB',
              background: 'transparent', border: '1px solid rgba(37,99,235,0.3)',
              borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Server Cards */}
      <div className="space-y-2">
        {visibleServers.map(server => {
          const cfg = SERVER_CFG[server.type];
          const isExp = expanded.has(server.id);
          const isDef = server.id === `${server.type}-default`;
          const fp = focusStyle(cfg.color);

          return (
            <div key={server.id}
              className="bg-white rounded-xl border transition-all"
              style={{
                borderColor: server.applicable ? `${cfg.color}30` : 'rgba(15,41,82,0.07)',
                boxShadow: server.applicable ? `0 1px 4px ${cfg.color}12` : 'none',
              }}>

              {/* Card Header */}
              <div className="flex items-center gap-3 p-[12px_16px]"
                style={{ opacity: server.applicable ? 1 : 0.55 }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: server.applicable ? `${cfg.color}12` : '#F1F5F9' }}>
                  <span style={{ color: server.applicable ? cfg.color : '#94A3B8' }}>{cfg.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: server.applicable ? '#0F172A' : '#94A3B8' }}>
                    {cfg.label}
                  </div>
                  {server.applicable && !isExp && (
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {server.hostname && (
                        <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>
                          {server.hostname}
                        </span>
                      )}
                      {server.osName && (
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                          {server.osName.length > 38 ? server.osName.slice(0, 36) + '…' : server.osName}
                        </span>
                      )}
                      {server.drives.map(d => {
                        const p = usagePct(d.usedGB, d.totalGB);
                        return p > 0 ? (
                          <span key={d.id} style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: barColor(p) }}>
                            {d.label || 'Drive'} {p}%
                          </span>
                        ) : null;
                      })}
                      {server.ramTotalGB > 0 && (
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: barColor(usagePct(server.ramUsedGB, server.ramTotalGB)) }}>
                          RAM {usagePct(server.ramUsedGB, server.ramTotalGB)}%
                        </span>
                      )}
                      {server.cpuUsagePercent > 0 && (
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: barColor(server.cpuUsagePercent) }}>
                          CPU {server.cpuUsagePercent}%
                        </span>
                      )}
                      {!server.hostname && server.drives.length === 0 && !server.ramTotalGB && !server.cpuUsagePercent && (
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>No data entered yet — click to expand</span>
                      )}
                    </div>
                  )}
                  {!server.applicable && (
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{cfg.hint}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleApplicable(server.id)}
                    className="px-2.5 py-1 rounded-lg font-semibold transition-all"
                    style={{
                      fontSize: '10px',
                      background: server.applicable ? `${cfg.color}12` : '#F1F5F9',
                      color: server.applicable ? cfg.color : '#94A3B8',
                      border: server.applicable ? `1.5px solid ${cfg.color}35` : '1.5px solid #E2E8F0',
                    }}
                  >
                    {server.applicable ? 'Active' : 'N/A'}
                  </button>

                  {!isDef && (
                    <button
                      onClick={() => delServer(server.id)}
                      className="w-7 h-7 rounded flex items-center justify-center transition-all"
                      style={{ color: '#CBD5E1' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}

                  {server.applicable && (
                    <button
                      onClick={() => toggleExpand(server.id)}
                      className="w-7 h-7 rounded flex items-center justify-center transition-all"
                      style={{ color: '#94A3B8', background: isExp ? '#F1F5F9' : 'transparent' }}
                    >
                      {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Form */}
              {server.applicable && isExp && (
                <div className="px-4 pb-4 pt-3 space-y-4" style={{ borderTop: '1px solid rgba(15,41,82,0.06)' }}>

                  {/* Hostname */}
                  <div>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
                      HOSTNAME / IP ADDRESS
                    </label>
                    <input
                      value={server.hostname}
                      onChange={e => upd(server.id, { hostname: e.target.value })}
                      placeholder={`e.g. ${server.type}-srv-01 or 192.168.1.10`}
                      style={{ ...IS, width: '100%' }}
                      {...fp}
                    />
                  </div>

                  {/* Operating System */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
                        OPERATING SYSTEM
                      </label>
                      <input
                        value={server.osName ?? ''}
                        onChange={e => upd(server.id, { osName: e.target.value })}
                        placeholder="e.g. Microsoft Windows Server 2019 Datacenter"
                        style={{ ...IS, width: '100%' }}
                        {...fp}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
                        OS VERSION / BUILD
                      </label>
                      <input
                        value={server.osVersion ?? ''}
                        onChange={e => upd(server.id, { osVersion: e.target.value })}
                        placeholder="e.g. 10.0.17763"
                        style={{ ...IS, width: '100%', fontFamily: 'monospace' }}
                        {...fp}
                      />
                    </div>
                  </div>

                  {/* Disk Drives */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em' }}>
                        DISK DRIVES
                      </label>
                      <button
                        onClick={() => addDrive(server.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-all"
                        style={{ fontSize: '10px', fontWeight: 600, color: cfg.color, background: `${cfg.color}0D`, border: `1px solid ${cfg.color}25` }}
                      >
                        <Plus size={10} /> Add Drive
                      </button>
                    </div>

                    {server.drives.length === 0 ? (
                      <div className="rounded-lg p-3 text-center" style={{ background: '#F8FAFC', border: '1px dashed rgba(15,41,82,0.12)' }}>
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>No drives added — click Add Drive above</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {server.drives.map(drive => {
                          const dp = usagePct(drive.usedGB, drive.totalGB);
                          const dc = barColor(dp);
                          const dfp = focusStyle(cfg.color);
                          return (
                            <div key={drive.id} className="rounded-lg p-3"
                              style={{ background: '#F8FAFC', border: '1px solid rgba(15,41,82,0.08)' }}>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <input
                                  value={drive.label}
                                  onChange={e => updDrive(server.id, drive.id, { label: e.target.value })}
                                  placeholder="C:"
                                  title="Drive letter or mount point"
                                  style={{ ...IS, width: '56px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, padding: '5px 6px' }}
                                  {...dfp}
                                />
                                <div className="flex items-center gap-1.5">
                                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Total</span>
                                  <input
                                    type="number" min={0}
                                    value={drive.totalGB || ''}
                                    onChange={e => updDrive(server.id, drive.id, { totalGB: nv(e.target.value) })}
                                    placeholder="0"
                                    style={{ ...NI }}
                                    {...dfp}
                                  />
                                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>GB</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Used</span>
                                  <input
                                    type="number" min={0}
                                    value={drive.usedGB || ''}
                                    onChange={e => updDrive(server.id, drive.id, { usedGB: nv(e.target.value) })}
                                    placeholder="0"
                                    style={{ ...NI }}
                                    {...dfp}
                                  />
                                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>GB</span>
                                </div>
                                <button
                                  onClick={() => delDrive(server.id, drive.id)}
                                  className="w-6 h-6 rounded flex items-center justify-center transition-all ml-auto"
                                  style={{ color: '#CBD5E1' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                              {drive.totalGB > 0 && (
                                <div>
                                  <div className="flex justify-between mb-0.5">
                                    <span style={{ fontSize: '9.5px', color: '#94A3B8' }}>{drive.usedGB} GB used of {drive.totalGB} GB</span>
                                    <span style={{ fontSize: '9.5px', fontFamily: 'monospace', fontWeight: 700, color: dc }}>{dp}%</span>
                                  </div>
                                  <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ width: `${dp}%`, height: '100%', background: dc, borderRadius: '999px', transition: 'width 0.3s' }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* RAM + CPU */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* RAM */}
                    <div className="rounded-lg p-3 space-y-2.5" style={{ background: '#F8FAFC', border: '1px solid rgba(15,41,82,0.08)' }}>
                      <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block' }}>RAM</label>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, width: '32px' }}>Total</span>
                        <input type="number" min={0}
                          value={server.ramTotalGB || ''}
                          onChange={e => upd(server.id, { ramTotalGB: nv(e.target.value) })}
                          placeholder="0"
                          style={{ ...NI, width: '75px' }}
                          {...fp}
                        />
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>GB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, width: '32px' }}>Used</span>
                        <input type="number" min={0}
                          value={server.ramUsedGB || ''}
                          onChange={e => upd(server.id, { ramUsedGB: nv(e.target.value) })}
                          placeholder="0"
                          style={{ ...NI, width: '75px' }}
                          {...fp}
                        />
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>GB</span>
                      </div>
                      {server.ramTotalGB > 0 && (
                        <UsageBar
                          used={server.ramUsedGB}
                          total={server.ramTotalGB}
                          leftLabel={`${server.ramUsedGB} / ${server.ramTotalGB} GB`}
                        />
                      )}
                    </div>

                    {/* CPU */}
                    <div className="rounded-lg p-3 space-y-2.5" style={{ background: '#F8FAFC', border: '1px solid rgba(15,41,82,0.08)' }}>
                      <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block' }}>CPU</label>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, width: '32px' }}>Cores</span>
                        <input type="number" min={0}
                          value={server.cpuCores || ''}
                          onChange={e => upd(server.id, { cpuCores: parseInt(e.target.value, 10) || 0 })}
                          placeholder="0"
                          style={{ ...NI, width: '75px' }}
                          {...fp}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, width: '32px' }}>Avg %</span>
                        <input type="number" min={0} max={100}
                          value={server.cpuUsagePercent || ''}
                          onChange={e => upd(server.id, { cpuUsagePercent: nv(e.target.value) })}
                          placeholder="0"
                          style={{ ...NI, width: '75px' }}
                          {...fp}
                        />
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>%</span>
                      </div>
                      {server.cpuUsagePercent > 0 && (
                        <UsageBar
                          used={server.cpuUsagePercent}
                          total={100}
                          leftLabel={server.cpuCores > 0 ? `${server.cpuCores} core${server.cpuCores !== 1 ? 's' : ''}` : 'Average'}
                        />
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
                      NOTES
                    </label>
                    <textarea
                      value={server.notes}
                      onChange={e => upd(server.id, { notes: e.target.value })}
                      placeholder="Additional observations, warnings, or context…"
                      rows={2}
                      style={{ ...IS, width: '100%', resize: 'none', lineHeight: 1.6 } as CSSProperties}
                      {...fp}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Additional Instance */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08)] p-[16px_20px]">
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: '10px' }}>
          ADD ADDITIONAL SERVER INSTANCE
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={addType}
            onChange={e => setAddType(e.target.value)}
            style={{
              fontSize: '12px', border: '1.5px solid rgba(15,41,82,0.14)',
              background: '#F8FAFC', color: addType ? '#0F172A' : '#94A3B8',
              borderRadius: '8px', padding: '7px 12px', outline: 'none',
            }}
          >
            <option value="">Select server type…</option>
            {(Object.keys(SERVER_CFG) as ServerType[]).map(t => (
              <option key={t} value={t}>{SERVER_CFG[t].label}</option>
            ))}
          </select>
          <button
            onClick={addInstance}
            disabled={!addType}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white transition-all"
            style={{
              fontSize: '12px',
              background: addType ? 'linear-gradient(135deg, #F97316, #EA580C)' : '#CBD5E1',
              boxShadow: addType ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
              cursor: addType ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={13} /> Add Instance
          </button>
        </div>
      </div>
    </div>
  );
}

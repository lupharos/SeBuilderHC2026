import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, RefreshCw, Check, X, Pause, Play, ShieldCheck, Shield, Trash2, AlertTriangle, Clock,
} from 'lucide-react';
import type { AuthUser } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';

/* ─── User Management page ───────────────────────────────────────────
   Admin-only. Lists every registered account with quick actions:
     • Pending  → Approve / Reject
     • Approved → Suspend / Promote-Demote
     • Rejected → Approve (re-instate)
     • Suspended → Approve (unsuspend)
   Last-admin guard is enforced server-side; the UI still hides the
   destructive options on the only remaining admin to avoid a wasted
   round-trip and a confusing 409. */

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'suspended';

export function UserManagementPage() {
  const { user: me, refreshInfo } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/users');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setUsers(json.users);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* Counts drive the filter pill badges. */
  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 };
    (users ?? []).forEach((u) => {
      c.all += 1;
      c[u.status] = (c[u.status] ?? 0) + 1;
    });
    return c;
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users ?? [];
    if (filter !== 'all') list = list.filter((u) => u.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => u.email.toLowerCase().includes(q));
    }
    /* Pending first so admins always see new requests at the top. */
    return [...list].sort((a, b) => {
      const order: Record<string, number> = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
      const sa = order[a.status] ?? 9;
      const sb = order[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.email.localeCompare(b.email);
    });
  }, [users, filter, search]);

  /* Admin-count derived from current list — the UI guards against
     demoting / suspending / deleting the only remaining admin. */
  const adminCount = useMemo(
    () => (users ?? []).filter((u) => u.role === 'admin' && u.status === 'approved').length,
    [users],
  );

  /* Wrap each action so it disables the row while in flight and
     surfaces server errors back into the inline banner. */
  const performAction = useCallback(async (path: string, body?: unknown) => {
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}.`);
        return false;
      }
      await refresh();
      await refreshInfo();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [refresh, refreshInfo]);

  const approve = (id: string) => { setBusyId(id); return performAction(`/api/auth/users/${id}/approve`).finally(() => setBusyId(null)); };
  const reject  = (id: string) => { setBusyId(id); return performAction(`/api/auth/users/${id}/reject`).finally(() => setBusyId(null)); };
  const suspend = (id: string) => { setBusyId(id); return performAction(`/api/auth/users/${id}/suspend`).finally(() => setBusyId(null)); };
  const toggleRole = (u: AuthUser) => {
    setBusyId(u.id);
    return performAction(`/api/auth/users/${u.id}/role`, { role: u.role === 'admin' ? 'user' : 'admin' })
      .finally(() => setBusyId(null));
  };
  const deleteUser = async (u: AuthUser) => {
    if (!confirm(`Delete ${u.email}? This permanently removes the account and revokes any open sessions.`)) return;
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `Server returned ${r.status}.`);
        return;
      }
      await refresh();
      await refreshInfo();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F4F7FB' }}>
      {/* Header */}
      <div className="px-8 py-5 flex items-center justify-between"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(37,99,235,0.1)' }}>
            <Users size={18} style={{ color: '#2563EB' }} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>User Management</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
              Approve registrations · manage roles · review every HC Studio account.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatPill label="Total"     value={String(counts.all)}       color="#0F172A" />
          <StatPill label="Pending"   value={String(counts.pending)}   color="#B58800" emphasize={counts.pending > 0} />
          <StatPill label="Approved"  value={String(counts.approved)}  color="#16A34A" />
          <StatPill label="Rejected"  value={String(counts.rejected)}  color="#DC2626" />
          <StatPill label="Suspended" value={String(counts.suspended)} color="#EA580C" />
          <div style={{ width: '1px', height: '28px', background: '#E2E8F0', margin: '0 4px' }} />
          <button onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ fontSize: '12px', background: '#F8FAFC', color: '#475569', border: '1.5px solid #E2E8F0' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-8 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #F0F2F7' }}>
        {(['all', 'pending', 'approved', 'rejected', 'suspended'] as StatusFilter[]).map((f) => (
          <button key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{
              fontSize: '11.5px',
              background: filter === f ? '#0F172A' : '#F1F5F9',
              color: filter === f ? '#fff' : '#475569',
              border: '1px solid transparent',
              textTransform: 'capitalize',
            }}>
            {f} <span style={{ marginLeft: 4, opacity: 0.7 }}>{counts[f]}</span>
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="px-3 py-1.5 rounded-lg outline-none"
          style={{ fontSize: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', minWidth: 220 }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-5">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg flex items-start gap-2"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertTriangle size={14} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: '12.5px', color: '#991B1B', flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Dismiss</button>
          </div>
        )}

        {loading && !users && (
          <div className="flex items-center justify-center py-20" style={{ color: '#94A3B8', fontSize: '13px' }}>
            <RefreshCw size={14} className="animate-spin mr-2" />
            Loading users…
          </div>
        )}

        {users && filteredUsers.length === 0 && (
          <div className="rounded-xl py-20 text-center"
            style={{ background: '#FFFFFF', border: '1px dashed #E2E8F0', fontSize: '13px', color: '#94A3B8' }}>
            No accounts match the current filter.
          </div>
        )}

        {users && filteredUsers.length > 0 && (
          <div className="rounded-xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid #EEF0F5' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Role</Th>
                  <Th>Registered</Th>
                  <Th>Approved</Th>
                  <Th>Last sign-in</Th>
                  <Th style={{ textAlign: 'right', width: 280 }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = me?.id === u.id;
                  const isOnlyAdmin = u.role === 'admin' && u.status === 'approved' && adminCount <= 1;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid #F0F2F7' }}>
                      <Td>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{u.email}</div>
                        {isSelf && <div style={{ fontSize: '10px', color: '#2563EB', fontWeight: 600, marginTop: 2 }}>YOU</div>}
                      </Td>
                      <Td><StatusBadge status={u.status} /></Td>
                      <Td><RoleBadge role={u.role} /></Td>
                      <Td><DateCell value={u.createdAt} /></Td>
                      <Td><DateCell value={u.approvedAt} dim={u.status === 'pending'} /></Td>
                      <Td><DateCell value={u.lastLoginAt} /></Td>
                      <Td style={{ textAlign: 'right' }}>
                        <div className="flex items-center gap-1.5 justify-end">
                          {u.status === 'pending' && (
                            <>
                              <ActionButton tone="success" disabled={busy} onClick={() => approve(u.id)}><Check size={11} /> Approve</ActionButton>
                              <ActionButton tone="danger"  disabled={busy} onClick={() => reject(u.id)}><X size={11} /> Reject</ActionButton>
                            </>
                          )}
                          {u.status === 'approved' && (
                            <>
                              {!isOnlyAdmin && !isSelf && (
                                <ActionButton tone="warn" disabled={busy} onClick={() => suspend(u.id)}><Pause size={11} /> Suspend</ActionButton>
                              )}
                              <ActionButton
                                tone="neutral"
                                disabled={busy || (u.role === 'admin' && isOnlyAdmin)}
                                title={u.role === 'admin' && isOnlyAdmin ? 'Cannot demote the last remaining admin' : undefined}
                                onClick={() => toggleRole(u)}>
                                {u.role === 'admin' ? <Shield size={11} /> : <ShieldCheck size={11} />}
                                {u.role === 'admin' ? 'Demote' : 'Promote'}
                              </ActionButton>
                            </>
                          )}
                          {u.status === 'rejected' && (
                            <ActionButton tone="success" disabled={busy} onClick={() => approve(u.id)}><Check size={11} /> Approve</ActionButton>
                          )}
                          {u.status === 'suspended' && (
                            <ActionButton tone="success" disabled={busy} onClick={() => approve(u.id)}><Play size={11} /> Re-instate</ActionButton>
                          )}
                          {!isSelf && !isOnlyAdmin && (
                            <ActionButton tone="ghostDanger" disabled={busy} onClick={() => deleteUser(u)}><Trash2 size={11} /></ActionButton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Small UI atoms ─────────────────────────────────────────────── */
function StatPill({ label, value, color, emphasize }: { label: string; value: string; color: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
      style={{
        background: emphasize ? `${color}14` : '#F8FAFC',
        border: `1px solid ${emphasize ? `${color}40` : '#EEF0F5'}`,
      }}>
      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '10px 14px',
      textAlign: 'left',
      fontSize: '10px',
      fontWeight: 700,
      color: '#94A3B8',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      ...(style ?? {}),
    }}>{children}</th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: '10px 14px',
      color: '#334155',
      verticalAlign: 'middle',
      ...(style ?? {}),
    }}>{children}</td>
  );
}

function StatusBadge({ status }: { status: AuthUser['status'] }) {
  const cfg = status === 'approved'
    ? { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'APPROVED' }
    : status === 'pending'
      ? { color: '#B58800', bg: '#FFFBEB', border: '#FDE68A', label: 'PENDING' }
      : status === 'rejected'
        ? { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'REJECTED' }
        : { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', label: 'SUSPENDED' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      color: cfg.color,
      fontSize: '9.5px',
      fontWeight: 700,
      letterSpacing: '0.06em',
    }}>{cfg.label}</span>
  );
}

function RoleBadge({ role }: { role: AuthUser['role'] }) {
  const isAdmin = role === 'admin';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      borderRadius: 4,
      background: isAdmin ? '#EFF6FF' : '#F8FAFC',
      border: `1px solid ${isAdmin ? '#BFDBFE' : '#E2E8F0'}`,
      color: isAdmin ? '#1D4ED8' : '#64748B',
      fontSize: '9.5px',
      fontWeight: 700,
      letterSpacing: '0.06em',
    }}>{isAdmin ? <Shield size={9} /> : null}{isAdmin ? 'ADMIN' : 'USER'}</span>
  );
}

function DateCell({ value, dim }: { value: string | null; dim?: boolean }) {
  if (!value) return <span style={{ color: '#CBD5E1', fontSize: '11.5px' }}>—</span>;
  const d = new Date(value);
  return (
    <div style={{ fontSize: '11.5px', color: dim ? '#94A3B8' : '#475569', fontFamily: 'JetBrains Mono, monospace' }}>
      <div>{d.toLocaleDateString()}</div>
      <div style={{ fontSize: '10px', color: '#94A3B8' }}>{d.toLocaleTimeString()}</div>
    </div>
  );
}

function ActionButton({
  children, onClick, tone, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'success' | 'danger' | 'warn' | 'neutral' | 'ghostDanger';
  disabled?: boolean;
  title?: string;
}) {
  const cfg = tone === 'success'
    ? { color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', hover: '#DCFCE7' }
    : tone === 'danger'
      ? { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', hover: '#FEE2E2' }
      : tone === 'warn'
        ? { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', hover: '#FEF3C7' }
        : tone === 'ghostDanger'
          ? { color: '#DC2626', bg: '#FFFFFF', border: '#FECACA', hover: '#FEF2F2' }
          : { color: '#334155', bg: '#F1F5F9', border: '#E2E8F0', hover: '#E2E8F0' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-all"
      style={{
        fontSize: '10.5px',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = cfg.hover; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = cfg.bg; }}
    >
      {children}
    </button>
  );
}

/* Lint-fence: Clock is imported for future "pending duration" use. */
void Clock;

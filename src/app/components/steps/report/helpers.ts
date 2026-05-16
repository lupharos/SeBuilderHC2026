export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function sevStyle(sev: string) {
  const m: Record<string, string> = {
    CRITICAL: 'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
    HIGH:     'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
    MEDIUM:   'background:#dbeafe;color:#2563eb;border:1px solid #93c5fd;',
    LOW:      'background:#d1fae5;color:#059669;border:1px solid #6ee7b7;',
  };
  return m[sev] ?? 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';
}

export function stStyle(st: string) {
  const m: Record<string, string> = {
    ok: 'background:#d1fae5;color:#059669;', warning: 'background:#fef3c7;color:#d97706;',
    eos: 'background:#fee2e2;color:#dc2626;', unknown: 'background:#f1f5f9;color:#64748b;',
    done: 'background:#d1fae5;color:#059669;', in_progress: 'background:#dbeafe;color:#2563eb;',
    not_started: 'background:#f1f5f9;color:#64748b;', open: 'background:#f1f5f9;color:#64748b;',
    planned: 'background:#ede9fe;color:#7c3aed;', delivered: 'background:#d1fae5;color:#059669;',
  };
  return m[st] ?? 'background:#f1f5f9;color:#64748b;';
}

export function pct(used: number, total: number) {
  return total ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

export function dateBadgeHtml(value: string): string {
  if (!value || value === '—') return '<span style="color:#cbd5e1;">—</span>';
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isIso) return `<span style="font-family:monospace;font-size:10.5px;color:#475569;">${esc(value)}</span>`;
  const expired = value < new Date().toISOString().slice(0, 10);
  const diff = (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const soon = !expired && diff < 180;
  const col = expired ? '#dc2626' : soon ? '#d97706' : '#475569';
  const bg  = expired ? '#fef2f2' : soon ? '#fffbeb' : '#f8fafc';
  const bdr = expired ? '#fecaca' : soon ? '#fde68a' : '#e2e8f0';
  return `<span style="font-family:monospace;font-size:10.5px;font-weight:600;color:${col};background:${bg};border:1px solid ${bdr};border-radius:4px;padding:2px 6px;white-space:nowrap;">${esc(value)}</span>`;
}

export function scoreColor(s: number | null) {
  if (s === null) return '#94A3B8';
  return s >= 80 ? '#16A34A' : s >= 60 ? '#D97706' : '#DC2626';
}

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { consumeSeedNotice, type SeedOutcome } from '../utils/seedData';

/* Quiet, self-dismissing toast shown once after seedOnBoot() applied
   default data. "full" = fresh install loaded the whole base; "catalog"
   = reference data refreshed because the shipped seed changed. Reads +
   clears the sessionStorage flag on mount, so it shows at most once per
   boot and never blocks anything. */
export function SeedNotice() {
  const [notice, setNotice] = useState<SeedOutcome | null>(null);

  useEffect(() => {
    const n = consumeSeedNotice();
    if (!n) return;
    setNotice(n);
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!notice) return null;

  const msg =
    notice === 'full'
      ? 'Default data loaded — templates, version data & matrix are ready.'
      : 'Catalogue updated — templates / version data refreshed to the latest.';

  return (
    <div
      role="status"
      onClick={() => setNotice(null)}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        maxWidth: '340px',
        padding: '11px 14px',
        borderRadius: '12px',
        background: '#FFFFFF',
        border: '1px solid #BBF7D0',
        boxShadow: '0 8px 24px rgba(15,41,82,0.14)',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <CheckCircle2 size={16} style={{ color: '#16A34A', flexShrink: 0 }} />
      <span style={{ fontSize: '12.5px', color: '#0F2952', lineHeight: 1.45 }}>{msg}</span>
    </div>
  );
}

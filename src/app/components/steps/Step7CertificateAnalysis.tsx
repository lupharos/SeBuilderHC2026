import { useRef, useState } from 'react';
import { Upload, ShieldCheck, AlertCircle, XCircle, CheckCircle2, Trash2, Lock, FileKey } from 'lucide-react';
import {
  parseCertificateFile,
  formatRemaining,
  certStatusColor,
  certStatusIcon,
  type ParsedCertificate,
} from './certificateParser';

interface Props {
  certificates: ParsedCertificate[];
  setCertificates: React.Dispatch<React.SetStateAction<ParsedCertificate[]>>;
}

export function Step7CertificateAnalysis({ certificates, setCertificates }: Props) {
  const [parseError, setParseError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setParseError('');
    try {
      // Rule: one file == one certificate entry. PEM chain bundles only contribute their first cert.
      const added: ParsedCertificate[] = [];
      for (const file of Array.from(files)) {
        if (!/\.(cer|crt|pem|der)$/i.test(file.name)) continue;
        try {
          // Try as text first (PEM). If parser falls through, try as bytes (DER).
          const text = await file.text();
          let parsed = parseCertificateFile(text, file.name);
          if (parsed.length === 0) {
            const buf = await file.arrayBuffer();
            parsed = parseCertificateFile(buf, file.name);
          }
          if (parsed.length === 0) {
            setParseError(`"${file.name}" — could not detect any X.509 certificate (must be PEM or DER).`);
            continue;
          }
          added.push(parsed[0]);
        } catch (e) {
          setParseError(`Failed to read "${file.name}": ${e instanceof Error ? e.message : 'unknown error'}`);
        }
      }
      if (added.length > 0) {
        setCertificates(prev => {
          // One file == one entry. Replace any existing entry with the same filename.
          const newNames = new Set(added.map(c => c.fileName));
          return [...prev.filter(c => !newNames.has(c.fileName)), ...added];
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const removeCert = (cert: ParsedCertificate) => {
    setCertificates(prev => prev.filter(c => !(c.fileName === cert.fileName && c.index === cert.index && c.serialNumber === cert.serialNumber)));
  };

  const clearAll = () => setCertificates([]);

  // Group by file for the comparison table.
  // The original UX requested side-by-side "Alan | allcerts.cer (Host Cert) | ca.cer (CA Cert)".
  // Sort: host certs first, then CA certs, then others. Within same group, order by serial.
  const sorted = [...certificates].sort((a, b) => {
    const order = (c: ParsedCertificate) => c.fileLabel === 'Host Cert' ? 0 : c.fileLabel === 'CA Cert' ? 1 : 2;
    return order(a) - order(b);
  });

  const expiring = certificates.filter(c => c.status === 'EXPIRING_SOON').length;
  const expired = certificates.filter(c => c.status === 'EXPIRED').length;
  const valid = certificates.filter(c => c.status === 'VALID').length;

  return (
    <div className="space-y-[13px]">
      {/* Page header */}
      <div>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F2952' }}>Certificate Analysis</div>
        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
          Import the customer's <span style={{ fontFamily: 'monospace' }}>.cer</span> / <span style={{ fontFamily: 'monospace' }}>.pem</span> files (typically <span style={{ fontFamily: 'monospace' }}>allcerts.cer</span> and <span style={{ fontFamily: 'monospace' }}>ca.cer</span> from the DLP Server Info bundle). The wizard parses subject, issuer, validity, key length, algorithm, and CA flag automatically.
        </div>
      </div>

      {/* KPI strip */}
      {certificates.length > 0 && (
        <div className="grid grid-cols-4 gap-[10px]">
          {[
            { label: 'CERTIFICATES', value: certificates.length, color: '#0F2952', icon: <ShieldCheck size={14} /> },
            { label: 'VALID',        value: valid,                 color: '#16a34a', icon: <CheckCircle2 size={14} /> },
            { label: 'EXPIRING SOON',value: expiring,              color: '#d97706', icon: <AlertCircle size={14} /> },
            { label: 'EXPIRED',      value: expired,               color: '#dc2626', icon: <XCircle size={14} /> },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl p-[12px_16px]"
              style={{ border: '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>
              <div className="flex items-center gap-2" style={{ color: k.color }}>
                {k.icon}
                <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em' }}>{k.label}</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: k.color, fontFamily: 'monospace', marginTop: '4px' }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${certificates.length > 0 ? '#A5B4FC' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>
        <div className="flex items-center gap-3 p-[16px_22px]"
          style={{ background: certificates.length > 0 ? '#EEF2FF' : 'white', borderBottom: '1px solid #F1F5F9' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(99,102,241,0.1)' }}>
            <FileKey size={14} style={{ color: '#6366F1' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Import Certificates</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
              Supports <span style={{ fontFamily: 'monospace' }}>.cer .pem .crt .der</span> — PEM bundles with multiple certificates are parsed individually
            </div>
          </div>
          {certificates.length > 0 && (
            <button onClick={clearAll}
              className="px-3 py-1.5 rounded-lg font-semibold"
              style={{ fontSize: '11px', background: '#FEE2E2', color: '#DC2626', border: '1.5px solid #FECACA', cursor: 'pointer' }}>
              Clear All
            </button>
          )}
        </div>

        <div className="p-[16px_22px]">
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center gap-2 cursor-pointer"
            style={{ border: '2px dashed #A5B4FC', borderRadius: '10px', padding: '24px', background: 'rgba(238,242,255,0.5)' }}
            onClick={() => inputRef.current?.click()}>
            <Upload size={22} style={{ color: '#6366F1' }} />
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#312E81' }}>
              {busy ? 'Parsing…' : 'Drop certificate files here, or click to browse'}
            </div>
            <div style={{ fontSize: '10.5px', color: '#4F46E5', textAlign: 'center', maxWidth: '420px' }}>
              We extract: Subject CN, Issuer CN, Serial, Validity, Public Key (RSA/ECDSA bits), Signature Algorithm, and CA flag.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".cer,.crt,.pem,.der"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
            />
          </div>

          {parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-3"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <XCircle size={13} style={{ color: '#DC2626' }} />
              <span style={{ fontSize: '11px', color: '#991B1B' }}>{parseError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Comparison table — replicates the customer-facing format */}
      {certificates.length > 0 && (
        <div className="bg-white rounded-xl overflow-hidden"
          style={{ border: '1.5px solid #E2E8F0', boxShadow: '0 1px 4px rgba(15,41,82,0.06)' }}>
          <div className="p-[16px_22px]" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-2">
              <Lock size={14} style={{ color: '#0F2952' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F2952' }}>Certificate Comparison</div>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Side-by-side view of all imported certificates. Use this for the customer's certificate health report.
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', borderBottom: '2px solid #E2E8F0', minWidth: '140px' }}>FIELD</th>
                  {sorted.map(c => (
                    <th key={`${c.fileName}-${c.index}`}
                      style={{ textAlign: 'left', padding: '10px 14px', fontSize: '10.5px', fontWeight: 700, color: '#0F2952', borderBottom: '2px solid #E2E8F0', borderLeft: '1px solid #F1F5F9', minWidth: '220px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: certStatusColor(c.status) }}>{certStatusIcon(c.status)}</span>
                        <div>
                          <div style={{ fontWeight: 700 }}>{c.fileName}{sorted.filter(x => x.fileName === c.fileName).length > 1 ? ` [${c.index}]` : ''}</div>
                          <div style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 500 }}>({c.fileLabel})</div>
                        </div>
                        <button onClick={() => removeCert(c)}
                          className="ml-auto flex items-center justify-center rounded"
                          style={{ width: '20px', height: '20px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#CBD5E1' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#CBD5E1'; }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Type"          render={c => c.certificateType} sorted={sorted} />
                <Row label="CN / Subject"  render={c => c.subjectCN || '—'} sorted={sorted} />
                <Row label="Issuer"        render={c => c.issuerCN || '—'} sorted={sorted} />
                <Row label="Subject (full)"render={c => c.subject.raw || '—'} sorted={sorted} mono />
                <Row label="Key"           render={c => c.keyAlgorithm && c.keyBits ? `${c.keyAlgorithm} ${c.keyBits}-bit` : (c.keyAlgorithm || '—')} sorted={sorted} mono />
                <Row label="Algorithm"     render={c => c.signatureAlgorithm || '—'} sorted={sorted} mono />
                <Row label="Valid From"    render={c => c.validFromRaw || '—'} sorted={sorted} />
                <Row label="Valid To"      render={c => `${c.validToRaw || '—'} ${certStatusIcon(c.status)}`} sorted={sorted}
                  cellColor={c => certStatusColor(c.status)} bold />
                <Row label="Remaining"     render={c => formatRemaining(c.daysRemaining)} sorted={sorted}
                  cellColor={c => certStatusColor(c.status)} bold />
                <Row label="CA Flag"       render={c => c.isCA ? 'TRUE — Yes (root CA authority)' : 'FALSE — End-entity'} sorted={sorted} />
                <Row label="Self-Signed"   render={c => c.isSelfSigned ? 'Yes' : 'No'} sorted={sorted} />
                <Row label="Serial"        render={c => c.serialNumber || '—'} sorted={sorted} mono small />
              </tbody>
            </table>
          </div>

          {/* Per-cert warnings */}
          {certificates.some(c => c.parseError) && (
            <div className="p-[12px_22px]" style={{ borderTop: '1px solid #F1F5F9', background: '#FEF2F2' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '4px' }}>Parse warnings:</div>
              {certificates.filter(c => c.parseError).map((c, i) => (
                <div key={i} style={{ fontSize: '10.5px', color: '#991B1B' }}>• {c.fileName}: {c.parseError}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state hint */}
      {certificates.length === 0 && (
        <div className="bg-white rounded-xl p-[18px_22px]"
          style={{ border: '1px dashed #CBD5E1', textAlign: 'center' }}>
          <ShieldCheck size={24} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            No certificates imported yet. Drop the customer's <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>allcerts.cer</span> and <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 5px', borderRadius: '3px' }}>ca.cer</span> above to start the analysis.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comparison row helper ────────────────────────────────────────────────────
function Row({
  label, sorted, render, mono, small, bold, cellColor,
}: {
  label: string;
  sorted: ParsedCertificate[];
  render: (c: ParsedCertificate) => string;
  mono?: boolean;
  small?: boolean;
  bold?: boolean;
  cellColor?: (c: ParsedCertificate) => string;
}) {
  return (
    <tr>
      <td style={{ padding: '8px 14px', fontWeight: 700, color: '#475569', fontSize: '10.5px', background: '#FAFCFF', borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' }}>
        {label}
      </td>
      {sorted.map(c => {
        const v = render(c);
        return (
          <td key={`${label}-${c.fileName}-${c.index}`}
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #F1F5F9',
              borderLeft: '1px solid #F1F5F9',
              fontSize: small ? '10px' : '11.5px',
              fontFamily: mono ? 'monospace' : undefined,
              color: cellColor ? cellColor(c) : '#0F172A',
              fontWeight: bold ? 700 : 400,
              verticalAlign: 'top',
              wordBreak: mono ? 'break-all' : 'normal',
            }}>
            {v}
          </td>
        );
      })}
    </tr>
  );
}


// Minimal X.509 / ASN.1 DER parser — no dependencies.
// Extracts only the fields the wizard needs: subject CN, issuer CN, validity,
// public key algorithm + bit-length, signature algorithm, CA flag, serial.
//
// Accepts both PEM (-----BEGIN CERTIFICATE-----) and raw DER input.
// A single PEM file may contain multiple concatenated certificates — all are parsed.

export interface ParsedCertificate {
  fileName: string;
  fileLabel: string;           // friendly label (host_cert / ca_cert / other)
  index: number;               // index inside the file (multi-cert PEMs)
  subject: DistinguishedName;
  issuer: DistinguishedName;
  subjectCN: string;
  issuerCN: string;
  serialNumber: string;        // hex
  validFrom: string;           // ISO YYYY-MM-DD
  validTo: string;             // ISO YYYY-MM-DD
  validFromRaw: string;        // human "17 April 2026"
  validToRaw: string;
  daysRemaining: number;
  keyAlgorithm: string;        // "RSA", "ECDSA", or OID
  keyBits: number;
  signatureAlgorithm: string;  // "SHA-256 with RSA"
  isCA: boolean;
  isSelfSigned: boolean;
  certificateType: string;     // friendly: "Server / Host Certificate" | "Self-signed Root CA" | …
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  parseError?: string;
  isManual?: boolean;          // manual entry (not from file)
  manualExpiryDate?: string;   // ISO YYYY-MM-DD for manual entries
}

export interface DistinguishedName {
  CN?: string;   // Common Name
  O?: string;    // Organization
  OU?: string;   // Organizational Unit
  C?: string;    // Country
  ST?: string;   // State
  L?: string;    // Locality
  raw: string;   // full DN as comma-joined
}

// ── OID → human label map ────────────────────────────────────────────────────
const OIDS: Record<string, string> = {
  '2.5.4.3':  'CN',
  '2.5.4.6':  'C',
  '2.5.4.7':  'L',
  '2.5.4.8':  'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',

  '1.2.840.113549.1.1.1':  'RSA',
  '1.2.840.113549.1.1.5':  'SHA-1 with RSA',
  '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
  '1.2.840.10045.2.1':     'ECDSA',
  '1.2.840.10045.4.3.2':   'SHA-256 with ECDSA',
  '1.2.840.10045.4.3.3':   'SHA-384 with ECDSA',
  '1.2.840.10045.4.3.4':   'SHA-512 with ECDSA',

  '2.5.29.19': 'basicConstraints',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.37': 'extKeyUsage',
  '2.5.29.15': 'keyUsage',
};

// ── ASN.1 DER decoder ───────────────────────────────────────────────────────
interface Asn1Node {
  tag: number;
  cls: number;       // 0=universal, 1=application, 2=context, 3=private
  constructed: boolean;
  value: Uint8Array;
  start: number;
  end: number;
  children?: Asn1Node[];
}

function decodeLength(bytes: Uint8Array, offset: number): { length: number; next: number } {
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4) throw new Error('Unsupported ASN.1 length encoding');
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | bytes[offset + 1 + i];
  return { length, next: offset + 1 + numBytes };
}

function decodeAsn1(bytes: Uint8Array, offset = 0, end = bytes.length): Asn1Node[] {
  const nodes: Asn1Node[] = [];
  let i = offset;
  while (i < end) {
    if (i >= bytes.length) break;
    const tagByte = bytes[i];
    const cls = (tagByte >> 6) & 0x03;
    const constructed = (tagByte & 0x20) !== 0;
    const tag = tagByte & 0x1f;
    const { length, next } = decodeLength(bytes, i + 1);
    const valueStart = next;
    const valueEnd = next + length;
    const value = bytes.slice(valueStart, valueEnd);
    const node: Asn1Node = { tag, cls, constructed, value, start: i, end: valueEnd };
    if (constructed) {
      try { node.children = decodeAsn1(bytes, valueStart, valueEnd); } catch { /* opaque */ }
    }
    nodes.push(node);
    i = valueEnd;
  }
  return nodes;
}

function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const first = bytes[0];
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) { parts.push(value); value = 0; }
  }
  return parts.join('.');
}

function decodeTime(node: Asn1Node): { iso: string; date: Date; raw: string } {
  // UTCTime (tag 23) "YYMMDDHHMMSSZ" or GeneralizedTime (tag 24) "YYYYMMDDHHMMSSZ"
  const s = new TextDecoder().decode(node.value);
  let year: number, month: number, day: number, hh = 0, mm = 0, ss = 0;
  if (node.tag === 23) {
    const yy = parseInt(s.slice(0, 2), 10);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    month = parseInt(s.slice(2, 4), 10) - 1;
    day = parseInt(s.slice(4, 6), 10);
    hh = parseInt(s.slice(6, 8), 10);
    mm = parseInt(s.slice(8, 10), 10);
    ss = parseInt(s.slice(10, 12), 10) || 0;
  } else {
    year = parseInt(s.slice(0, 4), 10);
    month = parseInt(s.slice(4, 6), 10) - 1;
    day = parseInt(s.slice(6, 8), 10);
    hh = parseInt(s.slice(8, 10), 10);
    mm = parseInt(s.slice(10, 12), 10);
    ss = parseInt(s.slice(12, 14), 10) || 0;
  }
  const date = new Date(Date.UTC(year, month, day, hh, mm, ss));
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const raw = `${day} ${monthNames[month]} ${year}`;
  return { iso, date, raw };
}

function decodeString(node: Asn1Node): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(node.value);
}

function decodeInteger(bytes: Uint8Array): string {
  // Return hex string with leading zero stripped if first byte is 0x00 padding.
  let start = 0;
  if (bytes.length > 1 && bytes[0] === 0x00) start = 1;
  return Array.from(bytes.slice(start)).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

// ── Distinguished Name decoder ──────────────────────────────────────────────
function decodeDN(seq: Asn1Node): DistinguishedName {
  const dn: DistinguishedName = { raw: '' };
  const parts: string[] = [];
  if (!seq.children) return dn;
  for (const rdn of seq.children) {
    // RDN is a SET of SEQUENCE { OID, value }
    if (!rdn.children) continue;
    for (const attr of rdn.children) {
      if (!attr.children || attr.children.length < 2) continue;
      const oidNode = attr.children[0];
      const valueNode = attr.children[1];
      const oid = decodeOid(oidNode.value);
      const value = decodeString(valueNode);
      const label = OIDS[oid];
      if (label && ['CN', 'C', 'L', 'ST', 'O', 'OU'].includes(label)) {
        (dn as Record<string, string>)[label] = value;
        parts.push(`${label}=${value}`);
      } else {
        parts.push(`${oid}=${value}`);
      }
    }
  }
  dn.raw = parts.join(', ');
  return dn;
}

// ── Public key length detection ─────────────────────────────────────────────
function publicKeyBits(spki: Asn1Node): { algorithm: string; bits: number } {
  // SubjectPublicKeyInfo ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
  if (!spki.children || spki.children.length < 2) return { algorithm: '', bits: 0 };
  const algSeq = spki.children[0];
  const keyBitString = spki.children[1];
  const algOid = algSeq.children && algSeq.children[0] ? decodeOid(algSeq.children[0].value) : '';
  const algorithm = OIDS[algOid] || algOid;

  // BIT STRING contains an extra leading byte for unused bits.
  let keyBytes = keyBitString.value;
  if (keyBytes[0] === 0x00) keyBytes = keyBytes.slice(1);

  if (algorithm === 'RSA') {
    // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
    const inner = decodeAsn1(keyBytes);
    if (inner[0] && inner[0].children && inner[0].children[0]) {
      let modBytes = inner[0].children[0].value;
      if (modBytes[0] === 0x00) modBytes = modBytes.slice(1);
      return { algorithm: 'RSA', bits: modBytes.length * 8 };
    }
  } else if (algorithm === 'ECDSA') {
    // EC public key length in bytes (subtract uncompressed prefix 0x04)
    const bits = (keyBytes.length - 1) * 4; // x and y coords, so total / 2 * 8
    return { algorithm: 'ECDSA', bits };
  }
  return { algorithm, bits: 0 };
}

// ── basicConstraints extension → CA flag ────────────────────────────────────
function findCAFlag(tbs: Asn1Node): boolean {
  // tbsCertificate is a SEQUENCE; extensions are tagged [3] EXPLICIT, holding a SEQUENCE OF Extension.
  if (!tbs.children) return false;
  for (const child of tbs.children) {
    if (child.cls === 2 && child.tag === 3 && child.children) {
      const extensions = child.children[0];
      if (!extensions || !extensions.children) continue;
      for (const ext of extensions.children) {
        if (!ext.children || ext.children.length < 2) continue;
        const oid = decodeOid(ext.children[0].value);
        if (oid !== '2.5.29.19') continue;
        // OCTET STRING wrapping basicConstraints SEQUENCE { cA BOOLEAN OPTIONAL, pathLen INTEGER OPTIONAL }
        const octet = ext.children[ext.children.length - 1];
        const inner = decodeAsn1(octet.value);
        if (inner[0] && inner[0].children) {
          for (const c of inner[0].children) {
            if (c.tag === 1 /* BOOLEAN */ && c.value.length > 0) {
              return c.value[0] !== 0;
            }
          }
        }
      }
    }
  }
  return false;
}

// ── Top-level certificate parser ────────────────────────────────────────────
export function parseSingleCertificate(der: Uint8Array, fileName: string, fileLabel: string, index: number): ParsedCertificate {
  const base: ParsedCertificate = {
    fileName, fileLabel, index,
    subject: { raw: '' }, issuer: { raw: '' }, subjectCN: '', issuerCN: '',
    serialNumber: '', validFrom: '', validTo: '', validFromRaw: '', validToRaw: '',
    daysRemaining: 0, keyAlgorithm: '', keyBits: 0, signatureAlgorithm: '',
    isCA: false, isSelfSigned: false, certificateType: 'Certificate',
    status: 'VALID',
  };

  try {
    const root = decodeAsn1(der)[0];
    if (!root || !root.children) throw new Error('Not a valid X.509 certificate');
    // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
    const tbs = root.children[0];
    const sigAlgSeq = root.children[1];
    if (!tbs.children) throw new Error('Missing tbsCertificate');

    // tbsCertificate ::= SEQUENCE { [0] version DEFAULT v1, serial, sigAlg, issuer, validity, subject, spki, ... }
    let idx = 0;
    if (tbs.children[0].cls === 2 && tbs.children[0].tag === 0) idx = 1; // skip version
    const serial = tbs.children[idx++];
    /* const tbsSigAlg = */ tbs.children[idx++];
    const issuer = tbs.children[idx++];
    const validity = tbs.children[idx++];
    const subject = tbs.children[idx++];
    const spki = tbs.children[idx++];

    base.serialNumber = decodeInteger(serial.value);
    base.issuer = decodeDN(issuer);
    base.subject = decodeDN(subject);
    base.issuerCN = base.issuer.CN || base.issuer.raw;
    base.subjectCN = base.subject.CN || base.subject.raw;
    base.isSelfSigned = base.issuer.raw === base.subject.raw;

    if (validity.children && validity.children.length >= 2) {
      const nb = decodeTime(validity.children[0]);
      const na = decodeTime(validity.children[1]);
      base.validFrom = nb.iso;
      base.validTo = na.iso;
      base.validFromRaw = nb.raw;
      base.validToRaw = na.raw;
      base.daysRemaining = Math.floor((na.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (base.daysRemaining < 0) base.status = 'EXPIRED';
      else if (base.daysRemaining < 90) base.status = 'EXPIRING_SOON';
      else base.status = 'VALID';
    }

    const keyInfo = publicKeyBits(spki);
    base.keyAlgorithm = keyInfo.algorithm;
    base.keyBits = keyInfo.bits;

    if (sigAlgSeq && sigAlgSeq.children && sigAlgSeq.children[0]) {
      const oid = decodeOid(sigAlgSeq.children[0].value);
      base.signatureAlgorithm = OIDS[oid] || oid;
    }

    base.isCA = findCAFlag(tbs);

    // Friendly type label
    if (base.isCA && base.isSelfSigned) base.certificateType = 'Self-signed Root CA';
    else if (base.isCA) base.certificateType = 'Intermediate CA';
    else if (base.isSelfSigned) base.certificateType = 'Self-signed Server Certificate';
    else base.certificateType = 'Server / Host Certificate';
  } catch (e) {
    base.parseError = e instanceof Error ? e.message : 'Parse failed';
  }

  return base;
}

// Content-derived label — preferred over filename heuristics once we know the cert role.
function labelForCert(c: ParsedCertificate): string {
  if (c.parseError) return 'Certificate';
  if (c.isCA && c.isSelfSigned) return 'Root CA Cert';
  if (c.isCA) return 'Intermediate CA Cert';
  return 'Host / End-Entity Cert';
}

// Detects PEM vs DER and splits multi-cert PEM bundles.
export function parseCertificateFile(content: string | ArrayBuffer, fileName: string): ParsedCertificate[] {
  // Initial label from filename — overridden later by the actual cert role.
  const lowerName = fileName.toLowerCase();
  let fileLabel = 'Certificate';
  if (/^ca\.|^ca[_-]|\/ca\.cer/i.test(lowerName)) fileLabel = 'CA Cert';
  else if (/allcerts|host(\s|_)?cert/i.test(lowerName)) fileLabel = 'Host Cert';

  const certs: ParsedCertificate[] = [];

  // Try to detect PEM by looking for the marker.
  let text = '';
  let bytes: Uint8Array;

  if (typeof content === 'string') {
    text = content;
  } else {
    bytes = new Uint8Array(content);
    // If first byte is 0x30 (SEQUENCE) and not a printable ASCII, treat as DER.
    if (bytes[0] === 0x30) {
      const cert = parseSingleCertificate(bytes, fileName, fileLabel, 0);
      return [cert];
    }
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  // PEM extraction (can contain multiple BEGIN CERTIFICATE blocks)
  const pemRe = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = pemRe.exec(text)) !== null) {
    const base64 = m[1].replace(/[\s\r\n]+/g, '');
    try {
      const der = base64ToBytes(base64);
      certs.push(parseSingleCertificate(der, fileName, fileLabel, idx++));
    } catch (e) {
      certs.push({
        fileName, fileLabel, index: idx++,
        subject: { raw: '' }, issuer: { raw: '' }, subjectCN: '', issuerCN: '',
        serialNumber: '', validFrom: '', validTo: '', validFromRaw: '', validToRaw: '',
        daysRemaining: 0, keyAlgorithm: '', keyBits: 0, signatureAlgorithm: '',
        isCA: false, isSelfSigned: false, certificateType: 'Certificate', status: 'VALID',
        parseError: e instanceof Error ? e.message : 'Base64 decode failed',
      });
    }
  }

  // If no PEM markers but text looks like base64 (e.g. raw cert without header), try it as DER
  if (certs.length === 0) {
    const trimmed = text.replace(/[\s\r\n]+/g, '');
    if (trimmed && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      try {
        const der = base64ToBytes(trimmed);
        certs.push(parseSingleCertificate(der, fileName, fileLabel, 0));
      } catch { /* ignore */ }
    }
  }

  // Override fileLabel with the content-derived role — filename heuristic is unreliable
  // for chain bundles like allcerts.cer that hold both a host cert and a CA cert.
  for (const c of certs) c.fileLabel = labelForCert(c);

  return certs;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Human-readable remaining lifetime (e.g. "~4y 11m", "Expired 17 days ago").
export function formatRemaining(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0 && months === 0) return `${days} days`;
  if (years === 0) return `~${months} months`;
  if (months === 0) return `~${years} years`;
  return `~${years}y ${months}m`;
}

export function certStatusColor(status: ParsedCertificate['status']): string {
  switch (status) {
    case 'VALID': return '#16a34a';
    case 'EXPIRING_SOON': return '#d97706';
    case 'EXPIRED': return '#dc2626';
    default: return '#64748b';
  }
}

export function certStatusIcon(status: ParsedCertificate['status']): string {
  switch (status) {
    case 'VALID': return '✅';
    case 'EXPIRING_SOON': return '⚠️';
    case 'EXPIRED': return '❌';
    default: return '•';
  }
}

// Create a manual certificate entry (when file not available)
export function createManualCertificate(name: string, expiryDate: string): ParsedCertificate {
  const iso = expiryDate; // assumed YYYY-MM-DD format from input
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysRemaining = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const expiryRaw = `${day} ${monthNames[month - 1]} ${year}`;

  let status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' = 'VALID';
  if (daysRemaining < 0) status = 'EXPIRED';
  else if (daysRemaining < 90) status = 'EXPIRING_SOON';

  return {
    fileName: `Manual - ${name}`,
    fileLabel: 'Manual Entry',
    index: 0,
    subject: { raw: name, CN: name },
    issuer: { raw: name, CN: name },
    subjectCN: name,
    issuerCN: name,
    serialNumber: '',
    validFrom: iso,
    validTo: iso,
    validFromRaw: expiryRaw,
    validToRaw: expiryRaw,
    daysRemaining,
    keyAlgorithm: '',
    keyBits: 0,
    signatureAlgorithm: '',
    isCA: false,
    isSelfSigned: true,
    certificateType: 'Manual Entry',
    status,
    isManual: true,
    manualExpiryDate: iso,
  };
}

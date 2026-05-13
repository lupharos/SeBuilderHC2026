import { Check } from 'lucide-react';

interface Step2Props {
  selectedProducts: Record<string, boolean>;
  setSelectedProducts: (products: Record<string, boolean>) => void;
}

/* ─── Data ─── */

interface ProductItem {
  id: string;
  name: string;
  tag: string;
  dotColor: string;
  tagBg: string;
  tagColor: string;
  tagBorder: string;
}

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  products: ProductItem[];
}

const sections: Section[] = [
  {
    id: 'access',
    label: 'Access & Threat Protection Layer',
    iconBg: '#2563EB',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z"
          fill="white"
          fillOpacity="0.95"
        />
        <path
          d="M9 12L11 14L15 10"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    products: [
      {
        id: 'ngfw',
        name: 'Next Generation Firewall',
        tag: 'NGFW',
        dotColor: '#F59E0B',
        tagBg: 'rgba(245,158,11,0.1)',
        tagColor: '#D97706',
        tagBorder: 'rgba(245,158,11,0.25)',
      },
      {
        id: 'web',
        name: 'Web Security Gateway',
        tag: 'WSG',
        dotColor: '#3B82F6',
        tagBg: 'rgba(59,130,246,0.1)',
        tagColor: '#2563EB',
        tagBorder: 'rgba(59,130,246,0.25)',
      },
      {
        id: 'email',
        name: 'Email Security Gateway',
        tag: 'ESG',
        dotColor: '#8B5CF6',
        tagBg: 'rgba(139,92,246,0.1)',
        tagColor: '#7C3AED',
        tagBorder: 'rgba(139,92,246,0.25)',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data Security Layer',
    iconBg: '#16A34A',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="11" rx="2" fill="white" fillOpacity="0.95" />
        <path
          d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V11"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="1.5" fill="#16A34A" />
      </svg>
    ),
    products: [
      {
        id: 'data',
        name: 'Data Security (DLP)',
        tag: 'DLP',
        dotColor: '#10B981',
        tagBg: 'rgba(16,185,129,0.1)',
        tagColor: '#059669',
        tagBorder: 'rgba(16,185,129,0.25)',
      },
      {
        id: 'cls',
        name: 'Data Classification',
        tag: 'CLASS',
        dotColor: '#16A34A',
        tagBg: 'rgba(22,163,74,0.1)',
        tagColor: '#16A34A',
        tagBorder: 'rgba(22,163,74,0.25)',
      },
      {
        id: 'dspm',
        name: 'Data Security Posture Management (DSPM)',
        tag: 'DSPM',
        dotColor: '#EA580C',
        tagBg: 'rgba(234,88,12,0.1)',
        tagColor: '#EA580C',
        tagBorder: 'rgba(234,88,12,0.25)',
      },
    ],
  },
  {
    id: 'appliances',
    label: 'Forcepoint Appliances',
    iconBg: '#0F2952',
    icon: (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 800,
          fontFamily: 'monospace',
          color: '#60A5FA',
          letterSpacing: '-0.03em',
        }}
      >
        V
      </span>
    ),
    products: [
      {
        id: 'appl',
        name: 'V-Series Hardware Appliances',
        tag: 'V-HW',
        dotColor: '#2563EB',
        tagBg: 'rgba(15,41,82,0.08)',
        tagColor: '#1D4ED8',
        tagBorder: 'rgba(15,41,82,0.18)',
      },
      {
        id: 'vappl',
        name: 'V-Series Virtual Appliances',
        tag: 'V-VM',
        dotColor: '#60A5FA',
        tagBg: 'rgba(96,165,250,0.12)',
        tagColor: '#2563EB',
        tagBorder: 'rgba(96,165,250,0.3)',
      },
    ],
  },
];

/* ─── Component ─── */

export function Step2ProductScope({ selectedProducts, setSelectedProducts }: Step2Props) {
  const toggleProduct = (id: string) => {
    setSelectedProducts({ ...selectedProducts, [id]: !selectedProducts[id] });
  };

  const totalProducts = sections.reduce((acc, s) => acc + s.products.length, 0);
  const selectedCount = Object.values(selectedProducts).filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 rounded-xl"
        style={{
          background: '#FFFFFF',
          border: '1px solid #EEF0F5',
          boxShadow: '0 1px 3px rgba(15,41,82,0.06)',
        }}
      >
        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
          Select the Forcepoint products to be assessed. Unselected products will be skipped.
        </span>
        <span
          className="font-mono font-bold px-2.5 py-1 rounded-lg"
          style={{
            fontSize: '11px',
            background: selectedCount > 0 ? 'rgba(37,99,235,0.08)' : '#F1F5F9',
            color: selectedCount > 0 ? '#2563EB' : '#94A3B8',
            border: selectedCount > 0 ? '1px solid rgba(37,99,235,0.18)' : '1px solid #E2E8F0',
          }}
        >
          {selectedCount} / {totalProducts} selected
        </span>
      </div>

      {/* Sections */}
      {sections.map((section) => {
        const sectionSelected = section.products.filter((p) => selectedProducts[p.id]).length;

        return (
          <div
            key={section.id}
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E8ECF2',
              boxShadow: '0 1px 4px rgba(15,41,82,0.07)',
            }}
          >
            {/* Section header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid #F0F3F8' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: section.iconBg }}
                >
                  {section.icon}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                  {section.label}
                </span>
              </div>
              {sectionSelected > 0 && (
                <span
                  className="font-mono font-bold px-2 py-0.5 rounded"
                  style={{
                    fontSize: '9.5px',
                    background: 'rgba(37,99,235,0.08)',
                    color: '#2563EB',
                    border: '1px solid rgba(37,99,235,0.15)',
                  }}
                >
                  {sectionSelected}/{section.products.length}
                </span>
              )}
            </div>

            {/* Product rows */}
            <div className="divide-y" style={{ borderColor: '#F4F6FB' }}>
              {section.products.map((product, idx) => {
                const isSelected = !!selectedProducts[product.id];
                const isLast = idx === section.products.length - 1;

                return (
                  <button
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    className="w-full flex items-center gap-3.5 px-5 transition-all"
                    style={{
                      height: '50px',
                      background: isSelected ? 'rgba(37,99,235,0.045)' : 'transparent',
                      borderBottom: isLast ? 'none' : '1px solid #F4F6FB',
                      cursor: 'pointer',
                      borderLeft: isSelected ? '3px solid #2563EB' : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#FAFBFF';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Dot */}
                    <div
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: '9px',
                        height: '9px',
                        background: product.dotColor,
                        boxShadow: `0 0 0 2px ${product.dotColor}22`,
                      }}
                    />

                    {/* Name */}
                    <span
                      className="flex-1 text-left"
                      style={{
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? '#2563EB' : '#1E293B',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {product.name}
                    </span>

                    {/* Tag */}
                    <span
                      className="font-mono font-bold px-2 py-0.5 rounded flex-shrink-0"
                      style={{
                        fontSize: '9.5px',
                        background: product.tagBg,
                        color: product.tagColor,
                        border: `1px solid ${product.tagBorder}`,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {product.tag}
                    </span>

                    {/* Checkmark */}
                    <div
                      className="flex-shrink-0 rounded-full flex items-center justify-center transition-all"
                      style={{
                        width: '20px',
                        height: '20px',
                        background: isSelected ? '#2563EB' : 'transparent',
                        border: isSelected ? '2px solid #2563EB' : '2px solid #CBD5E1',
                        boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
                      }}
                    >
                      {isSelected && <Check size={11} style={{ color: 'white', strokeWidth: 3 }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
import { useState } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
  product: string;
}

export function Step8Findings() {
  const [findings, setFindings] = useState<Finding[]>([
    {
      id: '1',
      severity: 'critical',
      title: 'ESG v8.5.4 — End-of-Maintenance reached',
      description: 'March 2026 EoM passed. No security patches or hotfixes. Active CVEs unpatched.',
      recommendation: 'Upgrade to ESG v8.5.7. Plan maintenance window. Effort: Medium.',
      product: 'EMAIL',
    },
    {
      id: '2',
      severity: 'high',
      title: 'DLP v10.3 — newer version available',
      description: 'v10.4 integrates OCR on Protectors, improves endpoint performance, adds ML classifiers.',
      recommendation: 'Plan upgrade within 60 days. EoM June 2026.',
      product: 'DLP',
    },
    {
      id: '3',
      severity: 'high',
      title: 'SSL Inspection not enabled on Web Security Gateway',
      description: 'HTTPS traffic is not being decrypted and inspected, creating a blind spot for malware and data exfiltration.',
      recommendation: 'Enable SSL inspection with proper certificate deployment and user awareness training.',
      product: 'WEB',
    },
  ]);

  const addFinding = () => {
    const newFinding: Finding = {
      id: Date.now().toString(),
      severity: 'medium',
      title: 'New Finding',
      description: '',
      recommendation: '',
      product: 'GENERAL',
    };
    setFindings([...findings, newFinding]);
  };

  const removeFinding = (id: string) => {
    setFindings(findings.filter((f) => f.id !== id));
  };

  const updateFinding = (id: string, field: keyof Finding, value: string) => {
    setFindings(findings.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-500/10 border-red-500/20 text-red-700',
      high: 'bg-amber-500/10 border-amber-500/20 text-amber-700',
      medium: 'bg-blue-500/10 border-blue-500/20 text-blue-700',
      low: 'bg-slate-200 border-slate-300 text-slate-700',
    };
    return colors[severity] || colors.medium;
  };

  const getSeverityBorderColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'border-l-red-600',
      high: 'border-l-amber-600',
      medium: 'border-l-blue-600',
      low: 'border-l-slate-400',
    };
    return colors[severity] || colors.medium;
  };

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl p-5 border border-red-200/50">
          <div className="text-sm font-semibold text-red-900 mb-2">Critical</div>
          <div className="text-3xl font-bold text-red-700">{criticalCount}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-5 border border-amber-200/50">
          <div className="text-sm font-semibold text-amber-900 mb-2">High</div>
          <div className="text-3xl font-bold text-amber-700">{highCount}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-5 border border-blue-200/50">
          <div className="text-sm font-semibold text-blue-900 mb-2">Medium</div>
          <div className="text-3xl font-bold text-blue-700">{mediumCount}</div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-5 border border-slate-200/50">
          <div className="text-sm font-semibold text-slate-900 mb-2">Low</div>
          <div className="text-3xl font-bold text-slate-700">{lowCount}</div>
        </div>
      </div>

      {/* Findings List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="font-semibold text-slate-900">Findings & Issues</div>
            </div>
            <button
              onClick={addFinding}
              className="h-9 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-1.5"
            >
              <Plus size={16} />
              Add Finding
            </button>
          </div>

          <div className="space-y-3">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className={`border-l-4 ${getSeverityBorderColor(finding.severity)} bg-slate-50 rounded-xl p-4`}
              >
                <div className="flex items-start gap-3">
                  {/* Severity Badge */}
                  <select
                    value={finding.severity}
                    onChange={(e) => updateFinding(finding.id, 'severity', e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border-2 outline-none cursor-pointer ${getSeverityColor(
                      finding.severity
                    )}`}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  {/* Finding Content */}
                  <div className="flex-1 space-y-3">
                    {/* Title */}
                    <div className="flex items-start gap-2">
                      <input
                        type="text"
                        value={finding.title}
                        onChange={(e) => updateFinding(finding.id, 'title', e.target.value)}
                        className="flex-1 bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                        placeholder="Finding title..."
                      />
                      <select
                        value={finding.product}
                        onChange={(e) => updateFinding(finding.id, 'product', e.target.value)}
                        className="px-3 py-2 bg-blue-500/10 text-blue-700 rounded-lg border-2 border-blue-500/20 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="EMAIL">EMAIL</option>
                        <option value="WEB">WEB</option>
                        <option value="DLP">DLP</option>
                        <option value="DSPM">DSPM</option>
                        <option value="NGFW">NGFW</option>
                        <option value="GENERAL">GENERAL</option>
                      </select>
                    </div>

                    {/* Description */}
                    <textarea
                      value={finding.description}
                      onChange={(e) => updateFinding(finding.id, 'description', e.target.value)}
                      className="w-full bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none resize-vertical min-h-[60px]"
                      placeholder="Describe the finding..."
                    />

                    {/* Recommendation */}
                    <div className="flex items-start gap-2">
                      <div className="text-blue-600 font-semibold text-sm pt-2 flex-shrink-0">→</div>
                      <input
                        type="text"
                        value={finding.recommendation}
                        onChange={(e) => updateFinding(finding.id, 'recommendation', e.target.value)}
                        className="flex-1 bg-blue-50 border-2 border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                        placeholder="Recommendation..."
                      />
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => removeFinding(finding.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors p-2"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

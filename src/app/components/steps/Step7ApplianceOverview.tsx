import { Server, Calendar, AlertTriangle } from 'lucide-react';

interface ApplianceLifecycle {
  id: string;
  hostname: string;
  model: string;
  serial: string;
  module: string;
  installedVersion: string;
  purchaseDate: string;
  eofSale: string;
  eom: string;
  eos: string;
  suggestedMigration: string;
  status: 'active' | 'eof' | 'eom';
}

const mockLifecycle: ApplianceLifecycle[] = [
  {
    id: '1',
    hostname: 'FP-V10000-01',
    model: 'V10000 G4',
    serial: 'FP-V10K-TUR-2019-004421',
    module: 'WCG',
    installedVersion: '8.5.7',
    purchaseDate: '14 Mar 2019',
    eofSale: 'Dec 2024',
    eom: 'Dec 2025',
    eos: 'Dec 2026',
    suggestedMigration: 'FWaaS / Cloud SWG',
    status: 'eof',
  },
  {
    id: '2',
    hostname: 'FP-V5000-01',
    model: 'V5000 G3',
    serial: 'FP-V5K-TUR-2020-007734',
    module: 'ESG',
    installedVersion: '8.5.4',
    purchaseDate: '02 Sep 2020',
    eofSale: 'Mar 2027',
    eom: 'Mar 2028',
    eos: 'Mar 2029',
    suggestedMigration: 'Cloud Email Security',
    status: 'active',
  },
  {
    id: '3',
    hostname: 'FP-V10000-02',
    model: 'V10000 G4',
    serial: 'FP-V10K-TUR-2021-009982',
    module: 'DLP',
    installedVersion: '10.3',
    purchaseDate: '15 Jun 2021',
    eofSale: 'Jun 2027',
    eom: 'Jun 2028',
    eos: 'Jun 2029',
    suggestedMigration: 'V10000 G5 / Cloud',
    status: 'active',
  },
];

export function Step7ApplianceOverview() {
  const getModuleBadge = (module: string) => {
    const badges: Record<string, JSX.Element> = {
      WCG: (
        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-700 rounded-lg border border-blue-500/20 text-xs font-bold">
          WCG
        </span>
      ),
      ESG: (
        <span className="px-2.5 py-1 bg-purple-500/10 text-purple-700 rounded-lg border border-purple-500/20 text-xs font-bold">
          ESG
        </span>
      ),
      DLP: (
        <span className="px-2.5 py-1 bg-teal-500/10 text-teal-700 rounded-lg border border-teal-500/20 text-xs font-bold">
          DLP
        </span>
      ),
    };
    return badges[module] || badges.WCG;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, JSX.Element> = {
      active: (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-700 rounded-lg border border-green-500/20 text-xs font-bold">
          ✓ ACTIVE
        </span>
      ),
      eof: (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-700 rounded-lg border border-red-500/20 text-xs font-bold">
          ⚠ EoF SALE
        </span>
      ),
      eom: (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-700 rounded-lg border border-amber-500/20 text-xs font-bold">
          ⚠ EoM
        </span>
      ),
    };
    return badges[status] || badges.active;
  };

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-5 border border-blue-200/50">
          <div className="text-sm font-semibold text-blue-900 mb-2">Total Appliances</div>
          <div className="text-3xl font-bold text-blue-700">{mockLifecycle.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-5 border border-green-200/50">
          <div className="text-sm font-semibold text-green-900 mb-2">Active</div>
          <div className="text-3xl font-bold text-green-700">
            {mockLifecycle.filter((a) => a.status === 'active').length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-5 border border-amber-200/50">
          <div className="text-sm font-semibold text-amber-900 mb-2">Approaching EoM</div>
          <div className="text-3xl font-bold text-amber-700">
            {mockLifecycle.filter((a) => a.status === 'eom').length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl p-5 border border-red-200/50">
          <div className="text-sm font-semibold text-red-900 mb-2">End-of-Sale</div>
          <div className="text-3xl font-bold text-red-700">
            {mockLifecycle.filter((a) => a.status === 'eof').length}
          </div>
        </div>
      </div>

      {/* Lifecycle Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div className="font-semibold text-slate-900">Appliance Lifecycle Overview</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Hostname / Role
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Serial Number
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Module
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Purchase Date
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    EoF Sale
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    EoM
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    EoS
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Migration
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockLifecycle.map((appliance) => (
                  <tr key={appliance.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-semibold text-sm">{appliance.hostname}</td>
                    <td className="py-3 px-3 font-mono text-xs">{appliance.model}</td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-600">{appliance.serial}</td>
                    <td className="py-3 px-3">{getModuleBadge(appliance.module)}</td>
                    <td className="py-3 px-3 font-mono text-xs">{appliance.installedVersion}</td>
                    <td className="py-3 px-3 font-mono text-xs">{appliance.purchaseDate}</td>
                    <td className={`py-3 px-3 font-mono text-xs ${appliance.status === 'eof' ? 'text-amber-600' : ''}`}>
                      {appliance.eofSale}
                    </td>
                    <td className={`py-3 px-3 font-mono text-xs ${appliance.status === 'eof' ? 'text-amber-600' : ''}`}>
                      {appliance.eom}
                    </td>
                    <td className={`py-3 px-3 font-mono text-xs ${appliance.status === 'eof' ? 'text-red-600' : ''}`}>
                      {appliance.eos}
                    </td>
                    <td className="py-3 px-3 text-xs text-blue-600">{appliance.suggestedMigration}</td>
                    <td className="py-3 px-3">{getStatusBadge(appliance.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl border-2 border-amber-500/20 shadow-sm overflow-hidden p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
          <div>
            <div className="font-semibold text-amber-900 mb-2">Hardware Lifecycle Alert</div>
            <div className="text-sm text-amber-800">
              <span className="font-bold">1 appliance</span> has reached End-of-Sale. Hardware replacements should be
              planned before End-of-Support. Consider migration to cloud-delivered or next-gen appliance platform.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

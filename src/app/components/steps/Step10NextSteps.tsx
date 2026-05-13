import { useState } from 'react';
import { Plus, X, Calendar } from 'lucide-react';

interface NextStep {
  id: string;
  action: string;
  owner: string;
  timeline: string;
  priority: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export function Step10NextSteps() {
  const [nextSteps, setNextSteps] = useState<NextStep[]>([
    {
      id: '1',
      action: 'Schedule ESG upgrade maintenance window',
      owner: 'IT Operations Team',
      timeline: 'Within 30 days',
      priority: 'Critical',
      status: 'pending',
    },
    {
      id: '2',
      action: 'Deploy SSL inspection certificates',
      owner: 'Security Team',
      timeline: 'Q2 2026',
      priority: 'High',
      status: 'pending',
    },
    {
      id: '3',
      action: 'Evaluate cloud migration options for V-Series',
      owner: 'Architecture Team',
      timeline: 'Q3 2026',
      priority: 'Medium',
      status: 'pending',
    },
  ]);

  const addNextStep = () => {
    const newStep: NextStep = {
      id: Date.now().toString(),
      action: 'New Action',
      owner: '',
      timeline: '',
      priority: 'Medium',
      status: 'pending',
    };
    setNextSteps([...nextSteps, newStep]);
  };

  const removeNextStep = (id: string) => {
    setNextSteps(nextSteps.filter((s) => s.id !== id));
  };

  const updateNextStep = (id: string, field: keyof NextStep, value: any) => {
    setNextSteps(nextSteps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, JSX.Element> = {
      pending: (
        <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold">PENDING</span>
      ),
      'in-progress': (
        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-700 rounded-lg border border-blue-500/20 text-xs font-bold">
          IN PROGRESS
        </span>
      ),
      completed: (
        <span className="px-2.5 py-1 bg-green-500/10 text-green-700 rounded-lg border border-green-500/20 text-xs font-bold">
          ✓ COMPLETED
        </span>
      ),
    };
    return badges[status] || badges.pending;
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, string> = {
      Critical: 'bg-red-500/10 text-red-700 border-red-500/20',
      High: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
      Medium: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
      Low: 'bg-slate-200 text-slate-700 border-slate-300',
    };
    return badges[priority] || badges.Medium;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div className="font-semibold text-slate-900">Next Steps & Roadmap</div>
            </div>
            <button
              onClick={addNextStep}
              className="h-9 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-1.5"
            >
              <Plus size={16} />
              Add Action
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Timeline
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {nextSteps.map((step, index) => (
                  <tr key={step.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-700">{index + 1}</td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={step.action}
                        onChange={(e) => updateNextStep(step.id, 'action', e.target.value)}
                        className="w-full bg-transparent border-none outline-none focus:bg-blue-50 px-2 py-1 rounded text-sm font-semibold"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={step.owner}
                        onChange={(e) => updateNextStep(step.id, 'owner', e.target.value)}
                        className="w-full bg-transparent border-none outline-none focus:bg-blue-50 px-2 py-1 rounded text-sm"
                        placeholder="Owner..."
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={step.timeline}
                        onChange={(e) => updateNextStep(step.id, 'timeline', e.target.value)}
                        className="w-full bg-transparent border-none outline-none focus:bg-blue-50 px-2 py-1 rounded text-sm"
                        placeholder="Timeline..."
                      />
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={step.priority}
                        onChange={(e) => updateNextStep(step.id, 'priority', e.target.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border-2 outline-none cursor-pointer ${getPriorityBadge(
                          step.priority
                        )}`}
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={step.status}
                        onChange={(e) => updateNextStep(step.id, 'status', e.target.value as any)}
                        className="bg-transparent border-none outline-none cursor-pointer text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => removeNextStep(step.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

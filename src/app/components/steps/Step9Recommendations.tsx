import { useState } from 'react';
import { Plus, X, Lightbulb } from 'lucide-react';

interface Recommendation {
  id: string;
  priority: 'p1' | 'p2' | 'p3';
  title: string;
  description: string;
  tags: string[];
}

export function Step9Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([
    {
      id: '1',
      priority: 'p1',
      title: 'Upgrade Email Security Gateway to v8.5.7',
      description:
        'Critical security patches and CVE fixes are not available on the current version. Schedule maintenance window within 30 days to minimize security exposure.',
      tags: ['Security', 'Email', 'Urgent'],
    },
    {
      id: '2',
      priority: 'p2',
      title: 'Enable SSL Inspection on Web Security Gateway',
      description:
        'Deploy SSL inspection certificates and configure policy to decrypt HTTPS traffic. Coordinate with IT team for certificate deployment and user communication.',
      tags: ['Web', 'Security', 'Best Practice'],
    },
    {
      id: '3',
      priority: 'p3',
      title: 'Plan V-Series Appliance Migration Strategy',
      description:
        'One appliance has reached End-of-Sale. Evaluate cloud migration options (FWaaS, Cloud Email Security) vs. next-gen appliance replacement before EoS date.',
      tags: ['Planning', 'Hardware', 'Migration'],
    },
  ]);

  const addRecommendation = () => {
    const newRec: Recommendation = {
      id: Date.now().toString(),
      priority: 'p3',
      title: 'New Recommendation',
      description: '',
      tags: [],
    };
    setRecommendations([...recommendations, newRec]);
  };

  const removeRecommendation = (id: string) => {
    setRecommendations(recommendations.filter((r) => r.id !== id));
  };

  const updateRecommendation = (id: string, field: keyof Recommendation, value: any) => {
    setRecommendations(recommendations.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      p1: 'border-l-red-600 bg-red-50',
      p2: 'border-l-amber-600 bg-amber-50',
      p3: 'border-l-blue-600 bg-blue-50',
    };
    return colors[priority] || colors.p3;
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, JSX.Element> = {
      p1: (
        <span className="px-3 py-1.5 bg-red-500/10 text-red-700 rounded-lg border-2 border-red-500/20 text-xs font-bold uppercase">
          Priority 1
        </span>
      ),
      p2: (
        <span className="px-3 py-1.5 bg-amber-500/10 text-amber-700 rounded-lg border-2 border-amber-500/20 text-xs font-bold uppercase">
          Priority 2
        </span>
      ),
      p3: (
        <span className="px-3 py-1.5 bg-blue-500/10 text-blue-700 rounded-lg border-2 border-blue-500/20 text-xs font-bold uppercase">
          Priority 3
        </span>
      ),
    };
    return badges[priority] || badges.p3;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-blue-600" />
              </div>
              <div className="font-semibold text-slate-900">Recommendations</div>
            </div>
            <button
              onClick={addRecommendation}
              className="h-9 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-1.5"
            >
              <Plus size={16} />
              Add Recommendation
            </button>
          </div>

          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={rec.id} className={`border-l-4 ${getPriorityColor(rec.priority)} rounded-xl p-4 shadow-sm`}>
                <div className="flex items-start gap-4">
                  {/* Number Badge */}
                  <div className="w-10 h-10 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-bold text-slate-700 flex-shrink-0">
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    {/* Title & Priority */}
                    <div className="flex items-start gap-3">
                      <input
                        type="text"
                        value={rec.title}
                        onChange={(e) => updateRecommendation(rec.id, 'title', e.target.value)}
                        className="flex-1 bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                        placeholder="Recommendation title..."
                      />
                      <select
                        value={rec.priority}
                        onChange={(e) => updateRecommendation(rec.id, 'priority', e.target.value)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase border-2 outline-none cursor-pointer ${
                          rec.priority === 'p1'
                            ? 'bg-red-500/10 text-red-700 border-red-500/20'
                            : rec.priority === 'p2'
                            ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-700 border-blue-500/20'
                        }`}
                      >
                        <option value="p1">Priority 1</option>
                        <option value="p2">Priority 2</option>
                        <option value="p3">Priority 3</option>
                      </select>
                    </div>

                    {/* Description */}
                    <textarea
                      value={rec.description}
                      onChange={(e) => updateRecommendation(rec.id, 'description', e.target.value)}
                      className="w-full bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none resize-vertical min-h-[60px]"
                      placeholder="Describe the recommendation and implementation steps..."
                    />

                    {/* Tags */}
                    <div className="flex gap-2 flex-wrap">
                      {rec.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => removeRecommendation(rec.id)}
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

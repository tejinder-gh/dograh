import React from 'react';
import {
  Calendar,
  Users,
  MessageSquare,
  CreditCard,
  Database,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ToolDefinition, TenantToolInstallation, ToolCategory } from '../../types/marketplace.types';

interface DiscoverToolsViewProps {
  tools: ToolDefinition[];
  installations: TenantToolInstallation[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectTool: (tool: ToolDefinition) => void;
}

const CATEGORIES: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'all', label: 'All Tools', icon: Layers },
  { id: 'scheduling', label: 'Calendaring & Scheduling', icon: Calendar },
  { id: 'crm', label: 'CRM & Leads', icon: Users },
  { id: 'communication', label: 'SMS & Messaging', icon: MessageSquare },
  { id: 'payment', label: 'Payments & Retainers', icon: CreditCard },
  { id: 'knowledge_mcp', label: 'Enterprise MCP', icon: Database },
  { id: 'operations', label: 'Operations & Escalation', icon: ShieldAlert },
];

export const DiscoverToolsView: React.FC<DiscoverToolsViewProps> = ({
  tools,
  installations,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSelectTool,
}) => {
  const installedToolIds = new Set(installations.map((i) => i.toolId));

  const filteredTools = tools.filter((tool) => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.provider.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getToolIcon = (category: ToolCategory) => {
    switch (category) {
      case 'scheduling':
        return <Calendar className="w-6 h-6 text-indigo-600" />;
      case 'crm':
        return <Users className="w-6 h-6 text-blue-600" />;
      case 'communication':
        return <MessageSquare className="w-6 h-6 text-teal-600" />;
      case 'payment':
        return <CreditCard className="w-6 h-6 text-amber-600" />;
      case 'knowledge_mcp':
        return <Database className="w-6 h-6 text-purple-600" />;
      case 'operations':
        return <ShieldAlert className="w-6 h-6 text-rose-600" />;
      default:
        return <Layers className="w-6 h-6 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Pills & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search tools, providers..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Grid of Tools */}
      {filteredTools.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-900">No matching marketplace tools found</h4>
          <p className="text-xs text-slate-500 mt-1">Try refining your category selection or search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTools.map((tool) => {
            const isInstalled = installedToolIds.has(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => onSelectTool(tool)}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-105 transition">
                      {getToolIcon(tool.category)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isInstalled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Installed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition">
                        {tool.name}
                      </h3>
                      {tool.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{tool.description}</p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 capitalize">{tool.provider}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-500 font-semibold uppercase">{tool.minPlanTier}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">
                    Configure <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

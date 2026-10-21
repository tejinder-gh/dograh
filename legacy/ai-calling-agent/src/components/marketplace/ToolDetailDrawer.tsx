import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  Code2,
  AlertTriangle,
  Zap,
  Lock,
} from 'lucide-react';
import { ToolDefinition, TenantToolInstallation, TenantProviderConnection } from '../../types/marketplace.types';

interface ToolDetailDrawerProps {
  tool: ToolDefinition | null;
  installation?: TenantToolInstallation;
  connections: TenantProviderConnection[];
  onClose: () => void;
  onInstall: (toolId: string, connectionId?: string, settings?: Record<string, unknown>) => Promise<void>;
  onUninstall: (installationId: string) => Promise<void>;
}

export const ToolDetailDrawer: React.FC<ToolDetailDrawerProps> = ({
  tool,
  installation,
  connections,
  onClose,
  onInstall,
  onUninstall,
}) => {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    installation?.providerConnectionId || (connections[0]?.id || '')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'capabilities' | 'schemas'>('overview');

  if (!tool) return null;

  const activeVersion = tool.versions?.[0];
  const capabilities = activeVersion?.capabilities || [];
  const compatibleConnections = connections.filter(
    (c) => c.provider === tool.provider || tool.toolType === 'internal_function'
  );

  const handleInstallClick = async () => {
    setIsSubmitting(true);
    try {
      await onInstall(tool.id, selectedConnectionId || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUninstallClick = async () => {
    if (!installation) return;
    setIsSubmitting(true);
    try {
      await onUninstall(installation.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{tool.name}</h2>
                {tool.isVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                provider: {tool.provider} • v{activeVersion?.versionString || '1.0.0'} • tier: {tool.minPlanTier}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 px-6 gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`py-3 border-b-2 transition ${
              activeSubTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview & Setup
          </button>
          <button
            onClick={() => setActiveSubTab('capabilities')}
            className={`py-3 border-b-2 transition ${
              activeSubTab === 'capabilities'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Capabilities ({capabilities.length})
          </button>
          <button
            onClick={() => setActiveSubTab('schemas')}
            className={`py-3 border-b-2 transition ${
              activeSubTab === 'schemas'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Schemas & Policy
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSubTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</h3>
                <p className="mt-2 text-sm text-slate-700 leading-relaxed">{tool.description}</p>
              </div>

              {/* Pricing & Entitlement Badges */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500">Pricing Model</span>
                  <p className="text-sm font-semibold text-slate-900 capitalize">
                    {tool.pricingModel === 'included'
                      ? 'Included with Plan'
                      : `${tool.costPerExecutionCents}¢ / invocation`}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Minimum Plan</span>
                  <p className="text-sm font-semibold text-slate-900 capitalize">{tool.minPlanTier}</p>
                </div>
              </div>

              {/* Provider Connection Selection */}
              {tool.toolType !== 'internal_function' && (
                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Provider Connection
                    </label>
                    <span className="text-xs text-indigo-600 font-medium">Encrypted AES-256</span>
                  </div>
                  {compatibleConnections.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        No credentials connected for provider "{tool.provider}". Create a connection in the
                        "Providers" tab before or after installing.
                      </div>
                    </div>
                  ) : (
                    <select
                      value={selectedConnectionId}
                      onChange={(e) => setSelectedConnectionId(e.target.value)}
                      className="w-full text-sm rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">No connection (Configure later)</option>
                      {compatibleConnections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.connectionName} ({c.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'capabilities' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Callable Functions ({capabilities.length})
              </h3>
              {capabilities.map((cap) => (
                <div key={cap.id} className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-indigo-600" />
                      <span className="font-mono text-sm font-semibold text-slate-900">{cap.functionName}</span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        cap.riskLevel === 'safe_read'
                          ? 'bg-blue-50 text-blue-700'
                          : cap.riskLevel === 'consequential_action' || cap.riskLevel === 'critical_financial'
                          ? 'bg-rose-50 text-rose-700 font-bold'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {cap.riskLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{cap.description}</p>
                  {cap.requiresApproval && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                      <Lock className="w-3.5 h-3.5" />
                      Requires human supervisor sign-off before completing
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'schemas' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Manifest & JSON Schema</h3>
              {capabilities.map((cap) => (
                <div key={cap.id} className="space-y-2">
                  <span className="text-xs font-mono font-bold text-slate-700">{cap.functionName} Input Schema</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                    {JSON.stringify(cap.inputSchema, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {installation ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Installed for Tenant
              </span>
            ) : (
              <span className="text-xs text-slate-500">Ready to install</span>
            )}
          </div>
          <div className="flex gap-3">
            {installation ? (
              <button
                disabled={isSubmitting}
                onClick={handleUninstallClick}
                className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-sm font-semibold transition"
              >
                {isSubmitting ? 'Uninstalling...' : 'Uninstall Tool'}
              </button>
            ) : (
              <button
                disabled={isSubmitting}
                onClick={handleInstallClick}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-xs transition"
              >
                {isSubmitting ? 'Installing...' : 'Install to Tenant'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

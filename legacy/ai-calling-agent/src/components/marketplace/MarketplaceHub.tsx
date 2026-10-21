import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plug,
  Bot,
  BarChart2,
  Activity,
  Layers,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  ToolDefinition,
  TenantToolInstallation,
  TenantProviderConnection,
  AgentToolAssignment,
  SubscriptionEntitlement,
  ToolExecutionLog,
  ToolApprovalRequest,
} from '../../types/marketplace.types';
import { DiscoverToolsView } from './DiscoverToolsView';
import { ToolDetailDrawer } from './ToolDetailDrawer';
import { ConnectedProvidersView } from './ConnectedProvidersView';
import { AgentAssignmentsView } from './AgentAssignmentsView';
import { UsageBillingView } from './UsageBillingView';
import { ExecutionLogsView } from './ExecutionLogsView';
import { getAuthHeaders } from '../../utils/auth-client';

type MarketplaceSubTab = 'discover' | 'connections' | 'agents' | 'usage' | 'logs';

export const MarketplaceHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MarketplaceSubTab>('discover');
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [installations, setInstallations] = useState<TenantToolInstallation[]>([]);
  const [connections, setConnections] = useState<TenantProviderConnection[]>([]);
  const [assignments, setAssignments] = useState<AgentToolAssignment[]>([]);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(null);
  const [usageSummary, setUsageSummary] = useState<any | null>(null);
  const [logs, setLogs] = useState<ToolExecutionLog[]>([]);
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = (): HeadersInit => getAuthHeaders();

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = getHeaders();
      const [catRes, instRes, connRes, usageRes, logsRes, appRes] = await Promise.all([
        fetch('/api/marketplace/catalog', { headers }),
        fetch('/api/marketplace/installations', { headers }),
        fetch('/api/marketplace/connections', { headers }),
        fetch('/api/marketplace/usage', { headers }),
        fetch('/api/marketplace/logs', { headers }),
        fetch('/api/marketplace/approvals', { headers }),
      ]);

      if (catRes.ok) {
        const data = await catRes.json();
        setTools(data.tools || []);
      }
      if (instRes.ok) {
        const data = await instRes.json();
        setInstallations(data.installations || []);
      }
      if (connRes.ok) {
        const data = await connRes.json();
        setConnections(data.connections || []);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        setEntitlement(data.entitlement || null);
        setUsageSummary(data.summary || null);
      }
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
      if (appRes.ok) {
        const data = await appRes.json();
        setApprovals(data.approvals || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Marketplace API.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInstall = async (toolId: string, providerConnectionId?: string) => {
    const res = await fetch('/api/marketplace/installations', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ toolId, providerConnectionId }),
    });
    if (res.ok) {
      await loadData();
      setSelectedTool(null);
    }
  };

  const handleUninstall = async (installationId: string) => {
    const res = await fetch(`/api/marketplace/installations/${installationId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      await loadData();
      setSelectedTool(null);
    }
  };

  const handleAddConnection = async (data: any) => {
    const res = await fetch('/api/marketplace/connections', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await loadData();
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    const res = await fetch(`/api/marketplace/connections/${connectionId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      await loadData();
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    const res = await fetch(`/api/marketplace/connections/${connectionId}/test`, {
      method: 'POST',
      headers: getHeaders(),
    });
    const json = await res.json();
    return json.result;
  };

  const handleAssignTool = async (data: any) => {
    const res = await fetch(`/api/marketplace/agents/${data.agentId}/tools`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      setAssignments((prev) => [...prev.filter((a) => a.id !== json.assignment.id), json.assignment]);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const target = assignments.find((a) => a.id === assignmentId);
    if (!target) return;
    const res = await fetch(`/api/marketplace/agents/${target.agentId}/tools/${assignmentId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    }
  };

  const handleReviewApproval = async (approvalId: string, status: 'approved' | 'rejected', reason?: string) => {
    const res = await fetch(`/api/marketplace/approvals/${approvalId}/review`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    if (res.ok) {
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      await loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Marketplace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Plugin & Tool Marketplace</h1>
            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
              Multi-Tenant OS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Discover, connect, configure, and assign approved external capabilities to calling agents without code changes.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-8 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition ${
            activeTab === 'discover'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> Discover Tools ({tools.length})
        </button>

        <button
          onClick={() => setActiveTab('connections')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition ${
            activeTab === 'connections'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Plug className="w-4 h-4" /> Connected Providers ({connections.length})
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition ${
            activeTab === 'agents'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Bot className="w-4 h-4" /> Agent Assignments
        </button>

        <button
          onClick={() => setActiveTab('usage')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition ${
            activeTab === 'usage'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart2 className="w-4 h-4" /> Quotas & Billing
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition ${
            activeTab === 'logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" /> Execution Logs & Approvals
          {approvals.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          )}
        </button>
      </div>

      {/* Sub-Views */}
      {activeTab === 'discover' && (
        <DiscoverToolsView
          tools={tools}
          installations={installations}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectTool={(tool) => setSelectedTool(tool)}
        />
      )}

      {activeTab === 'connections' && (
        <ConnectedProvidersView
          connections={connections}
          onRefresh={loadData}
          onAddConnection={handleAddConnection}
          onDeleteConnection={handleDeleteConnection}
          onTestConnection={handleTestConnection}
        />
      )}

      {activeTab === 'agents' && (
        <AgentAssignmentsView
          installations={installations}
          assignments={assignments}
          onAssignTool={handleAssignTool}
          onRemoveAssignment={handleRemoveAssignment}
        />
      )}

      {activeTab === 'usage' && (
        <UsageBillingView entitlement={entitlement} usageSummary={usageSummary} />
      )}

      {activeTab === 'logs' && (
        <ExecutionLogsView
          logs={logs}
          approvals={approvals}
          onReviewApproval={handleReviewApproval}
          onRefresh={loadData}
        />
      )}

      {/* Drawer */}
      {selectedTool && (
        <ToolDetailDrawer
          tool={selectedTool}
          installation={installations.find((i) => i.toolId === selectedTool.id)}
          connections={connections}
          onClose={() => setSelectedTool(null)}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
        />
      )}
    </div>
  );
};

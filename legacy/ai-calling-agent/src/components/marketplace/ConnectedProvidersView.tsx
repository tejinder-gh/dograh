import React, { useState } from 'react';
import {
  Plug,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
  ExternalLink,
  Shield,
  Activity,
} from 'lucide-react';
import { TenantProviderConnection } from '../../types/marketplace.types';

interface ConnectedProvidersViewProps {
  connections: TenantProviderConnection[];
  onRefresh: () => Promise<void>;
  onAddConnection: (data: {
    provider: string;
    connectionName: string;
    authType: 'oauth2' | 'api_key' | 'mcp_endpoint';
    rawCredentials?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  onDeleteConnection: (connectionId: string) => Promise<void>;
  onTestConnection: (connectionId: string) => Promise<{ success: boolean; latencyMs: number; message: string }>;
}

export const ConnectedProvidersView: React.FC<ConnectedProvidersViewProps> = ({
  connections,
  onRefresh,
  onAddConnection,
  onDeleteConnection,
  onTestConnection,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provider, setProvider] = useState('google_workspace');
  const [connectionName, setConnectionName] = useState('');
  const [authType, setAuthType] = useState<'oauth2' | 'api_key' | 'mcp_endpoint'>('api_key');
  const [rawCredentials, setRawCredentials] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { testing: boolean; result?: { success: boolean; latencyMs: number; message: string } }>>({});

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: { testing: true } }));
    try {
      const res = await onTestConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: { testing: false, result: res } }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          testing: false,
          result: { success: false, latencyMs: 0, message: err instanceof Error ? err.message : 'Test failed' },
        },
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionName) return;
    setIsSubmitting(true);
    try {
      await onAddConnection({
        provider,
        connectionName,
        authType,
        rawCredentials: rawCredentials || undefined,
        metadata: endpointUrl ? { endpointUrl } : {},
      });
      setIsModalOpen(false);
      setConnectionName('');
      setRawCredentials('');
      setEndpointUrl('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Provider Connections</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage authenticated third-party connections and encrypted credentials. Secrets are never exposed to LLMs.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
        >
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {/* Connections List */}
      {connections.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-slate-200">
          <Plug className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-900">No active provider connections</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Connect your Google Workspace, Twilio, Salesforce, or MCP endpoints to allow agents to execute actions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const testState = testResults[conn.id];
            return (
              <div key={conn.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                      <Plug className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{conn.connectionName}</h4>
                      <p className="text-xs font-mono text-slate-500 capitalize">{conn.provider} • {conn.authType}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      conn.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {conn.status === 'connected' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {conn.status}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Credentials:</span>
                    <span className="font-mono font-bold text-slate-800">••••••••••••••••</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                    AES-256-GCM
                  </span>
                </div>

                {testState?.result && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${
                      testState.result.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    <span>{testState.result.message}</span>
                    {testState.result.latencyMs > 0 && (
                      <span className="font-mono font-bold">{testState.result.latencyMs}ms</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    disabled={testState?.testing}
                    onClick={() => handleTest(conn.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                  >
                    <Activity className={`w-3.5 h-3.5 ${testState?.testing ? 'animate-spin' : ''}`} />
                    {testState?.testing ? 'Testing...' : 'Test Connection'}
                  </button>

                  <button
                    onClick={() => onDeleteConnection(conn.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-md hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Connection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900">Add Provider Connection</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                >
                  <option value="google_workspace">Google Workspace / Calendar</option>
                  <option value="salesforce">Salesforce CRM</option>
                  <option value="twilio">Twilio Telephony & SMS</option>
                  <option value="stripe">Stripe Payments</option>
                  <option value="anthropic_mcp">Model Context Protocol (MCP)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Connection Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Primary Google Calendar"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Auth Type</label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as any)}
                  className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                >
                  <option value="api_key">API Key / Secret Token</option>
                  <option value="oauth2">OAuth2 Credentials</option>
                  <option value="mcp_endpoint">MCP Endpoint URL & Bearer</option>
                </select>
              </div>

              {authType === 'mcp_endpoint' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">MCP Server URL</label>
                  <input
                    type="url"
                    placeholder="https://mcp.internal.org/rpc"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Secret Credentials</label>
                <input
                  type="password"
                  placeholder="Paste API Key or Token (Stored with AES-256-GCM)"
                  value={rawCredentials}
                  onChange={(e) => setRawCredentials(e.target.value)}
                  className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Encrypted securely before database write. Never returned in plaintext.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {isSubmitting ? 'Encrypting & Saving...' : 'Save Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

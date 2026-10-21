import React, { useState } from 'react';
import { Bot, Layers, Check, Plus, Trash2, Sliders, Shield } from 'lucide-react';
import { TenantToolInstallation, AgentToolAssignment } from '../../types/marketplace.types';

interface AgentAssignmentsViewProps {
  installations: TenantToolInstallation[];
  assignments: AgentToolAssignment[];
  onAssignTool: (data: {
    agentId: string;
    toolInstallationId: string;
    maxCallsPerSession?: number;
  }) => Promise<void>;
  onRemoveAssignment: (assignmentId: string) => Promise<void>;
}

// Default demonstration agent profiles for assignment interface
const SAMPLE_AGENTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Inbound Concierge Agent', role: 'Frontline Inbound Reception' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Outbound BDR Qualification Agent', role: 'Lead Qualification & Discovery' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'VIP Retention & Escalation Specialist', role: 'High-Urgency Complaint Resolution' },
];

export const AgentAssignmentsView: React.FC<AgentAssignmentsViewProps> = ({
  installations,
  assignments,
  onAssignTool,
  onRemoveAssignment,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState(SAMPLE_AGENTS[0].id);
  const [selectedInstallationId, setSelectedInstallationId] = useState(installations[0]?.id || '');
  const [maxCalls, setMaxCalls] = useState(10);
  const [isAssigning, setIsAssigning] = useState(false);

  const currentAgent = SAMPLE_AGENTS.find((a) => a.id === selectedAgentId) || SAMPLE_AGENTS[0];
  const agentAssignments = assignments.filter((a) => a.agentId === selectedAgentId);
  const assignedInstallationIds = new Set(agentAssignments.map((a) => a.toolInstallationId));

  const handleAssign = async () => {
    if (!selectedInstallationId) return;
    setIsAssigning(true);
    try {
      await onAssignTool({
        agentId: selectedAgentId,
        toolInstallationId: selectedInstallationId,
        maxCallsPerSession: maxCalls,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Agent Capability Assignments</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Assign installed tools to specific AI agents. Only assigned tools are exposed during a live call session.
          </p>
        </div>

        {/* Agent Selector */}
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-600" />
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"
          >
            {SAMPLE_AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned Tools for Active Agent */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Assigned Capabilities</h4>
                <p className="text-xs text-slate-500">Active tools for {currentAgent.name}</p>
              </div>
              <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                {agentAssignments.length} Assigned
              </span>
            </div>

            {agentAssignments.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Sliders className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-600">No tools assigned to this agent yet.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Use the panel on the right to grant permissions to installed tools.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {agentAssignments.map((assignment) => {
                  const inst = installations.find((i) => i.id === assignment.toolInstallationId);
                  const toolName = inst?.tool?.name || 'Assigned Tool';
                  return (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{toolName}</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded">
                              Authorized
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Limit: {assignment.maxCallsPerSession} calls/session
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onRemoveAssignment(assignment.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-md hover:bg-rose-50"
                        title="Revoke capability"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Assign New Tool Panel */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Grant Tool Access</h4>

            {installations.length === 0 ? (
              <p className="text-xs text-slate-500">
                No tools installed for this tenant. Visit the "Discover" tab to install tools first.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">Installed Tool</label>
                  <select
                    value={selectedInstallationId}
                    onChange={(e) => setSelectedInstallationId(e.target.value)}
                    className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                  >
                    {installations.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.tool?.name || inst.toolId} {assignedInstallationIds.has(inst.id) ? '(Already Assigned)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase">Max Invocations Per Session</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={maxCalls}
                    onChange={(e) => setMaxCalls(parseInt(e.target.value, 10) || 10)}
                    className="w-full text-xs mt-1 p-2.5 border border-slate-300 rounded-lg"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Prevents runaway loops during live conversational sessions.
                  </span>
                </div>

                <button
                  disabled={isAssigning || !selectedInstallationId || assignedInstallationIds.has(selectedInstallationId)}
                  onClick={handleAssign}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs transition mt-2"
                >
                  {isAssigning
                    ? 'Assigning...'
                    : assignedInstallationIds.has(selectedInstallationId)
                    ? 'Already Assigned'
                    : 'Assign to Agent'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

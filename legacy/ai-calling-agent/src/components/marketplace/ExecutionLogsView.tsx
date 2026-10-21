import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Check,
  X,
  Code,
  Lock,
} from 'lucide-react';
import { ToolExecutionLog, ToolApprovalRequest } from '../../types/marketplace.types';

interface ExecutionLogsViewProps {
  logs: ToolExecutionLog[];
  approvals: ToolApprovalRequest[];
  onReviewApproval: (approvalId: string, status: 'approved' | 'rejected', reason?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const ExecutionLogsView: React.FC<ExecutionLogsViewProps> = ({
  logs,
  approvals,
  onReviewApproval,
  onRefresh,
}) => {
  const [selectedLog, setSelectedLog] = useState<ToolExecutionLog | null>(null);
  const [isReviewing, setIsReviewing] = useState<string | null>(null);

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    setIsReviewing(id);
    try {
      await onReviewApproval(id, status);
    } finally {
      setIsReviewing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        );
      case 'blocked_entitlement':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> Quota Blocked
          </span>
        );
      case 'rejected_approval':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200">
            <Lock className="w-3 h-3" /> Approval Required
          </span>
        );
      case 'timeout':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-full border border-orange-200">
            <Clock className="w-3 h-3" /> Timeout
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200">
            <AlertTriangle className="w-3 h-3" /> Failed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Consequential Action Approval Queue */}
      {approvals.length > 0 && (
        <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <h4 className="text-sm font-bold text-amber-950">
                Pending Consequential Action Approvals ({approvals.length})
              </h4>
            </div>
            <span className="text-xs text-amber-700 font-medium">Human-in-the-Loop Gate</span>
          </div>

          <div className="space-y-3">
            {approvals.map((req) => (
              <div
                key={req.id}
                className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">{req.toolName}</span>
                    <span className="font-mono text-xs text-indigo-600 font-semibold">• {req.capabilityName}</span>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-600 mt-2 bg-slate-50 p-2 rounded-md border border-slate-200">
                    {JSON.stringify(req.sanitizedArguments)}
                  </pre>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Requested: {new Date(req.requestedAt).toLocaleTimeString()} • Session: {req.sessionId}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={isReviewing === req.id}
                    onClick={() => handleReview(req.id, 'rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    disabled={isReviewing === req.id}
                    onClick={() => handleReview(req.id, 'approved')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve & Execute
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Execution Audit Trail</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable telemetry across native adapters, internal tools, and MCP queries.
            </p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No execution logs recorded yet. Invocations from voice calls or workflows will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-5">Timestamp</th>
                  <th className="py-3 px-5">Tool & Function</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Duration</th>
                  <th className="py-3 px-5 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-5 text-slate-500 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-5">
                      <div className="font-bold text-slate-900">{log.toolName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{log.capabilityName}</div>
                    </td>
                    <td className="py-3 px-5">{getStatusBadge(log.status)}</td>
                    <td className="py-3 px-5 font-mono text-slate-600">{log.durationMs}ms</td>
                    <td className="py-3 px-5 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
                      >
                        <Code className="w-3.5 h-3.5" /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Payload Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{selectedLog.toolName} • {selectedLog.capabilityName}</h4>
                <p className="text-xs text-slate-400 font-mono">Session: {selectedLog.sessionId}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-slate-600 uppercase">Sanitized Input Arguments</span>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono mt-1 overflow-x-auto max-h-40">
                  {JSON.stringify(selectedLog.sanitizedInput, null, 2)}
                </pre>
              </div>

              {selectedLog.sanitizedOutput && (
                <div>
                  <span className="text-xs font-bold text-slate-600 uppercase">Provider Response Output</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono mt-1 overflow-x-auto max-h-40">
                    {JSON.stringify(selectedLog.sanitizedOutput, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  <span className="font-bold">Error Message:</span> {selectedLog.errorMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

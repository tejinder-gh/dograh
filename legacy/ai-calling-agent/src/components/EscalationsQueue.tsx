import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Phone,
  MessageSquare,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { EscalationTicket, CustomerContact } from '../types';

interface EscalationsQueueProps {
  escalations: EscalationTicket[];
  contacts: CustomerContact[];
  onResolveEscalation: (id: string, notes: string) => void;
  onInitiateCall: (contactId: string) => void;
}

export const EscalationsQueue: React.FC<EscalationsQueueProps> = ({
  escalations,
  contacts,
  onResolveEscalation,
  onInitiateCall,
}) => {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const displayedTickets = escalations.filter((e) =>
    filter === 'pending' ? e.status !== 'resolved' : true
  );

  const handleResolve = (id: string) => {
    onResolveEscalation(id, resolutionNote.trim() || 'Supervisor intervened and resolved issue directly with client.');
    setActiveTicketId(null);
    setResolutionNote('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Automated Sentiment & Urgent Escalations Queue
            </h2>
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              SLA Priority Queue
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Real-time sentiment monitoring intercepts customer distress or churn risks on voice and text, dispatching supervisor alerts before client relationships degrade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                filter === 'pending' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Action Required ({escalations.filter((e) => e.status !== 'resolved').length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              All Logs ({escalations.length})
            </button>
          </div>
        </div>
      </div>

      {/* Escalation Cards List */}
      <div className="space-y-4">
        {displayedTickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-900">All Escalations Resolved</h3>
            <p className="text-xs text-slate-500 mt-1">
              Customer sentiment is currently stable across all live voice and multichannel text threads.
            </p>
          </div>
        ) : (
          displayedTickets.map((ticket) => {
            const contact = contacts.find((c) => c.id === ticket.contactId);
            const isCritical = ticket.urgencyLevel === 'critical';
            const isResolved = ticket.status === 'resolved';

            return (
              <div
                key={ticket.id}
                className={`p-5 bg-white rounded-xl border shadow-xs transition-all ${
                  isResolved
                    ? 'border-slate-200 opacity-75'
                    : isCritical
                    ? 'border-rose-300 ring-1 ring-rose-200'
                    : 'border-amber-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isResolved
                          ? 'bg-slate-100 text-slate-500'
                          : isCritical
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-amber-100 text-amber-600'
                      }`}
                    >
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">
                          {ticket.contactName}
                        </h4>
                        <span className="text-xs text-slate-500">· {ticket.customerCompany}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 capitalize">
                        Channel: {ticket.channel.replace('_', ' ')} · Triggered{' '}
                        {new Date(ticket.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded capitalize ${
                        isCritical ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {ticket.urgencyLevel} Urgency
                    </span>
                    <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Sentiment: {ticket.sentimentScore}
                    </span>
                    <span className="text-xs font-mono text-slate-600 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      SLA: {ticket.slaMinutesRemaining}m target
                    </span>
                  </div>
                </div>

                {/* Reason & Content */}
                <div className="py-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Automated Trigger Diagnostic:
                  </span>
                  <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {ticket.triggerReason}
                  </p>
                </div>

                {/* Resolution notes if resolved */}
                {ticket.supervisorNotes && (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-xs text-emerald-900">
                    <span className="font-bold">Supervisor Action:</span> {ticket.supervisorNotes}
                  </div>
                )}

                {/* Actions */}
                {!isResolved && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      {contact && (
                        <button
                          onClick={() => onInitiateCall(contact.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors shadow-xs"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Direct Call Escalation Handoff</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeTicketId === ticket.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Supervisor intervention notes..."
                            value={resolutionNote}
                            onChange={(e) => setResolutionNote(e.target.value)}
                            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-64 bg-slate-50"
                          />
                          <button
                            onClick={() => handleResolve(ticket.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors"
                          >
                            Save & Close
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveTicketId(ticket.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

import React from 'react';
import {
  Calendar,
  ShieldCheck,
  Smile,
  Users,
  AlertTriangle,
  CheckCircle2,
  BarChart2
} from 'lucide-react';
import { CustomerContact, InteractionLog, ScheduledSession, EscalationTicket } from '../types';

interface AnalyticsDashboardProps {
  contacts: CustomerContact[];
  interactions: InteractionLog[];
  sessions: ScheduledSession[];
  escalations: EscalationTicket[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  contacts,
  interactions,
  sessions,
  escalations,
}) => {
  const totalInteractions = interactions.length;
  const totalCalls = interactions.filter((i) => i.channel.startsWith('call')).length;
  const totalBookings = sessions.length;

  const hasInteractions = totalInteractions > 0;
  const avgSentiment = hasInteractions
    ? Math.round(interactions.reduce((acc, i) => acc + i.sentimentScore, 0) / totalInteractions)
    : null;

  const qualifiedLeads = contacts.filter((c) => (c.leadScore ?? 0) >= 60).length;
  const resolvedEscalations = escalations.filter((e) => e.status === 'resolved').length;
  const pendingEscalations = escalations.filter((e) => e.status !== 'resolved').length;

  // Real First Contact Resolution calculation
  const nonEscalatedInteractions = interactions.filter((i) => !i.wasEscalated).length;
  const fcrPercentage = hasInteractions
    ? Math.round((nonEscalatedInteractions / totalInteractions) * 100)
    : null;

  // Channel breakdown calculated from genuine records
  const inboundCalls = interactions.filter((i) => i.channel === 'call_inbound').length;
  const outboundCalls = interactions.filter((i) => i.channel === 'call_outbound').length;
  const whatsappMsgs = interactions.filter((i) => i.channel === 'whatsapp').length;
  const smsAndChatMsgs = interactions.filter((i) => i.channel === 'sms' || i.channel === 'webchat').length;

  const inboundPct = hasInteractions ? Math.round((inboundCalls / totalInteractions) * 100) : 0;
  const outboundPct = hasInteractions ? Math.round((outboundCalls / totalInteractions) * 100) : 0;
  const whatsappPct = hasInteractions ? Math.round((whatsappMsgs / totalInteractions) * 100) : 0;
  const smsChatPct = hasInteractions ? Math.round((smsAndChatMsgs / totalInteractions) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Performance & Customer Engagement Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Real-time telemetry aggregated directly from verified PostgreSQL call transcripts, sentiment scoring, and booking records.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Database Sync
          </span>
        </div>
      </div>

      {/* Empty State Banner when no records exist */}
      {!hasInteractions && contacts.length === 0 && (
        <div className="p-8 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <BarChart2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No telemetry recorded yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Place an inbound call in Call Studio or upload a CSV lead list to generate genuine interaction metrics and sentiment telemetry.
          </p>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: 1-on-1 Sessions Booked */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sessions Booked
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {totalBookings}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {contacts.length > 0
              ? `${Math.round((totalBookings / contacts.length) * 100)}% lead-to-booking conversion`
              : 'Awaiting lead engagement'}
          </p>
        </div>

        {/* Metric 2: Average Sentiment */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Avg Real-Time Sentiment
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Smile className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {avgSentiment !== null ? `${avgSentiment > 0 ? '+' : ''}${avgSentiment} / 100` : '--'}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {hasInteractions ? `Calculated from ${totalInteractions} interactions` : 'No interactions recorded yet'}
          </p>
        </div>

        {/* Metric 3: First Contact Resolution */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              First Contact Resolution (FCR)
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {fcrPercentage !== null ? `${fcrPercentage}%` : '--'}
          </div>
          <p className="text-[11px] text-slate-500">
            {hasInteractions ? `${nonEscalatedInteractions} resolved without escalation` : 'No interactions to evaluate'}
          </p>
        </div>

        {/* Metric 4: Qualified Leads */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              BANT Qualified Leads
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {qualifiedLeads} / {contacts.length}
          </div>
          <p className="text-[11px] text-purple-600 font-medium">
            {contacts.length > 0
              ? `${Math.round((qualifiedLeads / contacts.length) * 100)}% pipeline qualification rate`
              : 'No leads in CRM'}
          </p>
        </div>
      </div>

      {/* Middle Grid: Channel Volume Breakdown & Empathy Pillar Efficacy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Volume */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Omnichannel Inquiries Handled
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Total: {totalInteractions} sessions
            </span>
          </div>

          {hasInteractions ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Inbound Voice Telephony ({inboundCalls})</span>
                  <span className="font-mono tabular-nums">{inboundPct}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${inboundPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Outbound Voice Calls ({outboundCalls})</span>
                  <span className="font-mono tabular-nums">{outboundPct}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${outboundPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>WhatsApp Business ({whatsappMsgs})</span>
                  <span className="font-mono tabular-nums">{whatsappPct}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${whatsappPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>SMS & Web Chat ({smsAndChatMsgs})</span>
                  <span className="font-mono tabular-nums">{smsChatPct}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${smsChatPct}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No channel activity recorded yet.
            </div>
          )}
        </div>

        {/* Empathy Consistency & Escalation Metrics */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Escalation & Safety Safeguards
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Active Alerts: {pendingEscalations}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-3 text-xs border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Escalations Flagged:</span>
              <span className="font-bold font-mono text-slate-900">{escalations.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Resolved by Supervisors:</span>
              <span className="font-bold font-mono text-emerald-600">{resolvedEscalations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Pending Resolution:</span>
              <span className="font-bold font-mono text-rose-600">{pendingEscalations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Escalation Containment:</span>
              <span className="font-bold font-mono text-indigo-700">
                {hasInteractions ? `${Math.round(((totalInteractions - pendingEscalations) / totalInteractions) * 100)}% contained` : '--'}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Every customer inquiry is evaluated against three core pillars:
            1. Active Validation & Empathy; 2. Strict Grounded Fact Retrieval; 3. Proactive 1-on-1 Consultation Booking.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MessageSquare,
  Calendar,
  Clock,
  TrendingUp,
  FileText,
  CheckCircle2,
  Tag,
  ArrowRight
} from 'lucide-react';
import { CustomerContact, InteractionLog, CompanyRepresentative, ScheduledSession } from '../types';
import { formatCallDuration, getSentimentCategory } from '../utils/agent-logic';

interface CrmDirectoryProps {
  contacts: CustomerContact[];
  interactions: InteractionLog[];
  representatives: CompanyRepresentative[];
  onOpenBookingModal: (contactId?: string) => void;
  onInitiateCall: (contactId: string) => void;
  onUpdateContactNotes: (contactId: string, notes: string) => void;
}

export const CrmDirectory: React.FC<CrmDirectoryProps> = ({
  contacts,
  interactions,
  representatives,
  onOpenBookingModal,
  onInitiateCall,
  onUpdateContactNotes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedContactId, setSelectedContactId] = useState<string>(contacts[0]?.id || '');
  const [newNote, setNewNote] = useState('');

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.role && c.role.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedContact =
    contacts.find((c) => c.id === selectedContactId) || filteredContacts[0] || contacts[0];

  const contactInteractions = interactions.filter(
    (i) => i.contactId === selectedContact?.id
  );

  const handleAddNote = () => {
    if (!newNote.trim() || !selectedContact) return;
    const updatedNotes = selectedContact.notes
      ? `${selectedContact.notes}\n[${new Date().toLocaleDateString()}]: ${newNote.trim()}`
      : `[${new Date().toLocaleDateString()}]: ${newNote.trim()}`;
    onUpdateContactNotes(selectedContact.id, updatedNotes);
    setNewNote('');
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            CRM & Lead Interaction Tracking
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            360° lead profiles, automated call transcripts, BANT qualification, and complete interaction histories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search leads, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-52"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="qualified">Qualified</option>
            <option value="nurturing">Nurturing</option>
            <option value="booked">Booked (1-on-1)</option>
            <option value="contacted">Contacted</option>
            <option value="new">New</option>
          </select>

          <button
            onClick={() => onOpenBookingModal()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book 1-on-1 Session</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Contact List + 360 Detail Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Lead Directory Table/Cards (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs font-bold text-slate-800">
            <span>Leads & Accounts ({filteredContacts.length})</span>
            <span className="font-normal text-slate-500 text-[11px]">Ranked by BANT Score</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-semibold text-slate-800">No Leads Found</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Upload a CSV through Lead Matcher or wait for inbound calls.
                </p>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContact?.id === contact.id;
              return (
                <div
                  key={contact.id}
                  onClick={() => setSelectedContactId(contact.id)}
                  className={`p-4 transition-colors cursor-pointer flex items-start gap-3 ${
                    isSelected ? 'bg-indigo-50/50 border-l-2 border-indigo-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={contact.avatar}
                    alt={contact.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {contact.name}
                      </h4>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 tabular-nums">
                        {contact.leadScore}/100
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      {contact.role} · <span className="font-semibold text-slate-800">{contact.company}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded capitalize ${
                          contact.status === 'booked'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : contact.status === 'qualified'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : contact.status === 'nurturing'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {contact.status}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 font-mono">{contact.estimatedValue}</span>
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>

        {/* Right Column: 360° Lead View & History Timeline (7 cols) */}
        {selectedContact ? (
          <div className="lg:col-span-7 space-y-6">
            {/* Lead Profile Banner */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={selectedContact.avatar}
                    alt={selectedContact.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">{selectedContact.name}</h3>
                      <span className="text-xs font-semibold font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        BANT: {selectedContact.leadScore}/100
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {selectedContact.role} at <span className="font-semibold">{selectedContact.company}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono text-slate-500">
                      <span>{selectedContact.email}</span>
                      <span>·</span>
                      <span>{selectedContact.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onInitiateCall(selectedContact.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Call Lead</span>
                  </button>

                  <button
                    onClick={() => onOpenBookingModal(selectedContact.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Book 1-on-1 Session</span>
                  </button>
                </div>
              </div>

              {/* BANT Qualification Breakdown Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Budget Allocation
                  </span>
                  <p className="text-xs text-slate-800 font-medium mt-0.5">
                    {selectedContact.bant?.budget || 'Under discovery'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Decision Authority
                  </span>
                  <p className="text-xs text-slate-800 font-medium capitalize mt-0.5">
                    {selectedContact.bant?.authority.replace('_', ' ') || 'Primary Stakeholder'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Core Operational Need
                  </span>
                  <p className="text-xs text-slate-800 font-medium mt-0.5">
                    {selectedContact.bant?.need || 'Enterprise automation'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Target Deployment Timeline
                  </span>
                  <p className="text-xs text-slate-800 font-medium mt-0.5">
                    {selectedContact.bant?.timeline || 'Immediate Q4'}
                  </p>
                </div>
              </div>

              {/* CRM Lead Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Representative & AI Agent Notes
                </label>
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-line leading-relaxed mb-2">
                  {selectedContact.notes || 'No notes logged yet.'}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add quick CRM observation or action item..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNote();
                    }}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                  <button
                    onClick={handleAddNote}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Add Note
                  </button>
                </div>
              </div>
            </div>

            {/* Omnichannel Interaction History Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Omnichannel Interaction History ({contactInteractions.length})
                </h4>
                <span className="text-xs text-slate-500">Live Telephony & Text Logs</span>
              </div>

              {contactInteractions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No interactions recorded yet for this lead. Initiate an inbound or outbound call from the Studio to log data automatically.
                </div>
              ) : (
                <div className="space-y-4">
                  {contactInteractions.map((log) => {
                    const sentimentCat = getSentimentCategory(log.sentimentScore);
                    return (
                      <div
                        key={log.id}
                        className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900 capitalize">
                              {log.channel.replace('_', ' ')}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs font-mono text-slate-500">
                              Duration: {formatCallDuration(log.durationSeconds)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded capitalize ${
                                sentimentCat === 'positive'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : sentimentCat === 'neutral'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              Sentiment: {log.sentimentScore > 0 ? `+${log.sentimentScore}` : log.sentimentScore}
                            </span>
                            {log.wasEscalated && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600 text-white">
                                Escalated
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          {log.summary}
                        </p>

                        {/* Transcript disclosure */}
                        {log.transcript && log.transcript.length > 0 && (
                          <details className="text-xs">
                            <summary className="font-medium text-indigo-600 cursor-pointer hover:underline text-[11px]">
                              View Full Call Transcript ({log.transcript.length} turns)
                            </summary>
                            <div className="mt-2 p-3 bg-white rounded-lg border border-slate-200 space-y-2 max-h-48 overflow-y-auto">
                              {log.transcript.map((t, idx) => (
                                <div key={idx} className="text-[11px] leading-relaxed">
                                  <span className="font-semibold text-slate-800">
                                    {t.speaker === 'agent' ? 'AI Agent' : selectedContact.name}:
                                  </span>{' '}
                                  <span className="text-slate-600">{t.text}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">No Lead Selected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Select a contact from the directory to review their 360° profile, BANT scores, and audit timeline.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

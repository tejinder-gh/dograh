import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  User,
  Building,
  CheckCircle2,
  Plus,
  Mail,
  Video,
  FileText,
  UserCheck,
  ExternalLink,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ScheduledSession, CompanyRepresentative, CustomerContact } from '../types';
import { getAuthHeaders } from '../utils/auth-client';

interface BookingsViewProps {
  sessions: ScheduledSession[];
  representatives: CompanyRepresentative[];
  contacts: CustomerContact[];
  onOpenBookingModal: () => void;
  onUpdateSessionStatus: (sessionId: string, status: 'confirmed' | 'rescheduled' | 'completed' | 'cancelled') => void;
  googleUser?: any | null;
  googleToken?: string | null;
  onGoogleSignIn?: () => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({
  sessions,
  representatives,
  contacts,
  onOpenBookingModal,
  onUpdateSessionStatus,
  googleUser,
  googleToken,
  onGoogleSignIn,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [isFetchingCalendar, setIsFetchingCalendar] = useState<boolean>(false);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [showCalendarPreview, setShowCalendarPreview] = useState<boolean>(false);

  const filteredSessions = sessions.filter((s) => {
    if (filterType === 'all') return true;
    return s.status === filterType;
  });

  const handleFetchGoogleCalendarAvailability = async () => {
    setIsFetchingCalendar(true);
    try {
      const res = await fetch('/api/calendar/availability', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ accessToken: googleToken || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
        setShowCalendarPreview(true);
      }
    } catch (err) {
      console.error('Failed to fetch calendar availability:', err);
    } finally {
      setIsFetchingCalendar(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Row */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              1-on-1 Personalized Lead Nurturing Sessions
            </h2>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
              Primary Goal Hub
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Sessions autonomously booked by the AI agent during inbound inquiries and outbound calls, pairing qualified prospects 
            with company experts and synchronizing event details straight to Google Calendar.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleFetchGoogleCalendarAvailability}
            disabled={isFetchingCalendar}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isFetchingCalendar ? 'animate-spin' : ''}`} />
            <span>Check Calendar Availability</span>
          </button>

          <button
            onClick={onOpenBookingModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule New Session</span>
          </button>
        </div>
      </div>

      {/* Google Calendar Connection Status Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-4 text-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>Google Calendar Real-Time Synchronization</span>
                {googleUser ? (
                  <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2 py-0.2 rounded border border-emerald-800">
                    CONNECTED: {googleUser.email}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono bg-amber-950 text-amber-300 px-2 py-0.2 rounded border border-amber-800">
                    DIRECT CALENDAR LINKS ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Every booking dynamically attaches the full AI customer conversation summary, BANT metrics, and Google Meet video conferencing.
              </p>
            </div>
          </div>

          {!googleUser && onGoogleSignIn && (
            <button
              onClick={onGoogleSignIn}
              className="px-3.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-xs"
            >
              Sign in to Connect Calendar
            </button>
          )}
        </div>
      </div>

      {/* Live Calendar Availability Drawer */}
      {showCalendarPreview && (
        <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-xs">
                Real-Time Calendar Availability & Scheduled Slots
              </h3>
            </div>
            <button
              onClick={() => setShowCalendarPreview(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {calendarEvents.slice(0, 6).map((ev: any, idx: number) => (
              <div
                key={ev.id || idx}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1"
              >
                <div className="font-semibold text-slate-900 truncate">
                  {ev.summary || 'Scheduled Calendar Slot'}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Flexible Business Hours'}
                </div>
                <span className="inline-block text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-100">
                  Google Calendar Verified
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Representative Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {representatives.map((rep) => (
          <div
            key={rep.id}
            className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-4"
          >
            <img
              src={rep.avatar}
              alt={rep.name}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm truncate">{rep.name}</h3>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Active Pairing
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{rep.role}</p>
              <p className="text-[11px] text-indigo-700 font-medium mt-1">{rep.specialization}</p>

              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">Open Slots:</span>
                {rep.availableSlots.slice(0, 3).map((slot) => (
                  <span
                    key={slot}
                    className="font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-700 text-[10px]"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
              filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Bookings ({sessions.length})
          </button>
          <button
            onClick={() => setFilterType('confirmed')}
            className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
              filterType === 'confirmed' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Confirmed
          </button>
          <button
            onClick={() => setFilterType('completed')}
            className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
              filterType === 'completed' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Booked Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSessions.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">No Scheduled Sessions</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {filterType === 'all'
                ? 'No sessions currently booked in this organization. When inbound or outbound calls convert prospects, confirmed meetings appear here.'
                : `No sessions found with status "${filterType}".`}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition-colors"
            >
            {/* Header: Date, Format, Status */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900">
                  {session.meetingType}
                </span>
                <div className="flex items-center gap-2 mt-1 text-xs font-mono text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{session.date}</span>
                  <span>·</span>
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{session.timeSlot}</span>
                </div>
              </div>

              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded capitalize ${
                  session.status === 'confirmed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : session.status === 'completed'
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {session.status}
              </span>
            </div>

            {/* Stakeholders: Customer + Rep */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-xs border border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Prospect Lead</span>
                <p className="font-semibold text-slate-900 mt-0.5">{session.contactName}</p>
                <p className="text-slate-500 text-[11px]">{session.company}</p>
                <p className="font-mono text-slate-400 text-[10px] mt-0.5">{session.contactEmail}</p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Assigned Expert</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <img
                    src={session.representativeAvatar}
                    alt={session.representativeName}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                  <p className="font-semibold text-slate-900">{session.representativeName}</p>
                </div>
                <p className="text-slate-500 text-[11px] truncate">{session.representativeRole}</p>
              </div>
            </div>

            {/* AI Preparation Brief & Attraction Takeaways */}
            <div>
              <span className="text-[11px] font-bold text-slate-500">AI Preparation & Attraction Summary:</span>
              <p className="text-xs text-slate-700 mt-0.5 leading-relaxed bg-white p-2.5 rounded border border-slate-200 whitespace-pre-line font-sans max-h-36 overflow-y-auto">
                {session.agendaNotes}
              </p>
            </div>

            {/* Footer with Google Calendar link and status toggles */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
              {session.googleCalendarLink ? (
                <a
                  href={session.googleCalendarLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-[11px]"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Open in Google Calendar</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>Calendar Invite Dispatched</span>
                </span>
              )}

              <div className="flex items-center gap-1.5 ml-auto">
                {session.status === 'confirmed' && (
                  <button
                    onClick={() => onUpdateSessionStatus(session.id, 'completed')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
          </div>
        )))}
      </div>
    </div>
  );
};

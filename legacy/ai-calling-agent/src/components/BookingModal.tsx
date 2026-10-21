import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Building,
  Mail,
  Video,
  ExternalLink,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import {
  CustomerContact,
  CompanyRepresentative,
  ScheduledSession,
  ClientCompanyDomain
} from '../types';
import { getAuthHeaders } from '../utils/auth-client';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: CustomerContact[];
  representatives: CompanyRepresentative[];
  defaultContactId?: string;
  defaultRepId?: string;
  onBookingCreated: (session: ScheduledSession) => void;
  activeDomain?: ClientCompanyDomain;
  googleToken?: string | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  contacts,
  representatives,
  defaultContactId,
  defaultRepId,
  onBookingCreated,
  activeDomain,
  googleToken,
}) => {
  const [selectedContactId, setSelectedContactId] = useState<string>(
    defaultContactId || (contacts[0]?.id ?? '')
  );
  const [customName, setCustomName] = useState('');
  const [customCompany, setCustomCompany] = useState(activeDomain?.name || '');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [selectedRepId, setSelectedRepId] = useState<string>(
    defaultRepId || (representatives[0]?.id ?? '')
  );
  const [date, setDate] = useState('2026-10-24');
  const [timeSlot, setTimeSlot] = useState('02:00 PM EST');
  const [meetingType, setMeetingType] = useState<
    '30-min Discovery' | '45-min Technical Deep Dive' | 'VIP Executive Consultation'
  >('30-min Discovery');
  const [agendaNotes, setAgendaNotes] = useState(
    'Tailored solution walkthrough, architectural fit, and lead nurturing discussion.'
  );
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState<boolean>(true);

  // Mandatory Workspace User Confirmation Dialog State
  const [showWorkspaceConfirm, setShowWorkspaceConfirm] = useState(false);
  const [pendingEventDetails, setPendingEventDetails] = useState<any>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState<ScheduledSession | null>(null);

  if (!isOpen) return null;

  const selectedContact = contacts.find((c) => c.id === selectedContactId);
  const selectedRep = representatives.find((r) => r.id === selectedRepId) || representatives[0];

  const handleInitialFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const contactName = selectedContact ? selectedContact.name : customName.trim();
    const contactEmail = selectedContact ? selectedContact.email : customEmail.trim();
    const company = selectedContact ? selectedContact.company : customCompany.trim() || activeDomain?.name || 'Enterprise Prospect';
    const contactPhone = selectedContact ? selectedContact.phone : customPhone.trim() || '+1 (555) 000-0000';

    if (!contactName || !contactEmail) return;

    const details = {
      contactId: selectedContact ? selectedContact.id : 'contact-new',
      contactName,
      company,
      contactEmail,
      contactPhone,
      representativeId: selectedRep.id,
      date,
      timeSlot,
      meetingType,
      meetingGoal: activeDomain ? activeDomain.inboundGoal : 'Lead nurturing and technical architecture walkthrough',
      agendaNotes,
      calendarLink: activeDomain ? activeDomain.inboundCalendarLink : undefined,
    };

    // If Google token is available and user opted to sync Google Calendar, require user confirmation
    if (googleToken && syncGoogleCalendar) {
      setPendingEventDetails(details);
      setShowWorkspaceConfirm(true);
    } else {
      executeBookingCreation(details);
    }
  };

  const executeBookingCreation = async (details: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/calendar/book-event', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...details,
          accessToken: googleToken || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const createdSession: ScheduledSession = data.session || data;
        setSuccessBooking(createdSession);
        onBookingCreated(createdSession);
      }
    } catch (err) {
      console.error('Error creating booking:', err);
    } finally {
      setIsSubmitting(false);
      setShowWorkspaceConfirm(false);
    }
  };

  const handleFinish = () => {
    setSuccessBooking(null);
    setShowWorkspaceConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Schedule 1-on-1 Lead Nurturing Session
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Empathetically reserve dedicated consultation time with a company representative.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Confirmation View */}
        {successBooking ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Session Confirmed & Synced!</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                Invitation and complete attraction notes have been logged to the CRM and dispatched to{' '}
                <span className="font-semibold">{successBooking.contactEmail}</span> and{' '}
                <span className="font-semibold">{successBooking.representativeName}</span>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg text-left text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Representative:</span>
                <span className="font-medium text-slate-900">
                  {successBooking.representativeName} ({successBooking.representativeRole})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Date & Time:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {successBooking.date} at {successBooking.timeSlot}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Meeting Format:</span>
                <span className="font-medium text-indigo-700">{successBooking.meetingType}</span>
              </div>
              {successBooking.googleCalendarLink && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Google Calendar Event:</span>
                  </span>
                  <a
                    href={successBooking.googleCalendarLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    <span>View in Google Calendar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={handleFinish}
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        ) : showWorkspaceConfirm ? (
          /* MANDATORY USER CONFIRMATION DIALOG FOR GOOGLE WORKSPACE API MUTATION */
          <div className="p-6 space-y-4">
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>CONFIRM GOOGLE CALENDAR EVENT CREATION</span>
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed">
                You are about to create an official calendar event on your primary Google Calendar:
              </p>
              <div className="p-3 bg-white rounded border border-indigo-200 text-xs space-y-1.5 font-sans">
                <p>
                  <strong>Summary:</strong> 1-on-1 Lead Nurturing: {pendingEventDetails?.contactName} ({pendingEventDetails?.company}) with {selectedRep.name}
                </p>
                <p>
                  <strong>Date & Time:</strong> {pendingEventDetails?.date} at {pendingEventDetails?.timeSlot}
                </p>
                <p>
                  <strong>Attendees:</strong> {pendingEventDetails?.contactEmail}, {selectedRep.email}
                </p>
                <p>
                  <strong>Video Link:</strong> Google Meet conference will be automatically generated.
                </p>
                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  The event will include the full AI interaction summary, customer BANT assessment, and tailored discussion agenda.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWorkspaceConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeBookingCreation(pendingEventDetails)}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Syncing with Google Calendar...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Create Google Calendar Event</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Standard Booking Form */
          <form onSubmit={handleInitialFormSubmit} className="p-6 space-y-4">
            {/* Lead Selection or Custom Lead */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Lead / Customer Contact
              </label>
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.company} ({c.email})
                  </option>
                ))}
                <option value="new">+ Enter Custom / Walk-In Contact Details</option>
              </select>
            </div>

            {selectedContactId === 'new' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Name</label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Company</label>
                  <input
                    type="text"
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Email</label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="john@acme.com"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Phone</label>
                  <input
                    type="tel"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded"
                  />
                </div>
              </div>
            )}

            {/* Representative Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Assigned Company Representative
              </label>
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                {representatives.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} — {rep.role} ({rep.specialization})
                  </option>
                ))}
              </select>
            </div>

            {/* Date, Time Slot, and Meeting Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Time Slot</label>
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="09:30 AM EST">09:30 AM EST</option>
                  <option value="11:00 AM EST">11:00 AM EST</option>
                  <option value="01:30 PM EST">01:30 PM EST</option>
                  <option value="02:00 PM EST">02:00 PM EST</option>
                  <option value="03:30 PM EST">03:30 PM EST</option>
                  <option value="04:00 PM EST">04:00 PM EST</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Session Type</label>
                <select
                  value={meetingType}
                  onChange={(e: any) => setMeetingType(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="30-min Discovery">30-min Discovery</option>
                  <option value="45-min Technical Deep Dive">45-min Deep Dive</option>
                  <option value="VIP Executive Consultation">VIP Consultation</option>
                </select>
              </div>
            </div>

            {/* AI Notes / Agenda */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                AI Interaction & Attraction Summary for Calendar
              </label>
              <textarea
                rows={3}
                value={agendaNotes}
                onChange={(e) => setAgendaNotes(e.target.value)}
                placeholder="Key talking points from customer inquiry, timeline, and requirements..."
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Google Calendar Sync Indicator */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="font-medium text-slate-800">
                  {googleToken ? 'Google Calendar Sync Active' : 'Google Calendar Link Mode'}
                </span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={syncGoogleCalendar}
                  onChange={(e) => setSyncGoogleCalendar(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span className="text-[11px]">Sync to Calendar</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Proceed to Book Session</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

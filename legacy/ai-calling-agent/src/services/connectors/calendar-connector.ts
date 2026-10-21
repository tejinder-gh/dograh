import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import {
  createBooking,
  getContactById,
  cancelPendingBooking,
  confirmBooking,
  getBusinessProfiles,
} from '../../db';
import { safeFetch } from '../../utils/ssrf-guard';
import { parseTimeSlotToISO } from '../../utils/agent-logic';

export class CalendarConnector implements BaseToolConnector {
  readonly provider = 'google_workspace';

  async testConnection(
    credentials?: Record<string, unknown>,
    _metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const accessToken = (credentials?.accessToken || credentials?.token) as string | undefined;
    const apiKey = (credentials?.apiKey || credentials?.clientId) as string | undefined;

    if (!accessToken && !apiKey && !credentials?.serviceAccountKey) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Missing Google Workspace API Key, OAuth Access Token, or Service Account credentials in connection configuration.',
      };
    }

    try {
      const url = accessToken
        ? 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'
        : `https://www.googleapis.com/calendar/v3/calendars/primary?key=${encodeURIComponent(apiKey || '')}`;

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const res = await safeFetch(url, { headers });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          latencyMs: Date.now() - start,
          message: errBody.error?.message || `Google Calendar API verification failed with HTTP status ${res.status}.`,
        };
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Google Calendar API authenticated and synchronization active.',
        details: {
          calendarId: 'primary',
          syncState: 'synchronized',
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Failed to reach Google Calendar API server.',
      };
    }
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { tenantId, capabilityName, arguments: args, decryptedCredentials, customSettings } = params;
    const accessToken = (decryptedCredentials?.accessToken || decryptedCredentials?.token) as string | undefined;
    const apiKey = (decryptedCredentials?.apiKey || decryptedCredentials?.clientId) as string | undefined;
    const timeZone = String(customSettings?.timeZone || args.timeZone || 'America/New_York');
    const calendarId = String(customSettings?.calendarId || 'primary');

    if (!accessToken && !apiKey) {
      throw new Error(
        '[GOOGLE CALENDAR BLOCKED] No verified Google Workspace credentials configured for this tenant. ' +
        'Live calendar availability search and booking operations are disabled until an authorized provider connection is established.'
      );
    }

    switch (capabilityName) {
      case 'check_calendar_availability': {
        const date = String(args.date || new Date().toISOString().split('T')[0]);
        const durationMinutes = Number(args.durationMinutes || 60);
        const dayStart = parseTimeSlotToISO(date, '00:00', 1, timeZone);
        const dayEnd = parseTimeSlotToISO(date, '23:59', 1, timeZone);
        const timeMin = dayStart.startIso;
        const timeMax = dayEnd.endIso;

        const res = await safeFetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            timeMin,
            timeMax,
            timeZone,
            items: [{ id: calendarId }],
          }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(errBody.error?.message || `Google Calendar freeBusy query failed with HTTP status ${res.status}.`);
        }

        const data = (await res.json()) as {
          calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
        };
        const busyRanges = data.calendars?.[calendarId]?.busy || data.calendars?.primary?.busy || [];

        // Derive candidate slots from tenant operating hours if configured
        let candidateSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];
        try {
          const profiles = await getBusinessProfiles(tenantId);
          if (profiles[0]?.operatingHours?.slots && profiles[0].operatingHours.slots.length > 0) {
            candidateSlots = profiles[0].operatingHours.slots;
          }
        } catch {
          // Fall back to standard business slots
        }

        const availableSlots = candidateSlots.filter((slot) => {
          const { startIso: slotStartIso, endIso: slotEndIso } = parseTimeSlotToISO(
            date,
            slot,
            durationMinutes,
            timeZone
          );
          const slotStart = new Date(slotStartIso).getTime();
          const slotEnd = new Date(slotEndIso).getTime();

          // Interval overlap check: slotStart < busyEnd && slotEnd > busyStart
          for (const b of busyRanges) {
            const bStart = new Date(b.start).getTime();
            const bEnd = new Date(b.end).getTime();
            if (slotStart < bEnd && slotEnd > bStart) {
              return false;
            }
          }
          return true;
        });

        return {
          date,
          timeZone,
          calendarId,
          totalAvailable: availableSlots.length,
          availableSlots,
          source: 'google_workspace_calendar_api',
        };
      }

      case 'book_calendar_appointment': {
        const date = String(args.date || '');
        const timeSlot = String(args.timeSlot || '');
        const durationMinutes = Number(args.durationMinutes || 60);
        const contactId = typeof args.contactId === 'string' ? args.contactId : undefined;
        const notes = typeof args.notes === 'string' ? args.notes : 'Booked via AI Voice Agent Marketplace';

        if (!date || !timeSlot) {
          throw new Error('Both date and timeSlot are required to confirm a calendar appointment.');
        }

        let contactName = 'Valued Customer';
        if (contactId) {
          const contact = await getContactById(tenantId, contactId);
          if (contact) {
            contactName = contact.name;
          }
        }

        // Calculate ISO range for slot with IANA timezone compliance
        const { startIso, endIso } = parseTimeSlotToISO(date, timeSlot, durationMinutes, timeZone);

        // Pre-flight busy check to prevent provider collisions
        const freeBusyCheck = await safeFetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            timeMin: startIso,
            timeMax: endIso,
            timeZone,
            items: [{ id: calendarId }],
          }),
        });

        // FAIL-CLOSED: If availability check fails, abort immediately
        if (!freeBusyCheck.ok) {
          const errData = (await freeBusyCheck.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(
            `Google Calendar availability verification failed (${errData.error?.message || `HTTP ${freeBusyCheck.status}`}). ` +
            'Appointment booking aborted to prevent scheduling conflicts.'
          );
        }

        const fbData = (await freeBusyCheck.json()) as {
          calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
        };
        const busy = fbData.calendars?.[calendarId]?.busy || fbData.calendars?.primary?.busy || [];
        const slotStart = new Date(startIso).getTime();
        const slotEnd = new Date(endIso).getTime();
        for (const b of busy) {
          const bStart = new Date(b.start).getTime();
          const bEnd = new Date(b.end).getTime();
          if (slotStart < bEnd && slotEnd > bStart) {
            throw new Error(`Requested calendar appointment time ${timeSlot} on ${date} conflicts with an existing busy window.`);
          }
        }

        // 1. Persist local booking hold FIRST with status 'pending_confirmation'
        let holdBooking;
        try {
          holdBooking = await createBooking(tenantId, {
            contactId,
            contactName,
            date,
            timeSlot,
            agendaNotes: `${notes} [hold:pending_confirmation]`,
            status: 'pending_confirmation',
          });
        } catch (dbErr: unknown) {
          throw new Error(`Booking persistence failed; calendar hold was rejected: ${dbErr instanceof Error ? dbErr.message : 'Database conflict'}`);
        }

        // 2. Create genuine event on Google Calendar API
        let gcalEvent: { id: string; htmlLink?: string };
        try {
          const gcalRes = await safeFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              summary: `Consultation with ${contactName}`,
              description: notes,
              start: { dateTime: startIso, timeZone },
              end: { dateTime: endIso, timeZone },
            }),
          });

          if (!gcalRes.ok) {
            // Compensating action: cancel local pending hold immediately
            await cancelPendingBooking(tenantId, holdBooking.id).catch(() => {});
            const errData = (await gcalRes.json().catch(() => ({}))) as { error?: { message?: string } };
            throw new Error(errData.error?.message || `Google Calendar event creation failed with HTTP status ${gcalRes.status}.`);
          }

          gcalEvent = (await gcalRes.json()) as { id: string; htmlLink?: string };
        } catch (extErr: unknown) {
          // Compensating action on external failure
          await cancelPendingBooking(tenantId, holdBooking.id).catch(() => {});
          throw extErr;
        }

        // 3. Confirm booking locally upon verified provider event ID
        let confirmed;
        try {
          confirmed = await confirmBooking(tenantId, holdBooking.id, gcalEvent.id);
        } catch (confirmErr: unknown) {
          // Rollback external event if confirm persistence fails
          try {
            await safeFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcalEvent.id)}`, {
              method: 'DELETE',
              headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
            });
          } catch {
            // Non-fatal logging of cleanup failure
          }
          throw new Error(`Booking persistence failed; calendar hold was rolled back: ${confirmErr instanceof Error ? confirmErr.message : 'Database error'}`);
        }

        return {
          success: true,
          bookingId: confirmed.id,
          googleCalendarEventId: gcalEvent.id,
          calendarLink: gcalEvent.htmlLink || `https://calendar.google.com/calendar/event?eid=${gcalEvent.id}`,
          status: confirmed.status,
          date: confirmed.date,
          timeSlot: confirmed.timeSlot,
          timeZone,
          calendarId,
          confirmed: true,
        };
      }

      default:
        throw new Error(`Unsupported capability "${capabilityName}" on CalendarConnector.`);
    }
  }
}

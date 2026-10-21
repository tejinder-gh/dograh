export interface CalendarEventInput {
  summary: string;
  description: string;
  startDateTime: string; // ISO 8601 string
  endDateTime: string;   // ISO 8601 string
  timeZone?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  representativeEmail?: string;
  representativeName?: string;
}

export interface GoogleCalendarEventResult {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

/**
 * Fetch upcoming events and availability slots from user's primary Google Calendar
 */
export async function fetchCalendarEvents(
  accessToken: string,
  timeMin?: string,
  timeMax?: string
): Promise<any[]> {
  const min = timeMin || new Date().toISOString();
  const max = timeMax || new Date(Date.now() + 7 * 86400000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    min
  )}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Create or update a Google Calendar event for a booked 1-on-1 lead nurturing session
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEventInput
): Promise<GoogleCalendarEventResult> {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  const attendees: Array<{ email: string; displayName?: string }> = [];
  if (event.attendeeEmail && event.attendeeEmail.includes('@')) {
    attendees.push({ email: event.attendeeEmail, displayName: event.attendeeName || undefined });
  }
  if (event.representativeEmail && event.representativeEmail.includes('@')) {
    attendees.push({ email: event.representativeEmail, displayName: event.representativeName || undefined });
  }

  const tz = event.timeZone || 'America/New_York';

  const body: Record<string, any> = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startDateTime,
      timeZone: tz,
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: tz,
    },
    conferenceData: {
      createRequest: {
        requestId: `acuity-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  if (attendees.length > 0) {
    body.attendees = attendees;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Google Calendar event (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Delete a Google Calendar event (compensating action upon post-creation booking failure).
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Failed to delete Google Calendar event (${res.status}): ${errText}`);
  }

  return true;
}

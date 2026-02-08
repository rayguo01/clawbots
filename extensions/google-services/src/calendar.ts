import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../src/agents/tools/common.js";
import { jsonResult } from "../../../src/agents/tools/common.js";
import { googleFetch } from "./google-api.js";

const CALENDAR_BASE = "/calendar/v3";

const ListEventsSchema = Type.Object({
  calendarId: Type.Optional(Type.String({ description: "Calendar ID. Default: 'primary'" })),
  timeMin: Type.Optional(Type.String({ description: "Lower bound (RFC 3339). Default: now." })),
  timeMax: Type.Optional(
    Type.String({ description: "Upper bound (RFC 3339). Default: 7 days from now." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Max events to return. Default: 10.", minimum: 1, maximum: 50 }),
  ),
  query: Type.Optional(Type.String({ description: "Free-text search filter." })),
});

const CreateEventSchema = Type.Object({
  summary: Type.String({ description: "Event title." }),
  start: Type.String({ description: "Start time (RFC 3339, e.g. 2026-03-01T09:00:00+08:00)." }),
  end: Type.String({ description: "End time (RFC 3339)." }),
  description: Type.Optional(Type.String({ description: "Event description." })),
  location: Type.Optional(Type.String({ description: "Event location." })),
  calendarId: Type.Optional(Type.String({ description: "Calendar ID. Default: 'primary'." })),
});

const UpdateEventSchema = Type.Object({
  eventId: Type.String({ description: "The event ID to update." }),
  summary: Type.Optional(Type.String({ description: "New title." })),
  start: Type.Optional(Type.String({ description: "New start time (RFC 3339)." })),
  end: Type.Optional(Type.String({ description: "New end time (RFC 3339)." })),
  description: Type.Optional(Type.String({ description: "New description." })),
  location: Type.Optional(Type.String({ description: "New location." })),
  calendarId: Type.Optional(Type.String({ description: "Calendar ID. Default: 'primary'." })),
});

const DeleteEventSchema = Type.Object({
  eventId: Type.String({ description: "The event ID to delete." }),
  calendarId: Type.Optional(Type.String({ description: "Calendar ID. Default: 'primary'." })),
});

export function createCalendarTools(): AnyAgentTool[] {
  return [
    createListEventsTool(),
    createCreateEventTool(),
    createUpdateEventTool(),
    createDeleteEventTool(),
  ];
}

function createListEventsTool(): AnyAgentTool {
  return {
    label: "Google Calendar: List Events",
    name: "google_calendar_list_events",
    description:
      "List upcoming events from Google Calendar. Returns event titles, times, locations, and IDs.",
    parameters: ListEventsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const calendarId = encodeURIComponent(String(params.calendarId ?? "primary"));
      const now = new Date();
      const timeMin = String(params.timeMin ?? now.toISOString());
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const timeMax = String(params.timeMax ?? weekLater.toISOString());
      const maxResults = Number(params.maxResults ?? 10);

      const qs = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: String(maxResults),
        singleEvents: "true",
        orderBy: "startTime",
      });
      if (params.query) qs.set("q", String(params.query));

      const res = await googleFetch(`${CALENDAR_BASE}/calendars/${calendarId}/events?${qs}`);
      const data = (await res.json()) as { items?: CalendarEvent[] };
      const events = (data.items ?? []).map(formatEvent);
      return jsonResult({ events, count: events.length });
    },
  };
}

function createCreateEventTool(): AnyAgentTool {
  return {
    label: "Google Calendar: Create Event",
    name: "google_calendar_create_event",
    description: "Create a new event on Google Calendar.",
    parameters: CreateEventSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const calendarId = encodeURIComponent(String(params.calendarId ?? "primary"));

      const body = {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
      };

      const res = await googleFetch(`${CALENDAR_BASE}/calendars/${calendarId}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const event = (await res.json()) as CalendarEvent;
      return jsonResult({ created: true, event: formatEvent(event) });
    },
  };
}

function createUpdateEventTool(): AnyAgentTool {
  return {
    label: "Google Calendar: Update Event",
    name: "google_calendar_update_event",
    description: "Update an existing Google Calendar event.",
    parameters: UpdateEventSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const calendarId = encodeURIComponent(String(params.calendarId ?? "primary"));
      const eventId = encodeURIComponent(String(params.eventId));

      // First fetch existing event
      const getRes = await googleFetch(
        `${CALENDAR_BASE}/calendars/${calendarId}/events/${eventId}`,
      );
      const existing = (await getRes.json()) as CalendarEvent;

      // Merge updates
      const body: Record<string, unknown> = {
        summary: params.summary ?? existing.summary,
        description: params.description ?? existing.description,
        location: params.location ?? existing.location,
        start: params.start ? { dateTime: params.start } : existing.start,
        end: params.end ? { dateTime: params.end } : existing.end,
      };

      const res = await googleFetch(`${CALENDAR_BASE}/calendars/${calendarId}/events/${eventId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const event = (await res.json()) as CalendarEvent;
      return jsonResult({ updated: true, event: formatEvent(event) });
    },
  };
}

function createDeleteEventTool(): AnyAgentTool {
  return {
    label: "Google Calendar: Delete Event",
    name: "google_calendar_delete_event",
    description: "Delete an event from Google Calendar.",
    parameters: DeleteEventSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const calendarId = encodeURIComponent(String(params.calendarId ?? "primary"));
      const eventId = encodeURIComponent(String(params.eventId));

      await googleFetch(`${CALENDAR_BASE}/calendars/${calendarId}/events/${eventId}`, {
        method: "DELETE",
      });
      return jsonResult({ deleted: true, eventId: String(params.eventId) });
    },
  };
}

type CalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
};

function formatEvent(e: CalendarEvent) {
  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    link: e.htmlLink,
    status: e.status,
  };
}

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { graphFetch } from "./microsoft-api.js";

// ── Schemas ─────────────────────────────────────────────────

const ProfileSchema = Type.Object({});

const ListEmailsSchema = Type.Object({
  query: Type.Optional(
    Type.String({
      description:
        "Search query (searches subject, body, sender). If omitted, returns recent emails.",
    }),
  ),
  folder: Type.Optional(
    Type.String({
      description: 'Folder name: "inbox", "sentitems", "drafts", "deleteditems". Default: "inbox".',
    }),
  ),
  top: Type.Optional(
    Type.Number({ description: "Max results (1-50). Default: 10.", minimum: 1, maximum: 50 }),
  ),
});

const ReadEmailSchema = Type.Object({
  id: Type.String({ description: "The email message ID to read." }),
});

const SendEmailSchema = Type.Object({
  to: Type.String({ description: "Recipient email address (comma-separated for multiple)." }),
  subject: Type.String({ description: "Email subject line." }),
  body: Type.String({ description: "Email body content." }),
  cc: Type.Optional(Type.String({ description: "CC recipients (comma-separated)." })),
  isHtml: Type.Optional(
    Type.Boolean({ description: "If true, body is treated as HTML. Default: false." }),
  ),
});

const ReplyEmailSchema = Type.Object({
  id: Type.String({ description: "The message ID to reply to." }),
  body: Type.String({ description: "Reply body content." }),
});

const ListEventsSchema = Type.Object({
  startDate: Type.Optional(
    Type.String({ description: "Start date in YYYY-MM-DD format. Default: today." }),
  ),
  endDate: Type.Optional(
    Type.String({ description: "End date in YYYY-MM-DD format. Default: same as startDate." }),
  ),
  top: Type.Optional(
    Type.Number({ description: "Max results (1-50). Default: 25.", minimum: 1, maximum: 50 }),
  ),
});

const CreateEventSchema = Type.Object({
  subject: Type.String({ description: "Event title." }),
  start: Type.String({
    description: "Start datetime in ISO 8601 format (e.g. 2026-02-10T09:00:00).",
  }),
  end: Type.String({ description: "End datetime in ISO 8601 format (e.g. 2026-02-10T10:00:00)." }),
  body: Type.Optional(Type.String({ description: "Event description/notes." })),
  location: Type.Optional(Type.String({ description: "Event location." })),
  attendees: Type.Optional(
    Type.String({ description: "Attendee email addresses (comma-separated)." }),
  ),
  timeZone: Type.Optional(
    Type.String({ description: 'Time zone (e.g. "Asia/Singapore"). Default: UTC.' }),
  ),
});

const CancelEventSchema = Type.Object({
  id: Type.String({ description: "The event ID to cancel." }),
  comment: Type.Optional(
    Type.String({ description: "Optional cancellation message to attendees." }),
  ),
});

// ── Tools ───────────────────────────────────────────────────

export function createMicrosoft365Tools(): AnyAgentTool[] {
  return [
    createProfileTool(),
    createListEmailsTool(),
    createReadEmailTool(),
    createSendEmailTool(),
    createReplyEmailTool(),
    createListEventsTool(),
    createCreateEventTool(),
    createCancelEventTool(),
  ];
}

function createProfileTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Profile",
    name: "ms365_profile",
    description:
      "Get the user's Microsoft 365 profile: display name, email, job title, office location.",
    parameters: ProfileSchema,
    execute: async () => {
      const res = await graphFetch(
        "/me?$select=displayName,mail,userPrincipalName,jobTitle,officeLocation,mobilePhone",
      );
      const data = (await res.json()) as MsProfile;
      return jsonResult({
        displayName: data.displayName,
        email: data.mail || data.userPrincipalName,
        jobTitle: data.jobTitle,
        officeLocation: data.officeLocation,
        mobilePhone: data.mobilePhone,
      });
    },
  };
}

function createListEmailsTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: List Emails",
    name: "ms365_list_emails",
    description:
      "List recent emails or search for emails by query. Returns subject, sender, date, preview, and message ID.",
    parameters: ListEmailsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const top = Number(params.top ?? 10);
      const query = params.query ? String(params.query) : null;
      const folder = String(params.folder ?? "inbox");

      const folderMap: Record<string, string> = {
        inbox: "inbox",
        sentitems: "sentitems",
        sent: "sentitems",
        drafts: "drafts",
        deleteditems: "deleteditems",
        deleted: "deleteditems",
      };
      const folderId = folderMap[folder.toLowerCase()] ?? "inbox";

      let path: string;
      if (query) {
        path = `/me/mailFolders/${folderId}/messages?$search="${encodeURIComponent(query)}"&$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview`;
      } else {
        path = `/me/mailFolders/${folderId}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview`;
      }

      const res = await graphFetch(path);
      const data = (await res.json()) as { value?: MsEmail[] };
      const emails = (data.value ?? []).map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from?.emailAddress?.name || e.from?.emailAddress?.address,
        date: e.receivedDateTime,
        isRead: e.isRead,
        preview: e.bodyPreview?.substring(0, 200),
      }));
      return jsonResult({ folder: folderId, emails, count: emails.length });
    },
  };
}

function createReadEmailTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Read Email",
    name: "ms365_read_email",
    description: "Read the full content of a specific email by its ID.",
    parameters: ReadEmailSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const id = String(params.id);
      const res = await graphFetch(
        `/me/messages/${id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead,hasAttachments`,
      );
      const e = (await res.json()) as MsEmailFull;

      const plainBody = e.body?.content
        ?.replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return jsonResult({
        id: e.id,
        subject: e.subject,
        from: e.from?.emailAddress?.name || e.from?.emailAddress?.address,
        to: e.toRecipients?.map((r) => r.emailAddress?.name || r.emailAddress?.address),
        cc: e.ccRecipients?.map((r) => r.emailAddress?.name || r.emailAddress?.address),
        date: e.receivedDateTime,
        body: plainBody,
        hasAttachments: e.hasAttachments,
      });
    },
  };
}

function createSendEmailTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Send Email",
    name: "ms365_send_email",
    description: "Send an email from the user's Microsoft 365 account.",
    parameters: SendEmailSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const toAddresses = String(params.to)
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const isHtml = Boolean(params.isHtml);

      const message: Record<string, unknown> = {
        subject: String(params.subject),
        body: {
          contentType: isHtml ? "HTML" : "Text",
          content: String(params.body),
        },
        toRecipients: toAddresses.map((addr) => ({ emailAddress: { address: addr } })),
      };

      if (params.cc) {
        const ccAddresses = String(params.cc)
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        message.ccRecipients = ccAddresses.map((addr) => ({ emailAddress: { address: addr } }));
      }

      await graphFetch("/me/sendMail", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      return jsonResult({ sent: true, to: toAddresses, subject: params.subject });
    },
  };
}

function createReplyEmailTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Reply Email",
    name: "ms365_reply_email",
    description: "Reply to a specific email by its message ID.",
    parameters: ReplyEmailSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const id = String(params.id);
      await graphFetch(`/me/messages/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ comment: String(params.body) }),
      });
      return jsonResult({ replied: true, messageId: id });
    },
  };
}

function createListEventsTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: List Events",
    name: "ms365_list_events",
    description: "List calendar events for a date range. Defaults to today.",
    parameters: ListEventsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const top = Number(params.top ?? 25);
      const startDate = String(params.startDate ?? todayStr());
      const endDate = String(params.endDate ?? startDate);

      const startISO = `${startDate}T00:00:00Z`;
      const endISO = `${endDate}T23:59:59Z`;

      const path = `/me/calendarview?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$orderby=start/dateTime&$top=${top}&$select=id,subject,start,end,location,organizer,attendees,isAllDay,isCancelled`;

      const res = await graphFetch(path);
      const data = (await res.json()) as { value?: MsEvent[] };
      const events = (data.value ?? []).map((e) => ({
        id: e.id,
        subject: e.subject,
        start: e.start?.dateTime,
        end: e.end?.dateTime,
        timeZone: e.start?.timeZone,
        isAllDay: e.isAllDay,
        isCancelled: e.isCancelled,
        location: e.location?.displayName,
        organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address,
        attendees: e.attendees
          ?.slice(0, 10)
          .map((a) => a.emailAddress?.name || a.emailAddress?.address),
      }));
      return jsonResult({ startDate, endDate, events, count: events.length });
    },
  };
}

function createCreateEventTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Create Event",
    name: "ms365_create_event",
    description: "Create a new calendar event.",
    parameters: CreateEventSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const tz = String(params.timeZone ?? "UTC");

      const event: Record<string, unknown> = {
        subject: String(params.subject),
        start: { dateTime: String(params.start), timeZone: tz },
        end: { dateTime: String(params.end), timeZone: tz },
      };

      if (params.body) {
        event.body = { contentType: "Text", content: String(params.body) };
      }
      if (params.location) {
        event.location = { displayName: String(params.location) };
      }
      if (params.attendees) {
        const addrs = String(params.attendees)
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        event.attendees = addrs.map((addr) => ({
          emailAddress: { address: addr },
          type: "required",
        }));
      }

      const res = await graphFetch("/me/events", {
        method: "POST",
        body: JSON.stringify(event),
      });
      const created = (await res.json()) as { id?: string; subject?: string };
      return jsonResult({ created: true, eventId: created.id, subject: created.subject });
    },
  };
}

function createCancelEventTool(): AnyAgentTool {
  return {
    label: "Microsoft 365: Cancel Event",
    name: "ms365_cancel_event",
    description: "Cancel a calendar event and optionally notify attendees.",
    parameters: CancelEventSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const id = String(params.id);
      const comment = params.comment ? String(params.comment) : "";
      await graphFetch(`/me/events/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      });
      return jsonResult({ cancelled: true, eventId: id });
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Types ───────────────────────────────────────────────────

type MsProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
};

type MsEmailAddress = {
  emailAddress?: { name?: string; address?: string };
};

type MsEmail = {
  id?: string;
  subject?: string;
  from?: MsEmailAddress;
  receivedDateTime?: string;
  isRead?: boolean;
  bodyPreview?: string;
};

type MsEmailFull = MsEmail & {
  toRecipients?: MsEmailAddress[];
  ccRecipients?: MsEmailAddress[];
  body?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
};

type MsEvent = {
  id?: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string };
  organizer?: MsEmailAddress;
  attendees?: MsEmailAddress[];
};

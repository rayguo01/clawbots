import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../src/agents/tools/common.js";
import { jsonResult } from "../../../src/agents/tools/common.js";
import { googleFetch } from "./google-api.js";

const GMAIL_BASE = "/gmail/v1/users/me";

const SearchSchema = Type.Object({
  query: Type.String({
    description:
      "Gmail search query (same syntax as Gmail search box). Examples: 'from:alice subject:meeting', 'is:unread newer_than:1d'.",
  }),
  maxResults: Type.Optional(
    Type.Number({ description: "Max emails to return. Default: 5.", minimum: 1, maximum: 20 }),
  ),
});

const ReadSchema = Type.Object({
  messageId: Type.String({ description: "The Gmail message ID to read." }),
});

const SendSchema = Type.Object({
  to: Type.String({ description: "Recipient email address." }),
  subject: Type.String({ description: "Email subject line." }),
  body: Type.String({ description: "Email body (plain text)." }),
  cc: Type.Optional(Type.String({ description: "CC email address(es), comma separated." })),
});

const ReplySchema = Type.Object({
  messageId: Type.String({ description: "The message ID to reply to." }),
  body: Type.String({ description: "Reply body (plain text)." }),
});

export function createGmailTools(): AnyAgentTool[] {
  return [createSearchTool(), createReadTool(), createSendTool(), createReplyTool()];
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "Gmail: Search",
    name: "google_gmail_search",
    description: "Search Gmail messages using Gmail search syntax.",
    parameters: SearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = String(params.query);
      const maxResults = Number(params.maxResults ?? 5);

      const qs = new URLSearchParams({ q: query, maxResults: String(maxResults) });
      const listRes = await googleFetch(`${GMAIL_BASE}/messages?${qs}`);
      const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };

      if (!listData.messages?.length) {
        return jsonResult({ messages: [], count: 0 });
      }

      // Fetch headers for each message
      const messages = await Promise.all(
        listData.messages.slice(0, maxResults).map(async (m) => {
          const msgRes = await googleFetch(
            `${GMAIL_BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          );
          const msg = (await msgRes.json()) as GmailMessage;
          return formatMessageSummary(msg);
        }),
      );

      return jsonResult({ messages, count: messages.length });
    },
  };
}

function createReadTool(): AnyAgentTool {
  return {
    label: "Gmail: Read",
    name: "google_gmail_read",
    description: "Read the full content of a Gmail message by ID.",
    parameters: ReadSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const messageId = String(params.messageId);

      const res = await googleFetch(`${GMAIL_BASE}/messages/${messageId}?format=full`);
      const msg = (await res.json()) as GmailMessage;
      return jsonResult(formatMessageFull(msg));
    },
  };
}

function createSendTool(): AnyAgentTool {
  return {
    label: "Gmail: Send",
    name: "google_gmail_send",
    description: "Send a new email via Gmail.",
    parameters: SendSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const to = String(params.to);
      const subject = String(params.subject);
      const body = String(params.body);
      const cc = params.cc ? String(params.cc) : undefined;

      const raw = buildRawEmail({ to, subject, body, cc });
      const res = await googleFetch(`${GMAIL_BASE}/messages/send`, {
        method: "POST",
        body: JSON.stringify({ raw }),
      });
      const sent = (await res.json()) as { id: string; threadId: string };
      return jsonResult({ sent: true, messageId: sent.id, threadId: sent.threadId });
    },
  };
}

function createReplyTool(): AnyAgentTool {
  return {
    label: "Gmail: Reply",
    name: "google_gmail_reply",
    description: "Reply to an existing Gmail message.",
    parameters: ReplySchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const messageId = String(params.messageId);
      const body = String(params.body);

      // Fetch original message to get thread and headers
      const origRes = await googleFetch(
        `${GMAIL_BASE}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`,
      );
      const orig = (await origRes.json()) as GmailMessage;
      const headers = parseHeaders(orig);
      const to = headers["From"] ?? "";
      const subject = headers["Subject"]?.startsWith("Re:")
        ? headers["Subject"]
        : `Re: ${headers["Subject"] ?? ""}`;
      const inReplyTo = headers["Message-ID"] ?? "";

      const raw = buildRawEmail({
        to,
        subject,
        body,
        inReplyTo,
        references: inReplyTo,
      });

      const res = await googleFetch(`${GMAIL_BASE}/messages/send`, {
        method: "POST",
        body: JSON.stringify({ raw, threadId: orig.threadId }),
      });
      const sent = (await res.json()) as { id: string; threadId: string };
      return jsonResult({ replied: true, messageId: sent.id, threadId: sent.threadId });
    },
  };
}

// ── helpers ───────────────────────────────────────────────────

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    body?: { data?: string };
    mimeType?: string;
  };
};

function parseHeaders(msg: GmailMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    result[h.name] = h.value;
  }
  return result;
}

function formatMessageSummary(msg: GmailMessage) {
  const h = parseHeaders(msg);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: h["From"],
    to: h["To"],
    subject: h["Subject"],
    date: h["Date"],
    snippet: msg.snippet,
  };
}

function formatMessageFull(msg: GmailMessage) {
  const h = parseHeaders(msg);
  const body = extractTextBody(msg);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: h["From"],
    to: h["To"],
    subject: h["Subject"],
    date: h["Date"],
    body,
  };
}

function extractTextBody(msg: GmailMessage): string {
  // Try payload.body first
  if (msg.payload?.body?.data) {
    return base64UrlDecode(msg.payload.body.data);
  }
  // Try parts
  const parts = msg.payload?.parts ?? [];
  const textPart = parts.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    return base64UrlDecode(textPart.body.data);
  }
  const htmlPart = parts.find((p) => p.mimeType === "text/html");
  if (htmlPart?.body?.data) {
    return base64UrlDecode(htmlPart.body.data);
  }
  return msg.snippet ?? "";
}

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("", opts.body);
  return base64UrlEncode(lines.join("\r\n"));
}

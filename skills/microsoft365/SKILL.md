---
name: microsoft365
description: Microsoft 365 Outlook email and calendar management — read, send, search emails and manage calendar events. 关键词：Outlook邮件、微软日历、Office邮箱、发邮件、会议安排、查看邮件、日程安排。
---

# Microsoft 365 (Outlook Email & Calendar)

You have access to the user's Microsoft 365 account through these tools:

- `ms365_profile` — User profile (name, email, job title)
- `ms365_list_emails` — List or search emails
- `ms365_read_email` — Read full email content by ID
- `ms365_send_email` — Send an email
- `ms365_reply_email` — Reply to an email
- `ms365_list_events` — List calendar events for a date range
- `ms365_create_event` — Create a calendar event
- `ms365_cancel_event` — Cancel a calendar event

## When to Use

Activate when the user asks about:

- Reading emails, checking inbox, unread messages
- Sending or replying to emails
- Searching for specific emails
- Checking today's or this week's calendar/schedule
- Creating meetings or events
- Cancelling appointments
- Anything related to Outlook or Microsoft 365

## How to Respond

1. **For "check my email"** — use `ms365_list_emails` with no query, summarize the most recent messages conversationally.

2. **For "find emails about X"** — use `ms365_list_emails` with a search query. Microsoft Graph search covers subject, body, and sender.

3. **For reading a specific email** — first list to get the ID, then use `ms365_read_email` with that ID.

4. **For sending emails** — confirm recipient, subject and content with the user before calling `ms365_send_email`. Never send without user confirmation.

5. **For "what's on my calendar today"** — use `ms365_list_events` with today's date. Present events in chronological order with time, title, and location.

6. **For creating events** — gather subject, start/end time, and optionally location and attendees. Use ISO 8601 datetime format. Ask for timezone if not obvious.

7. **Email IDs** — these are opaque strings from Microsoft Graph. Store them from list results to use in read/reply operations.

## Important Rules

- **Never send emails without explicit user confirmation** — always show the draft (to, subject, body) and ask "shall I send this?"
- **Never cancel events without confirmation** — show event details first
- When listing emails, show a concise summary (sender, subject, date) not the full body
- For calendar events, include the time zone context if the user travels

## Language

Respond in the same language as the user's message.

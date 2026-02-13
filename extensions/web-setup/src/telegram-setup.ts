import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk";
import { updateConfig } from "./config-bridge.js";
import { readJsonBody, sendJson } from "./helpers.js";

export async function handleTelegramVerify(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as { botToken?: string };
  const botToken = body.botToken?.trim();
  if (!botToken) {
    sendJson(res, 400, { ok: false, error: "botToken is required" });
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (data.ok) {
      sendJson(res, 200, { ok: true, botName: data.result?.username ?? "unknown" });
    } else {
      sendJson(res, 400, { ok: false, error: data.description ?? "Invalid token" });
    }
  } catch {
    sendJson(res, 500, { ok: false, error: "Failed to reach Telegram API" });
  }
}

export async function handleTelegramDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    await updateConfig((config) => {
      if (config.channels?.telegram) {
        delete config.channels.telegram.botToken;
        delete config.channels.telegram.allowFrom;
      }
      return config;
    });

    // Clean up the update offset file so a new bot doesn't inherit
    // the old bot's offset (which would cause all messages to be skipped).
    const offsetFile = path.join(resolveStateDir(), "telegram", "update-offset-default.json");
    try {
      fs.unlinkSync(offsetFile);
    } catch {
      // File may not exist — that's fine.
    }

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

export async function handleTelegramSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as { botToken?: string; userId?: string };
  const botToken = body.botToken?.trim();
  const userId = body.userId?.trim();

  if (!botToken || !userId) {
    sendJson(res, 400, { ok: false, error: "botToken and userId are required" });
    return;
  }

  try {
    await updateConfig((config) => {
      config.channels ??= {};
      config.channels.telegram = {
        ...config.channels.telegram,
        botToken,
        allowFrom: [userId],
      };
      return config;
    });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./helpers.js";

/**
 * POST /api/setup/whatsapp/qr
 * Starts a WhatsApp login flow and returns a QR code as base64 data URL.
 */
export async function handleWhatsAppQr(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    // Lazy-import to avoid loading heavy Baileys dependencies at plugin registration time
    const { startWebLoginWithQr } = await import("openclaw/plugin-sdk");
    const result = await startWebLoginWithQr({ force: false, timeoutMs: 30_000 });
    sendJson(res, 200, {
      ok: true,
      qrDataUrl: result.qrDataUrl ?? null,
      message: result.message,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

/**
 * GET /api/setup/whatsapp/status
 * Polls the current WhatsApp connection status.
 */
export async function handleWhatsAppStatus(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    const { waitForWebLogin } = await import("openclaw/plugin-sdk");
    // Short timeout — just check current state, don't block
    const result = await waitForWebLogin({ timeoutMs: 1000 });
    sendJson(res, 200, {
      connected: result.connected,
      message: result.message,
    });
  } catch (err) {
    sendJson(res, 200, { connected: false, message: String(err) });
  }
}

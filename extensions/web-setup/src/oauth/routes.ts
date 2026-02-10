import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { sendJson, readJsonBody } from "../helpers.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  getPendingState,
  refreshAccessToken,
} from "./core.js";
import { getProviderById, getAvailableProviders } from "./providers.js";
import { deleteToken, getValidToken, listTokens, loadToken } from "./store.js";

export function registerOAuthRoutes(api: OpenClawPluginApi): void {
  // List available OAuth providers and their connection status
  api.registerHttpRoute({
    path: "/api/oauth/providers",
    handler: handleProviders,
  });

  // Start OAuth flow for a provider
  api.registerHttpRoute({
    path: "/api/oauth/start",
    handler: handleStart,
  });

  // OAuth callback (receives authorization code)
  api.registerHttpRoute({
    path: "/api/oauth/callback",
    handler: handleCallback,
  });

  // Get connection status for all providers
  api.registerHttpRoute({
    path: "/api/oauth/status",
    handler: handleStatus,
  });

  // Disconnect a provider
  api.registerHttpRoute({
    path: "/api/oauth/disconnect",
    handler: handleDisconnect,
  });
}

async function handleProviders(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const providers = getAvailableProviders();
  const tokens = await listTokens();
  const connectedSet = new Set(tokens.map((t) => t.provider));

  const result = providers.map((p) => ({
    id: p.id,
    name: p.name,
    configured: !!(p.clientId && p.clientSecret),
    connected: connectedSet.has(p.id),
    scopes: p.scopes,
    envHint: p.envHint,
  }));

  sendJson(res, 200, { providers: result });
}

async function handleStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const body = (await readJsonBody(req)) as { provider?: string };
  const providerId = body.provider;
  if (!providerId) {
    sendJson(res, 400, { error: "provider is required" });
    return;
  }

  const provider = getProviderById(providerId);
  if (!provider) {
    sendJson(res, 400, { error: `Unknown provider: ${providerId}` });
    return;
  }

  if (!provider.clientId || !provider.clientSecret) {
    const hint = provider.envHint;
    const envNames = hint
      ? `${hint.clientId} and ${hint.clientSecret}`
      : `client ID and client secret`;
    sendJson(res, 400, {
      error: `OAuth not configured for ${provider.name}. Set ${envNames} environment variables.`,
    });
    return;
  }

  // Build redirect URI from the request host
  const host = req.headers.host ?? "localhost:8080";
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const redirectUri = `${protocol}://${host}/api/oauth/callback`;

  const { url } = buildAuthorizationUrl(provider, redirectUri);
  sendJson(res, 200, { ok: true, url });
}

async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(false, `Authorization denied: ${error}`));
    return;
  }

  if (!code || !state) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(false, "Missing code or state parameter"));
    return;
  }

  const pending = getPendingState(state);
  if (!pending) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(false, "Invalid or expired state. Please try again."));
    return;
  }

  const provider = getProviderById(pending.provider);
  if (!provider) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(false, `Unknown provider: ${pending.provider}`));
    return;
  }

  try {
    await exchangeCodeForToken(provider, code, pending.redirectUri, pending.codeVerifier);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(true, `${provider.name} connected successfully!`));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackPage(false, `Failed to connect: ${String(err)}`));
  }
}

async function handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const tokens = await listTokens();
  const providers = getAvailableProviders();

  const status = providers.map((p) => {
    const token = tokens.find((t) => t.provider === p.id);
    return {
      id: p.id,
      name: p.name,
      configured: !!(p.clientId && p.clientSecret),
      connected: !!token,
      expiresAt: token?.expiresAt,
      scopes: token?.scopes ?? [],
    };
  });

  sendJson(res, 200, { status });
}

async function handleDisconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const body = (await readJsonBody(req)) as { provider?: string };
  const providerId = body.provider;
  if (!providerId) {
    sendJson(res, 400, { error: "provider is required" });
    return;
  }

  await deleteToken(providerId);
  sendJson(res, 200, { ok: true });
}

function callbackPage(success: boolean, message: string): string {
  const icon = success ? "&#x2705;" : "&#x274C;";
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth - Nanobots</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 48px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: ${color}; margin-bottom: 8px; }
    p { color: #666; margin-bottom: 24px; }
    a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${success ? "Connected!" : "Error"}</h2>
    <p>${escapeHtml(message)}</p>
    <a href="javascript:void(0)" onclick="closeWin()">Close</a>
  </div>
  <script>
    function closeWin() {
      if (window.opener && window.opener.onOAuthDone) window.opener.onOAuthDone();
      window.close();
    }
    setTimeout(closeWin, 2000);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

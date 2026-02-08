import crypto from "node:crypto";
import type { OAuthToken } from "./store.js";
import { saveToken } from "./store.js";

export type OAuthProviderConfig = {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
};

// In-flight OAuth state tracking (state → provider mapping)
const pendingStates = new Map<
  string,
  { provider: string; redirectUri: string; createdAt: number }
>();

// Clean up stale states (older than 10 minutes)
function cleanStaleStates(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of pendingStates) {
    if (val.createdAt < cutoff) pendingStates.delete(key);
  }
}

export function buildAuthorizationUrl(
  provider: OAuthProviderConfig,
  redirectUri: string,
): { url: string; state: string } {
  cleanStaleStates();
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, {
    provider: provider.id,
    redirectUri,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return { url: `${provider.authUrl}?${params.toString()}`, state };
}

export function getPendingState(state: string): { provider: string; redirectUri: string } | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  return { provider: entry.provider, redirectUri: entry.redirectUri };
}

export async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  code: string,
  redirectUri: string,
): Promise<OAuthToken> {
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const token: OAuthToken = {
    provider: provider.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: (data.scope ?? provider.scopes.join(" ")).split(" "),
  };

  await saveToken(provider.id, token);
  return token;
}

export async function refreshAccessToken(
  provider: OAuthProviderConfig,
  token: OAuthToken,
): Promise<OAuthToken> {
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  return {
    provider: provider.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: (data.scope ?? token.scopes.join(" ")).split(" "),
  };
}

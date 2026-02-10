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
  scopeSeparator?: string;
  extraAuthParams?: Record<string, string>;
  tokenNeverExpires?: boolean;
  tokenAuthMethod?: "body" | "basic"; // default "body"; Notion uses "basic"
  tokenContentType?: "form" | "json"; // default "form"; Notion uses "json"
  usePKCE?: boolean; // enable PKCE (required by Twitter/X)
  envHint?: { clientId: string; clientSecret: string };
};

// In-flight OAuth state tracking (state → provider mapping)
const pendingStates = new Map<
  string,
  { provider: string; redirectUri: string; createdAt: number; codeVerifier?: string }
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

  let codeVerifier: string | undefined;
  if (provider.usePKCE) {
    codeVerifier = crypto.randomBytes(32).toString("base64url");
  }

  pendingStates.set(state, {
    provider: provider.id,
    redirectUri,
    createdAt: Date.now(),
    codeVerifier,
  });

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(provider.scopeSeparator ?? " "),
    state,
    ...(provider.extraAuthParams ?? {}),
  });

  if (codeVerifier) {
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return { url: `${provider.authUrl}?${params.toString()}`, state };
}

export function getPendingState(
  state: string,
): { provider: string; redirectUri: string; codeVerifier?: string } | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  return {
    provider: entry.provider,
    redirectUri: entry.redirectUri,
    codeVerifier: entry.codeVerifier,
  };
}

function buildTokenRequest(
  provider: OAuthProviderConfig,
  params: Record<string, string>,
): { headers: Record<string, string>; body: string } {
  const useBasic = provider.tokenAuthMethod === "basic";
  const useJson = provider.tokenContentType === "json";

  const headers: Record<string, string> = {
    Accept: "application/json", // GitHub returns form-urlencoded by default without this
  };

  if (useBasic) {
    const creds = Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  } else {
    params.client_id = provider.clientId;
    params.client_secret = provider.clientSecret;
  }

  if (useJson) {
    headers["Content-Type"] = "application/json";
    return { headers, body: JSON.stringify(params) };
  }
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  return { headers, body: new URLSearchParams(params).toString() };
}

export async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<OAuthToken> {
  const tokenParams: Record<string, string> = {
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  if (codeVerifier) {
    tokenParams.code_verifier = codeVerifier;
  }
  const { headers, body } = buildTokenRequest(provider, tokenParams);

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const sep = provider.scopeSeparator ?? " ";
  const expiresAt =
    provider.tokenNeverExpires || !data.expires_in
      ? Number.MAX_SAFE_INTEGER
      : Date.now() + data.expires_in * 1000;

  const token: OAuthToken = {
    provider: provider.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt,
    scopes: (data.scope ?? provider.scopes.join(sep)).split(sep),
  };

  await saveToken(provider.id, token);
  return token;
}

export async function refreshAccessToken(
  provider: OAuthProviderConfig,
  token: OAuthToken,
): Promise<OAuthToken> {
  if (provider.tokenNeverExpires) return token;

  const { headers, body } = buildTokenRequest(provider, {
    refresh_token: token.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
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

  const sep = provider.scopeSeparator ?? " ";
  return {
    provider: provider.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: (data.scope ?? token.scopes.join(sep)).split(sep),
  };
}

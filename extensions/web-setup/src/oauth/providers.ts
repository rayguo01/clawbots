import type { OAuthProviderConfig } from "./core.js";

/**
 * Resolve OAuth provider config from environment variables.
 * Users configure their own Google OAuth app credentials via env vars
 * or through the web setup UI.
 */
function envOrEmpty(key: string): string {
  return process.env[key]?.trim() ?? "";
}

export function getGoogleProvider(): OAuthProviderConfig {
  return {
    id: "google",
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    clientId: envOrEmpty("NANOBOTS_GOOGLE_CLIENT_ID") || envOrEmpty("GOOGLE_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_GOOGLE_CLIENT_SECRET") || envOrEmpty("GOOGLE_CLIENT_SECRET"),
  };
}

export type OAuthProviderSummary = {
  id: string;
  name: string;
  configured: boolean; // client ID + secret are set
  connected: boolean; // has valid token
  scopes: string[];
};

export function getAvailableProviders(): OAuthProviderConfig[] {
  return [getGoogleProvider()];
}

export function getProviderById(id: string): OAuthProviderConfig | null {
  const providers = getAvailableProviders();
  return providers.find((p) => p.id === id) ?? null;
}

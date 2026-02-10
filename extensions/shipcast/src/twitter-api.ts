import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getTwitterProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const TWITTER_BASE = "https://api.twitter.com/2";

/**
 * Make an authenticated request to the Twitter/X API v2.
 * Automatically refreshes the token if expired.
 */
export async function twitterFetch(path: string, options?: RequestInit): Promise<Response> {
  const provider = getTwitterProvider();
  const token = await getValidToken("twitter", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "X (Twitter) account not connected. Please connect your X account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${TWITTER_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitter API error ${response.status}: ${text}`);
  }

  return response;
}

import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getGoogleProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

/**
 * Make an authenticated request to a Google API endpoint.
 * Automatically refreshes the token if expired.
 */
export async function googleFetch(urlPath: string, options?: RequestInit): Promise<Response> {
  const provider = getGoogleProvider();
  const token = await getValidToken("google", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Google account not connected. Please connect your Google account in Nanobots Setup → Services.",
    );
  }

  const url = urlPath.startsWith("https://") ? urlPath : `https://www.googleapis.com${urlPath}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API error ${response.status}: ${text}`);
  }

  return response;
}

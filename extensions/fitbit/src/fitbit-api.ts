import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getFitbitProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const FITBIT_BASE = "https://api.fitbit.com";

/**
 * Make an authenticated request to the Fitbit Web API.
 * Automatically refreshes the token if expired.
 */
export async function fitbitFetch(path: string, options?: RequestInit): Promise<Response> {
  const provider = getFitbitProvider();
  const token = await getValidToken("fitbit", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Fitbit account not connected. Please connect your Fitbit account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${FITBIT_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fitbit API error ${response.status}: ${text}`);
  }

  return response;
}

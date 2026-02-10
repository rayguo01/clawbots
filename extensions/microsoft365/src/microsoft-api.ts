import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getMicrosoft365Provider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Make an authenticated request to the Microsoft Graph API.
 * Automatically refreshes the token if expired.
 */
export async function graphFetch(path: string, options?: RequestInit): Promise<Response> {
  const provider = getMicrosoft365Provider();
  const token = await getValidToken("microsoft365", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Microsoft 365 account not connected. Please connect your Microsoft account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${GRAPH_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph API error ${response.status}: ${text}`);
  }

  return response;
}

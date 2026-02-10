import { getValidToken } from "../../web-setup/src/oauth/store.js";

const TODOIST_BASE = "https://api.todoist.com/rest/v2";

/**
 * Make an authenticated request to the Todoist REST API.
 * Token never expires so no refresh function is needed.
 */
export async function todoistFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getValidToken("todoist");

  if (!token) {
    throw new Error(
      "Todoist account not connected. Please connect your Todoist account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${TODOIST_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Todoist API error ${response.status}: ${text}`);
  }

  return response;
}

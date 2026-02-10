import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getNotionProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

/**
 * Make an authenticated request to the Notion API.
 * Automatically refreshes the token if expired.
 */
export async function notionFetch(path: string, options?: RequestInit): Promise<Response> {
  const provider = getNotionProvider();
  const token = await getValidToken("notion", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Notion account not connected. Please connect your Notion account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${NOTION_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  headers.set("Notion-Version", NOTION_VERSION);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API error ${response.status}: ${text}`);
  }

  return response;
}

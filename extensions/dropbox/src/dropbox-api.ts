import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getDropboxProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";

async function getToken() {
  const provider = getDropboxProvider();
  const token = await getValidToken("dropbox", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Dropbox account not connected. Please connect your Dropbox account in Nanobots Setup → Services.",
    );
  }
  return token;
}

/**
 * Make an authenticated POST request to the Dropbox API.
 * Dropbox API uses POST for all endpoints with JSON body.
 */
export async function dropboxFetch(path: string, body?: unknown): Promise<Response> {
  const token = await getToken();
  const url = `${DROPBOX_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : JSON.stringify(null),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox API error ${response.status}: ${text}`);
  }

  return response;
}

/**
 * Download file content from Dropbox Content API.
 * Uses Dropbox-API-Arg header for the path parameter.
 */
export async function dropboxDownload(dropboxPath: string): Promise<Response> {
  const token = await getToken();
  const url = `${DROPBOX_CONTENT_BASE}/files/download`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath }),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox download error ${response.status}: ${text}`);
  }

  return response;
}

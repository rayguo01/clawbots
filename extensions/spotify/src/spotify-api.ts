import { refreshAccessToken } from "../../web-setup/src/oauth/core.js";
import { getSpotifyProvider } from "../../web-setup/src/oauth/providers.js";
import { getValidToken } from "../../web-setup/src/oauth/store.js";

const SPOTIFY_BASE = "https://api.spotify.com/v1";

/**
 * Make an authenticated request to the Spotify Web API.
 * Automatically refreshes the token if expired.
 */
export async function spotifyFetch(path: string, options?: RequestInit): Promise<Response> {
  const provider = getSpotifyProvider();
  const token = await getValidToken("spotify", (t) => refreshAccessToken(provider, t));

  if (!token) {
    throw new Error(
      "Spotify account not connected. Please connect your Spotify account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${SPOTIFY_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${text}`);
  }

  return response;
}

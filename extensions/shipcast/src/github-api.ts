import { getValidToken } from "../../web-setup/src/oauth/store.js";

const GITHUB_BASE = "https://api.github.com";

/**
 * Make an authenticated request to the GitHub REST API.
 * Token never expires so no refresh function is needed.
 */
export async function githubFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getValidToken("github");

  if (!token) {
    throw new Error(
      "GitHub account not connected. Please connect your GitHub account in Nanobots Setup → Services.",
    );
  }

  const url = path.startsWith("https://") ? path : `${GITHUB_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token.accessToken}`);
  headers.set("Accept", "application/vnd.github+json");
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }

  return response;
}

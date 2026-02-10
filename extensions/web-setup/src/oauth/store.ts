import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk";

const OAUTH_DIR = path.join(resolveStateDir(), "oauth_tokens");

export type OAuthToken = {
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp (ms)
  scopes: string[];
};

export async function saveToken(provider: string, token: OAuthToken): Promise<void> {
  await fs.promises.mkdir(OAUTH_DIR, { recursive: true });
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(token, null, 2), "utf-8");
}

export async function loadToken(provider: string): Promise<OAuthToken | null> {
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as OAuthToken;
  } catch {
    return null;
  }
}

export async function deleteToken(provider: string): Promise<void> {
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore if file doesn't exist
  }
}

export async function listTokens(): Promise<
  Array<{ provider: string; expiresAt: number; scopes: string[] }>
> {
  try {
    const files = await fs.promises.readdir(OAUTH_DIR);
    const results: Array<{ provider: string; expiresAt: number; scopes: string[] }> = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.promises.readFile(path.join(OAUTH_DIR, file), "utf-8");
        const token = JSON.parse(raw) as OAuthToken;
        results.push({
          provider: token.provider,
          expiresAt: token.expiresAt,
          scopes: token.scopes,
        });
      } catch {
        // skip corrupt files
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function getValidToken(
  provider: string,
  refreshFn?: (token: OAuthToken) => Promise<OAuthToken>,
): Promise<OAuthToken | null> {
  const token = await loadToken(provider);
  if (!token) return null;

  // Token never expires (e.g. Todoist)
  if (token.expiresAt >= Number.MAX_SAFE_INTEGER - 60_000) return token;

  // Token still valid (with 60s buffer)
  if (Date.now() < token.expiresAt - 60_000) return token;

  // Try refresh
  if (!refreshFn || !token.refreshToken) return null;
  try {
    const refreshed = await refreshFn(token);
    await saveToken(provider, refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

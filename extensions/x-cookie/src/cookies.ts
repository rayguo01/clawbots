import fs from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { resolveStateDir } from "openclaw/plugin-sdk";
import type { CookieFileData, CookieMap } from "./types.js";
import { X_COOKIE_NAMES, X_REQUIRED_COOKIES } from "./constants.js";

function resolveUserDataRoot(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
}

// Primary: nanobots state dir (persisted in Docker volume)
// Fallback: legacy baoyu path
function resolveCookiePaths(): string[] {
  const override = process.env.X_COOKIE_PATH?.trim();
  if (override) return [path.resolve(override)];
  return [
    path.join(resolveStateDir(), "x-cookies", "cookies.json"),
    path.join(resolveUserDataRoot(), "baoyu-skills", "x-to-markdown", "cookies.json"),
  ];
}

function filterCookieMap(raw: CookieMap): CookieMap {
  const filtered: CookieMap = {};
  for (const name of X_COOKIE_NAMES) {
    if (raw[name]) filtered[name] = raw[name];
  }
  return filtered;
}

function parseCookieFile(raw: string): CookieMap | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;

    const obj = data as Record<string, unknown>;
    const source = (obj.cookieMap ?? obj.cookies ?? obj) as Record<string, unknown>;
    if (!source || typeof source !== "object") return null;

    const out: CookieMap = {};
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function loadFromEnv(): CookieMap {
  const map: CookieMap = {};
  const authToken = process.env.X_AUTH_TOKEN?.trim();
  const ct0 = process.env.X_CT0?.trim();
  if (authToken) map.auth_token = authToken;
  if (ct0) map.ct0 = ct0;
  return map;
}

async function loadFromFile(): Promise<CookieMap> {
  for (const cookiePath of resolveCookiePaths()) {
    try {
      if (!fs.existsSync(cookiePath)) continue;
      const raw = await readFile(cookiePath, "utf8");
      const map = filterCookieMap(parseCookieFile(raw) ?? {});
      if (Object.keys(map).length > 0) return map;
    } catch {
      continue;
    }
  }
  return {};
}

export function hasRequiredCookies(cookieMap: CookieMap): boolean {
  return X_REQUIRED_COOKIES.every((name) => Boolean(cookieMap[name]));
}

export function buildCookieHeader(cookieMap: CookieMap): string | undefined {
  const entries = Object.entries(cookieMap).filter(([, v]) => v);
  if (entries.length === 0) return undefined;
  return entries.map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function loadXCookies(): Promise<CookieMap> {
  const envMap = loadFromEnv();
  const fileMap = await loadFromFile();
  return { ...fileMap, ...envMap };
}

export async function requireXCookies(): Promise<CookieMap> {
  const cookies = await loadXCookies();
  if (!hasRequiredCookies(cookies)) {
    throw new Error(
      "X (Twitter) cookies not configured. Go to Nanobots Setup → Services → X Cookie to set up auth_token and ct0.",
    );
  }
  return cookies;
}

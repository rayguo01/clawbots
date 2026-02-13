import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk";
import { readJsonBody, sendJson } from "./helpers.js";

// Primary: nanobots state dir (persisted in Docker volume)
const COOKIE_FILE_DIR = path.join(resolveStateDir(), "x-cookies");
const COOKIE_FILE_PATH = path.join(COOKIE_FILE_DIR, "cookies.json");

// Legacy fallback: old baoyu path
const LEGACY_COOKIE_PATH = path.join(
  os.homedir(),
  ".local",
  "share",
  "baoyu-skills",
  "x-to-markdown",
  "cookies.json",
);

const REQUIRED_COOKIES = ["auth_token", "ct0"] as const;

type CookieMap = Record<string, string>;

function parseCookieFile(filePath: string): CookieMap | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;

    const cookies =
      (data.cookieMap as CookieMap | undefined) ?? (data.cookies as CookieMap | undefined);
    if (cookies && typeof cookies === "object") {
      const out: CookieMap = {};
      for (const [k, v] of Object.entries(cookies)) {
        if (typeof v === "string") out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : null;
    }
    return null;
  } catch {
    return null;
  }
}

function readCookieMap(): CookieMap | null {
  return parseCookieFile(COOKIE_FILE_PATH) ?? parseCookieFile(LEGACY_COOKIE_PATH);
}

export function hasXCookies(): boolean {
  const envOk = !!process.env.X_AUTH_TOKEN?.trim() && !!process.env.X_CT0?.trim();
  if (envOk) return true;

  const map = readCookieMap();
  if (!map) return false;
  return REQUIRED_COOKIES.every((name) => !!map[name]);
}

export async function handleXCookiesStatus(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const map = readCookieMap();
  const hasEnv = !!process.env.X_AUTH_TOKEN?.trim() && !!process.env.X_CT0?.trim();
  const hasFile = !!map && REQUIRED_COOKIES.every((name) => !!map[name]);

  sendJson(res, 200, {
    configured: hasEnv || hasFile,
    source: hasEnv ? "env" : hasFile ? "file" : null,
    hasMaskedAuthToken:
      hasFile && map?.auth_token
        ? map.auth_token.slice(0, 6) + "..."
        : hasEnv
          ? process.env.X_AUTH_TOKEN!.trim().slice(0, 6) + "..."
          : null,
  });
}

export async function handleXCookiesSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as {
    auth_token?: string;
    ct0?: string;
  };

  const authToken = body?.auth_token?.trim();
  const ct0 = body?.ct0?.trim();

  if (!authToken || !ct0) {
    sendJson(res, 400, {
      ok: false,
      error: "auth_token and ct0 are both required",
    });
    return;
  }

  try {
    await mkdir(COOKIE_FILE_DIR, { recursive: true });

    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      cookieMap: { auth_token: authToken, ct0 },
      source: "webui",
    };
    await writeFile(COOKIE_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

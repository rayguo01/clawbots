import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk";

const EZB_DIR = path.join(resolveStateDir(), "ezbookkeeping");

export type EzbCredential = {
  sessionKey: string;
  username: string;
  token: string;
  defaultAccountId: string;
  createdAt: number;
};

/** Replace non-alphanumeric characters with underscores for safe filenames. */
export function sanitizeKey(sessionKey: string): string {
  return sessionKey.replace(/[^a-zA-Z0-9]/g, "_");
}

export async function loadCredential(sessionKey: string): Promise<EzbCredential | null> {
  const filePath = path.join(EZB_DIR, `${sanitizeKey(sessionKey)}.json`);
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as EzbCredential;
  } catch {
    return null;
  }
}

export async function saveCredential(sessionKey: string, cred: EzbCredential): Promise<void> {
  await fs.promises.mkdir(EZB_DIR, { recursive: true });
  const filePath = path.join(EZB_DIR, `${sanitizeKey(sessionKey)}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(cred, null, 2), "utf-8");
}

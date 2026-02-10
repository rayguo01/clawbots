import fs from "node:fs/promises";
import type { SyncState } from "./types.js";

/**
 * Load sync state from JSON file. Returns empty state if file doesn't exist.
 */
export async function loadSyncState(filePath: string): Promise<SyncState> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return { last_synced_at: "", files: {} };
  }
}

/**
 * Save sync state to JSON file.
 */
export async function saveSyncState(filePath: string, state: SyncState): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

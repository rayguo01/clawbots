import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSyncState, saveSyncState } from "./sync-state.js";

describe("sync-state", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty state when file does not exist", async () => {
    const state = await loadSyncState(path.join(tmpDir, "sync-state.json"));
    expect(state.files).toEqual({});
    expect(state.last_synced_at).toBe("");
  });

  it("round-trips state through save/load", async () => {
    const filePath = path.join(tmpDir, "sync-state.json");
    const state = {
      last_synced_at: "2026-02-10T14:30:00Z",
      files: {
        abc123: {
          remote_id: "abc123",
          remote_modified: "2026-02-10T12:00:00Z",
          local_path: "report.md",
          hash: "sha256hex",
        },
      },
    };
    await saveSyncState(filePath, state);
    const loaded = await loadSyncState(filePath);
    expect(loaded).toEqual(state);
  });
});

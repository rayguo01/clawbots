import { describe, expect, it } from "vitest";
import { createKnowledgeSyncTool } from "./knowledge-tools.js";

describe("knowledge_sync tool", () => {
  it("creates a tool with correct name and schema", () => {
    const tool = createKnowledgeSyncTool({ knowledgeDir: "/tmp/test" });
    expect(tool.name).toBe("knowledge_sync");
    expect(tool.parameters).toBeDefined();
  });

  it("returns no-sources message when nothing configured", async () => {
    const tool = createKnowledgeSyncTool({
      knowledgeDir: "/tmp/test",
      getConfig: () => ({}),
    });
    const result = await tool.execute("call-1", {});
    expect(result.json.summary).toBe("No sources configured or enabled.");
  });

  it("calls syncGoogleDrive when google-drive is enabled", async () => {
    let called = false;
    const tool = createKnowledgeSyncTool({
      knowledgeDir: "/tmp/test",
      getConfig: () => ({ "google-drive": { enabled: true } }),
      syncGoogleDrive: async () => {
        called = true;
        return { added: 1, updated: 0, deleted: 0, errors: [] };
      },
    });
    const result = await tool.execute("call-2", { source: "google-drive" });
    expect(called).toBe(true);
    expect(result.json.summary).toContain("google-drive: +1");
  });

  it("calls syncNotion when notion is enabled", async () => {
    let called = false;
    const tool = createKnowledgeSyncTool({
      knowledgeDir: "/tmp/test",
      getConfig: () => ({ notion: { enabled: true } }),
      syncNotion: async () => {
        called = true;
        return { added: 2, updated: 1, deleted: 0, errors: [] };
      },
    });
    const result = await tool.execute("call-3", { source: "notion" });
    expect(called).toBe(true);
    expect(result.json.summary).toContain("notion: +2");
  });
});

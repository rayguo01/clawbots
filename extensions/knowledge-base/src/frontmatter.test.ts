import { describe, expect, it } from "vitest";
import { buildMarkdownWithFrontmatter } from "./frontmatter.js";

describe("buildMarkdownWithFrontmatter", () => {
  it("prepends YAML frontmatter to markdown content", () => {
    const result = buildMarkdownWithFrontmatter("# Hello", {
      source: "google-drive",
      original_path: "/docs/report.pdf",
      original_format: "pdf",
      synced_at: "2026-02-10T14:30:00Z",
      remote_modified: "2026-02-10T12:00:00Z",
      remote_id: "abc123",
    });
    expect(result).toContain("---\n");
    expect(result).toContain("source: google-drive\n");
    expect(result).toContain("original_path: /docs/report.pdf\n");
    expect(result).toContain("remote_id: abc123\n");
    expect(result).toContain("---\n# Hello");
  });
});

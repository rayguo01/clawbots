import type { KnowledgeFrontmatter } from "./types.js";

/**
 * Build a markdown string with YAML frontmatter prepended.
 */
export function buildMarkdownWithFrontmatter(markdown: string, meta: KnowledgeFrontmatter): string {
  const lines = [
    "---",
    `source: ${meta.source}`,
    `original_path: ${meta.original_path}`,
    `original_format: ${meta.original_format}`,
    `synced_at: ${meta.synced_at}`,
    `remote_modified: ${meta.remote_modified}`,
    `remote_id: ${meta.remote_id}`,
    "---",
  ];
  return `${lines.join("\n")}\n${markdown}`;
}

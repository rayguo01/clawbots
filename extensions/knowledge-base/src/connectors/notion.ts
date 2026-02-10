import fs from "node:fs/promises";
import path from "node:path";
import type { NotionKnowledgeConfig, SyncState } from "../types.js";
import type { SyncResult } from "./google-drive.js";
import { notionFetch } from "../../../notion/src/notion-api.js";
import { blocksToMarkdown } from "../converters/notion-blocks.js";
import { buildMarkdownWithFrontmatter } from "../frontmatter.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import { extractPageTitle, sanitizePageTitle } from "./notion-helpers.js";

export { sanitizePageTitle } from "./notion-helpers.js";

type NotionPage = {
  id: string;
  last_edited_time: string;
  properties?: Record<string, unknown>;
  url?: string;
};

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string;
};

type NotionBlocksResponse = {
  results?: Array<{ type: string; [key: string]: unknown }>;
  has_more?: boolean;
  next_cursor?: string;
};

/**
 * Fetch all blocks for a Notion page (recursive pagination).
 */
async function fetchPageBlocks(
  pageId: string,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
  const allBlocks: Array<{ type: string; [key: string]: unknown }> = [];
  let cursor: string | undefined;

  do {
    let url = `/blocks/${pageId}/children?page_size=100`;
    if (cursor) url += `&start_cursor=${cursor}`;

    const res = await notionFetch(url);
    const data = (await res.json()) as NotionBlocksResponse;

    allBlocks.push(...(data.results ?? []));
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return allBlocks;
}

/**
 * List pages from configured Notion databases.
 */
async function listPages(config: NotionKnowledgeConfig): Promise<NotionPage[]> {
  const allPages: NotionPage[] = [];
  const databases = config.databases ?? [];

  if (databases.length === 0) {
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filter: { value: "page", property: "object" },
        page_size: 100,
      };
      if (cursor) body.start_cursor = cursor;

      const res = await notionFetch("/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as NotionQueryResponse;
      allPages.push(...(data.results ?? []));
      cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
    } while (cursor);
  } else {
    for (const dbId of databases) {
      let cursor: string | undefined;
      do {
        const body: Record<string, unknown> = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;

        const res = await notionFetch(`/databases/${dbId}/query`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as NotionQueryResponse;
        allPages.push(...(data.results ?? []));
        cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
      } while (cursor);
    }
  }

  return allPages;
}

/**
 * Sync Notion pages to the local knowledge directory.
 */
export async function syncNotion(params: {
  config: NotionKnowledgeConfig;
  knowledgeDir: string;
}): Promise<SyncResult> {
  const { config, knowledgeDir } = params;
  const outDir = path.join(knowledgeDir, "notion");
  await fs.mkdir(outDir, { recursive: true });

  const stateFile = path.join(outDir, "sync-state.json");
  const prevState = await loadSyncState(stateFile);
  const result: SyncResult = { added: 0, updated: 0, deleted: 0, errors: [] };

  let remotePages: NotionPage[];
  try {
    remotePages = await listPages(config);
  } catch (err) {
    result.errors.push(`Failed to list pages: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const remoteIds = new Set(remotePages.map((p) => p.id));
  const newState: SyncState = {
    last_synced_at: new Date().toISOString(),
    files: {},
  };

  for (const page of remotePages) {
    const prev = prevState.files[page.id];
    if (prev && prev.remote_modified === page.last_edited_time) {
      newState.files[page.id] = prev;
      continue;
    }

    try {
      const blocks = await fetchPageBlocks(page.id);
      const markdownContent = blocksToMarkdown(blocks);
      const title = extractPageTitle(page);
      const localName = `${sanitizePageTitle(title)}.md`;
      const localPath = path.join(outDir, localName);

      const markdown = buildMarkdownWithFrontmatter(markdownContent, {
        source: "notion",
        original_path: title,
        original_format: "notion",
        synced_at: new Date().toISOString(),
        remote_modified: page.last_edited_time,
        remote_id: page.id,
      });

      await fs.writeFile(localPath, markdown, "utf-8");

      newState.files[page.id] = {
        remote_id: page.id,
        remote_modified: page.last_edited_time,
        local_path: localName,
        hash: "",
      };

      if (prev) {
        result.updated++;
      } else {
        result.added++;
      }
    } catch (err) {
      result.errors.push(
        `Failed to sync page "${page.id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Delete pages no longer in Notion
  for (const [remoteId, entry] of Object.entries(prevState.files)) {
    if (!remoteIds.has(remoteId)) {
      try {
        await fs.unlink(path.join(outDir, entry.local_path));
        result.deleted++;
      } catch {}
    }
  }

  await saveSyncState(stateFile, newState);
  return result;
}

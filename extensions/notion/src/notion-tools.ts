import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { notionFetch } from "./notion-api.js";

// ── Schemas ─────────────────────────────────────────────────

const SearchSchema = Type.Object({
  query: Type.Optional(Type.String({ description: "Search query text." })),
  filter: Type.Optional(
    Type.Object(
      {
        property: Type.String({ description: 'Must be "object".' }),
        value: Type.String({ description: '"page" or "database".' }),
      },
      { description: 'Filter by object type, e.g. { property: "object", value: "page" }.' },
    ),
  ),
  pageSize: Type.Optional(
    Type.Number({ description: "Max results (1-100). Default: 20.", minimum: 1, maximum: 100 }),
  ),
});

const GetPageSchema = Type.Object({
  pageId: Type.String({ description: "The page ID (UUID)." }),
});

const GetPageContentSchema = Type.Object({
  pageId: Type.String({ description: "The page/block ID to get children for." }),
  pageSize: Type.Optional(
    Type.Number({
      description: "Max blocks per request (1-100). Default: 50.",
      minimum: 1,
      maximum: 100,
    }),
  ),
});

const RichTextItem = Type.Object({
  text: Type.Object({
    content: Type.String({ description: "The text content." }),
    link: Type.Optional(Type.Object({ url: Type.String() }, { description: "Optional link." })),
  }),
});

const CreatePageSchema = Type.Object({
  parentPageId: Type.Optional(Type.String({ description: "Parent page ID (create as sub-page)." })),
  parentDatabaseId: Type.Optional(
    Type.String({ description: "Parent database ID (create as database entry)." }),
  ),
  title: Type.String({ description: "Page title." }),
  properties: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        "Additional properties (for database entries). Keys are property names, values follow Notion property value format.",
    }),
  ),
  content: Type.Optional(
    Type.Array(Type.Unknown(), {
      description:
        'Block objects to add as page content. E.g. [{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"text":{"content":"Hello"}}]}}]',
    }),
  ),
});

const UpdatePageSchema = Type.Object({
  pageId: Type.String({ description: "The page ID to update." }),
  properties: Type.Record(Type.String(), Type.Unknown(), {
    description:
      "Properties to update. Keys are property names, values follow Notion property value format.",
  }),
  archived: Type.Optional(Type.Boolean({ description: "Set true to archive (delete) the page." })),
});

const AppendBlocksSchema = Type.Object({
  pageId: Type.String({ description: "The page or block ID to append children to." }),
  children: Type.Array(Type.Unknown(), {
    description:
      'Block objects to append. E.g. [{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"text":{"content":"Hello"}}]}}]',
  }),
});

const QueryDatabaseSchema = Type.Object({
  databaseId: Type.String({ description: "The database (data source) ID to query." }),
  filter: Type.Optional(Type.Unknown({ description: "Notion filter object." })),
  sorts: Type.Optional(
    Type.Array(Type.Unknown(), {
      description: 'Sort objects. E.g. [{"property":"Date","direction":"descending"}]',
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({ description: "Max results (1-100). Default: 20.", minimum: 1, maximum: 100 }),
  ),
});

const GetDatabaseSchema = Type.Object({
  databaseId: Type.String({ description: "The database ID to retrieve." }),
});

const CreateDatabaseSchema = Type.Object({
  parentPageId: Type.String({ description: "Parent page ID to create database in." }),
  title: Type.String({ description: "Database title." }),
  properties: Type.Record(Type.String(), Type.Unknown(), {
    description:
      'Property schema definitions. E.g. {"Name":{"title":{}},"Status":{"select":{"options":[{"name":"Todo"},{"name":"Done"}]}}}',
  }),
  isInline: Type.Optional(
    Type.Boolean({
      description: "If true, database is embedded inline in the page. Default: false.",
    }),
  ),
});

// ── Tools ───────────────────────────────────────────────────

export function createNotionTools(): AnyAgentTool[] {
  return [
    createSearchTool(),
    createGetPageTool(),
    createGetPageContentTool(),
    createCreatePageTool(),
    createUpdatePageTool(),
    createAppendBlocksTool(),
    createQueryDatabaseTool(),
    createGetDatabaseTool(),
    createCreateDatabaseTool(),
  ];
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "Notion: Search",
    name: "notion_search",
    description: "Search for pages and databases in Notion by title or content.",
    parameters: SearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      if (params.query) body.query = params.query;
      if (params.filter) body.filter = params.filter;
      body.page_size = params.pageSize ?? 20;

      const res = await notionFetch("/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as NotionList;
      return jsonResult({
        results: data.results?.map(formatSearchResult) ?? [],
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      });
    },
  };
}

function createGetPageTool(): AnyAgentTool {
  return {
    label: "Notion: Get Page",
    name: "notion_get_page",
    description: "Get a Notion page's properties by ID.",
    parameters: GetPageSchema,
    execute: async (_toolCallId, args) => {
      const { pageId } = args as { pageId: string };
      const res = await notionFetch(`/pages/${encodeURIComponent(pageId)}`);
      const page = (await res.json()) as NotionPage;
      return jsonResult({ page: formatPage(page) });
    },
  };
}

function createGetPageContentTool(): AnyAgentTool {
  return {
    label: "Notion: Get Page Content",
    name: "notion_get_page_content",
    description: "Get the block content (children) of a Notion page.",
    parameters: GetPageContentSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const pageId = encodeURIComponent(String(params.pageId));
      const pageSize = params.pageSize ?? 50;
      const res = await notionFetch(`/blocks/${pageId}/children?page_size=${pageSize}`);
      const data = (await res.json()) as NotionList;
      return jsonResult({
        blocks: data.results ?? [],
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      });
    },
  };
}

function createCreatePageTool(): AnyAgentTool {
  return {
    label: "Notion: Create Page",
    name: "notion_create_page",
    description:
      "Create a new page in Notion. Can be a sub-page of another page or an entry in a database.",
    parameters: CreatePageSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;

      if (!params.parentPageId && !params.parentDatabaseId) {
        return jsonResult({ error: "Either parentPageId or parentDatabaseId is required." });
      }

      const body: Record<string, unknown> = {};

      if (params.parentDatabaseId) {
        body.parent = { database_id: params.parentDatabaseId };
        body.properties = {
          ...((params.properties as Record<string, unknown>) ?? {}),
          Name: { title: [{ text: { content: params.title } }] },
        };
      } else {
        body.parent = { page_id: params.parentPageId };
        body.properties = {
          title: { title: [{ text: { content: params.title } }] },
        };
      }

      if (params.content) {
        body.children = params.content;
      }

      const res = await notionFetch("/pages", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const page = (await res.json()) as NotionPage;
      return jsonResult({ created: true, page: formatPage(page) });
    },
  };
}

function createUpdatePageTool(): AnyAgentTool {
  return {
    label: "Notion: Update Page",
    name: "notion_update_page",
    description: "Update properties of an existing Notion page, or archive it.",
    parameters: UpdatePageSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const pageId = encodeURIComponent(String(params.pageId));
      const body: Record<string, unknown> = { properties: params.properties };
      if (params.archived !== undefined) body.archived = params.archived;

      const res = await notionFetch(`/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const page = (await res.json()) as NotionPage;
      return jsonResult({ updated: true, page: formatPage(page) });
    },
  };
}

function createAppendBlocksTool(): AnyAgentTool {
  return {
    label: "Notion: Append Blocks",
    name: "notion_append_blocks",
    description: "Append block content (paragraphs, headings, lists, etc.) to a Notion page.",
    parameters: AppendBlocksSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const pageId = encodeURIComponent(String(params.pageId));

      const res = await notionFetch(`/blocks/${pageId}/children`, {
        method: "PATCH",
        body: JSON.stringify({ children: params.children }),
      });
      const data = (await res.json()) as NotionList;
      return jsonResult({
        appended: true,
        blocks: data.results ?? [],
      });
    },
  };
}

function createQueryDatabaseTool(): AnyAgentTool {
  return {
    label: "Notion: Query Database",
    name: "notion_query_database",
    description:
      "Query a Notion database (data source) with optional filters and sorts. Returns pages that are entries in the database.",
    parameters: QueryDatabaseSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const dbId = encodeURIComponent(String(params.databaseId));
      const body: Record<string, unknown> = {};
      if (params.filter) body.filter = params.filter;
      if (params.sorts) body.sorts = params.sorts;
      body.page_size = params.pageSize ?? 20;

      const res = await notionFetch(`/databases/${dbId}/query`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as NotionList;
      return jsonResult({
        results: data.results?.map(formatPage) ?? [],
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      });
    },
  };
}

function createGetDatabaseTool(): AnyAgentTool {
  return {
    label: "Notion: Get Database",
    name: "notion_get_database",
    description: "Get a Notion database's schema (properties and their types).",
    parameters: GetDatabaseSchema,
    execute: async (_toolCallId, args) => {
      const { databaseId } = args as { databaseId: string };
      const res = await notionFetch(`/databases/${encodeURIComponent(databaseId)}`);
      const db = (await res.json()) as NotionDatabase;
      return jsonResult({
        database: {
          id: db.id,
          title: extractPlainText(db.title),
          properties: db.properties,
          url: db.url,
          archived: db.archived,
        },
      });
    },
  };
}

function createCreateDatabaseTool(): AnyAgentTool {
  return {
    label: "Notion: Create Database",
    name: "notion_create_database",
    description: "Create a new database inside a Notion page.",
    parameters: CreateDatabaseSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        parent: { page_id: params.parentPageId },
        title: [{ text: { content: params.title } }],
        properties: params.properties,
      };
      if (params.isInline) body.is_inline = true;

      const res = await notionFetch("/databases", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const db = (await res.json()) as NotionDatabase;
      return jsonResult({
        created: true,
        database: {
          id: db.id,
          title: extractPlainText(db.title),
          url: db.url,
        },
      });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type RichText = { plain_text?: string; text?: { content?: string } }[];

type NotionPage = {
  id?: string;
  object?: string;
  url?: string;
  archived?: boolean;
  created_time?: string;
  last_edited_time?: string;
  parent?: Record<string, unknown>;
  properties?: Record<string, unknown>;
};

type NotionDatabase = {
  id?: string;
  title?: RichText;
  properties?: Record<string, unknown>;
  url?: string;
  archived?: boolean;
};

type NotionList = {
  results?: Record<string, unknown>[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function extractPlainText(richText?: RichText): string {
  if (!richText) return "";
  return richText.map((t) => t.plain_text ?? t.text?.content ?? "").join("");
}

function formatPage(page: NotionPage) {
  return {
    id: page.id,
    url: page.url,
    archived: page.archived,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    parent: page.parent,
    properties: page.properties,
  };
}

function formatSearchResult(item: Record<string, unknown>) {
  const obj = item.object as string;
  if (obj === "page") {
    return formatPage(item as NotionPage);
  }
  // database
  const db = item as NotionDatabase;
  return {
    object: obj,
    id: db.id,
    title: extractPlainText(db.title),
    url: db.url,
    archived: db.archived,
    properties: db.properties,
  };
}

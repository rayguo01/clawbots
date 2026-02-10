import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { dropboxFetch, dropboxDownload } from "./dropbox-api.js";

// ── Schemas ─────────────────────────────────────────────────

const AccountSchema = Type.Object({});

const ListFolderSchema = Type.Object({
  path: Type.Optional(
    Type.String({
      description: 'Folder path to list. Use "" (empty string) for root. Default: root.',
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results (1-2000). Default: 50.", minimum: 1, maximum: 2000 }),
  ),
});

const SearchSchema = Type.Object({
  query: Type.String({ description: "Search query — matches file and folder names." }),
  maxResults: Type.Optional(
    Type.Number({ description: "Max results (1-100). Default: 20.", minimum: 1, maximum: 100 }),
  ),
});

const ReadTextFileSchema = Type.Object({
  path: Type.String({
    description: 'Full Dropbox path to the text file, e.g. "/Documents/notes.txt".',
  }),
});

const GetLinkSchema = Type.Object({
  path: Type.String({
    description: 'Full Dropbox path to the file, e.g. "/Documents/report.pdf".',
  }),
});

const GetMetadataSchema = Type.Object({
  path: Type.String({
    description: 'Full Dropbox path to file or folder, e.g. "/Documents" or "/Photos/pic.jpg".',
  }),
});

// ── Tools ───────────────────────────────────────────────────

export function createDropboxTools(): AnyAgentTool[] {
  return [
    createAccountTool(),
    createListFolderTool(),
    createSearchTool(),
    createReadTextFileTool(),
    createGetLinkTool(),
    createGetMetadataTool(),
  ];
}

function createAccountTool(): AnyAgentTool {
  return {
    label: "Dropbox: Account",
    name: "dropbox_account",
    description: "Get the user's Dropbox account info: name, email, storage usage.",
    parameters: AccountSchema,
    execute: async () => {
      const res = await dropboxFetch("/users/get_current_account");
      const data = (await res.json()) as DbxAccount;
      return jsonResult({
        name: data.name?.display_name,
        email: data.email,
        accountId: data.account_id,
        country: data.country,
        accountType: data.account_type?.[".tag"],
      });
    },
  };
}

function createListFolderTool(): AnyAgentTool {
  return {
    label: "Dropbox: List Folder",
    name: "dropbox_list_folder",
    description: "List files and folders in a Dropbox directory. Use empty path for root folder.",
    parameters: ListFolderSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const path = String(params.path ?? "");
      const limit = Number(params.limit ?? 50);

      const res = await dropboxFetch("/files/list_folder", { path, limit });
      const data = (await res.json()) as DbxListFolderResult;

      const entries = (data.entries ?? []).map((e) => ({
        name: e.name,
        path: e.path_display,
        type: e[".tag"],
        size: e[".tag"] === "file" ? e.size : undefined,
        modified: e[".tag"] === "file" ? e.client_modified : undefined,
      }));

      return jsonResult({
        path: path || "/",
        entries,
        count: entries.length,
        hasMore: data.has_more,
      });
    },
  };
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "Dropbox: Search",
    name: "dropbox_search",
    description: "Search for files and folders in Dropbox by name.",
    parameters: SearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = String(params.query);
      const maxResults = Number(params.maxResults ?? 20);

      const res = await dropboxFetch("/files/search_v2", {
        query,
        options: { max_results: maxResults },
      });
      const data = (await res.json()) as DbxSearchResult;

      const matches = (data.matches ?? []).map((m) => {
        const meta = m.metadata?.metadata;
        return {
          name: meta?.name,
          path: meta?.path_display,
          type: meta?.[".tag"],
          size: meta?.[".tag"] === "file" ? meta.size : undefined,
          modified: meta?.[".tag"] === "file" ? meta.client_modified : undefined,
        };
      });

      return jsonResult({ query, matches, count: matches.length, hasMore: data.has_more });
    },
  };
}

function createReadTextFileTool(): AnyAgentTool {
  return {
    label: "Dropbox: Read Text File",
    name: "dropbox_read_text_file",
    description:
      "Read the content of a text file from Dropbox (max 1 MB). Suitable for .txt, .md, .csv, .json, .xml, .html, .log, source code, etc.",
    parameters: ReadTextFileSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const path = String(params.path);

      // Get metadata first to check size
      const metaRes = await dropboxFetch("/files/get_metadata", { path });
      const meta = (await metaRes.json()) as DbxFileMetadata;

      if (meta[".tag"] !== "file") {
        return jsonResult({
          error: "Path is a folder, not a file. Use dropbox_list_folder to browse folders.",
        });
      }

      const MAX_SIZE = 1024 * 1024; // 1 MB
      if (meta.size && meta.size > MAX_SIZE) {
        return jsonResult({
          error: `File is too large (${formatBytes(meta.size)}). Maximum readable size is 1 MB. Use dropbox_get_link to get a download link instead.`,
          size: meta.size,
          path: meta.path_display,
        });
      }

      const dlRes = await dropboxDownload(path);
      const content = await dlRes.text();

      return jsonResult({
        path: meta.path_display,
        name: meta.name,
        size: meta.size,
        modified: meta.client_modified,
        content,
      });
    },
  };
}

function createGetLinkTool(): AnyAgentTool {
  return {
    label: "Dropbox: Get Link",
    name: "dropbox_get_link",
    description: "Get a temporary download link for a Dropbox file. The link is valid for 4 hours.",
    parameters: GetLinkSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const path = String(params.path);

      const res = await dropboxFetch("/files/get_temporary_link", { path });
      const data = (await res.json()) as { metadata?: DbxFileMetadata; link?: string };

      return jsonResult({
        path: data.metadata?.path_display,
        name: data.metadata?.name,
        size: data.metadata?.size,
        link: data.link,
      });
    },
  };
}

function createGetMetadataTool(): AnyAgentTool {
  return {
    label: "Dropbox: Metadata",
    name: "dropbox_get_metadata",
    description: "Get metadata for a file or folder in Dropbox (size, modified date, type).",
    parameters: GetMetadataSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const path = String(params.path);

      const res = await dropboxFetch("/files/get_metadata", { path });
      const meta = (await res.json()) as DbxFileMetadata;

      return jsonResult({
        name: meta.name,
        path: meta.path_display,
        type: meta[".tag"],
        size: meta[".tag"] === "file" ? meta.size : undefined,
        modified: meta[".tag"] === "file" ? meta.client_modified : undefined,
        isDownloadable: meta[".tag"] === "file" ? meta.is_downloadable : undefined,
      });
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ── Types ───────────────────────────────────────────────────

type DbxAccount = {
  account_id?: string;
  name?: { display_name?: string };
  email?: string;
  country?: string;
  account_type?: { ".tag"?: string };
};

type DbxFileMetadata = {
  ".tag"?: string;
  name?: string;
  path_display?: string;
  size?: number;
  client_modified?: string;
  is_downloadable?: boolean;
};

type DbxListFolderResult = {
  entries?: DbxFileMetadata[];
  has_more?: boolean;
  cursor?: string;
};

type DbxSearchMatch = {
  metadata?: { metadata?: DbxFileMetadata };
};

type DbxSearchResult = {
  matches?: DbxSearchMatch[];
  has_more?: boolean;
};

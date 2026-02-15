import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { googleFetch } from "./google-api.js";

const DRIVE_BASE = "/drive/v3";

const SearchSchema = Type.Object({
  query: Type.String({
    description:
      "Search query. Examples: \"name contains 'report'\", \"mimeType='application/pdf'\", \"'root' in parents\". Uses Google Drive query syntax.",
  }),
  maxResults: Type.Optional(
    Type.Number({ description: "Max files to return. Default: 10.", minimum: 1, maximum: 100 }),
  ),
});

const ListSchema = Type.Object({
  folderId: Type.Optional(
    Type.String({ description: "Folder ID to list. Default: 'root' (My Drive)." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Max files to return. Default: 20.", minimum: 1, maximum: 100 }),
  ),
});

const ReadSchema = Type.Object({
  fileId: Type.String({ description: "The file ID to read." }),
  exportMimeType: Type.Optional(
    Type.String({
      description:
        "Export format for Google Docs/Sheets/Slides. E.g. 'text/plain', 'text/csv', 'application/pdf'. Default: 'text/plain' for Docs, 'text/csv' for Sheets.",
    }),
  ),
});

const UploadSchema = Type.Object({
  name: Type.String({ description: "File name (e.g. 'notes.txt')." }),
  content: Type.String({ description: "Text content of the file." }),
  mimeType: Type.Optional(Type.String({ description: "MIME type. Default: 'text/plain'." })),
  folderId: Type.Optional(Type.String({ description: "Parent folder ID. Default: root." })),
});

const CreateFolderSchema = Type.Object({
  name: Type.String({ description: "Folder name to create." }),
  parentId: Type.Optional(
    Type.String({ description: "Parent folder ID. Default: root (My Drive)." }),
  ),
});

export function createDriveTools(): AnyAgentTool[] {
  return [
    createSearchTool(),
    createListTool(),
    createReadTool(),
    createUploadTool(),
    createCreateFolderTool(),
  ];
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "Google Drive: Search Files",
    name: "google_drive_search",
    description:
      "Search for files in Google Drive by name, type, or content. Returns file names, IDs, types, and links.",
    parameters: SearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const maxResults = Number(params.maxResults ?? 10);

      const qs = new URLSearchParams({
        q: String(params.query),
        pageSize: String(maxResults),
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
        orderBy: "modifiedTime desc",
      });

      const res = await googleFetch(`${DRIVE_BASE}/files?${qs}`);
      const data = (await res.json()) as { files?: DriveFile[] };
      const files = (data.files ?? []).map(formatFile);
      return jsonResult({ files, count: files.length });
    },
  };
}

function createListTool(): AnyAgentTool {
  return {
    label: "Google Drive: List Folder",
    name: "google_drive_list",
    description: "List files in a Google Drive folder. Defaults to root (My Drive).",
    parameters: ListSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const folderId = String(params.folderId ?? "root");
      const maxResults = Number(params.maxResults ?? 20);

      const qs = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: String(maxResults),
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
        orderBy: "folder,name",
      });

      const res = await googleFetch(`${DRIVE_BASE}/files?${qs}`);
      const data = (await res.json()) as { files?: DriveFile[] };
      const files = (data.files ?? []).map(formatFile);
      return jsonResult({ folderId, files, count: files.length });
    },
  };
}

const GOOGLE_DOC_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function createReadTool(): AnyAgentTool {
  return {
    label: "Google Drive: Read File",
    name: "google_drive_read",
    description:
      "Read the content of a file from Google Drive. Google Docs are exported as plain text, Sheets as CSV. Binary files return metadata only.",
    parameters: ReadSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const fileId = String(params.fileId);

      // Get file metadata first
      const metaRes = await googleFetch(
        `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime`,
      );
      const meta = (await metaRes.json()) as DriveFile;

      const exportType =
        String(params.exportMimeType ?? "") || GOOGLE_DOC_TYPES[meta.mimeType ?? ""];

      let content: string;
      if (exportType) {
        // Google Workspace file → export
        const res = await googleFetch(
          `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportType)}`,
        );
        content = await res.text();
      } else if (meta.mimeType?.startsWith("text/") || meta.mimeType === "application/json") {
        // Plain text / JSON → download
        const res = await googleFetch(
          `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
        );
        content = await res.text();
      } else {
        // Binary file → metadata only
        return jsonResult({
          file: formatFile(meta),
          content: null,
          note: "Binary file. Use webViewLink to open in browser.",
        });
      }

      // Truncate very large content
      const MAX_LEN = 50_000;
      const truncated = content.length > MAX_LEN;
      if (truncated) content = content.slice(0, MAX_LEN);

      return jsonResult({
        file: formatFile(meta),
        content,
        truncated,
      });
    },
  };
}

function createUploadTool(): AnyAgentTool {
  return {
    label: "Google Drive: Upload File",
    name: "google_drive_upload",
    description: "Create or upload a text file to Google Drive.",
    parameters: UploadSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = String(params.name);
      const content = String(params.content);
      const mimeType = String(params.mimeType ?? "text/plain");
      const folderId = params.folderId ? String(params.folderId) : undefined;

      // Multipart upload
      const metadata: Record<string, unknown> = { name, mimeType };
      if (folderId) metadata.parents = [folderId];

      const boundary = "nanobots_upload_boundary";
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const res = await googleFetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      const file = (await res.json()) as DriveFile;
      return jsonResult({ uploaded: true, file: formatFile(file) });
    },
  };
}

function createCreateFolderTool(): AnyAgentTool {
  return {
    label: "Google Drive: Create Folder",
    name: "google_drive_create_folder",
    description: "Create a folder in Google Drive. Returns the new folder's ID.",
    parameters: CreateFolderSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const name = String(params.name);
      const parentId = params.parentId ? String(params.parentId) : undefined;

      const metadata: Record<string, unknown> = {
        name,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parentId) metadata.parents = [parentId];

      const res = await googleFetch(`${DRIVE_BASE}/files?fields=id,name,mimeType,webViewLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const folder = (await res.json()) as DriveFile;
      return jsonResult({ created: true, folder: formatFile(folder) });
    },
  };
}

type DriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

function formatFile(f: DriveFile) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    link: f.webViewLink,
  };
}

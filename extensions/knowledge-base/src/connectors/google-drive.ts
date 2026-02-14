import fs from "node:fs/promises";
import path from "node:path";
import type { GoogleDriveKnowledgeConfig, SyncState } from "../types.js";
import { googleFetch } from "../../../google-services/src/google-api.js";
import { convertToMarkdown } from "../converters/index.js";
import { buildMarkdownWithFrontmatter } from "../frontmatter.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import {
  getGoogleDocExportType,
  isGoogleDocType,
  resolveFileExtension,
  sanitizeFileName,
} from "./google-drive-helpers.js";

export { resolveFileExtension, isGoogleDocType, sanitizeFileName } from "./google-drive-helpers.js";

/**
 * Create a folder in Google Drive. Returns the folder ID.
 */
export async function createGoogleDriveFolder(name: string, parentId?: string): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const res = await googleFetch("/drive/v3/files", {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Upload a text file to Google Drive. Returns the file ID.
 */
export async function uploadGoogleDriveFile(
  name: string,
  content: string,
  parentId: string,
): Promise<string> {
  const boundary = "nanobots_boundary";
  const metadata = JSON.stringify({
    name,
    parents: [parentId],
  });

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await googleFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Find a folder by name under a parent (or root). Returns folder ID or null.
 */
export async function findGoogleDriveFolder(
  name: string,
  parentId?: string,
): Promise<string | null> {
  const parent = parentId ? `'${parentId}'` : "'root'";
  const query = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parent} in parents and trashed=false`;
  const res = await googleFetch(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`,
  );
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

/**
 * Recursively create a directory structure with files on Google Drive.
 * entries is a flat list: { path: "dir/subdir/file.md", content?: "..." }
 * Entries without content are folder-only entries.
 *
 * If parentFolderId is provided, the rootName folder is created/found under
 * that parent instead of Drive top-level.
 */
export async function createStructureOnGoogleDrive(
  rootName: string,
  entries: Array<{ path: string; content?: string }>,
  parentFolderId?: string,
): Promise<{ folderId: string; created: { folders: number; files: number }; errors: string[] }> {
  const result = { folderId: "", created: { folders: 0, files: 0 }, errors: [] as string[] };

  // Find or create the rootName folder (under parentFolderId if given, else Drive root)
  let rootId = await findGoogleDriveFolder(rootName, parentFolderId);
  if (!rootId) {
    rootId = await createGoogleDriveFolder(rootName, parentFolderId);
    result.created.folders++;
  }
  result.folderId = rootId;

  // Cache of created folder paths → IDs
  const folderCache: Record<string, string> = { "": rootId };

  async function ensureFolder(folderPath: string): Promise<string> {
    if (folderCache[folderPath]) return folderCache[folderPath];
    const parts = folderPath.split("/");
    let currentPath = "";
    let parentId = rootId;
    for (const part of parts) {
      currentPath = currentPath ? currentPath + "/" + part : part;
      if (folderCache[currentPath]) {
        parentId = folderCache[currentPath];
        continue;
      }
      let folderId = await findGoogleDriveFolder(part, parentId);
      if (!folderId) {
        folderId = await createGoogleDriveFolder(part, parentId);
        result.created.folders++;
      }
      folderCache[currentPath] = folderId;
      parentId = folderId;
    }
    return parentId;
  }

  for (const entry of entries) {
    try {
      const lastSlash = entry.path.lastIndexOf("/");
      if (lastSlash === -1) {
        if (entry.content !== undefined) {
          await uploadGoogleDriveFile(entry.path, entry.content, rootId);
          result.created.files++;
        } else {
          await ensureFolder(entry.path);
        }
      } else {
        if (entry.content !== undefined) {
          const parentPath = entry.path.substring(0, lastSlash);
          const fileName = entry.path.substring(lastSlash + 1);
          const parentId = await ensureFolder(parentPath);
          await uploadGoogleDriveFile(fileName, entry.content, parentId);
          result.created.files++;
        } else {
          await ensureFolder(entry.path);
        }
      }
    } catch (err) {
      result.errors.push(`${entry.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  size?: string;
};

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

/**
 * List files in specified Google Drive folders.
 */
async function listFiles(config: GoogleDriveKnowledgeConfig): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  const folderIds: string[] = [];

  // If rootFolder is set, use it directly
  if (config.rootFolder?.id) {
    folderIds.push(config.rootFolder.id);
  }

  // Also check legacy folders config
  const folders = config.folders ?? [];
  for (const folder of folders) {
    const folderQuery = `name = '${folder.replace(/^\//, "")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const folderRes = await googleFetch(
      `/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
    );
    const folderData = (await folderRes.json()) as DriveListResponse;
    const folderId = folderData.files?.[0]?.id;
    if (folderId) folderIds.push(folderId);
  }

  const fileTypes = config.fileTypes ?? ["pdf", "docx", "md", "txt"];

  for (const folderId of folderIds) {
    let pageToken: string | undefined;
    do {
      const query = `'${folderId}' in parents and trashed = false`;
      let url = `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size),nextPageToken&pageSize=100`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const res = await googleFetch(url);
      const data = (await res.json()) as DriveListResponse;

      for (const file of data.files ?? []) {
        if (isGoogleDocType(file.mimeType)) {
          allFiles.push(file);
          continue;
        }
        const ext = resolveFileExtension(file.mimeType) ?? file.name.split(".").pop() ?? "";
        if (fileTypes.includes(ext)) {
          allFiles.push(file);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  return allFiles;
}

/**
 * Download a file from Google Drive and return its content as a Buffer.
 * Google Docs are exported via the export API; binary files via media download.
 */
async function downloadFile(file: DriveFile): Promise<{ buffer: Buffer; ext: string }> {
  const exportType = getGoogleDocExportType(file.mimeType);
  if (exportType) {
    const res = await googleFetch(
      `/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportType.mimeType)}`,
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, ext: exportType.ext };
  }
  const res = await googleFetch(`/drive/v3/files/${file.id}?alt=media`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = resolveFileExtension(file.mimeType) ?? file.name.split(".").pop() ?? "txt";
  return { buffer, ext };
}

export type SyncResult = {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
};

/**
 * Sync Google Drive files to the local knowledge directory.
 */
export async function syncGoogleDrive(params: {
  config: GoogleDriveKnowledgeConfig;
  knowledgeDir: string;
}): Promise<SyncResult> {
  const { config, knowledgeDir } = params;
  const outDir = path.join(knowledgeDir, "google-drive");
  await fs.mkdir(outDir, { recursive: true });

  const stateFile = path.join(outDir, "sync-state.json");
  const prevState = await loadSyncState(stateFile);
  const result: SyncResult = { added: 0, updated: 0, deleted: 0, errors: [] };

  let remoteFiles: DriveFile[];
  try {
    remoteFiles = await listFiles(config);
  } catch (err) {
    result.errors.push(`Failed to list files: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const remoteIds = new Set(remoteFiles.map((f) => f.id));
  const newState: SyncState = {
    last_synced_at: new Date().toISOString(),
    files: {},
  };

  for (const file of remoteFiles) {
    const prev = prevState.files[file.id];
    if (prev && prev.remote_modified === file.modifiedTime) {
      newState.files[file.id] = prev;
      continue;
    }

    try {
      const { buffer, ext } = await downloadFile(file);
      const converted = await convertToMarkdown(buffer, ext);
      if (!converted) {
        result.errors.push(`Unsupported format for "${file.name}" (${ext})`);
        continue;
      }

      const localName = `${sanitizeFileName(file.name.replace(/\.[^.]+$/, ""))}.md`;
      const localPath = path.join(outDir, localName);
      const markdown = buildMarkdownWithFrontmatter(converted.markdown, {
        source: "google-drive",
        original_path: file.name,
        original_format: ext,
        synced_at: new Date().toISOString(),
        remote_modified: file.modifiedTime,
        remote_id: file.id,
      });

      await fs.writeFile(localPath, markdown, "utf-8");

      newState.files[file.id] = {
        remote_id: file.id,
        remote_modified: file.modifiedTime,
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
        `Failed to sync "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Delete files that no longer exist remotely
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

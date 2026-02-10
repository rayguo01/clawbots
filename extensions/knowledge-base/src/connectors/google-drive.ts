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
  const folders = config.folders ?? [];

  for (const folder of folders) {
    const folderQuery = `name = '${folder.replace(/^\//, "")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const folderRes = await googleFetch(
      `/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
    );
    const folderData = (await folderRes.json()) as DriveListResponse;
    const folderId = folderData.files?.[0]?.id;
    if (!folderId) continue;

    let pageToken: string | undefined;
    do {
      const query = `'${folderId}' in parents and trashed = false`;
      const fileTypes = config.fileTypes ?? ["pdf", "docx", "md", "txt"];
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

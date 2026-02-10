/** Frontmatter metadata prepended to each synced knowledge document. */
export type KnowledgeFrontmatter = {
  source: string;
  original_path: string;
  original_format: string;
  synced_at: string;
  remote_modified: string;
  remote_id: string;
};

/** Per-file tracking entry in sync-state.json. */
export type SyncFileState = {
  remote_id: string;
  remote_modified: string;
  local_path: string;
  hash: string;
};

/** Top-level sync-state.json shape for each source. */
export type SyncState = {
  last_synced_at: string;
  files: Record<string, SyncFileState>;
};

/** Config for knowledge sync per source. */
export type KnowledgeSourceConfig = {
  enabled: boolean;
  syncInterval?: number;
};

export type GoogleDriveKnowledgeConfig = KnowledgeSourceConfig & {
  folders?: string[];
  fileTypes?: string[];
  maxFileSize?: string;
};

export type NotionKnowledgeConfig = KnowledgeSourceConfig & {
  databases?: string[];
};

export type KnowledgeConfig = {
  "google-drive"?: GoogleDriveKnowledgeConfig;
  notion?: NotionKnowledgeConfig;
};

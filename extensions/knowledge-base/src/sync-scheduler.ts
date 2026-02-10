import type { SyncFn } from "./knowledge-tools.js";
import type { KnowledgeConfig } from "./types.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Start periodic knowledge sync.
 * Returns a stop function to cancel the timer.
 */
export function startSyncScheduler(params: {
  knowledgeDir: string;
  getConfig: () => KnowledgeConfig;
  syncGoogleDrive?: SyncFn;
  syncNotion?: SyncFn;
  intervalMs?: number;
  log?: (message: string) => void;
}): () => void {
  const { knowledgeDir, getConfig, log } = params;
  const intervalMs = params.intervalMs ?? DEFAULT_INTERVAL_MS;

  const runSync = async () => {
    const config = getConfig();
    if (config["google-drive"]?.enabled && params.syncGoogleDrive) {
      try {
        const result = await params.syncGoogleDrive({
          config: config["google-drive"],
          knowledgeDir,
        });
        log?.(
          `Knowledge sync (Google Drive): +${result.added} updated:${result.updated} -${result.deleted}`,
        );
      } catch (err) {
        log?.(
          `Knowledge sync (Google Drive) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (config.notion?.enabled && params.syncNotion) {
      try {
        const result = await params.syncNotion({
          config: config.notion,
          knowledgeDir,
        });
        log?.(
          `Knowledge sync (Notion): +${result.added} updated:${result.updated} -${result.deleted}`,
        );
      } catch (err) {
        log?.(
          `Knowledge sync (Notion) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  const timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  return () => clearInterval(timer);
}

import { Type } from "@sinclair/typebox";
import type { KnowledgeConfig } from "./types.js";

export type SyncResult = {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
};

export type SyncFn = (params: { config: unknown; knowledgeDir: string }) => Promise<SyncResult>;

const KnowledgeSyncSchema = Type.Object({
  source: Type.Optional(
    Type.String({
      description:
        'Which knowledge source to sync: "all", "google-drive", or "notion". Default: "all".',
    }),
  ),
});

export type KnowledgeSyncToolParams = {
  knowledgeDir: string;
  getConfig?: () => KnowledgeConfig;
  syncGoogleDrive?: SyncFn;
  syncNotion?: SyncFn;
};

export function createKnowledgeSyncTool(params: KnowledgeSyncToolParams) {
  return {
    label: "Knowledge Sync",
    name: "knowledge_sync",
    description:
      "Trigger an immediate sync of the user's knowledge base from connected cloud services (Google Drive, Notion). Use when the user asks to refresh their documents or when you suspect data might be stale.",
    parameters: KnowledgeSyncSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      const rawArgs = (args ?? {}) as Record<string, unknown>;
      const source = String(rawArgs.source ?? "all");
      const config = params.getConfig?.() ?? {};
      const results: Record<string, SyncResult> = {};
      const errors: string[] = [];

      if (source === "all" || source === "google-drive") {
        if (config["google-drive"]?.enabled && params.syncGoogleDrive) {
          try {
            results["google-drive"] = await params.syncGoogleDrive({
              config: config["google-drive"],
              knowledgeDir: params.knowledgeDir,
            });
          } catch (err) {
            errors.push(`Google Drive: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      if (source === "all" || source === "notion") {
        if (config.notion?.enabled && params.syncNotion) {
          try {
            results.notion = await params.syncNotion({
              config: config.notion,
              knowledgeDir: params.knowledgeDir,
            });
          } catch (err) {
            errors.push(`Notion: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const summary = Object.entries(results)
        .map(
          ([src, r]) =>
            `${src}: +${r.added} updated:${r.updated} -${r.deleted}${r.errors.length ? ` (${r.errors.length} errors)` : ""}`,
        )
        .join("; ");

      return {
        type: "json" as const,
        json: {
          summary: summary || "No sources configured or enabled.",
          results,
          errors: errors.length ? errors : undefined,
        },
      };
    },
  };
}

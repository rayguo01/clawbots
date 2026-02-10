import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import path from "node:path";
import {
  emptyPluginConfigSchema,
  loadConfig,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "openclaw/plugin-sdk";
import type { KnowledgeConfig } from "./src/types.js";
import { syncGoogleDrive } from "./src/connectors/google-drive.js";
import { syncNotion } from "./src/connectors/notion.js";
import { createKnowledgeSyncTool } from "./src/knowledge-tools.js";
import { startSyncScheduler } from "./src/sync-scheduler.js";
import { registerKnowledgeRoutes } from "./src/web-routes.js";

function resolveKnowledgeDir(): string {
  const cfg = loadConfig();
  const agentId = resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return path.join(workspaceDir, "knowledge");
}

function getKnowledgeConfig(): KnowledgeConfig {
  const cfg = loadConfig();
  return ((cfg as Record<string, unknown>).knowledge as KnowledgeConfig) ?? {};
}

const plugin = {
  id: "knowledge-base",
  name: "Knowledge Base",
  description: "Sync documents from cloud services into searchable knowledge",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    const knowledgeDir = resolveKnowledgeDir();

    // Register knowledge_sync tool
    api.registerTool(
      createKnowledgeSyncTool({
        knowledgeDir,
        getConfig: getKnowledgeConfig,
        syncGoogleDrive,
        syncNotion,
      }),
    );

    // Register web config routes
    registerKnowledgeRoutes(api);

    // Start background sync scheduler
    startSyncScheduler({
      knowledgeDir,
      getConfig: getKnowledgeConfig,
      syncGoogleDrive,
      syncNotion,
      log: (msg) => console.log(`[knowledge-base] ${msg}`),
    });
  },
};

export default plugin;

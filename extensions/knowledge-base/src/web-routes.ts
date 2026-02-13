import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  writeConfigFile,
  readConfigFileSnapshot,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "openclaw/plugin-sdk";
import type { KnowledgeConfig } from "./types.js";
import { googleFetch } from "../../google-services/src/google-api.js";
import { notionFetch } from "../../notion/src/notion-api.js";
import { loadToken } from "../../web-setup/src/oauth/store.js";
import { syncGoogleDrive, createStructureOnGoogleDrive } from "./connectors/google-drive.js";
import { syncNotion } from "./connectors/notion.js";
import { loadSyncState } from "./sync-state.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

function resolveKnowledgeDir(): string {
  const cfg = loadConfig();
  const agentId = resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return path.join(workspaceDir, "knowledge");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadCompanyTemplateEntries(): Promise<Array<{ path: string; content?: string }>> {
  const entries: Array<{ path: string; content?: string }> = [];
  const templateDir = path.resolve(__dirname, "..", "templates", "company");
  const today = new Date().toISOString().split("T")[0];

  async function walk(dir: string, prefix: string): Promise<void> {
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const itemPath = prefix ? prefix + "/" + item.name : item.name;
      if (item.isDirectory()) {
        entries.push({ path: itemPath });
        await walk(path.join(dir, item.name), itemPath);
      } else if (item.name.endsWith(".md")) {
        let content = await fs.readFile(path.join(dir, item.name), "utf-8");
        content = content.replace(/\{\{date\}\}/g, today);
        entries.push({ path: itemPath, content });
      }
    }
  }

  await walk(templateDir, "");
  return entries;
}

/**
 * Register HTTP routes for knowledge base configuration UI.
 */
export function registerKnowledgeRoutes(api: OpenClawPluginApi) {
  // GET /api/knowledge/config — return current knowledge config
  api.registerHttpRoute({
    path: "/api/knowledge/config",
    handler: async (req, res) => {
      if (req.method === "GET") {
        const cfg = loadConfig();
        const knowledgeConfig = (cfg as Record<string, unknown>).knowledge ?? {};
        sendJson(res, 200, knowledgeConfig);
        return;
      }

      if (req.method === "PUT") {
        try {
          const body = await readBody(req);
          const newConfig = JSON.parse(body) as KnowledgeConfig;
          const snapshot = readConfigFileSnapshot();
          const current = snapshot ? JSON.parse(snapshot) : {};
          current.knowledge = newConfig;
          writeConfigFile(JSON.stringify(current, null, 2));
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 400, { error: String(err) });
        }
        return;
      }

      res.writeHead(405);
      res.end();
    },
  });

  // GET /api/knowledge/google-drive/folders — list Google Drive folders
  api.registerHttpRoute({
    path: "/api/knowledge/google-drive/folders",
    handler: async (req, res) => {
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }

      try {
        const token = await loadToken("google");
        if (!token) {
          sendJson(res, 200, { connected: false, folders: [] });
          return;
        }

        const query = `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
        const gRes = await googleFetch(
          `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100`,
        );
        const data = (await gRes.json()) as { files?: Array<{ id: string; name: string }> };
        const folders = (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
        sendJson(res, 200, { connected: true, folders });
      } catch (err) {
        sendJson(res, 500, {
          connected: true,
          folders: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  // GET /api/knowledge/notion/databases — list Notion databases
  api.registerHttpRoute({
    path: "/api/knowledge/notion/databases",
    handler: async (req, res) => {
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }

      try {
        const token = await loadToken("notion");
        if (!token) {
          sendJson(res, 200, { connected: false, databases: [] });
          return;
        }

        const nRes = await notionFetch("/search", {
          method: "POST",
          body: JSON.stringify({
            filter: { value: "database", property: "object" },
            page_size: 100,
          }),
        });
        const data = (await nRes.json()) as {
          results?: Array<{
            id: string;
            title?: Array<{ plain_text?: string }>;
          }>;
        };
        const databases = (data.results ?? []).map((db) => ({
          id: db.id,
          name: db.title?.[0]?.plain_text ?? db.id,
        }));
        sendJson(res, 200, { connected: true, databases });
      } catch (err) {
        sendJson(res, 500, {
          connected: true,
          databases: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  // GET /api/knowledge/status — sync status for each source
  api.registerHttpRoute({
    path: "/api/knowledge/status",
    handler: async (req, res) => {
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }

      try {
        const knowledgeDir = resolveKnowledgeDir();
        const gdStatePath = path.join(knowledgeDir, "google-drive", "sync-state.json");
        const nStatePath = path.join(knowledgeDir, "notion", "sync-state.json");

        const [gdState, nState, gdToken, nToken] = await Promise.all([
          loadSyncState(gdStatePath),
          loadSyncState(nStatePath),
          loadToken("google"),
          loadToken("notion"),
        ]);

        sendJson(res, 200, {
          "google-drive": {
            connected: !!gdToken,
            lastSynced: gdState.last_synced_at || null,
            fileCount: Object.keys(gdState.files).length,
          },
          notion: {
            connected: !!nToken,
            lastSynced: nState.last_synced_at || null,
            fileCount: Object.keys(nState.files).length,
          },
        });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    },
  });

  // POST /api/knowledge/sync — trigger immediate sync
  api.registerHttpRoute({
    path: "/api/knowledge/sync",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }

      try {
        const body = await readBody(req);
        const { source } = JSON.parse(body || "{}") as { source?: string };
        const cfg = loadConfig();
        const knowledgeConfig =
          ((cfg as Record<string, unknown>).knowledge as KnowledgeConfig) ?? {};
        const knowledgeDir = resolveKnowledgeDir();
        const results: Record<string, unknown> = {};

        if (source === "all" || source === "google-drive") {
          const gdConfig = knowledgeConfig["google-drive"];
          if (gdConfig?.enabled) {
            results["google-drive"] = await syncGoogleDrive({
              config: gdConfig,
              knowledgeDir,
            });
          } else {
            results["google-drive"] = { skipped: true, reason: "not enabled" };
          }
        }

        if (source === "all" || source === "notion") {
          const nConfig = knowledgeConfig.notion;
          if (nConfig?.enabled) {
            results.notion = await syncNotion({ config: nConfig, knowledgeDir });
          } else {
            results.notion = { skipped: true, reason: "not enabled" };
          }
        }

        sendJson(res, 200, { ok: true, results });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
  });

  // POST /api/knowledge/create-structure — create directory structure on cloud
  api.registerHttpRoute({
    path: "/api/knowledge/create-structure",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }

      try {
        const body = await readBody(req);
        const { template, rootName, target } = JSON.parse(body) as {
          template: "personal" | "company";
          rootName: string;
          target: "google-drive" | "dropbox";
        };

        if (!rootName || !target) {
          sendJson(res, 400, { error: "Missing rootName or target" });
          return;
        }

        if (target === "dropbox") {
          sendJson(res, 501, { error: "Dropbox support coming soon" });
          return;
        }

        let entries: Array<{ path: string; content?: string }>;

        if (template === "personal") {
          entries = [
            { path: "00_收件箱" },
            { path: "10_日记" },
            { path: "20_项目" },
            { path: "30_研究" },
            { path: "40_知识库" },
            { path: "50_资源" },
            { path: "90_计划" },
            { path: "99_系统/归档" },
            { path: "99_系统/提示词" },
            { path: "99_系统/模板" },
          ];
        } else {
          entries = await loadCompanyTemplateEntries();
        }

        const result = await createStructureOnGoogleDrive(rootName, entries);

        // Auto-add root folder to knowledge sync config
        if (result.folderId) {
          try {
            const snapshot = readConfigFileSnapshot();
            const current = snapshot ? JSON.parse(snapshot) : {};
            if (!current.knowledge) current.knowledge = {};
            if (!current.knowledge["google-drive"]) {
              current.knowledge["google-drive"] = { enabled: true, folders: [] };
            }
            const folders: string[] = current.knowledge["google-drive"].folders ?? [];
            if (!folders.includes(rootName)) {
              folders.push(rootName);
              current.knowledge["google-drive"].folders = folders;
              current.knowledge["google-drive"].enabled = true;
              writeConfigFile(JSON.stringify(current, null, 2));
            }
          } catch {}
        }

        sendJson(res, 200, {
          ok: true,
          folderId: result.folderId,
          created: result.created,
          errors: result.errors,
        });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
  });
}

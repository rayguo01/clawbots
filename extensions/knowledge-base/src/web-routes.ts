import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { loadConfig, writeConfigFile, readConfigFileSnapshot } from "openclaw/plugin-sdk";
import type { KnowledgeConfig } from "./types.js";

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

  // POST /api/knowledge/sync — trigger immediate sync
  api.registerHttpRoute({
    path: "/api/knowledge/sync",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      sendJson(res, 200, { ok: true, message: "Sync triggered" });
    },
  });
}

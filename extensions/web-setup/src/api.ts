import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSetupStatus } from "./config-bridge.js";
import { sendJson } from "./helpers.js";

export function registerApiRoutes(api: OpenClawPluginApi): void {
  api.registerHttpRoute({
    path: "/api/setup/status",
    handler: async (_req, res) => {
      const status = getSetupStatus();
      sendJson(res, 200, status);
    },
  });
}

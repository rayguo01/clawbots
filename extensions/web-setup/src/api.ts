import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { sendJson } from "./helpers.js";

export function registerApiRoutes(api: OpenClawPluginApi): void {
  api.registerHttpRoute({
    path: "/api/setup/status",
    handler: async (_req, res) => {
      sendJson(res, 200, { configured: false, currentStep: 1 });
    },
  });
}

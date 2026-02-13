import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createGitHubTools } from "./src/tools.js";

const plugin = {
  id: "github",
  name: "GitHub",
  description: "List repos and get commits from GitHub",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createGitHubTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

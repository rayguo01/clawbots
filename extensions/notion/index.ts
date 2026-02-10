import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createNotionTools } from "./src/notion-tools.js";

const plugin = {
  id: "notion",
  name: "Notion",
  description: "Notion page, database, and block tools for your AI agent",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createNotionTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

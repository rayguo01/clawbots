import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createXTools } from "./src/tools.js";

const plugin = {
  id: "x-cookie",
  name: "X (Twitter) Cookie",
  description: "Post, read, and search tweets on X (Twitter) using cookie authentication",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createXTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

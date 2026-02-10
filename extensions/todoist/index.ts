import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createTodoistTools } from "./src/todoist-tools.js";

const plugin = {
  id: "todoist",
  name: "Todoist",
  description: "Todoist task management tools for your AI agent",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createTodoistTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

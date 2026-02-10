import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createShipcastTools } from "./src/tools.js";

const plugin = {
  id: "shipcast",
  name: "Shipcast",
  description: "Auto-tweet your code updates from GitHub commits",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createShipcastTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createFitbitTools } from "./src/fitbit-tools.js";

const plugin = {
  id: "fitbit",
  name: "Fitbit",
  description: "Fitbit health and fitness data: activity, sleep, heart rate, and profile",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createFitbitTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

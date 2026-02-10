import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createMicrosoft365Tools } from "./src/microsoft-tools.js";

const plugin = {
  id: "microsoft365",
  name: "Microsoft 365",
  description: "Microsoft 365 Outlook email, calendar, and contacts via Microsoft Graph API",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createMicrosoft365Tools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createCalendarTools } from "./src/calendar.js";
import { createDriveTools } from "./src/drive.js";
import { createGmailTools } from "./src/gmail.js";

const plugin = {
  id: "google-services",
  name: "Google Services",
  description: "Google Calendar, Gmail, and Google Drive tools for your AI agent",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createCalendarTools()) {
      api.registerTool(tool);
    }
    for (const tool of createGmailTools()) {
      api.registerTool(tool);
    }
    for (const tool of createDriveTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

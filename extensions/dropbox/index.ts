import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createDropboxTools } from "./src/dropbox-tools.js";

const plugin = {
  id: "dropbox",
  name: "Dropbox",
  description: "Read-only Dropbox file browsing, search, and text file reading",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createDropboxTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

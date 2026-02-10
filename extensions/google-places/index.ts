import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createGooglePlacesTools } from "./src/places-tools.js";

const plugin = {
  id: "google-places",
  name: "Google Places",
  description: "Google Places search tools for finding restaurants, shops, and points of interest",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createGooglePlacesTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

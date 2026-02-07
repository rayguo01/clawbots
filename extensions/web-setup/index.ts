import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerApiRoutes } from "./src/api.js";
import { createStaticHandler } from "./src/static.js";

const plugin = {
  id: "web-setup",
  name: "Web Setup",
  description: "Web-based setup wizard for nanobots",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Static file serving for web UI
    api.registerHttpHandler(createStaticHandler());

    // REST API routes
    registerApiRoutes(api);
  },
};

export default plugin;

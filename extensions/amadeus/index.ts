import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createAmadeusTools } from "./src/amadeus-tools.js";

const plugin = {
  id: "amadeus",
  name: "Amadeus",
  description: "航班搜索、酒店搜索、机场查询工具（Amadeus Travel API）",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createAmadeusTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createAmapTools } from "./src/amap-tools.js";

const plugin = {
  id: "amap",
  name: "Amap (高德地图)",
  description: "高德地图 POI 搜索工具，查找餐厅、商店、景点等",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createAmapTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

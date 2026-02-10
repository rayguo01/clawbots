import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createWeatherTools } from "./src/weather-tools.js";

const plugin = {
  id: "openweathermap",
  name: "OpenWeatherMap",
  description: "天气查询工具：当前天气、天气预报、空气质量",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createWeatherTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

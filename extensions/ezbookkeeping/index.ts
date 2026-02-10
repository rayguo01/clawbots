import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createBookkeepingTools, TOOL_NAMES } from "./src/ezbookkeeping-tools.js";

const plugin = {
  id: "ezbookkeeping",
  name: "ezBookkeeping",
  description: "Personal bookkeeping tools powered by ezBookkeeping",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        if (!ctx.sessionKey) return null;
        return createBookkeepingTools(ctx.sessionKey);
      },
      { names: TOOL_NAMES },
    );
  },
};

export default plugin;

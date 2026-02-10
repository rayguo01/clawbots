import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createSpotifyTools } from "./src/spotify-tools.js";

const plugin = {
  id: "spotify",
  name: "Spotify",
  description: "Spotify playback control, search, and playlist tools for your AI agent",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    for (const tool of createSpotifyTools()) {
      api.registerTool(tool);
    }
  },
};

export default plugin;

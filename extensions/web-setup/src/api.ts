import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSetupStatus } from "./config-bridge.js";
import { sendJson } from "./helpers.js";
import { handleModelSave } from "./model-setup.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import { handleSkillsSave, handleSkillsStatus, handleSkillsToggle } from "./skills-setup.js";
import {
  handleTelegramDisconnect,
  handleTelegramSave,
  handleTelegramVerify,
} from "./telegram-setup.js";
import { handleWhatsAppQr, handleWhatsAppStatus } from "./whatsapp-setup.js";
import { handleXCookiesSave, handleXCookiesStatus } from "./x-cookies-setup.js";

export function registerApiRoutes(api: OpenClawPluginApi): void {
  // Setup status
  api.registerHttpRoute({
    path: "/api/setup/status",
    handler: async (_req, res) => {
      const status = getSetupStatus();
      sendJson(res, 200, status);
    },
  });

  // Telegram
  api.registerHttpRoute({ path: "/api/setup/telegram/verify", handler: handleTelegramVerify });
  api.registerHttpRoute({ path: "/api/setup/telegram/save", handler: handleTelegramSave });
  api.registerHttpRoute({
    path: "/api/setup/telegram/disconnect",
    handler: handleTelegramDisconnect,
  });

  // WhatsApp
  api.registerHttpRoute({ path: "/api/setup/whatsapp/qr", handler: handleWhatsAppQr });
  api.registerHttpRoute({ path: "/api/setup/whatsapp/status", handler: handleWhatsAppStatus });

  // Model
  api.registerHttpRoute({ path: "/api/setup/model/save", handler: handleModelSave });

  // Skills
  api.registerHttpRoute({ path: "/api/setup/skills/status", handler: handleSkillsStatus });
  api.registerHttpRoute({ path: "/api/setup/skills/save", handler: handleSkillsSave });
  api.registerHttpRoute({ path: "/api/setup/skills/toggle", handler: handleSkillsToggle });

  // X Cookies (for x-cookie extension)
  api.registerHttpRoute({ path: "/api/setup/x-cookies/status", handler: handleXCookiesStatus });
  api.registerHttpRoute({ path: "/api/setup/x-cookies/save", handler: handleXCookiesSave });

  // Admin services status (API key based)
  api.registerHttpRoute({
    path: "/api/setup/admin-services/status",
    handler: async (_req, res) => {
      sendJson(res, 200, {
        "google-places": { configured: !!process.env.NANOBOTS_GOOGLE_PLACES_API_KEY?.trim() },
        amap: { configured: !!process.env.NANOBOTS_AMAP_API_KEY?.trim() },
        openweathermap: { configured: !!process.env.NANOBOTS_OPENWEATHERMAP_API_KEY?.trim() },
        amadeus: { configured: !!process.env.NANOBOTS_AMADEUS_API_KEY?.trim() },
      });
    },
  });

  // OAuth
  registerOAuthRoutes(api);
}

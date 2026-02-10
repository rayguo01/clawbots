import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSetupStatus } from "./config-bridge.js";
import { sendJson } from "./helpers.js";
import { handleModelSave } from "./model-setup.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import { handleSkillsSave, handleSkillsStatus } from "./skills-setup.js";
import { handleTelegramSave, handleTelegramVerify } from "./telegram-setup.js";
import { handleWhatsAppQr, handleWhatsAppStatus } from "./whatsapp-setup.js";

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

  // WhatsApp
  api.registerHttpRoute({ path: "/api/setup/whatsapp/qr", handler: handleWhatsAppQr });
  api.registerHttpRoute({ path: "/api/setup/whatsapp/status", handler: handleWhatsAppStatus });

  // Model
  api.registerHttpRoute({ path: "/api/setup/model/save", handler: handleModelSave });

  // Skills
  api.registerHttpRoute({ path: "/api/setup/skills/status", handler: handleSkillsStatus });
  api.registerHttpRoute({ path: "/api/setup/skills/save", handler: handleSkillsSave });

  // OAuth
  registerOAuthRoutes(api);
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { bumpSkillsSnapshotVersion, loadConfig } from "openclaw/plugin-sdk";
import { updateConfig } from "./config-bridge.js";
import { readJsonBody, sendJson } from "./helpers.js";

function hasBinary(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function handleSkillsStatus(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const config = loadConfig();
    const entry = config.skills?.entries?.["nano-banana-pro"];
    const hasApiKey = !!entry?.apiKey;
    const hasEnvKey = !!(config.env?.vars as Record<string, string> | undefined)?.[
      "GEMINI_API_KEY"
    ];

    const audioEnabled = !!(config as any).tools?.media?.audio?.enabled;
    const ezbUrl = process.env.NANOBOTS_EZBOOKKEEPING_URL || "";
    const hasPython = hasBinary("python3");
    let hasDdgs = false;
    try {
      execSync('python3 -c "import ddgs"', { stdio: "ignore" });
      hasDdgs = true;
    } catch {}

    const hasCaminoKey =
      !!(config.env?.vars as Record<string, string> | undefined)?.["CAMINO_API_KEY"] ||
      !!process.env.CAMINO_API_KEY;

    const hasUsdaKey =
      !!process.env.NANOBOTS_USDA_API_KEY && process.env.NANOBOTS_USDA_API_KEY !== "DEMO_KEY";
    const hasUv = hasBinary("uv");

    sendJson(res, 200, {
      "nano-banana-pro": { configured: hasApiKey || hasEnvKey },
      ezbookkeeping: { configured: !!ezbUrl },
      "voice-message": { configured: audioEnabled },
      "food-scout": { configured: hasUv, hasFullApi: hasUsdaKey },
      "xiao-fan-ka": { configured: hasPython && hasDdgs },
      "xiao-chu-niang": { configured: true },
      "ai-news-collector": { configured: true },
      "deep-research": { configured: (hasApiKey || hasEnvKey) && hasBinary("uv") },
      "travel-planner": { configured: hasCaminoKey },
    });
  } catch {
    sendJson(res, 200, {
      "nano-banana-pro": { configured: false },
      ezbookkeeping: { configured: false },
      "voice-message": { configured: false },
      "food-scout": { configured: false },
      "xiao-fan-ka": { configured: false },
      "xiao-chu-niang": { configured: true },
      "ai-news-collector": { configured: true },
      "deep-research": { configured: false },
      "travel-planner": { configured: false },
    });
  }
}

export async function handleSkillsSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as Record<string, { apiKey?: string }>;
  const bananaEntry = body?.["nano-banana-pro"];

  if (!bananaEntry?.apiKey?.trim()) {
    sendJson(res, 400, { ok: false, error: "apiKey is required" });
    return;
  }

  try {
    const apiKey = bananaEntry.apiKey.trim();
    await updateConfig((config) => {
      config.skills ??= {};
      config.skills.entries ??= {};
      config.skills.entries["nano-banana-pro"] = {
        ...config.skills.entries["nano-banana-pro"],
        apiKey,
      };
      return config;
    });

    // Force skills snapshot rebuild so existing sessions pick up the new key
    bumpSkillsSnapshotVersion({ reason: "manual" });

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

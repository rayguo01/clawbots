import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { bumpSkillsSnapshotVersion, loadConfig } from "openclaw/plugin-sdk";
import { updateConfig } from "./config-bridge.js";
import { readJsonBody, sendJson } from "./helpers.js";
import { loadToken } from "./oauth/store.js";
import { hasXCookies } from "./x-cookies-setup.js";

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
    const skillEntries = config.skills?.entries ?? {};
    const entry = skillEntries["nano-banana-pro"];
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

    const ouraEntry = skillEntries["oura-ring"];
    const hasOuraKey = !!ouraEntry?.apiKey || !!process.env.OURA_TOKEN;

    const hasGitHubOAuth = !!(await loadToken("github"));
    const hasTwitterOAuth = !!(await loadToken("twitter"));
    const hasGoogleOAuth = !!(await loadToken("google"));
    const hasTodoistOAuth = !!(await loadToken("todoist"));
    const hasNotionOAuth = !!(await loadToken("notion"));
    const hasMicrosoft365OAuth = !!(await loadToken("microsoft365"));
    const hasFitbitOAuth = !!(await loadToken("fitbit"));
    const hasWeatherKey = !!process.env.NANOBOTS_OPENWEATHERMAP_API_KEY;

    const isEnabled = (id: string) => skillEntries[id]?.enabled !== false;

    sendJson(res, 200, {
      "nano-banana-pro": {
        configured: hasApiKey || hasEnvKey,
        enabled: isEnabled("nano-banana-pro"),
      },
      ezbookkeeping: { configured: !!ezbUrl, enabled: isEnabled("ezbookkeeping") },
      "voice-message": { configured: audioEnabled, enabled: isEnabled("voice-message") },
      "food-scout": { configured: hasUv, hasFullApi: hasUsdaKey, enabled: isEnabled("food-scout") },
      "xiao-fan-ka": { configured: hasPython && hasDdgs, enabled: isEnabled("xiao-fan-ka") },
      "xiao-chu-niang": { configured: true, enabled: isEnabled("xiao-chu-niang") },
      "ai-news-collector": { configured: true, enabled: isEnabled("ai-news-collector") },
      "deep-research": {
        configured: (hasApiKey || hasEnvKey) && hasBinary("uv"),
        enabled: isEnabled("deep-research"),
      },
      "travel-planner": { configured: hasCaminoKey, enabled: isEnabled("travel-planner") },
      luma: { configured: hasPython, enabled: isEnabled("luma") },
      "tophub-trends": { configured: hasPython, enabled: isEnabled("tophub-trends") },
      "world-news-trends": { configured: hasPython, enabled: isEnabled("world-news-trends") },
      humanizer: { configured: true, enabled: isEnabled("humanizer") },
      "oura-ring": { configured: hasOuraKey && hasUv, enabled: isEnabled("oura-ring") },
      "contract-agent": { configured: true, enabled: isEnabled("contract-agent") },
      shipcast: {
        configured: hasGitHubOAuth && hasXCookies(),
        enabled: isEnabled("shipcast"),
        requiredServices: ["github", "x-cookies"],
      },
      // OAuth-based skills
      weather: { configured: hasWeatherKey, enabled: isEnabled("weather") },
      "google-calendar": { configured: hasGoogleOAuth, enabled: isEnabled("google-calendar") },
      gmail: { configured: hasGoogleOAuth, enabled: isEnabled("gmail") },
      todoist: { configured: hasTodoistOAuth, enabled: isEnabled("todoist") },
      notion: { configured: hasNotionOAuth, enabled: isEnabled("notion") },
      microsoft365: { configured: hasMicrosoft365OAuth, enabled: isEnabled("microsoft365") },
      "fitbit-insights": { configured: hasFitbitOAuth, enabled: isEnabled("fitbit-insights") },
      // Baoyu visual skills — depend on nano-banana-pro for image generation
      "baoyu-article-illustrator": {
        configured: hasApiKey || hasEnvKey,
        enabled: isEnabled("baoyu-article-illustrator"),
      },
      "baoyu-infographic": {
        configured: hasApiKey || hasEnvKey,
        enabled: isEnabled("baoyu-infographic"),
      },
      "baoyu-xhs-images": {
        configured: hasApiKey || hasEnvKey,
        enabled: isEnabled("baoyu-xhs-images"),
      },
      "baoyu-cover-image": {
        configured: hasApiKey || hasEnvKey,
        enabled: isEnabled("baoyu-cover-image"),
      },
      // Baoyu utility skills — need bun runtime
      "x-assistant": {
        configured: hasXCookies(),
        enabled: isEnabled("x-assistant"),
      },
      "baoyu-url-to-markdown": {
        configured: hasBinary("bun") && hasBinary("chromium"),
        enabled: isEnabled("baoyu-url-to-markdown"),
      },
      // Marketing skills — pure text, always available
      "copy-editing": { configured: true, enabled: isEnabled("copy-editing") },
      copywriting: { configured: true, enabled: isEnabled("copywriting") },
      "marketing-psychology": { configured: true, enabled: isEnabled("marketing-psychology") },
      "marketing-ideas": { configured: true, enabled: isEnabled("marketing-ideas") },
      "social-content": { configured: true, enabled: isEnabled("social-content") },
      "pricing-strategy": { configured: true, enabled: isEnabled("pricing-strategy") },
      "page-cro": { configured: true, enabled: isEnabled("page-cro") },
      "launch-strategy": { configured: true, enabled: isEnabled("launch-strategy") },
      "onboarding-cro": { configured: true, enabled: isEnabled("onboarding-cro") },
      "email-sequence": { configured: true, enabled: isEnabled("email-sequence") },
    });
  } catch {
    sendJson(res, 200, {
      "nano-banana-pro": { configured: false, enabled: true },
      ezbookkeeping: { configured: false, enabled: true },
      "voice-message": { configured: false, enabled: true },
      "food-scout": { configured: false, enabled: true },
      "xiao-fan-ka": { configured: false, enabled: true },
      "xiao-chu-niang": { configured: true, enabled: true },
      "ai-news-collector": { configured: true, enabled: true },
      "deep-research": { configured: false, enabled: true },
      "travel-planner": { configured: false, enabled: true },
      luma: { configured: false, enabled: true },
      "tophub-trends": { configured: false, enabled: true },
      "world-news-trends": { configured: false, enabled: true },
      humanizer: { configured: true, enabled: true },
      "oura-ring": { configured: false, enabled: true },
      "contract-agent": { configured: true, enabled: true },
      shipcast: { configured: false, enabled: true, requiredServices: ["github", "x-cookies"] },
      weather: { configured: false, enabled: true },
      "google-calendar": { configured: false, enabled: true },
      gmail: { configured: false, enabled: true },
      todoist: { configured: false, enabled: true },
      notion: { configured: false, enabled: true },
      microsoft365: { configured: false, enabled: true },
      "fitbit-insights": { configured: false, enabled: true },
      "baoyu-article-illustrator": { configured: false, enabled: true },
      "baoyu-infographic": { configured: false, enabled: true },
      "baoyu-xhs-images": { configured: false, enabled: true },
      "baoyu-cover-image": { configured: false, enabled: true },
      "x-assistant": { configured: false, enabled: true },
      "baoyu-url-to-markdown": { configured: false, enabled: true },
      "copy-editing": { configured: true, enabled: true },
      copywriting: { configured: true, enabled: true },
      "marketing-psychology": { configured: true, enabled: true },
      "marketing-ideas": { configured: true, enabled: true },
      "social-content": { configured: true, enabled: true },
      "pricing-strategy": { configured: true, enabled: true },
      "page-cro": { configured: true, enabled: true },
      "launch-strategy": { configured: true, enabled: true },
      "onboarding-cro": { configured: true, enabled: true },
      "email-sequence": { configured: true, enabled: true },
    });
  }
}

// Skills whose API keys can be saved via the WebUI
const SAVEABLE_SKILLS = new Set(["nano-banana-pro", "oura-ring"]);

export async function handleSkillsSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as Record<string, { apiKey?: string }>;

  // Collect all valid skill API keys from the request
  const updates: Array<{ skillName: string; apiKey: string }> = [];
  for (const skillName of SAVEABLE_SKILLS) {
    const entry = body?.[skillName];
    if (entry?.apiKey?.trim()) {
      updates.push({ skillName, apiKey: entry.apiKey.trim() });
    }
  }

  if (updates.length === 0) {
    sendJson(res, 400, { ok: false, error: "apiKey is required" });
    return;
  }

  try {
    await updateConfig((config) => {
      config.skills ??= {};
      config.skills.entries ??= {};
      for (const { skillName, apiKey } of updates) {
        config.skills.entries[skillName] = {
          ...config.skills.entries[skillName],
          apiKey,
        };
      }
      return config;
    });

    // Force skills snapshot rebuild so existing sessions pick up the new key
    bumpSkillsSnapshotVersion({ reason: "manual" });

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

export async function handleSkillsToggle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as { skillId?: string; enabled?: boolean };
  const { skillId, enabled } = body ?? {};

  if (!skillId || typeof enabled !== "boolean") {
    sendJson(res, 400, { ok: false, error: "skillId (string) and enabled (boolean) are required" });
    return;
  }

  try {
    await updateConfig((config) => {
      config.skills ??= {};
      config.skills.entries ??= {};
      config.skills.entries[skillId] = {
        ...config.skills.entries[skillId],
        enabled,
      };
      return config;
    });

    bumpSkillsSnapshotVersion({ reason: "manual" });

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

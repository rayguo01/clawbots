import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { bumpSkillsSnapshotVersion, loadConfig } from "openclaw/plugin-sdk";
import { updateConfig } from "./config-bridge.js";
import { readJsonBody, sendJson } from "./helpers.js";
import { loadToken } from "./oauth/store.js";

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

    const ouraEntry = config.skills?.entries?.["oura-ring"];
    const hasOuraKey = !!ouraEntry?.apiKey || !!process.env.OURA_TOKEN;

    const hasGitHubOAuth = !!(await loadToken("github"));
    const hasTwitterOAuth = !!(await loadToken("twitter"));

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
      luma: { configured: hasPython },
      "tophub-trends": { configured: hasPython },
      "world-news-trends": { configured: hasPython },
      humanizer: { configured: true },
      "oura-ring": { configured: hasOuraKey && hasUv },
      "contract-agent": { configured: true },
      shipcast: { configured: hasGitHubOAuth && hasTwitterOAuth },
      // Baoyu visual skills — depend on nano-banana-pro for image generation
      "baoyu-article-illustrator": { configured: hasApiKey || hasEnvKey },
      "baoyu-infographic": { configured: hasApiKey || hasEnvKey },
      "baoyu-xhs-images": { configured: hasApiKey || hasEnvKey },
      "baoyu-cover-image": { configured: hasApiKey || hasEnvKey },
      // Baoyu utility skills — need bun runtime
      "baoyu-danger-x-to-markdown": { configured: hasBinary("bun") },
      "baoyu-url-to-markdown": { configured: hasBinary("bun") && hasBinary("chromium") },
      // Marketing skills — pure text, always available
      "copy-editing": { configured: true },
      copywriting: { configured: true },
      "marketing-psychology": { configured: true },
      "marketing-ideas": { configured: true },
      "social-content": { configured: true },
      "pricing-strategy": { configured: true },
      "page-cro": { configured: true },
      "launch-strategy": { configured: true },
      "onboarding-cro": { configured: true },
      "email-sequence": { configured: true },
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
      luma: { configured: false },
      "tophub-trends": { configured: false },
      "world-news-trends": { configured: false },
      humanizer: { configured: true },
      "oura-ring": { configured: false },
      "contract-agent": { configured: true },
      shipcast: { configured: false },
      "baoyu-article-illustrator": { configured: false },
      "baoyu-infographic": { configured: false },
      "baoyu-xhs-images": { configured: false },
      "baoyu-cover-image": { configured: false },
      "baoyu-danger-x-to-markdown": { configured: false },
      "baoyu-url-to-markdown": { configured: false },
      "copy-editing": { configured: true },
      copywriting: { configured: true },
      "marketing-psychology": { configured: true },
      "marketing-ideas": { configured: true },
      "social-content": { configured: true },
      "pricing-strategy": { configured: true },
      "page-cro": { configured: true },
      "launch-strategy": { configured: true },
      "onboarding-cro": { configured: true },
      "email-sequence": { configured: true },
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

import type { IncomingMessage, ServerResponse } from "node:http";
import { upsertAuthProfile, applyAuthProfileConfig } from "openclaw/plugin-sdk";
import { updateConfig } from "./config-bridge.js";
import { readJsonBody, sendJson } from "./helpers.js";

export async function handleModelSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const body = (await readJsonBody(req)) as {
    provider?: string;
    model?: string;
    apiKey?: string;
    authMode?: "api-key" | "setup-token";
    setupToken?: string;
  };

  const model = body.model?.trim();
  const provider = body.provider?.trim();
  const apiKey = body.apiKey?.trim();
  const authMode = body.authMode ?? "api-key";
  const setupToken = body.setupToken?.trim();

  if (!model) {
    sendJson(res, 400, { ok: false, error: "model is required" });
    return;
  }

  try {
    const modelId = provider ? `${provider}/${model}` : model;

    if (authMode === "setup-token") {
      // Validate setup token format
      if (!setupToken || !setupToken.startsWith("sk-ant-oat01-") || setupToken.length < 80) {
        sendJson(res, 400, {
          ok: false,
          error:
            "Invalid setup token. Must start with sk-ant-oat01- and be at least 80 characters.",
        });
        return;
      }

      // Store token in auth-profiles.json
      upsertAuthProfile({
        profileId: "anthropic:default",
        credential: { type: "token", provider: "anthropic", token: setupToken },
      });

      // Apply auth profile to config and set model
      await updateConfig((config) => {
        config = applyAuthProfileConfig(config, {
          profileId: "anthropic:default",
          provider: "anthropic",
          mode: "token",
        });
        config.agents ??= {};
        config.agents.defaults ??= {};
        config.agents.defaults.model = { primary: modelId };
        return config;
      });
    } else {
      // Original API Key flow
      await updateConfig((config) => {
        config.agents ??= {};
        config.agents.defaults ??= {};
        config.agents.defaults.model = { primary: modelId };

        if (apiKey && provider) {
          config.env ??= {};
          config.env.vars ??= {};
          const envKey = providerEnvKey(provider);
          if (envKey) {
            (config.env.vars as Record<string, string>)[envKey] = apiKey;
          }
        }

        return config;
      });
    }

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
}

function providerEnvKey(provider: string): string | null {
  switch (provider) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
    default:
      return null;
  }
}

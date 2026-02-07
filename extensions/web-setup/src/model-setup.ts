import type { IncomingMessage, ServerResponse } from "node:http";
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
  };

  const model = body.model?.trim();
  const provider = body.provider?.trim();
  const apiKey = body.apiKey?.trim();

  if (!model) {
    sendJson(res, 400, { ok: false, error: "model is required" });
    return;
  }

  try {
    // Build the full model identifier: provider/model (if provider given)
    const modelId = provider ? `${provider}/${model}` : model;

    await updateConfig((config) => {
      config.agents ??= {};
      config.agents.defaults ??= {};
      config.agents.defaults.model = modelId;

      // If API key provided, store it in env vars for the provider
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
      return "GOOGLE_API_KEY";
    default:
      return null;
  }
}

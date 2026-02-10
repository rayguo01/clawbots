import type { OpenClawConfig } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "openclaw/plugin-sdk";
import { resolveConfigPath, resolveStateDir } from "openclaw/plugin-sdk";

export type SetupStatus = {
  configured: boolean;
  currentStep: number;
  channels: {
    telegram: { configured: boolean; botToken?: string; userId?: string };
    whatsapp: { configured: boolean };
  };
  model: {
    configured: boolean;
    defaultModel?: string;
  };
};

export function getSetupStatus(): SetupStatus {
  try {
    const config = loadConfig();
    return buildStatus(config);
  } catch {
    return emptyStatus();
  }
}

function buildStatus(config: OpenClawConfig): SetupStatus {
  const tg = config.channels?.telegram;
  const hasToken = !!tg?.botToken;
  const allowFrom = tg?.allowFrom;
  const userId = allowFrom?.[0] != null ? String(allowFrom[0]) : undefined;

  // WhatsApp can be configured via channels.whatsapp OR plugins.entries.whatsapp
  const waChannelEnabled = config.channels?.whatsapp != null;
  const waPluginEnabled = (config as any).plugins?.entries?.whatsapp?.enabled === true;
  // Also check if WhatsApp credentials exist (linked device)
  const waCredsExist = isWhatsAppLinked();
  const waEnabled = waChannelEnabled || waPluginEnabled || waCredsExist;

  const agentModel = resolveDefaultModel(config);

  const hasChannel = hasToken || waEnabled;
  const hasModel = !!agentModel;

  let step = 1;
  if (hasChannel) step = 2;
  if (hasChannel && hasModel) step = 3;

  return {
    configured: hasChannel && hasModel,
    currentStep: step,
    channels: {
      telegram: {
        configured: hasToken,
        botToken: hasToken ? "***" : undefined,
        userId,
      },
      whatsapp: { configured: waEnabled },
    },
    model: {
      configured: hasModel,
      defaultModel: agentModel ?? undefined,
    },
  };
}

function isWhatsAppLinked(): boolean {
  try {
    const configDir = resolveConfigPath();
    const credsPath = path.join(configDir, "credentials", "whatsapp", "default", "creds.json");
    return fs.existsSync(credsPath);
  } catch {
    return false;
  }
}

function resolveDefaultModel(config: OpenClawConfig): string | null {
  // Check agents.defaults.model first
  const defaultsModel = config.agents?.defaults?.model;
  if (typeof defaultsModel === "string") return defaultsModel;
  if (typeof defaultsModel === "object" && defaultsModel?.primary) return defaultsModel.primary;

  // Check agents.list for the default agent
  const agents = config.agents?.list;
  if (agents) {
    const defaultAgent = agents.find((a) => a.default) ?? agents[0];
    if (defaultAgent) {
      if (typeof defaultAgent.model === "string") return defaultAgent.model;
      if (typeof defaultAgent.model === "object" && defaultAgent.model?.primary) {
        return defaultAgent.model.primary;
      }
    }
  }
  return null;
}

function emptyStatus(): SetupStatus {
  return {
    configured: false,
    currentStep: 1,
    channels: {
      telegram: { configured: false },
      whatsapp: { configured: false },
    },
    model: { configured: false },
  };
}

/**
 * Read current config, apply a mutator function, and write it back.
 */
export async function updateConfig(
  mutator: (config: OpenClawConfig) => OpenClawConfig,
): Promise<void> {
  let config: OpenClawConfig;
  try {
    const snapshot = await readConfigFileSnapshot();
    config = snapshot.config;
  } catch {
    config = {};
  }
  config = mutator(config);
  await writeConfigFile(config);
}

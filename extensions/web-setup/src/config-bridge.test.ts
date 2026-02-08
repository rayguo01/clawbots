import { describe, expect, it, vi } from "vitest";

// Mock the config module before importing config-bridge
vi.mock("openclaw/plugin-sdk", async () => {
  const actual = await vi.importActual("openclaw/plugin-sdk");
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    readConfigFileSnapshot: vi.fn(async () => ({ config: {} })),
    writeConfigFile: vi.fn(async () => {}),
    resolveConfigPath: vi.fn(() => "/tmp/test-nanobots.json"),
    resolveStateDir: vi.fn(() => "/tmp"),
  };
});

import { loadConfig } from "openclaw/plugin-sdk";
import { getSetupStatus } from "./config-bridge.js";

describe("getSetupStatus", () => {
  it("returns unconfigured status for empty config", () => {
    vi.mocked(loadConfig).mockReturnValue({});
    const status = getSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.currentStep).toBe(1);
    expect(status.channels.telegram.configured).toBe(false);
    expect(status.channels.whatsapp.configured).toBe(false);
    expect(status.model.configured).toBe(false);
  });

  it("detects telegram as configured when botToken is present", () => {
    vi.mocked(loadConfig).mockReturnValue({
      channels: {
        telegram: {
          botToken: "123:ABC",
          allowFrom: ["456"],
        },
      },
    });
    const status = getSetupStatus();
    expect(status.channels.telegram.configured).toBe(true);
    expect(status.channels.telegram.botToken).toBe("***");
    expect(status.channels.telegram.userId).toBe("456");
    expect(status.currentStep).toBe(2); // channel done, needs model
  });

  it("detects model as configured from agents.defaults.model", () => {
    vi.mocked(loadConfig).mockReturnValue({
      channels: {
        telegram: { botToken: "123:ABC", allowFrom: ["456"] },
      },
      agents: {
        defaults: { model: "anthropic/claude-sonnet-4-5-20250929" },
      },
    });
    const status = getSetupStatus();
    expect(status.model.configured).toBe(true);
    expect(status.model.defaultModel).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(status.configured).toBe(true);
    expect(status.currentStep).toBe(3);
  });

  it("detects model from agents.list with primary/fallback format", () => {
    vi.mocked(loadConfig).mockReturnValue({
      channels: {
        telegram: { botToken: "123:ABC", allowFrom: ["456"] },
      },
      agents: {
        list: [{ id: "main", default: true, model: { primary: "openai/gpt-4o" } }],
      },
    });
    const status = getSetupStatus();
    expect(status.model.configured).toBe(true);
    expect(status.model.defaultModel).toBe("openai/gpt-4o");
  });

  it("returns step 1 when no channels configured", () => {
    vi.mocked(loadConfig).mockReturnValue({
      agents: { defaults: { model: "anthropic/claude-sonnet-4-5-20250929" } },
    });
    const status = getSetupStatus();
    expect(status.currentStep).toBe(1);
    expect(status.configured).toBe(false);
  });

  it("handles loadConfig throwing an error", () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new Error("config not found");
    });
    const status = getSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.currentStep).toBe(1);
  });
});

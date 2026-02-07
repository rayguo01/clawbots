import { describe, expect, it } from "vitest";
import { applyPluginAutoEnable } from "./plugin-auto-enable.js";

describe("applyPluginAutoEnable", () => {
  it("enables configured channel plugins and updates allowlist", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x" } },
        plugins: { allow: ["telegram"] },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.slack?.enabled).toBe(true);
    expect(result.config.plugins?.allow).toEqual(["telegram", "slack"]);
    expect(result.changes.join("\n")).toContain("Slack configured, not enabled yet.");
  });

  it("respects explicit disable", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x" } },
        plugins: { entries: { slack: { enabled: false } } },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.slack?.enabled).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("enables provider auth plugins when profiles exist", () => {
    const result = applyPluginAutoEnable({
      config: {
        auth: {
          profiles: {
            "google-antigravity:default": {
              provider: "google-antigravity",
              mode: "oauth",
            },
          },
        },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.["google-antigravity-auth"]?.enabled).toBe(true);
  });

  it("skips when plugins are globally disabled", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x" } },
        plugins: { enabled: false },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.slack?.enabled).toBeUndefined();
    expect(result.changes).toEqual([]);
  });

  describe("preferOver channel prioritization", () => {
    it("prefers telegram: auto-enables telegram when configured", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            telegram: { botToken: "123:ABC" },
            slack: { botToken: "xoxb-test" },
          },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.telegram?.enabled).toBe(true);
      expect(result.config.plugins?.entries?.slack?.enabled).toBe(true);
      expect(result.changes.join("\n")).toContain("Telegram configured, not enabled yet.");
      expect(result.changes.join("\n")).toContain("Slack configured, not enabled yet.");
    });

    it("keeps telegram enabled if already explicitly enabled (non-destructive)", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            telegram: { botToken: "123:ABC" },
            slack: { botToken: "xoxb-test" },
          },
          plugins: { entries: { telegram: { enabled: true } } },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.telegram?.enabled).toBe(true);
      expect(result.config.plugins?.entries?.slack?.enabled).toBe(true);
    });

    it("allows telegram auto-enable when slack is explicitly disabled", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            telegram: { botToken: "123:ABC" },
            slack: { botToken: "xoxb-test" },
          },
          plugins: { entries: { slack: { enabled: false } } },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.slack?.enabled).toBe(false);
      expect(result.config.plugins?.entries?.telegram?.enabled).toBe(true);
      expect(result.changes.join("\n")).toContain("Telegram configured, not enabled yet.");
    });

    it("allows telegram auto-enable when slack is in deny list", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            telegram: { botToken: "123:ABC" },
            slack: { botToken: "xoxb-test" },
          },
          plugins: { deny: ["slack"] },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.slack?.enabled).toBeUndefined();
      expect(result.config.plugins?.entries?.telegram?.enabled).toBe(true);
    });

    it("enables telegram normally when only telegram is configured", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: { telegram: { botToken: "123:ABC" } },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.telegram?.enabled).toBe(true);
      expect(result.changes.join("\n")).toContain("Telegram configured, not enabled yet.");
    });
  });
});

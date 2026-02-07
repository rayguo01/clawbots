import { isTruthyEnvValue } from "../infra/env.js";
import { getCommandPath, hasHelpOrVersion } from "./argv.js";

export async function tryRouteCli(argv: string[]): Promise<boolean> {
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_ROUTE_FIRST)) {
    return false;
  }
  if (hasHelpOrVersion(argv)) {
    return false;
  }

  const path = getCommandPath(argv, 2);
  if (!path[0]) {
    return false;
  }

  const { findRoutedCommand } = await import("./program/command-registry.js");
  const route = findRoutedCommand(path);
  if (!route) {
    return false;
  }

  const { VERSION } = await import("../version.js");
  const { defaultRuntime } = await import("../runtime.js");
  const { emitCliBanner } = await import("./banner.js");
  const { ensureConfigReady } = await import("./program/config-guard.js");

  emitCliBanner(VERSION, { argv });
  await ensureConfigReady({ runtime: defaultRuntime, commandPath: path });

  if (route.loadPlugins) {
    const { ensurePluginRegistryLoaded } = await import("./plugin-registry.js");
    ensurePluginRegistryLoaded();
  }

  return route.run(argv);
}

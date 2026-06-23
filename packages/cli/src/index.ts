#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main } from "./app.js";

export function isMainModule(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}

export { main } from "./app.js";
export { createMultiAgentDemoEvents } from "./commands/demo.js";
export {
  createAntigravityProbeCommand,
  createSetupSnippets,
  formatCodexHooksSetup,
  resolveCrewlightCommand,
  renderHookCommand,
  type CodexHooksSetupResult,
  type SetupRuntime,
  type SetupSnippets,
} from "./commands/setup.js";
export {
  createDoctorRuntime,
  runDoctor,
  type DoctorCheck,
  type DoctorReport,
  type DoctorRuntime,
  type DoctorRuntimeOptions,
} from "./commands/doctor.js";
export {
  DASHBOARD_CAPABILITIES_TIMEOUT_MS,
  DaemonClient,
} from "./daemon-client.js";
export type { CrewlightClient } from "./daemon-client.js";

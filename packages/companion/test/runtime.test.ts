import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWindowsToasterPath } from "@crewlight/notifier";

import { resolveCrewlightCliContext } from "../src/runtime.js";

describe("desktop CLI runtime resolution", () => {
  it("uses node plus the built CLI entry in development", () => {
    const developmentEntry = join("packages", "cli", "dist", "index.js");
    const context = resolveCrewlightCliContext({
      isPackaged: false,
      nodeExecutable: "/usr/local/bin/node",
      platform: "linux",
    });

    expect(context.command).toBe("/usr/local/bin/node");
    expect(context.args.at(0)).toContain(developmentEntry);
    expect(context.setupRuntime.entryPath).toContain(developmentEntry);
    expect(context.displayCommand).toContain("/usr/local/bin/node");
  });

  it("uses the bundled standalone CLI from resources when packaged", () => {
    const context = resolveCrewlightCliContext({
      isPackaged: true,
      platform: "win32",
      resourcesPath: "C:\\Crewlight\\resources",
    });

    expect(context.command).toBe(
      "C:\\Crewlight\\resources\\crewlight-cli\\crewlight.exe",
    );
    expect(context.args).toEqual([]);
    expect(context.setupRuntime.isSea()).toBe(true);
    expect(resolveWindowsToasterPath(context.setupRuntime)).toBe(
      "C:\\Crewlight\\resources\\crewlight-cli\\resources\\snoretoast-x64.exe",
    );
  });
});

import { dirname, join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import type { SetupRuntime } from "@crewlight/cli";

export interface CrewlightCliContext {
  cliPath: string;
  command: string;
  args: string[];
  displayCommand: string;
  setupRuntime: SetupRuntime;
}

export interface ResolveCrewlightCliContextOptions {
  isPackaged: boolean;
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
  resourcesPath?: string;
}

function joinForPlatform(
  platform: NodeJS.Platform,
  ...parts: string[]
): string {
  return (platform === "win32" ? win32 : posix).join(...parts);
}

function quoteWindowsToken(token: string): string {
  return `"${token
    .replace(/(\\*)"/gu, '$1$1\\"')
    .replace(/(\\+)$/gu, "$1$1")}"`;
}

function quotePosixToken(token: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", `'\"'\"'`)}'`;
}

export function renderCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform,
): string {
  const quote = platform === "win32" ? quoteWindowsToken : quotePosixToken;
  return [command, ...args].map(quote).join(" ");
}

export function resolveCrewlightCliContext(
  options: ResolveCrewlightCliContextOptions,
): CrewlightCliContext {
  const platform = options.platform ?? process.platform;
  if (options.isPackaged) {
    const resourcesPath = options.resourcesPath ?? process.resourcesPath;
    const executableName = platform === "win32" ? "crewlight.exe" : "crewlight";
    const cliPath = joinForPlatform(
      platform,
      resourcesPath,
      "crewlight-cli",
      executableName,
    );
    return {
      cliPath,
      command: cliPath,
      args: [],
      displayCommand: renderCommand(cliPath, [], platform),
      setupRuntime: {
        isSea: () => true,
        execPath: cliPath,
        entryPath: undefined,
        platform,
      },
    };
  }

  const nodeExecutable =
    options.nodeExecutable ??
    process.env.npm_node_execpath ??
    process.env.NODE ??
    "node";
  const companionOutputDirectory = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = join(companionOutputDirectory, "..", "..", "..");
  const cliPath = join(workspaceRoot, "packages", "cli", "dist", "index.js");
  const args = [cliPath];
  return {
    cliPath,
    command: nodeExecutable,
    args,
    displayCommand: renderCommand(nodeExecutable, args, platform),
    setupRuntime: {
      isSea: () => false,
      execPath: nodeExecutable,
      entryPath: cliPath,
      platform,
    },
  };
}

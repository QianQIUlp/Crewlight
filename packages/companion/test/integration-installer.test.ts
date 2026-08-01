import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSetupSnippets, type SetupRuntime } from "@crewlight/cli";

import {
  discoverIntegrationPaths,
  inspectClaudeCodeIntegration,
  inspectCodexIntegration,
  installClaudeCodeIntegration,
  installCodexIntegration,
  type IntegrationInstallerOptions,
} from "../src/integration-installer.js";

const tempRoots: string[] = [];
const binary =
  process.platform === "win32"
    ? "C:\\Crewlight\\crewlight.exe"
    : "/opt/crewlight/crewlight";
const backupTime = new Date("2026-08-01T04:05:06.789Z");

async function createTempHome(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "crewlight-integration-"));
  tempRoots.push(path);
  return path;
}

function options(homeDirectory: string): IntegrationInstallerOptions {
  return {
    binary,
    homeDirectory,
    now: () => backupTime,
    platform: process.platform,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("fixed-path integration discovery", () => {
  it("returns only official user config paths and honors explicit CODEX_HOME", async () => {
    const homeDirectory = await createTempHome();
    const codexHome = join(homeDirectory, "custom-codex-home");

    expect(discoverIntegrationPaths({ homeDirectory, codexHome })).toEqual({
      claudeCodeSettings: join(homeDirectory, ".claude", "settings.json"),
      codexConfig: join(codexHome, "config.toml"),
      codexHooks: join(codexHome, "hooks.json"),
    });
    expect(() =>
      discoverIntegrationPaths({ homeDirectory: "relative/home" }),
    ).toThrow("homeDirectory must be an absolute path");
    expect(() =>
      discoverIntegrationPaths({ homeDirectory, codexHome: "../codex" }),
    ).toThrow("codexHome must be an absolute path");
  });
});

describe("Claude Code integration installation", () => {
  it("accepts pre-generated source-mode snippets from the desktop runtime", async () => {
    const homeDirectory = await createTempHome();
    const runtime: SetupRuntime =
      process.platform === "win32"
        ? {
            entryPath: "C:\\Crewlight\\packages\\cli\\dist\\index.js",
            execPath: "C:\\Node\\node.exe",
            isSea: () => false,
            platform: "win32",
          }
        : {
            entryPath: "/workspace/Crewlight/packages/cli/dist/index.js",
            execPath: "/usr/bin/node",
            isSea: () => false,
            platform: process.platform,
          };
    const snippets = createSetupSnippets(undefined, runtime);

    const installed = await installClaudeCodeIntegration({
      homeDirectory,
      snippets,
    });

    expect(installed).toMatchObject({ ok: true, status: "installed" });
    const settings = JSON.parse(
      await readFile(join(homeDirectory, ".claude", "settings.json"), "utf8"),
    ) as {
      hooks: {
        SessionStart: Array<{ hooks: Array<{ command: string }> }>;
      };
    };
    const command = settings.hooks.SessionStart[0]!.hooks[0]!.command;
    expect(command).toContain(runtime.execPath);
    expect(command).toContain(runtime.entryPath);
  });

  it("preserves existing settings and handlers, creates a backup, and is idempotent", async () => {
    const homeDirectory = await createTempHome();
    const settingsPath = join(homeDirectory, ".claude", "settings.json");
    await mkdir(join(homeDirectory, ".claude"), { recursive: true });
    const original = `${JSON.stringify(
      {
        alwaysThinkingEnabled: true,
        hooks: {
          Stop: [
            {
              hooks: [{ command: "existing-handler", type: "command" }],
            },
            {
              hooks: [
                {
                  command: "other-monitor ingest claude-code",
                  type: "command",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`;
    await writeFile(settingsPath, original, "utf8");

    const before = await inspectClaudeCodeIntegration(options(homeDirectory));
    expect(before.status).toBe("not-configured");

    const installed = await installClaudeCodeIntegration(
      options(homeDirectory),
    );
    expect(installed).toMatchObject({ ok: true, status: "installed" });
    expect(installed.files).toHaveLength(1);
    const backupPath = installed.files[0]?.backupPath;
    expect(backupPath).toContain("settings.json.backup-20260801T040506-789Z");
    await expect(readFile(backupPath!, "utf8")).resolves.toBe(original);

    const merged = JSON.parse(await readFile(settingsPath, "utf8")) as {
      alwaysThinkingEnabled: boolean;
      hooks: Record<string, unknown[]>;
    };
    expect(merged.alwaysThinkingEnabled).toBe(true);
    expect(merged.hooks.Stop?.[0]).toEqual({
      hooks: [{ command: "existing-handler", type: "command" }],
    });
    expect(merged.hooks.Stop?.[1]).toEqual({
      hooks: [{ command: "other-monitor ingest claude-code", type: "command" }],
    });
    expect(merged.hooks.Stop).toHaveLength(3);
    expect(merged.hooks.PermissionRequest).toHaveLength(1);

    const after = await inspectClaudeCodeIntegration(options(homeDirectory));
    expect(after.status).toBe("configured");
    const second = await installClaudeCodeIntegration(options(homeDirectory));
    expect(second).toMatchObject({ ok: true, status: "unchanged" });
    expect(
      (await readdir(join(homeDirectory, ".claude"))).filter((name) =>
        name.includes(".backup-"),
      ),
    ).toHaveLength(1);
  });

  it("replaces an older Crewlight hook path instead of adding duplicate handlers", async () => {
    const homeDirectory = await createTempHome();
    const oldBinary =
      process.platform === "win32"
        ? "C:\\Crewlight-old\\crewlight.exe"
        : "/opt/crewlight-old/crewlight";
    const newBinary =
      process.platform === "win32"
        ? "C:\\Crewlight-new\\crewlight.exe"
        : "/opt/crewlight-new/crewlight";

    await expect(
      installClaudeCodeIntegration({
        ...options(homeDirectory),
        binary: oldBinary,
      }),
    ).resolves.toMatchObject({ ok: true, status: "installed" });
    await expect(
      installClaudeCodeIntegration({
        ...options(homeDirectory),
        binary: newBinary,
      }),
    ).resolves.toMatchObject({ ok: true, status: "installed" });

    const settings = JSON.parse(
      await readFile(join(homeDirectory, ".claude", "settings.json"), "utf8"),
    ) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    for (const groups of Object.values(settings.hooks)) {
      const crewlightCommands = groups
        .flatMap((group) => group.hooks)
        .map((hook) => hook.command)
        .filter((command) => command.includes("ingest"));
      expect(crewlightCommands).toHaveLength(1);
      expect(crewlightCommands[0]).toContain(newBinary);
      expect(crewlightCommands[0]).not.toContain(oldBinary);
    }

    await expect(
      installClaudeCodeIntegration({
        ...options(homeDirectory),
        binary: newBinary,
      }),
    ).resolves.toMatchObject({ ok: true, status: "unchanged" });
  });

  it("refuses malformed JSON without changing or backing up the file", async () => {
    const homeDirectory = await createTempHome();
    const settingsDirectory = join(homeDirectory, ".claude");
    const settingsPath = join(settingsDirectory, "settings.json");
    await mkdir(settingsDirectory, { recursive: true });
    const malformed = '{"hooks":';
    await writeFile(settingsPath, malformed, "utf8");

    const result = await installClaudeCodeIntegration(options(homeDirectory));

    expect(result).toMatchObject({ ok: false, status: "refused" });
    await expect(readFile(settingsPath, "utf8")).resolves.toBe(malformed);
    expect(await readdir(settingsDirectory)).toEqual(["settings.json"]);
  });
});

describe("Codex integration installation", () => {
  it("merges notify and hooks while preserving unrelated config and existing handlers", async () => {
    const homeDirectory = await createTempHome();
    const codexDirectory = join(homeDirectory, ".codex");
    const configPath = join(codexDirectory, "config.toml");
    const hooksPath = join(codexDirectory, "hooks.json");
    await mkdir(codexDirectory, { recursive: true });
    const originalConfig = 'model = "gpt-5"\n\n[features]\nweb_search = true\n';
    const originalHooks = `${JSON.stringify(
      {
        hooks: {
          Stop: [
            {
              hooks: [{ command: "existing-handler", type: "command" }],
            },
          ],
        },
        managedByUser: true,
      },
      null,
      2,
    )}\n`;
    await writeFile(configPath, originalConfig, "utf8");
    await writeFile(hooksPath, originalHooks, "utf8");

    const installed = await installCodexIntegration(options(homeDirectory));

    expect(installed).toMatchObject({ ok: true, status: "installed" });
    expect(installed.files).toHaveLength(2);
    expect(installed.files.every((file) => file.backupPath)).toBe(true);
    await expect(
      readFile(installed.files[0]!.backupPath!, "utf8"),
    ).resolves.toBe(originalConfig);
    await expect(
      readFile(installed.files[1]!.backupPath!, "utf8"),
    ).resolves.toBe(originalHooks);

    const config = await readFile(configPath, "utf8");
    expect(config).toContain('model = "gpt-5"');
    expect(config).toContain("notify = [");
    expect(config.indexOf("notify = [")).toBeLessThan(
      config.indexOf("[features]"),
    );
    expect(config).toContain("web_search = true");

    const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: Record<string, unknown[]>;
      managedByUser: boolean;
    };
    expect(hooks.managedByUser).toBe(true);
    expect(hooks.hooks.Stop?.[0]).toEqual({
      hooks: [{ command: "existing-handler", type: "command" }],
    });
    expect(hooks.hooks.Stop).toHaveLength(2);
    expect(hooks.hooks.PermissionRequest).toHaveLength(1);

    await expect(
      inspectCodexIntegration(options(homeDirectory)),
    ).resolves.toMatchObject({ status: "configured" });
    await expect(
      installCodexIntegration(options(homeDirectory)),
    ).resolves.toMatchObject({ ok: true, status: "unchanged" });
  });

  it("refuses to overwrite a different existing notify command", async () => {
    const homeDirectory = await createTempHome();
    const codexDirectory = join(homeDirectory, ".codex");
    const configPath = join(codexDirectory, "config.toml");
    await mkdir(codexDirectory, { recursive: true });
    const original =
      'notify = ["other-notifier", "--desktop"]\nmodel = "gpt-5"\n';
    await writeFile(configPath, original, "utf8");

    const inspected = await inspectCodexIntegration(options(homeDirectory));
    expect(inspected.status).toBe("conflict");
    const installed = await installCodexIntegration(options(homeDirectory));
    expect(installed).toMatchObject({ ok: false, status: "refused" });
    await expect(readFile(configPath, "utf8")).resolves.toBe(original);
    expect(await readdir(codexDirectory)).toEqual(["config.toml"]);
  });

  it("refuses malformed TOML before creating either Codex file", async () => {
    const homeDirectory = await createTempHome();
    const codexDirectory = join(homeDirectory, ".codex");
    const configPath = join(codexDirectory, "config.toml");
    await mkdir(codexDirectory, { recursive: true });
    const malformed = "model = ???\n";
    await writeFile(configPath, malformed, "utf8");

    const result = await installCodexIntegration(options(homeDirectory));

    expect(result).toMatchObject({ ok: false, status: "refused" });
    await expect(readFile(configPath, "utf8")).resolves.toBe(malformed);
    expect(await readdir(codexDirectory)).toEqual(["config.toml"]);
  });

  it("fails closed when Windows Codex hooks cannot represent the binary path", async () => {
    const homeDirectory = await createTempHome();
    const result = await installCodexIntegration({
      binary: "C:\\Program Files\\Crewlight\\crewlight.exe",
      homeDirectory,
      platform: "win32",
    });

    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    await expect(readdir(homeDirectory)).resolves.toEqual([]);
  });
});

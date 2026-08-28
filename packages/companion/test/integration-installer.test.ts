import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SetupSnippets } from "@crewlight/cli";

import {
  inspectIntegration,
  type IntegrationInspectionOptions,
} from "../src/integration-installer.js";

const tempRoots: string[] = [];

function snippets(): SetupSnippets {
  const claudeHandler = {
    type: "command",
    command: "crewlight ingest claude-code",
  };
  const codexHandler = {
    type: "command",
    command: "crewlight ingest codex-hook",
  };
  return {
    claudeCode: JSON.stringify({
      hooks: { Stop: [{ hooks: [claudeHandler] }] },
    }),
    codexHooks: {
      available: true,
      snippet: JSON.stringify({
        hooks: { Stop: [{ hooks: [codexHandler] }] },
      }),
    },
  } as SetupSnippets;
}

async function options(): Promise<
  IntegrationInspectionOptions & { root: string }
> {
  const root = await mkdtemp(join(tmpdir(), "crewlight-integration-"));
  tempRoots.push(root);
  return {
    root,
    homeDirectory: root,
    codexHome: join(root, "codex"),
    snippets: snippets(),
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("integration inspection", () => {
  it("reports a missing Claude file without creating it", async () => {
    const setup = await options();
    const result = await inspectIntegration("claude-code", setup);
    const path = join(setup.root, ".claude", "settings.json");

    expect(result.status).toBe("not-configured");
    expect(result.targets).toEqual([
      expect.objectContaining({ path, state: "missing" }),
    ]);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("recognizes configured Claude hooks", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    const source = JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: "crewlight ingest claude-code" },
            ],
          },
        ],
      },
    });
    await mkdir(join(setup.root, ".claude"), { recursive: true });
    await writeFile(path, source);

    const result = await inspectIntegration("claude-code", setup);

    expect(result.status).toBe("configured");
    expect(result.targets).toEqual([
      expect.objectContaining({ path, state: "configured" }),
    ]);
    expect(await readFile(path, "utf8")).toBe(source);
  });

  it("reports stale hooks without changing their bytes", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    const source = JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "crewlight ingest claude-code --old",
              },
            ],
          },
        ],
      },
    });
    await mkdir(join(setup.root, ".claude"), { recursive: true });
    await writeFile(path, source);

    const result = await inspectIntegration("claude-code", setup);

    expect(result.status).toBe("not-configured");
    expect(result.targets).toEqual([
      expect.objectContaining({ path, state: "needs-update" }),
    ]);
    expect(await readFile(path, "utf8")).toBe(source);
  });

  it("leaves malformed and conflicting files byte-for-byte unchanged", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    await mkdir(join(setup.root, ".claude"), { recursive: true });

    const malformedSource = "not-json\n";
    await writeFile(path, malformedSource);
    const malformed = await inspectIntegration("claude-code", setup);
    expect(malformed.status).toBe("conflict");
    expect(malformed.targets).toEqual([
      expect.objectContaining({ path, state: "malformed" }),
    ]);
    expect(await readFile(path, "utf8")).toBe(malformedSource);

    const conflictSource = JSON.stringify({ hooks: "wrong" });
    await writeFile(path, conflictSource);
    const conflict = await inspectIntegration("claude-code", setup);
    expect(conflict.status).toBe("conflict");
    expect(conflict.targets).toEqual([
      expect.objectContaining({ path, state: "conflict" }),
    ]);
    expect(await readFile(path, "utf8")).toBe(conflictSource);
  });

  it("preserves the Codex config.toml while inspecting hooks", async () => {
    const setup = await options();
    const configPath = join(setup.codexHome!, "config.toml");
    const source = 'notify = ["legacy"]\n';
    await mkdir(setup.codexHome!, { recursive: true });
    await writeFile(configPath, source);

    const result = await inspectIntegration("codex", setup);

    expect(result.status).toBe("not-configured");
    expect(await readFile(configPath, "utf8")).toBe(source);
    expect(result.targets.find((target) => target.path === configPath)).toEqual(
      expect.objectContaining({ state: "configured" }),
    );
    await expect(
      readFile(join(setup.codexHome!, "hooks.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recognizes configured Codex hooks without changing either file", async () => {
    const setup = await options();
    const configPath = join(setup.codexHome!, "config.toml");
    const hooksPath = join(setup.codexHome!, "hooks.json");
    const configSource = 'notify = ["legacy"]\n';
    const hooksSource = JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: "crewlight ingest codex-hook" },
            ],
          },
        ],
      },
    });
    await mkdir(setup.codexHome!, { recursive: true });
    await writeFile(configPath, configSource);
    await writeFile(hooksPath, hooksSource);

    const result = await inspectIntegration("codex", setup);

    expect(result.status).toBe("configured");
    expect(await readFile(configPath, "utf8")).toBe(configSource);
    expect(await readFile(hooksPath, "utf8")).toBe(hooksSource);
  });

  it("rejects oversized and non-file integration targets without mutation", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    await mkdir(join(setup.root, ".claude"), { recursive: true });
    const oversized = "x".repeat(512 * 1024 + 1);
    await writeFile(path, oversized);
    const oversizedResult = await inspectIntegration("claude-code", setup);
    expect(oversizedResult.status).toBe("error");
    expect(await readFile(path, "utf8")).toBe(oversized);

    await rm(path);
    await mkdir(path);
    const directoryResult = await inspectIntegration("claude-code", setup);
    expect(directoryResult.status).toBe("error");
  });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  installIntegration,
  inspectIntegration,
  type IntegrationInstallerOptions,
} from "../src/integration-installer.js";
import type { SetupSnippets } from "@crewlight/cli";

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
  IntegrationInstallerOptions & { root: string }
> {
  const root = await mkdtemp(join(tmpdir(), "crewlight-integration-"));
  tempRoots.push(root);
  return {
    root,
    homeDirectory: root,
    codexHome: join(root, "codex"),
    snippets: snippets(),
    now: () => new Date("2026-08-09T00:00:00.000Z"),
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("integration installer", () => {
  it("installs Claude hooks into the user file and is idempotent", async () => {
    const setup = await options();
    const first = await installIntegration("claude-code", setup);
    expect(first.status).toBe("installed");
    const path = join(setup.root, ".claude", "settings.json");
    const firstSource = await readFile(path, "utf8");
    expect(JSON.parse(firstSource)).toMatchObject({
      hooks: {
        Stop: [{ hooks: [{ command: "crewlight ingest claude-code" }] }],
      },
    });

    const second = await installIntegration("claude-code", setup);
    expect(second.status).toBe("unchanged");
    expect(second.files.every((file) => file.backupPath === undefined)).toBe(
      true,
    );
    expect(await readFile(path, "utf8")).toBe(firstSource);
  });

  it("preserves unrelated hooks and replaces an older Crewlight handler", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    await (
      await import("node:fs/promises")
    ).mkdir(join(setup.root, ".claude"), {
      recursive: true,
    });
    await writeFile(
      path,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: "*",
              hooks: [{ type: "command", command: "echo keep" }],
            },
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
      }),
    );

    const result = await installIntegration("claude-code", setup);
    expect(result.status).toBe("installed");
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      hooks: { Stop: { hooks: { command: string }[] }[] };
    };
    expect(parsed.hooks.Stop).toHaveLength(2);
    expect(parsed.hooks.Stop[0]?.hooks[0]?.command).toBe("echo keep");
    expect(parsed.hooks.Stop[1]?.hooks[0]?.command).toBe(
      "crewlight ingest claude-code",
    );
  });

  it("refuses malformed and conflicting files without writing", async () => {
    const setup = await options();
    const path = join(setup.root, ".claude", "settings.json");
    await (
      await import("node:fs/promises")
    ).mkdir(join(setup.root, ".claude"), {
      recursive: true,
    });
    await writeFile(path, "not-json");
    const malformed = await inspectIntegration("claude-code", setup);
    expect(malformed.status).toBe("conflict");
    expect(await readFile(path, "utf8")).toBe("not-json");

    await writeFile(path, JSON.stringify({ hooks: "wrong" }));
    const conflict = await installIntegration("claude-code", setup);
    expect(conflict.status).toBe("refused");
    expect(await readFile(path, "utf8")).toBe(
      JSON.stringify({ hooks: "wrong" }),
    );
  });

  it("keeps Codex config.toml read-only while installing hooks", async () => {
    const setup = await options();
    const configPath = join(setup.root, "codex", "config.toml");
    await (
      await import("node:fs/promises")
    ).mkdir(setup.codexHome!, {
      recursive: true,
    });
    await writeFile(configPath, 'notify = ["legacy"]\n');
    const result = await installIntegration("codex", setup);
    expect(result.status).toBe("installed");
    expect(await readFile(configPath, "utf8")).toBe('notify = ["legacy"]\n');
    expect(
      await readFile(join(setup.codexHome!, "hooks.json"), "utf8"),
    ).toContain("codex-hook");
  });

  it("serializes concurrent installs and never duplicates the handler", async () => {
    const setup = await options();
    const results = await Promise.all([
      installIntegration("claude-code", setup),
      installIntegration("claude-code", setup),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "installed",
      "unchanged",
    ]);
    const content = await readFile(
      join(setup.root, ".claude", "settings.json"),
      "utf8",
    );
    expect(content.match(/crewlight ingest claude-code/gu)).toHaveLength(1);
  });
});

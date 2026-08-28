import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  createSetupSnippets,
  type SetupRuntime,
  type SetupSnippets,
} from "@crewlight/cli";

export type InspectableIntegration = "claude-code" | "codex";

export interface IntegrationPaths {
  readonly claudeCodeSettings: string;
  readonly codexConfig: string;
  readonly codexHooks: string;
}

export interface IntegrationPathOptions {
  readonly homeDirectory?: string;
  readonly codexHome?: string;
}

export interface IntegrationInspectionOptions extends IntegrationPathOptions {
  readonly binary?: string;
  readonly platform?: NodeJS.Platform;
  readonly snippets?: SetupSnippets;
}

export type IntegrationTargetState =
  | "configured"
  | "missing"
  | "needs-update"
  | "conflict"
  | "malformed"
  | "unavailable"
  | "error";

export interface IntegrationTargetInspection {
  readonly message: string;
  readonly path: string;
  readonly state: IntegrationTargetState;
}

export interface IntegrationInspectionResult {
  readonly integration: InspectableIntegration;
  readonly message: string;
  readonly status:
    | "configured"
    | "not-configured"
    | "conflict"
    | "unavailable"
    | "error";
  readonly targets: readonly IntegrationTargetInspection[];
}

interface ExistingFile {
  readonly exists: boolean;
  readonly source: string;
}

interface InspectedFile extends ExistingFile {
  readonly message: string;
  readonly path: string;
  readonly state: IntegrationTargetState;
}

const MAX_READ_BYTES = 512 * 1024;

export function discoverIntegrationPaths(
  options: IntegrationPathOptions = {},
): IntegrationPaths {
  const home = requireAbsoluteDirectory(
    options.homeDirectory ?? homedir(),
    "homeDirectory",
  );
  const codexHome = requireAbsoluteDirectory(
    options.codexHome ?? process.env.CODEX_HOME ?? join(home, ".codex"),
    "codexHome",
  );
  return {
    claudeCodeSettings: join(home, ".claude", "settings.json"),
    codexConfig: join(codexHome, "config.toml"),
    codexHooks: join(codexHome, "hooks.json"),
  };
}

export async function inspectIntegration(
  integration: InspectableIntegration,
  options: IntegrationInspectionOptions = {},
): Promise<IntegrationInspectionResult> {
  const inspected = await inspectIntegrationFiles(integration, options);
  return inspectionFromFiles(integration, inspected);
}

function requireAbsoluteDirectory(value: string, label: string): string {
  if (
    !value ||
    value.includes("\0") ||
    /[\r\n]/u.test(value) ||
    !isAbsolute(value)
  ) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return resolve(value);
}

function setupRuntime(platform: NodeJS.Platform): SetupRuntime {
  return {
    entryPath: process.argv[1],
    execPath: process.execPath,
    isSea: () => false,
    platform,
  };
}

function loadSnippets(options: IntegrationInspectionOptions): SetupSnippets {
  return (
    options.snippets ??
    createSetupSnippets(
      options.binary,
      setupRuntime(options.platform ?? process.platform),
      "cli",
    )
  );
}

async function inspectIntegrationFiles(
  integration: InspectableIntegration,
  options: IntegrationInspectionOptions,
): Promise<InspectedFile[]> {
  let paths: IntegrationPaths;
  try {
    paths = discoverIntegrationPaths(options);
  } catch {
    return [
      failedInspection(
        "",
        "unavailable",
        "The integration path cannot be represented safely. Copy setup is required.",
      ),
    ];
  }

  let snippets: SetupSnippets;
  try {
    snippets = loadSnippets(options);
  } catch {
    return integration === "claude-code"
      ? [
          failedInspection(
            paths.claudeCodeSettings,
            "unavailable",
            "Crewlight could not produce a safe Claude Code command.",
          ),
        ]
      : [
          failedInspection(
            paths.codexHooks,
            "unavailable",
            "Crewlight could not produce a safe Codex hooks command. Copy setup is required.",
          ),
        ];
  }

  if (integration === "claude-code") {
    return [
      await inspectJsonHooksFile(
        paths.claudeCodeSettings,
        snippets.claudeCode,
        integration,
      ),
    ];
  }

  if (!snippets.codexHooks.available) {
    return [
      await inspectCodexNotifyFile(paths.codexConfig),
      failedInspection(
        paths.codexHooks,
        "unavailable",
        "Codex hooks are not safe to inspect automatically. Copy setup is required.",
      ),
    ];
  }

  return [
    await inspectCodexNotifyFile(paths.codexConfig),
    await inspectJsonHooksFile(
      paths.codexHooks,
      snippets.codexHooks.snippet,
      integration,
    ),
  ];
}

function inspectionFromFiles(
  integration: InspectableIntegration,
  inspected: readonly InspectedFile[],
): IntegrationInspectionResult {
  const targets = inspected.map(({ message, path, state }) => ({
    message,
    path,
    state,
  }));
  const states = new Set(targets.map((target) => target.state));
  const status = states.has("error")
    ? "error"
    : states.has("unavailable")
      ? "unavailable"
      : states.has("conflict") || states.has("malformed")
        ? "conflict"
        : targets.every((target) => target.state === "configured")
          ? "configured"
          : "not-configured";
  const problem = targets.find((target) =>
    ["error", "unavailable", "conflict", "malformed"].includes(target.state),
  );
  return {
    integration,
    message:
      problem?.message ??
      (status === "configured"
        ? `Crewlight ${integration} hooks are configured.`
        : `Crewlight ${integration} setup is not configured in the fixed user configuration path.`),
    status,
    targets,
  };
}

async function readExistingFile(path: string): Promise<ExistingFile> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("not-regular-file");
    }
    if (metadata.size > MAX_READ_BYTES) {
      throw new Error("too-large");
    }
    return {
      exists: true,
      source: await readFile(path, "utf8"),
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return { exists: false, source: "" };
    }
    throw error;
  }
}

async function inspectJsonHooksFile(
  path: string,
  desiredSnippet: string,
  integration: InspectableIntegration,
): Promise<InspectedFile> {
  let existing: ExistingFile;
  try {
    existing = await readExistingFile(path);
  } catch {
    return failedInspection(
      path,
      "error",
      "The existing integration file is not a regular readable JSON file.",
    );
  }
  let desired: Record<string, unknown>;
  let current: unknown = {};
  try {
    desired = asRecord(JSON.parse(desiredSnippet));
    if (existing.exists) {
      current = JSON.parse(existing.source) as unknown;
    }
  } catch {
    return failedInspection(
      path,
      "malformed",
      "Crewlight could not parse the integration definition.",
    );
  }
  const root = asRecordOrUndefined(current);
  if (root === undefined) {
    return failedInspection(
      path,
      "conflict",
      "The integration definition has an incompatible top-level type.",
    );
  }
  const desiredHooks = asRecord(desired.hooks);
  const existingHooks = root.hooks;
  if (
    existingHooks !== undefined &&
    asRecordOrUndefined(existingHooks) === undefined
  ) {
    return failedInspection(
      path,
      "conflict",
      "The existing hooks field has an incompatible type.",
    );
  }
  const existingHookMap = asRecordOrUndefined(existingHooks) ?? {};
  let changed = !existing.exists;
  for (const [eventName, rawDesiredGroups] of Object.entries(desiredHooks)) {
    if (!Array.isArray(rawDesiredGroups)) {
      return failedInspection(
        path,
        "conflict",
        "Crewlight generated an invalid hook definition.",
      );
    }
    const existingGroups = existingHookMap[eventName];
    if (existingGroups !== undefined && !Array.isArray(existingGroups)) {
      return failedInspection(
        path,
        "conflict",
        "An existing hook event has an incompatible type.",
      );
    }
    let groups = (existingGroups as unknown[] | undefined) ?? [];
    for (const desiredGroup of rawDesiredGroups) {
      const nextGroups: unknown[] = [];
      let exact = false;
      let replaced = false;
      for (const group of groups) {
        if (isCrewlightGroup(group, integration)) {
          if (!replaced) {
            nextGroups.push(desiredGroup);
            replaced = true;
          }
          continue;
        }
        nextGroups.push(group);
      }
      if (!replaced) {
        nextGroups.push(desiredGroup);
      } else {
        exact = isDeepStrictEqual(groups, nextGroups);
      }
      if (!exact || !replaced) {
        changed = true;
      }
      groups = nextGroups;
    }
  }
  if (!changed) {
    return {
      ...existing,
      message: "Crewlight hooks are already present.",
      path,
      state: "configured",
    };
  }
  return {
    ...existing,
    message: existing.exists
      ? "Crewlight hooks are stale but can be updated without replacing unrelated handlers."
      : "Crewlight hooks are missing from the fixed user configuration path.",
    path,
    state: existing.exists ? "needs-update" : "missing",
  };
}

function isCrewlightGroup(
  value: unknown,
  integration: InspectableIntegration,
): boolean {
  const group = asRecordOrUndefined(value);
  if (!group || !Array.isArray(group.hooks) || group.hooks.length !== 1) {
    return false;
  }
  const handler = asRecordOrUndefined(group.hooks[0]);
  if (!handler || handler.type !== "command") {
    return false;
  }
  const commands = [handler.command, handler.commandWindows].filter(
    (command): command is string => typeof command === "string",
  );
  return commands.some((command) =>
    integration === "claude-code"
      ? /\bingest\b[\s"']+claude-code\b/iu.test(command)
      : /\bingest\b[\s"']+codex-hook\b/iu.test(command),
  );
}

async function inspectCodexNotifyFile(path: string): Promise<InspectedFile> {
  try {
    const existing = await readExistingFile(path);
    if (!existing.exists) {
      return {
        ...existing,
        message:
          "Existing Codex notify configuration was not found; it was left unchanged.",
        path,
        state: "configured",
      };
    }
    const hasNotify = /^\s*notify\s*=/mu.test(existing.source);
    return {
      ...existing,
      message: hasNotify
        ? "Existing Codex notify configuration was detected and left unchanged."
        : "Codex config.toml was inspected read-only; hooks setup does not modify it.",
      path,
      state: "configured",
    };
  } catch {
    return failedInspection(
      path,
      "error",
      "Crewlight could not safely inspect Codex config.toml.",
    );
  }
}

function failedInspection(
  path: string,
  state: Extract<
    IntegrationTargetState,
    "error" | "unavailable" | "conflict" | "malformed"
  >,
  message: string,
): InspectedFile {
  return { exists: false, message, path, source: "", state };
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = asRecordOrUndefined(value);
  if (!record) {
    throw new Error("expected-record");
  }
  return record;
}

function asRecordOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isNodeError(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: unknown }).code === code
  );
}

import { randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  createSetupSnippets,
  type SetupRuntime,
  type SetupSnippets,
} from "@crewlight/cli";

export type InstallableIntegration = "claude-code" | "codex";

export interface IntegrationPaths {
  readonly claudeCodeSettings: string;
  readonly codexConfig: string;
  readonly codexHooks: string;
}

export interface IntegrationPathOptions {
  readonly homeDirectory?: string;
  readonly codexHome?: string;
}

export interface IntegrationInstallerOptions extends IntegrationPathOptions {
  readonly binary?: string;
  readonly now?: () => Date;
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
  readonly integration: InstallableIntegration;
  readonly message: string;
  readonly status:
    | "configured"
    | "not-configured"
    | "conflict"
    | "unavailable"
    | "error";
  readonly targets: readonly IntegrationTargetInspection[];
}

export interface IntegrationFileInstallResult {
  readonly backupPath?: string;
  readonly message: string;
  readonly path: string;
  readonly status: "installed" | "unchanged" | "failed";
}

export interface IntegrationInstallResult {
  readonly files: readonly IntegrationFileInstallResult[];
  readonly integration: InstallableIntegration;
  readonly message: string;
  readonly ok: boolean;
  readonly status:
    | "installed"
    | "unchanged"
    | "refused"
    | "unavailable"
    | "failed";
}

interface ExistingFile {
  readonly exists: boolean;
  readonly mode?: number;
  readonly source: string;
}

interface PreparedFile extends ExistingFile {
  readonly message: string;
  readonly output?: string;
  readonly path: string;
  readonly state: IntegrationTargetState;
}

const MAX_READ_BYTES = 512 * 1024;
const locks = new Map<InstallableIntegration, Promise<void>>();

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
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInspectionResult> {
  const prepared = await prepareIntegration(integration, options);
  return inspectionFromPrepared(integration, prepared);
}

export function inspectClaudeCodeIntegration(
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInspectionResult> {
  return inspectIntegration("claude-code", options);
}

export function inspectCodexIntegration(
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInspectionResult> {
  return inspectIntegration("codex", options);
}

export async function installIntegration(
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInstallResult> {
  const previous = locks.get(integration) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const queued = previous.then(() => current);
  locks.set(integration, queued);
  await previous;
  try {
    return await installIntegrationUnlocked(integration, options);
  } finally {
    release();
    if (locks.get(integration) === queued) {
      locks.delete(integration);
    }
  }
}

export function installClaudeCodeIntegration(
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInstallResult> {
  return installIntegration("claude-code", options);
}

export function installCodexIntegration(
  options: IntegrationInstallerOptions = {},
): Promise<IntegrationInstallResult> {
  return installIntegration("codex", options);
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

function loadSnippets(options: IntegrationInstallerOptions): SetupSnippets {
  return (
    options.snippets ??
    createSetupSnippets(
      options.binary,
      setupRuntime(options.platform ?? process.platform),
      "cli",
    )
  );
}

async function prepareIntegration(
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions,
): Promise<PreparedFile[]> {
  let paths: IntegrationPaths;
  try {
    paths = discoverIntegrationPaths(options);
  } catch {
    return [
      failedPreparation(
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
          failedPreparation(
            paths.claudeCodeSettings,
            "unavailable",
            "Crewlight could not produce a safe Claude Code command.",
          ),
        ]
      : [
          failedPreparation(
            paths.codexHooks,
            "unavailable",
            "Crewlight could not produce a safe Codex hooks command. Copy setup is required.",
          ),
        ];
  }

  if (integration === "claude-code") {
    return [
      await prepareJsonHooksFile(paths.claudeCodeSettings, snippets.claudeCode),
    ];
  }

  if (!snippets.codexHooks.available) {
    return [
      await inspectCodexNotifyFile(paths.codexConfig),
      failedPreparation(
        paths.codexHooks,
        "unavailable",
        "Codex hooks are not safe to install automatically. Copy setup is required.",
      ),
    ];
  }

  return [
    await inspectCodexNotifyFile(paths.codexConfig),
    await prepareJsonHooksFile(paths.codexHooks, snippets.codexHooks.snippet),
  ];
}

async function installIntegrationUnlocked(
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions,
): Promise<IntegrationInstallResult> {
  const prepared = await prepareIntegration(integration, options);
  const inspection = inspectionFromPrepared(integration, prepared);
  if (
    inspection.status !== "configured" &&
    inspection.status !== "not-configured"
  ) {
    return {
      files: [],
      integration,
      message: inspection.message,
      ok: false,
      status:
        inspection.status === "unavailable"
          ? "unavailable"
          : inspection.status === "error"
            ? "failed"
            : "refused",
    };
  }

  const files: IntegrationFileInstallResult[] = [];
  for (const target of prepared) {
    if (target.state === "configured") {
      if (target.output === undefined) {
        // Read-only Codex config inspection is never written.
        continue;
      }
      files.push({
        message: target.message,
        path: target.path,
        status: "unchanged",
      });
      continue;
    }
    if (target.path === "" || target.output === undefined) {
      continue;
    }
    if (target.state !== "missing" && target.state !== "needs-update") {
      return {
        files,
        integration,
        message: target.message,
        ok: false,
        status: "failed",
      };
    }
    const result = await writePreparedFile(
      target,
      options.now ?? (() => new Date()),
    );
    files.push(result);
    if (result.status === "failed") {
      return {
        files,
        integration,
        message:
          "Crewlight could not safely update the integration file; the original was restored when possible.",
        ok: false,
        status: "failed",
      };
    }
  }
  const changed = files.some((file) => file.status === "installed");
  return {
    files,
    integration,
    message: changed
      ? `Crewlight ${integration} configuration was installed. Review and trust the definition in the tool's hooks UI.`
      : `Crewlight ${integration} configuration is already installed.`,
    ok: true,
    status: changed ? "installed" : "unchanged",
  };
}

function inspectionFromPrepared(
  integration: InstallableIntegration,
  prepared: readonly PreparedFile[],
): IntegrationInspectionResult {
  const targets = prepared.map(({ message, path, state }) => ({
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
        ? `Crewlight ${integration} configuration is installed.`
        : `Crewlight ${integration} can be installed in the fixed user configuration path.`),
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
    const file = await stat(path);
    if (file.size > MAX_READ_BYTES) {
      throw new Error("too-large");
    }
    return {
      exists: true,
      mode: file.mode,
      source: await readFile(path, "utf8"),
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return { exists: false, source: "" };
    }
    throw error;
  }
}

async function prepareJsonHooksFile(
  path: string,
  desiredSnippet: string,
): Promise<PreparedFile> {
  let existing: ExistingFile;
  try {
    existing = await readExistingFile(path);
  } catch {
    return failedPreparation(
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
    return failedPreparation(
      path,
      "malformed",
      "Crewlight could not parse the integration definition.",
    );
  }
  const root = asRecordOrUndefined(current);
  if (root === undefined) {
    return failedPreparation(
      path,
      "conflict",
      "The integration definition has an incompatible top-level type.",
    );
  }
  const merged = { ...(root ?? {}) };
  const desiredHooks = asRecord(desired.hooks);
  const existingHooks = merged.hooks;
  if (
    existingHooks !== undefined &&
    asRecordOrUndefined(existingHooks) === undefined
  ) {
    return failedPreparation(
      path,
      "conflict",
      "The existing hooks field has an incompatible type.",
    );
  }
  const mergedHooks: Record<string, unknown> = {
    ...(asRecordOrUndefined(existingHooks) ?? {}),
  };
  let changed = !existing.exists;
  for (const [eventName, rawDesiredGroups] of Object.entries(desiredHooks)) {
    if (!Array.isArray(rawDesiredGroups)) {
      return failedPreparation(
        path,
        "conflict",
        "Crewlight generated an invalid hook definition.",
      );
    }
    const existingGroups = mergedHooks[eventName];
    if (existingGroups !== undefined && !Array.isArray(existingGroups)) {
      return failedPreparation(
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
        if (isCrewlightGroup(group, integrationFromDesired(desiredHooks))) {
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
    mergedHooks[eventName] = groups;
  }
  merged.hooks = mergedHooks;
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
      ? "Crewlight hooks can be merged without replacing unrelated handlers."
      : "Crewlight hooks can be installed at the fixed user configuration path.",
    output: `${JSON.stringify(merged, null, 2)}\n`,
    path,
    state: existing.exists ? "needs-update" : "missing",
  };
}

function integrationFromDesired(
  hooks: Record<string, unknown>,
): InstallableIntegration {
  const serialized = JSON.stringify(hooks);
  return serialized.includes("codex-hook") ? "codex" : "claude-code";
}

function isCrewlightGroup(
  value: unknown,
  integration: InstallableIntegration,
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

async function inspectCodexNotifyFile(path: string): Promise<PreparedFile> {
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
        : "Codex config.toml was inspected read-only; hooks installation does not modify it.",
      path,
      state: "configured",
    };
  } catch {
    return failedPreparation(
      path,
      "error",
      "Crewlight could not safely inspect Codex config.toml.",
    );
  }
}

async function writePreparedFile(
  target: PreparedFile,
  now: () => Date,
): Promise<IntegrationFileInstallResult> {
  if (target.output === undefined) {
    return { message: target.message, path: target.path, status: "unchanged" };
  }
  const directory = dirname(target.path);
  const temporaryPath = join(directory, `.crewlight-${randomUUID()}.tmp`);
  const backupPath = target.exists
    ? join(directory, `.crewlight-${now().getTime()}-${randomUUID()}.bak`)
    : undefined;
  let backupCreated = false;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, target.output, {
      encoding: "utf8",
      mode: target.mode,
      flag: "wx",
    });
    const readBack = await readFile(temporaryPath, "utf8");
    if (!isDeepStrictEqual(JSON.parse(readBack), JSON.parse(target.output))) {
      throw new Error("readback-mismatch");
    }
    if (backupPath && target.exists) {
      await copyFile(target.path, backupPath);
      backupCreated = true;
    }
    try {
      await rename(temporaryPath, target.path);
    } catch (error) {
      if (!backupPath) {
        throw error;
      }
      // Windows does not replace an existing file with rename(). The original
      // is already backed up, so remove only that exact target before retrying.
      await rm(target.path, { force: true });
      await rename(temporaryPath, target.path);
    }
    return {
      ...(backupPath ? { backupPath } : {}),
      message:
        "Crewlight configuration was written and read back successfully.",
      path: target.path,
      status: "installed",
    };
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (backupPath && backupCreated) {
      await rm(target.path, { force: true }).catch(() => undefined);
      await rename(backupPath, target.path).catch(() => undefined);
    } else if (backupPath) {
      // A failed backup must never turn into deletion of the only original.
      await rm(backupPath, { force: true }).catch(() => undefined);
    }
    return {
      message:
        "Crewlight could not write the integration file; no partial configuration was retained.",
      path: target.path,
      status: "failed",
    };
  }
}

function failedPreparation(
  path: string,
  state: Extract<
    IntegrationTargetState,
    "error" | "unavailable" | "conflict" | "malformed"
  >,
  message: string,
): PreparedFile {
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

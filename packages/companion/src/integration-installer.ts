import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
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
  /** Override used by tests and callers that already resolved the user home. */
  readonly homeDirectory?: string;
  /** Explicit CODEX_HOME. Crewlight does not read or search any other location. */
  readonly codexHome?: string;
}

export interface IntegrationInstallerOptions extends IntegrationPathOptions {
  /** Absolute Crewlight CLI/standalone executable, or the exact PATH token. */
  readonly binary?: string;
  readonly now?: () => Date;
  readonly platform?: NodeJS.Platform;
  /**
   * Existing setup output from the desktop runtime. Prefer this in source mode,
   * where Crewlight is a Node executable plus a JavaScript entry path.
   */
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

interface TomlStatement {
  readonly end: number;
  readonly key?: string;
  readonly root: boolean;
  readonly start: number;
  readonly type: "assignment" | "table";
  readonly value?: string;
}

interface SourceLine {
  readonly content: string;
  readonly end: number;
  readonly start: number;
}

const COPYFILE_EXCLUSIVE = 1;
const TOML_KEY_PART = String.raw`(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')`;
const TOML_KEY_PATTERN = new RegExp(
  String.raw`^${TOML_KEY_PART}(?:\s*\.\s*${TOML_KEY_PART})*$`,
  "u",
);
const TOML_TABLE_PATTERN = new RegExp(
  String.raw`^(?:\[\s*${TOML_KEY_PART}(?:\s*\.\s*${TOML_KEY_PART})*\s*\]|\[\[\s*${TOML_KEY_PART}(?:\s*\.\s*${TOML_KEY_PART})*\s*\]\])$`,
  "u",
);

export function discoverIntegrationPaths(
  options: IntegrationPathOptions = {},
): IntegrationPaths {
  const home = requireAbsoluteDirectory(
    options.homeDirectory ?? homedir(),
    "homeDirectory",
  );
  const codexHome = requireAbsoluteDirectory(
    options.codexHome ?? join(home, ".codex"),
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
  options: IntegrationInstallerOptions,
): Promise<IntegrationInspectionResult> {
  const prepared = await prepareIntegration(integration, options);
  return inspectionFromPrepared(integration, prepared);
}

export async function inspectCodexIntegration(
  options: IntegrationInstallerOptions,
): Promise<IntegrationInspectionResult> {
  return inspectIntegration("codex", options);
}

export async function inspectClaudeCodeIntegration(
  options: IntegrationInstallerOptions,
): Promise<IntegrationInspectionResult> {
  return inspectIntegration("claude-code", options);
}

export async function installIntegration(
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions,
): Promise<IntegrationInstallResult> {
  const prepared = await prepareIntegration(integration, options);
  const inspection = inspectionFromPrepared(integration, prepared);

  if (
    inspection.status !== "configured" &&
    inspection.status !== "not-configured"
  ) {
    const status =
      inspection.status === "unavailable"
        ? "unavailable"
        : inspection.status === "error"
          ? "failed"
          : "refused";
    return {
      files: [],
      integration,
      message: inspection.message,
      ok: false,
      status,
    };
  }

  const files: IntegrationFileInstallResult[] = [];
  for (const target of prepared) {
    if (target.state === "configured") {
      files.push({
        message: target.message,
        path: target.path,
        status: "unchanged",
      });
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
        message: files.some((file) => file.status === "installed")
          ? "Crewlight configuration was only partially installed; backups are listed for recovery."
          : result.message,
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
      ? `Crewlight ${integration} configuration was installed.`
      : `Crewlight ${integration} configuration is already installed.`,
    ok: true,
    status: changed ? "installed" : "unchanged",
  };
}

export async function installCodexIntegration(
  options: IntegrationInstallerOptions,
): Promise<IntegrationInstallResult> {
  return installIntegration("codex", options);
}

export async function installClaudeCodeIntegration(
  options: IntegrationInstallerOptions,
): Promise<IntegrationInstallResult> {
  return installIntegration("claude-code", options);
}

function requireAbsoluteDirectory(path: string, label: string): string {
  if (!path || path.includes("\0") || !isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return resolve(path);
}

function setupRuntime(platform: NodeJS.Platform): SetupRuntime {
  return {
    entryPath: undefined,
    execPath: process.execPath,
    isSea: () => false,
    platform,
  };
}

async function prepareIntegration(
  integration: InstallableIntegration,
  options: IntegrationInstallerOptions,
): Promise<PreparedFile[]> {
  let paths: IntegrationPaths;
  try {
    paths = discoverIntegrationPaths(options);
  } catch (error) {
    return [
      {
        exists: false,
        message: errorMessage(error),
        path: "",
        source: "",
        state: "error",
      },
    ];
  }

  let snippets: SetupSnippets;
  try {
    if (options.snippets) {
      snippets = options.snippets;
    } else {
      if (!options.binary) {
        throw new Error("binary or pre-generated snippets must be provided.");
      }
      snippets = createSetupSnippets(
        options.binary,
        setupRuntime(options.platform ?? process.platform),
        "cli",
      );
    }
  } catch (error) {
    const failed = (path: string): PreparedFile => ({
      exists: false,
      message: errorMessage(error),
      path,
      source: "",
      state: "error",
    });
    return integration === "claude-code"
      ? [failed(paths.claudeCodeSettings)]
      : [failed(paths.codexConfig), failed(paths.codexHooks)];
  }

  if (integration === "claude-code") {
    return [
      await prepareJsonHooksFile(paths.claudeCodeSettings, snippets.claudeCode),
    ];
  }

  if (!snippets.codexHooks.available) {
    return [
      await prepareCodexNotifyFile(paths.codexConfig, snippets.codex),
      {
        exists: false,
        message: `${snippets.codexHooks.reason.message} ${snippets.codexHooks.reason.action}`,
        path: paths.codexHooks,
        source: "",
        state: "unavailable",
      },
    ];
  }

  const [notify, hooks] = await Promise.all([
    prepareCodexNotifyFile(paths.codexConfig, snippets.codex),
    prepareJsonHooksFile(paths.codexHooks, snippets.codexHooks.snippet),
  ]);
  return [notify, hooks];
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
        : states.size === 1 && states.has("configured")
          ? "configured"
          : "not-configured";
  const message =
    status === "configured"
      ? `Crewlight ${integration} configuration is installed.`
      : status === "not-configured"
        ? `Crewlight ${integration} configuration can be installed at the fixed user configuration path.`
        : (targets.find((target) =>
            ["error", "unavailable", "conflict", "malformed"].includes(
              target.state,
            ),
          )?.message ??
          `Crewlight ${integration} configuration cannot be installed.`);
  return { integration, message, status, targets };
}

async function readExistingFile(path: string): Promise<ExistingFile> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("Configuration target must be a regular file.");
    }
    return {
      exists: true,
      mode: metadata.mode,
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
  } catch (error) {
    return failedPreparation(path, "error", errorMessage(error));
  }

  let desired: unknown;
  let current: unknown = {};
  try {
    desired = JSON.parse(desiredSnippet) as unknown;
    if (existing.exists) {
      current = JSON.parse(existing.source) as unknown;
    }
  } catch {
    return {
      ...existing,
      message:
        "Existing JSON configuration is malformed; Crewlight refused to overwrite it.",
      path,
      state: "malformed",
    };
  }

  if (!isRecord(current) || !isRecord(desired)) {
    return {
      ...existing,
      message: "The JSON configuration root must be an object.",
      path,
      state: "malformed",
    };
  }

  const currentHooks = current.hooks;
  const desiredHooks = desired.hooks;
  if (!isRecord(desiredHooks)) {
    return failedPreparation(
      path,
      "error",
      "Generated Crewlight hooks are invalid.",
    );
  }
  if (currentHooks !== undefined && !isRecord(currentHooks)) {
    return {
      ...existing,
      message:
        "The existing hooks value is not an object; Crewlight refused to replace it.",
      path,
      state: "conflict",
    };
  }

  const mergedRoot = structuredClone(current);
  const mergedHooks = isRecord(mergedRoot.hooks) ? mergedRoot.hooks : {};
  let changed = !isRecord(mergedRoot.hooks);

  for (const [eventName, desiredGroups] of Object.entries(desiredHooks)) {
    if (!Array.isArray(desiredGroups)) {
      return failedPreparation(
        path,
        "error",
        "Generated Crewlight hook groups are invalid.",
      );
    }
    const existingGroups = mergedHooks[eventName];
    if (existingGroups !== undefined && !Array.isArray(existingGroups)) {
      return {
        ...existing,
        message: `The existing ${eventName} hook group is not an array; Crewlight refused to replace it.`,
        path,
        state: "conflict",
      };
    }
    let groups = Array.isArray(existingGroups) ? existingGroups : [];
    for (const desiredGroup of desiredGroups) {
      const nextGroups: unknown[] = [];
      let inserted = false;
      for (const group of groups) {
        if (isCrewlightHookGroup(group)) {
          if (!inserted) {
            nextGroups.push(structuredClone(desiredGroup));
            inserted = true;
          }
          continue;
        }
        nextGroups.push(group);
      }
      if (!inserted) {
        nextGroups.push(structuredClone(desiredGroup));
      }
      if (!isDeepStrictEqual(groups, nextGroups)) {
        changed = true;
      }
      groups = nextGroups;
    }
    mergedHooks[eventName] = groups;
  }
  mergedRoot.hooks = mergedHooks;

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
      ? "Crewlight hooks can be merged without replacing existing handlers."
      : "Crewlight hooks can be installed at the fixed user configuration path.",
    output: `${JSON.stringify(mergedRoot, null, 2)}\n`,
    path,
    state: existing.exists ? "needs-update" : "missing",
  };
}

function isCrewlightHookGroup(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.hooks) ||
    value.hooks.length !== 1
  ) {
    return false;
  }
  const handler = value.hooks[0];
  if (!isRecord(handler) || handler.type !== "command") {
    return false;
  }
  const commands = [handler.command, handler.commandWindows].filter(
    (command): command is string => typeof command === "string",
  );
  return commands.some(
    (command) =>
      /\bingest\b[\s"']+(?:claude-code|codex-hook)\b/iu.test(command) &&
      (/(?:^|[\\/"'])crewlight(?:\.exe)?(?=[\s"']|$)/iu.test(command) ||
        /[\\/]packages[\\/]cli[\\/]dist[\\/]index\.js\b/iu.test(command)),
  );
}

async function prepareCodexNotifyFile(
  path: string,
  desiredSnippet: string,
): Promise<PreparedFile> {
  let existing: ExistingFile;
  try {
    existing = await readExistingFile(path);
  } catch (error) {
    return failedPreparation(path, "error", errorMessage(error));
  }

  if (!existing.exists) {
    return {
      ...existing,
      message:
        "Crewlight notify can be installed at the fixed user configuration path.",
      output: `${desiredSnippet}\n`,
      path,
      state: "missing",
    };
  }

  let statements: TomlStatement[];
  try {
    statements = scanToml(existing.source);
  } catch (error) {
    return {
      ...existing,
      message: `${errorMessage(error)} Crewlight refused to overwrite the existing TOML configuration.`,
      path,
      state: "malformed",
    };
  }

  const rootNotify = statements.filter(
    (statement) =>
      statement.root &&
      statement.type === "assignment" &&
      statement.key === "notify",
  );
  if (rootNotify.length > 1) {
    return {
      ...existing,
      message:
        "The Codex configuration contains duplicate top-level notify values.",
      path,
      state: "malformed",
    };
  }

  const notify = rootNotify[0];
  if (notify) {
    const argv = parseGeneratedTomlArray(notify.value ?? "");
    if (!argv) {
      return {
        ...existing,
        message:
          "The existing Codex notify value is not a safely mergeable argv array.",
        path,
        state: "conflict",
      };
    }
    const desiredArgv = parseGeneratedTomlArray(
      desiredSnippet.slice(desiredSnippet.indexOf("=") + 1),
    );
    if (desiredArgv && isDeepStrictEqual(argv, desiredArgv)) {
      return {
        ...existing,
        message: "Crewlight notify is already present.",
        path,
        state: "configured",
      };
    }
    if (!isCrewlightNotify(argv)) {
      return {
        ...existing,
        message:
          "Codex already has a different notify command. One notify array cannot safely be merged, so Crewlight left it unchanged.",
        path,
        state: "conflict",
      };
    }
    const newline = detectNewline(existing.source);
    const output = `${existing.source.slice(0, notify.start)}${desiredSnippet}${newline}${existing.source.slice(notify.end)}`;
    return {
      ...existing,
      message: "The existing Crewlight notify command can be updated safely.",
      output,
      path,
      state: "needs-update",
    };
  }

  const newline = detectNewline(existing.source);
  const firstTable = statements.find((statement) => statement.type === "table");
  const insertAt = firstTable?.start ?? existing.source.length;
  const before = existing.source.slice(0, insertAt);
  const after = existing.source.slice(insertAt);
  const separator =
    before.length > 0 && !endsWithNewline(before) ? newline : "";
  const output = `${before}${separator}${desiredSnippet}${newline}${after}`;
  return {
    ...existing,
    message:
      "Crewlight notify can be added without replacing unrelated Codex settings.",
    output,
    path,
    state: "needs-update",
  };
}

function parseGeneratedTomlArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function isCrewlightNotify(argv: readonly string[]): boolean {
  if (argv.length < 3 || argv.at(-2) !== "ingest" || argv.at(-1) !== "codex") {
    return false;
  }
  return argv.slice(0, -2).some((token) => {
    const normalized = token.replaceAll("\\", "/").toLowerCase();
    return (
      normalized === "crewlight" ||
      /(?:^|\/)crewlight(?:\.exe)?$/u.test(normalized) ||
      (normalized.includes("/crewlight/") &&
        normalized.endsWith("/packages/cli/dist/index.js"))
    );
  });
}

function scanToml(source: string): TomlStatement[] {
  if (source.includes("\0")) {
    throw new Error("The Codex configuration contains a null byte.");
  }
  const lines = splitSourceLines(source);
  const statements: TomlStatement[] = [];
  let root = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const significant = stripTomlComment(line.content).trim();
    if (!significant) {
      continue;
    }
    if (significant.startsWith("[")) {
      if (!TOML_TABLE_PATTERN.test(significant)) {
        throw new Error(`Malformed TOML table header on line ${index + 1}.`);
      }
      statements.push({
        end: line.end,
        root,
        start: line.start,
        type: "table",
      });
      root = false;
      continue;
    }

    const assignmentAt = findTomlAssignment(significant);
    if (assignmentAt < 0) {
      throw new Error(`Malformed TOML assignment on line ${index + 1}.`);
    }
    const key = significant.slice(0, assignmentAt).trim();
    if (!TOML_KEY_PATTERN.test(key)) {
      throw new Error(`Malformed TOML key on line ${index + 1}.`);
    }

    const startIndex = index;
    let value = significant.slice(assignmentAt + 1).trim();
    if (!value) {
      throw new Error(`Missing TOML value on line ${index + 1}.`);
    }
    let valueState = inspectTomlValue(value);
    while (!valueState.complete) {
      index += 1;
      const continuation = lines[index];
      if (!continuation) {
        throw new Error(`Unterminated TOML value on line ${startIndex + 1}.`);
      }
      value += `\n${continuation.content}`;
      valueState = inspectTomlValue(value);
    }
    if (!valueState.valid) {
      throw new Error(`Malformed TOML value on line ${startIndex + 1}.`);
    }
    statements.push({
      end: lines[index]!.end,
      key: unquoteBareTomlKey(key),
      root,
      start: lines[startIndex]!.start,
      type: "assignment",
      value: stripTomlComments(value).trim(),
    });
  }
  return statements;
}

function inspectTomlValue(value: string): {
  complete: boolean;
  valid: boolean;
} {
  const stack: string[] = [];
  let quote: "'" | '"' | "'''" | '\"\"\"' | undefined;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const triple = value.slice(index, index + 3);
    if (inComment) {
      if (character === "\n") {
        inComment = false;
      }
      continue;
    }
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
        continue;
      }
      if ((quote === '"' || quote === '\"\"\"') && character === "\\") {
        escaped = true;
        continue;
      }
      if ((quote === "'''" || quote === '\"\"\"') && triple === quote) {
        quote = undefined;
        index += 2;
      } else if ((quote === "'" || quote === '"') && character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "#") {
      inComment = true;
    } else if (triple === "'''" || triple === '\"\"\"') {
      quote = triple;
      index += 2;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "[" || character === "{") {
      stack.push(character);
    } else if (character === "]" || character === "}") {
      const expected = character === "]" ? "[" : "{";
      if (stack.pop() !== expected) {
        return { complete: true, valid: false };
      }
    }
  }

  if (quote || stack.length > 0) {
    return { complete: false, valid: true };
  }
  const token = stripTomlComments(value).trim();
  const startsStructured =
    token.startsWith("[") ||
    token.startsWith("{") ||
    token.startsWith('"') ||
    token.startsWith("'");
  const validScalar =
    /^(?:true|false|[+-]?(?:inf|nan)|[+-]?(?:0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)|\d[\dTtZz:_.+\-]*)$/u.test(
      token,
    );
  return { complete: true, valid: startsStructured || validScalar };
}

function findTomlAssignment(line: string): number {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "=") {
      return index;
    }
  }
  return -1;
}

function stripTomlComment(line: string): string {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

function stripTomlComments(value: string): string {
  return value.split(/\r?\n/u).map(stripTomlComment).join("\n");
}

function unquoteBareTomlKey(key: string): string {
  const trimmed = key.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n" && source[index] !== "\r") {
      continue;
    }
    const newlineLength =
      source[index] === "\r" && source[index + 1] === "\n" ? 2 : 1;
    lines.push({
      content: source.slice(start, index),
      end: index + newlineLength,
      start,
    });
    index += newlineLength - 1;
    start = index + 1;
  }
  if (start < source.length) {
    lines.push({ content: source.slice(start), end: source.length, start });
  }
  return lines;
}

async function writePreparedFile(
  target: PreparedFile,
  now: () => Date,
): Promise<IntegrationFileInstallResult> {
  if (target.output === undefined) {
    return {
      message: "No safely merged output was prepared.",
      path: target.path,
      status: "failed",
    };
  }
  const parent = dirname(target.path);
  const temporaryPath = join(
    parent,
    `.${basename(target.path)}.${process.pid}-${randomUUID()}.tmp`,
  );
  let backupPath: string | undefined;
  try {
    await mkdir(parent, { recursive: true });
    const handle = await open(temporaryPath, "wx", target.mode ?? 0o600);
    try {
      await handle.writeFile(target.output, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const latest = await readExistingFile(target.path);
    if (
      latest.exists !== target.exists ||
      latest.source !== target.source ||
      latest.mode !== target.mode
    ) {
      await unlink(temporaryPath).catch(() => undefined);
      return {
        message:
          "The configuration changed while Crewlight was preparing the update. No changes were written; try again.",
        path: target.path,
        status: "failed",
      };
    }
    if (target.exists) {
      backupPath = await createBackup(target.path, now());
    }
    await rename(temporaryPath, target.path);
    if (target.mode !== undefined) {
      await chmod(target.path, target.mode);
    }
    return {
      ...(backupPath ? { backupPath } : {}),
      message: "Crewlight configuration was written safely.",
      path: target.path,
      status: "installed",
    };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    return {
      ...(backupPath ? { backupPath } : {}),
      message: `Crewlight could not write the configuration: ${errorMessage(error)}`,
      path: target.path,
      status: "failed",
    };
  }
}

async function createBackup(path: string, date: Date): Promise<string> {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "-");
  const base = `${path}.backup-${timestamp}`;
  for (let suffix = 0; ; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}.${suffix}`;
    try {
      await copyFile(path, candidate, COPYFILE_EXCLUSIVE);
      return candidate;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        throw error;
      }
    }
  }
}

function failedPreparation(
  path: string,
  state: "error" | "malformed",
  message: string,
): PreparedFile {
  return { exists: false, message, path, source: "", state };
}

function detectNewline(source: string): string {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function endsWithNewline(source: string): boolean {
  return source.endsWith("\n") || source.endsWith("\r");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

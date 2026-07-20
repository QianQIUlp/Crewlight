import { realpathSync } from "node:fs";
import { posix, resolve, win32 } from "node:path";
import { isSea } from "node:sea";
import { parseArgs } from "node:util";

import {
  CODEX_HOOK_EVENT_NAMES,
  type CodexHookEventName,
} from "@crewlight/adapter-codex";

import type { CommandIo } from "./types.js";

type SetupPlatform =
  | "antigravity"
  | "claude-code"
  | "codebuddy"
  | "codex"
  | "codex-hooks"
  | "codewhale"
  | "copilot-cli"
  | "cursor"
  | "gemini-cli"
  | "hermes-agent"
  | "kimi-cli"
  | "kiro-cli"
  | "mimo-code"
  | "openclaw"
  | "opencode"
  | "pi-agent"
  | "qoder"
  | "qoderwork"
  | "qwen-code"
  | "reasonix-cli";
type RuntimePlatform = NodeJS.Platform;
type CodexHookSurface = "unknown" | "cli" | "desktop";

export interface SetupRuntime {
  isSea(): boolean;
  execPath: string;
  entryPath: string | undefined;
  platform: RuntimePlatform;
}

export interface SetupSnippets {
  antigravity: string;
  claudeCode: string;
  codebuddy: string;
  codex: string;
  codexHooks: CodexHooksSetupResult;
  codewhale: string;
  copilotCli: string;
  cursor: string;
  geminiCli: string;
  hermesAgent: string;
  kimiCli: string;
  kiroCli: string;
  mimoCode: string;
  openclaw: string;
  openCode: string;
  piAgent: string;
  qoder: string;
  qoderwork: string;
  qwenCode: string;
  reasonixCli: string;
  verification: {
    antigravity: string;
    claudeCode: string;
    codebuddy: string;
    codex: string;
    codewhale: string;
    copilotCli: string;
    cursor: string;
    geminiCli: string;
    hermesAgent: string;
    kimiCli: string;
    kiroCli: string;
    mimoCode: string;
    openclaw: string;
    piAgent: string;
    qoder: string;
    qoderwork: string;
    qwenCode: string;
    reasonixCli: string;
  };
}

export interface SetupUnavailableReason {
  code: "windows-codex-hooks-unsafe-command";
  message: string;
  action: string;
}

export type CodexHooksSetupResult =
  | { available: true; snippet: string }
  | { available: false; reason: SetupUnavailableReason };

const SETUP_USAGE =
  "Usage: crewlight setup <antigravity|claude-code|codebuddy|codex|codex-hooks|codewhale|copilot-cli|cursor|gemini-cli|hermes-agent|kimi-cli|kiro-cli|mimo-code|openclaw|opencode|pi-agent|qoder|qoderwork|qwen-code|reasonix-cli> --print [--binary <absolute-path|crewlight>] [--surface <unknown|cli|desktop>]";
const WINDOWS_CODEX_HOOK_SIMPLE_TOKEN = /^[\p{L}\p{N}:\\/._-]+$/u;
const WINDOWS_CODEX_HOOKS_UNAVAILABLE: SetupUnavailableReason = {
  code: "windows-codex-hooks-unsafe-command",
  message:
    "Codex hooks setup is unavailable because Codex CLI 0.141.0 on Windows cannot reliably run a leading quoted executable command, and the resolved Crewlight command is not a simple unquoted path.",
  action:
    "Install Crewlight into a simple no-space path such as C:\\Users\\<user>\\Tools\\Crewlight\\crewlight.exe, then rerun `crewlight setup codex-hooks --print`.",
};

function currentSetupRuntime(): SetupRuntime {
  return {
    isSea,
    execPath: process.execPath,
    entryPath: process.argv[1],
    platform: process.platform,
  };
}

function absoluteRealPath(
  path: string,
  platform: RuntimePlatform = process.platform,
): string {
  const absolute =
    platform === "win32"
      ? win32.isAbsolute(path)
        ? path
        : win32.resolve(path)
      : posix.isAbsolute(path)
        ? path
        : resolve(path);
  if (platform !== process.platform) {
    return absolute;
  }
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function isAbsoluteForPlatform(
  path: string,
  platform: RuntimePlatform,
): boolean {
  return platform === "win32" ? win32.isAbsolute(path) : posix.isAbsolute(path);
}

function validateToken(token: string): void {
  if (!token || /[\0\r\n]/u.test(token)) {
    throw new Error(
      "Setup command values cannot be empty or contain newlines.",
    );
  }
}

export function resolveCrewlightCommand(
  binary: string | undefined,
  runtime: SetupRuntime = currentSetupRuntime(),
): string[] {
  if (binary !== undefined) {
    validateToken(binary);
    if (binary === "crewlight") {
      return [binary];
    }
    if (!isAbsoluteForPlatform(binary, runtime.platform)) {
      throw new Error(
        "--binary must be an absolute path or the exact value `crewlight` for PATH mode.",
      );
    }
    return [binary];
  }

  if (runtime.isSea()) {
    return [absoluteRealPath(runtime.execPath, runtime.platform)];
  }

  if (!runtime.entryPath) {
    throw new Error(
      "Unable to determine the current CLI entry path. Use --binary with an absolute executable path or `crewlight`.",
    );
  }

  return [
    absoluteRealPath(runtime.execPath, runtime.platform),
    absoluteRealPath(runtime.entryPath, runtime.platform),
  ];
}

function quotePosixToken(token: string): string {
  validateToken(token);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", `'\"'\"'`)}'`;
}

function quoteWindowsToken(token: string): string {
  validateToken(token);
  return `"${token
    .replace(/(\\*)"/gu, '$1$1\\"')
    .replace(/(\\+)$/gu, "$1$1")}"`;
}

export function renderHookCommand(
  argv: readonly string[],
  platform: RuntimePlatform,
): string {
  const quote = platform === "win32" ? quoteWindowsToken : quotePosixToken;
  return argv.map(quote).join(" ");
}

function renderTomlArray(argv: readonly string[]): string {
  return `[${argv.map((token) => JSON.stringify(token)).join(", ")}]`;
}

function hookHandler(
  command: string,
  commandWindows?: string,
): Record<string, unknown> {
  return {
    type: "command",
    command,
    ...(commandWindows === undefined ? {} : { commandWindows }),
  };
}

function hookGroup(
  command: string,
  matcher?: string,
  commandWindows?: string,
): Record<string, unknown>[] {
  return [
    {
      ...(matcher ? { matcher } : {}),
      hooks: [hookHandler(command, commandWindows)],
    },
  ];
}

function createClaudeCodeSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "claude-code"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        UserPromptSubmit: hookGroup(rendered),
        Notification: hookGroup(rendered),
        PermissionRequest: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createGeminiCliSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "gemini-cli"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        SessionEnd: hookGroup(rendered),
        BeforeAgent: hookGroup(rendered),
        AfterAgent: hookGroup(rendered),
        BeforeTool: hookGroup(rendered),
        AfterTool: hookGroup(rendered),
        Notification: hookGroup(rendered),
        PreCompress: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createCopilotCliSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "copilot-cli"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
        Notification: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createAntigravitySnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "antigravity"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        BeforeTool: hookGroup(rendered, "*"),
        PreToolUse: hookGroup(rendered, "*"),
        AfterTool: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
        SessionEnd: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createCodebuddySnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "codebuddy"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PermissionNeeded: hookGroup(rendered),
        TaskEnd: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createKiroCliSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "kiro-cli"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        onSessionStart: hookGroup(rendered),
        onToolCall: hookGroup(rendered, "*"),
        onComplete: hookGroup(rendered),
        onError: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createKimiCliSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "kimi-cli"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        BeforeTool: hookGroup(rendered, "*"),
        AfterTool: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createQwenCodeSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "qwen-code"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        start: hookGroup(rendered),
        tool_use: hookGroup(rendered, "*"),
        finish: hookGroup(rendered),
        error: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createCodewhaleSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "codewhale"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createMimoCodeSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "mimo-code"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createPiAgentSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "pi-agent"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        start: hookGroup(rendered),
        tool_use: hookGroup(rendered, "*"),
        finish: hookGroup(rendered),
        error: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createOpenclawSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "openclaw"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createHermesAgentSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "hermes-agent"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        start: hookGroup(rendered),
        tool_use: hookGroup(rendered, "*"),
        finish: hookGroup(rendered),
        error: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createQoderSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand([...command, "ingest", "qoder"], platform);
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createQoderworkSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "qoderwork"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        SessionStart: hookGroup(rendered),
        PreToolUse: hookGroup(rendered, "*"),
        PostToolUse: hookGroup(rendered, "*"),
        Stop: hookGroup(rendered),
        StopFailure: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createReasonixCliSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const rendered = renderHookCommand(
    [...command, "ingest", "reasonix-cli"],
    platform,
  );
  return JSON.stringify(
    {
      hooks: {
        start: hookGroup(rendered),
        tool_use: hookGroup(rendered, "*"),
        finish: hookGroup(rendered),
        error: hookGroup(rendered),
      },
    },
    null,
    2,
  );
}

function createCodexNotifySnippet(command: readonly string[]): string {
  return `notify = ${renderTomlArray([...command, "ingest", "codex"])}`;
}

function createCodexHooksSnippet(
  command: readonly string[],
  platform: RuntimePlatform,
  surface: CodexHookSurface,
): CodexHooksSetupResult {
  const windowsCommandAvailable =
    platform !== "win32" ||
    command.every((token) => WINDOWS_CODEX_HOOK_SIMPLE_TOKEN.test(token));
  if (!windowsCommandAvailable) {
    return {
      available: false,
      reason: WINDOWS_CODEX_HOOKS_UNAVAILABLE,
    };
  }

  const group = (hookEventName: CodexHookEventName) => {
    const argv = [
      ...command,
      "ingest",
      "codex-hook",
      "--hook",
      hookEventName,
      "--surface",
      surface,
    ];
    const rendered = renderHookCommand(argv, platform);
    const commandWindows = platform === "win32" ? argv.join(" ") : undefined;
    return hookGroup(rendered, undefined, commandWindows);
  };

  return {
    available: true,
    snippet: JSON.stringify(
      {
        hooks: Object.fromEntries(
          CODEX_HOOK_EVENT_NAMES.map((hookEventName) => [
            hookEventName,
            group(hookEventName),
          ]),
        ),
      },
      null,
      2,
    ),
  };
}

function createOpenCodePlugin(command: readonly string[]): string {
  const commandJson = JSON.stringify(command);
  return `const CREWLIGHT_COMMAND = ${commandJson};
const EVENT_TYPES = new Set([
  "session.created",
  "session.updated",
  "session.status",
  "session.idle",
  "session.error",
  "permission.asked",
  "permission.replied",
  "message.updated",
]);

function safeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeSessionID(event) {
  const properties = event?.properties;
  return (
    safeText(properties?.sessionID) ??
    safeText(properties?.sessionId) ??
    safeText(properties?.info?.id)
  );
}

function safeStatusType(event) {
  const status = event?.properties?.status;
  return safeText(typeof status === "string" ? status : status?.type);
}

function publish(eventType, sessionID, statusType, cwd) {
  try {
    const bun = globalThis.Bun;
    if (!bun || typeof bun.spawn !== "function") {
      return;
    }

    const properties = {
      ...(sessionID ? { sessionID } : {}),
      ...(statusType ? { status: { type: statusType } } : {}),
    };
    const payload = {
      event: { type: eventType, properties },
      ...(safeText(cwd) ? { cwd: safeText(cwd) } : {}),
      timestamp: Date.now(),
    };
    const proc = bun.spawn(
      [
        ...CREWLIGHT_COMMAND,
        "ingest",
        "opencode-plugin",
        "--event",
        eventType,
      ],
      {
        stdin: new Blob([JSON.stringify(payload)], {
          type: "application/json",
        }),
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    if (typeof proc.unref === "function") {
      proc.unref();
    }
  } catch {}
}

export const CrewlightPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    try {
      const eventType = safeText(event?.type);
      if (!eventType || !EVENT_TYPES.has(eventType)) {
        return;
      }
      publish(
        eventType,
        safeSessionID(event),
        safeStatusType(event),
        directory,
      );
    } catch {}
  },
  "tool.execute.before": async (input) => {
    try {
      publish(
        "tool.execute.before",
        safeText(input?.sessionID),
        undefined,
        directory,
      );
    } catch {}
  },
  "tool.execute.after": async (input) => {
    try {
      publish(
        "tool.execute.after",
        safeText(input?.sessionID),
        undefined,
        directory,
      );
    } catch {}
  },
});
`;
}

function createCursorCommands(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const cursorCommand = (event: string, title: string): string =>
    renderHookCommand(
      [
        ...command,
        "ingest",
        "cursor",
        "--event",
        event,
        "--surface",
        "ide-extension",
        "--session",
        "cursor-crewlight",
        "--workspace",
        "Crewlight",
        "--title",
        title,
      ],
      platform,
    );

  return [
    cursorCommand("running", "Cursor working"),
    cursorCommand("needs-review", "Cursor needs review"),
    cursorCommand("completed", "Cursor work completed"),
    cursorCommand("failed", "Cursor work failed"),
  ].join("\n");
}

function createCursorVerificationCommand(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  return renderHookCommand(
    [
      ...command,
      "ingest",
      "cursor",
      "--event",
      "running",
      "--surface",
      "ide-extension",
      "--session",
      "crewlight-verify-cursor",
      "--workspace",
      "Crewlight",
      "--title",
      "Cursor verification",
    ],
    platform,
  );
}

function renderAntigravityProbe(
  command: readonly string[],
  platform: RuntimePlatform,
): string {
  const ingestCommand = renderHookCommand(
    [
      ...command,
      "ingest",
      "antigravity-probe",
      "--event",
      "manual.probe",
      "--surface",
      "desktop",
    ],
    platform,
  );
  const payloadCommand =
    platform === "win32"
      ? "echo {}"
      : renderHookCommand(["printf", "%s\\n", "{}"], platform);
  return `${payloadCommand} | ${ingestCommand}`;
}

export function createAntigravityProbeCommand(
  binary?: string,
  runtime: SetupRuntime = currentSetupRuntime(),
): string {
  return renderAntigravityProbe(
    resolveCrewlightCommand(binary, runtime),
    runtime.platform,
  );
}

export function createSetupSnippets(
  binary?: string,
  runtime: SetupRuntime = currentSetupRuntime(),
  codexHooksSurface: CodexHookSurface = "cli",
): SetupSnippets {
  const command = resolveCrewlightCommand(binary, runtime);
  const ingestClaude = renderHookCommand(
    [...command, "ingest", "claude-code"],
    runtime.platform,
  );
  const ingestCodex = renderHookCommand(
    [...command, "ingest", "codex"],
    runtime.platform,
  );

  const claudePayload = JSON.stringify({
    hook_event_name: "UserPromptSubmit",
    prompt: "Crewlight verification test",
    session_id: "crewlight-verify-claude-code",
  });

  const codexPayload = JSON.stringify({
    notify: "activity",
    message: "Crewlight verification test",
    source: "codex",
    session_id: "crewlight-verify-codex",
  });

  const claudeEcho =
    runtime.platform === "win32"
      ? `echo ${claudePayload}`
      : renderHookCommand(["printf", "%s\\n", claudePayload], runtime.platform);
  const codexEcho =
    runtime.platform === "win32"
      ? `echo ${codexPayload}`
      : renderHookCommand(["printf", "%s\\n", codexPayload], runtime.platform);

  const ingestGemini = renderHookCommand(
    [...command, "ingest", "gemini-cli"],
    runtime.platform,
  );
  const geminiPayload = JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: "crewlight-verify-gemini-cli",
  });
  const geminiEcho =
    runtime.platform === "win32"
      ? `echo ${geminiPayload}`
      : renderHookCommand(["printf", "%s\\n", geminiPayload], runtime.platform);

  const ingestCopilot = renderHookCommand(
    [...command, "ingest", "copilot-cli"],
    runtime.platform,
  );
  const copilotPayload = JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: "crewlight-verify-copilot-cli",
  });
  const copilotEcho =
    runtime.platform === "win32"
      ? `echo ${copilotPayload}`
      : renderHookCommand(
          ["printf", "%s\\n", copilotPayload],
          runtime.platform,
        );

  const ingestAntigravity = renderHookCommand(
    [...command, "ingest", "antigravity"],
    runtime.platform,
  );
  const antigravityPayload = JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: "crewlight-verify-antigravity",
  });
  const antigravityEcho =
    runtime.platform === "win32"
      ? `echo ${antigravityPayload}`
      : renderHookCommand(
          ["printf", "%s\\n", antigravityPayload],
          runtime.platform,
        );

  const newPlatforms = [
    { name: "codebuddy", verifyEvent: "SessionStart", prop: "codebuddy" },
    { name: "kiro-cli", verifyEvent: "onSessionStart", prop: "kiroCli" },
    { name: "kimi-cli", verifyEvent: "SessionStart", prop: "kimiCli" },
    { name: "qwen-code", verifyEvent: "start", prop: "qwenCode" },
    { name: "codewhale", verifyEvent: "SessionStart", prop: "codewhale" },
    { name: "mimo-code", verifyEvent: "SessionStart", prop: "mimoCode" },
    { name: "pi-agent", verifyEvent: "start", prop: "piAgent" },
    { name: "openclaw", verifyEvent: "SessionStart", prop: "openclaw" },
    { name: "hermes-agent", verifyEvent: "start", prop: "hermesAgent" },
    { name: "qoder", verifyEvent: "SessionStart", prop: "qoder" },
    { name: "qoderwork", verifyEvent: "SessionStart", prop: "qoderwork" },
    { name: "reasonix-cli", verifyEvent: "start", prop: "reasonixCli" },
  ];

  const extraVerifications: Record<string, string> = {};
  for (const np of newPlatforms) {
    const ingestCmd = renderHookCommand(
      [...command, "ingest", np.name],
      runtime.platform,
    );
    const payload = JSON.stringify({
      hook_event_name: np.verifyEvent,
      session_id: `crewlight-verify-${np.name}`,
    });
    const echoCmd =
      runtime.platform === "win32"
        ? `echo ${payload}`
        : renderHookCommand(["printf", "%s\\n", payload], runtime.platform);
    extraVerifications[np.prop] = `${echoCmd} | ${ingestCmd}`;
  }

  return {
    antigravity: createAntigravitySnippet(command, runtime.platform),
    claudeCode: createClaudeCodeSnippet(command, runtime.platform),
    codebuddy: createCodebuddySnippet(command, runtime.platform),
    codex: createCodexNotifySnippet(command),
    codexHooks: createCodexHooksSnippet(
      command,
      runtime.platform,
      codexHooksSurface,
    ),
    codewhale: createCodewhaleSnippet(command, runtime.platform),
    copilotCli: createCopilotCliSnippet(command, runtime.platform),
    cursor: createCursorCommands(command, runtime.platform),
    geminiCli: createGeminiCliSnippet(command, runtime.platform),
    hermesAgent: createHermesAgentSnippet(command, runtime.platform),
    kimiCli: createKimiCliSnippet(command, runtime.platform),
    kiroCli: createKiroCliSnippet(command, runtime.platform),
    mimoCode: createMimoCodeSnippet(command, runtime.platform),
    openclaw: createOpenclawSnippet(command, runtime.platform),
    openCode: createOpenCodePlugin(command),
    piAgent: createPiAgentSnippet(command, runtime.platform),
    qoder: createQoderSnippet(command, runtime.platform),
    qoderwork: createQoderworkSnippet(command, runtime.platform),
    qwenCode: createQwenCodeSnippet(command, runtime.platform),
    reasonixCli: createReasonixCliSnippet(command, runtime.platform),
    verification: {
      antigravity: `${antigravityEcho} | ${ingestAntigravity}`,
      claudeCode: `${claudeEcho} | ${ingestClaude}`,
      codebuddy: extraVerifications.codebuddy!,
      codex: `${codexEcho} | ${ingestCodex}`,
      codewhale: extraVerifications.codewhale!,
      copilotCli: `${copilotEcho} | ${ingestCopilot}`,
      cursor: createCursorVerificationCommand(command, runtime.platform),
      geminiCli: `${geminiEcho} | ${ingestGemini}`,
      hermesAgent: extraVerifications.hermesAgent!,
      kimiCli: extraVerifications.kimiCli!,
      kiroCli: extraVerifications.kiroCli!,
      mimoCode: extraVerifications.mimoCode!,
      openclaw: extraVerifications.openclaw!,
      piAgent: extraVerifications.piAgent!,
      qoder: extraVerifications.qoder!,
      qoderwork: extraVerifications.qoderwork!,
      qwenCode: extraVerifications.qwenCode!,
      reasonixCli: extraVerifications.reasonixCli!,
    },
  };
}

export function formatCodexHooksSetup(result: CodexHooksSetupResult): string {
  if (result.available) {
    return result.snippet;
  }

  return `Codex hooks setup unavailable.\n${result.reason.message}\nAction: ${result.reason.action}`;
}

const CLAUDE_CODE_SETUP_GUIDANCE = `Crewlight only printed a mergeable snippet; it did not read or modify Claude Code configuration.
Merge it manually into ~/.claude/settings.json (Windows: %USERPROFILE%\\.claude\\settings.json), .claude/settings.json, or .claude/settings.local.json.
If a hooks object or any matching event already exists, preserve it and append the Crewlight handler. Do not replace the whole file.
Use \`--binary crewlight\` only when the hook environment can reliably resolve Crewlight from PATH.
Next: start \`crewlight daemon --notifier console\`, run \`crewlight doctor\`, then use Claude Code \`/hooks\` to confirm the handlers are loaded.`;

const GEMINI_CLI_SETUP_GUIDANCE = `Crewlight only printed a mergeable snippet; it did not read or modify Gemini CLI configuration.
Merge it manually into ~/.gemini/settings.json (Windows: %USERPROFILE%\\.gemini\\settings.json), .gemini/settings.json, or .gemini/settings.local.json.
If a hooks object or any matching event already exists, preserve it and append the Crewlight handler. Do not replace the whole file.
Use \`--binary crewlight\` only when the hook environment can reliably resolve Crewlight from PATH.
Next: start \`crewlight daemon --notifier console\`, run \`crewlight doctor\`, then use Gemini CLI turns to confirm the handlers are loaded.`;

const COPILOT_CLI_SETUP_GUIDANCE = `Crewlight only printed a mergeable snippet; it did not read or modify Copilot CLI configuration.
Merge it manually into ~/.copilot/settings.json (Windows: %USERPROFILE%\\.copilot\\settings.json), .copilot/settings.json, or .copilot/settings.local.json.
If a hooks object or any matching event already exists, preserve it and append the Crewlight handler. Do not replace the whole file.
Use \`--binary crewlight\` only when the hook environment can reliably resolve Crewlight from PATH.
Next: start \`crewlight daemon --notifier console\`, run \`crewlight doctor\`, then use Copilot CLI turns to confirm the handlers are loaded.`;

const ANTIGRAVITY_SETUP_GUIDANCE = `Crewlight only printed a mergeable snippet; it did not read or modify Antigravity configuration.
Merge it manually into ~/.gemini/config/hooks.json or a trusted project .gemini/config/hooks.json while preserving existing hook groups.
Use \`--binary crewlight\` only when Antigravity can reliably resolve Crewlight from PATH.
Next: start \`crewlight daemon --notifier console\`, run \`crewlight doctor\`, then execute any agy command to confirm the handlers are loaded.`;

const CODEX_SETUP_GUIDANCE = `Crewlight only printed a mergeable snippet; it did not read or modify Codex configuration.
Merge it manually into ~/.codex/config.toml (Windows: %USERPROFILE%\\.codex\\config.toml, or $CODEX_HOME/config.toml when CODEX_HOME is set).
If notify already exists, do not overwrite it. Codex accepts one external notifier command, so keep the existing command or route both through a wrapper.
Do not place notify in project .codex/config.toml; Codex ignores machine-local notification commands there.
Use \`--binary crewlight\` only when Codex can reliably resolve Crewlight from PATH.
Next: start \`crewlight daemon --notifier console\`, run \`crewlight doctor\`, then complete one Codex CLI turn.`;

const CODEX_HOOKS_SETUP_GUIDANCE = `Crewlight only printed a mergeable hooks.json snippet; it did not read or modify Codex configuration.
Merge it manually into ~/.codex/hooks.json or a trusted project .codex/hooks.json while preserving existing hook groups.
Codex requires non-managed command hooks to be reviewed and trusted. Open \`/hooks\`, inspect the exact Crewlight commands, and trust them only if they match your installation.
Crewlight observes hook events only. It does not return permission decisions, context, or turn-control output, and it does not bypass Codex hook trust.
Each generated command passes its matching lifecycle event through \`--hook <EventName>\`; stdin is treated as optional payload data.
The default setup marks events as \`--surface cli\`, which preserves the verified Codex CLI path. Use \`--surface desktop\` only for an explicit local Codex Desktop verification.
On Windows, Codex hooks execute the \`commandWindows\` field. Codex CLI 0.141.0 requires Crewlight to be installed at a simple no-space path so this field can use an unquoted executable command.
Use \`--binary crewlight\` only when Codex can reliably resolve Crewlight from PATH.`;

const OPENCODE_SETUP_GUIDANCE = `Crewlight only printed an OpenCode plugin file; it did not read or modify OpenCode configuration.
Save it as .opencode/plugins/crewlight.js for one project or ~/.config/opencode/plugins/crewlight.js for global use.
The plugin uses an argv-array Bun.spawn call, sends only whitelisted session metadata, ignores child output, and swallows all errors.
Use \`--binary crewlight\` only when OpenCode can reliably resolve Crewlight from PATH.
OpenCode support is implemented but pending real local verification before it receives a supported label.`;

const CURSOR_SETUP_GUIDANCE = `Crewlight only printed manual Cursor bridge commands; it did not read or modify Cursor settings.
This integration is manual and experimental. It does not observe Cursor internals or claim a stable automatic lifecycle hook.
Start \`crewlight daemon --dashboard\`, then run the commands from Cursor's integrated terminal or user-defined tasks.
Use one stable \`--session\` value per Cursor work stream so later commands update the same Crewlight session.
Use \`--binary crewlight\` only when Cursor's integrated terminal can reliably resolve Crewlight from PATH.`;

export function executeSetupCommand(
  args: readonly string[],
  io: CommandIo,
  runtime: SetupRuntime = currentSetupRuntime(),
): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: {
      binary: { type: "string" },
      print: { type: "boolean", default: false },
      surface: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  const [platform, ...extra] = positionals;

  if (!values.print || extra.length > 0 || !platform) {
    throw new Error(SETUP_USAGE);
  }

  const VALID_PLATFORMS: SetupPlatform[] = [
    "antigravity",
    "claude-code",
    "codebuddy",
    "codex",
    "codex-hooks",
    "codewhale",
    "copilot-cli",
    "cursor",
    "gemini-cli",
    "hermes-agent",
    "kimi-cli",
    "kiro-cli",
    "mimo-code",
    "openclaw",
    "opencode",
    "pi-agent",
    "qoder",
    "qoderwork",
    "qwen-code",
    "reasonix-cli",
  ];
  if (!VALID_PLATFORMS.includes(platform as SetupPlatform)) {
    throw new Error(`Unsupported setup platform: ${platform}`);
  }

  const surface = values.surface ?? "cli";
  if (
    (values.surface !== undefined && platform !== "codex-hooks") ||
    (surface !== "unknown" && surface !== "cli" && surface !== "desktop")
  ) {
    throw new Error(SETUP_USAGE);
  }

  const snippets = createSetupSnippets(
    values.binary,
    runtime,
    surface as CodexHookSurface,
  );
  const selected = platform as SetupPlatform;
  if (selected === "claude-code") {
    io.write(snippets.claudeCode);
    io.warn(CLAUDE_CODE_SETUP_GUIDANCE);
  } else if (selected === "codex") {
    io.write(snippets.codex);
    io.warn(CODEX_SETUP_GUIDANCE);
  } else if (selected === "codex-hooks") {
    if (!snippets.codexHooks.available) {
      io.warn(formatCodexHooksSetup(snippets.codexHooks));
      return 1;
    }
    io.write(snippets.codexHooks.snippet);
    io.warn(CODEX_HOOKS_SETUP_GUIDANCE);
  } else if (selected === "cursor") {
    io.write(snippets.cursor);
    io.warn(
      `${CURSOR_SETUP_GUIDANCE}\nVerification command: ${snippets.verification.cursor}`,
    );
  } else if (selected === "gemini-cli") {
    io.write(snippets.geminiCli);
    io.warn(
      `${GEMINI_CLI_SETUP_GUIDANCE}\nVerification command: ${snippets.verification.geminiCli}`,
    );
  } else if (selected === "copilot-cli") {
    io.write(snippets.copilotCli);
    io.warn(
      `${COPILOT_CLI_SETUP_GUIDANCE}\nVerification command: ${snippets.verification.copilotCli}`,
    );
  } else if (selected === "antigravity") {
    io.write(snippets.antigravity);
    io.warn(
      `${ANTIGRAVITY_SETUP_GUIDANCE}\nVerification command: ${snippets.verification.antigravity}`,
    );
  } else if (selected === "codebuddy") {
    io.write(snippets.codebuddy);
    io.warn(
      `Crewlight only printed a mergeable snippet for CodeBuddy.\nVerification command: ${snippets.verification.codebuddy}`,
    );
  } else if (selected === "codewhale") {
    io.write(snippets.codewhale);
    io.warn(
      `Crewlight only printed a mergeable snippet for CodeWhale.\nVerification command: ${snippets.verification.codewhale}`,
    );
  } else if (selected === "hermes-agent") {
    io.write(snippets.hermesAgent);
    io.warn(
      `Crewlight only printed a mergeable snippet for Hermes Agent.\nVerification command: ${snippets.verification.hermesAgent}`,
    );
  } else if (selected === "kimi-cli") {
    io.write(snippets.kimiCli);
    io.warn(
      `Crewlight only printed a mergeable snippet for Kimi CLI.\nVerification command: ${snippets.verification.kimiCli}`,
    );
  } else if (selected === "kiro-cli") {
    io.write(snippets.kiroCli);
    io.warn(
      `Crewlight only printed a mergeable snippet for Kiro CLI.\nVerification command: ${snippets.verification.kiroCli}`,
    );
  } else if (selected === "mimo-code") {
    io.write(snippets.mimoCode);
    io.warn(
      `Crewlight only printed a mergeable snippet for MiMo Code.\nVerification command: ${snippets.verification.mimoCode}`,
    );
  } else if (selected === "openclaw") {
    io.write(snippets.openclaw);
    io.warn(
      `Crewlight only printed a mergeable snippet for OpenClaw.\nVerification command: ${snippets.verification.openclaw}`,
    );
  } else if (selected === "pi-agent") {
    io.write(snippets.piAgent);
    io.warn(
      `Crewlight only printed a mergeable snippet for Pi Agent.\nVerification command: ${snippets.verification.piAgent}`,
    );
  } else if (selected === "qoder") {
    io.write(snippets.qoder);
    io.warn(
      `Crewlight only printed a mergeable snippet for Qoder.\nVerification command: ${snippets.verification.qoder}`,
    );
  } else if (selected === "qoderwork") {
    io.write(snippets.qoderwork);
    io.warn(
      `Crewlight only printed a mergeable snippet for Qoderwork.\nVerification command: ${snippets.verification.qoderwork}`,
    );
  } else if (selected === "qwen-code") {
    io.write(snippets.qwenCode);
    io.warn(
      `Crewlight only printed a mergeable snippet for Qwen Code.\nVerification command: ${snippets.verification.qwenCode}`,
    );
  } else if (selected === "reasonix-cli") {
    io.write(snippets.reasonixCli);
    io.warn(
      `Crewlight only printed a mergeable snippet for Reasonix CLI.\nVerification command: ${snippets.verification.reasonixCli}`,
    );
  } else {
    io.write(snippets.openCode);
    io.warn(OPENCODE_SETUP_GUIDANCE);
  }

  return 0;
}

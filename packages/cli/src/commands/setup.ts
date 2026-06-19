import type { CommandIo } from "./types.js";

const CLAUDE_HOOK_COMMAND = {
  type: "command",
  command: "agentpulse ingest claude-code",
};

function hook(matcher?: string) {
  return [
    {
      ...(matcher ? { matcher } : {}),
      hooks: [CLAUDE_HOOK_COMMAND],
    },
  ];
}

export const CLAUDE_CODE_SETUP_SNIPPET = JSON.stringify(
  {
    hooks: {
      SessionStart: hook(),
      UserPromptSubmit: hook(),
      Notification: hook(),
      PermissionRequest: hook(),
      PreToolUse: hook("*"),
      PostToolUse: hook("*"),
      Stop: hook(),
      StopFailure: hook(),
    },
  },
  null,
  2,
);

export const CODEX_SETUP_SNIPPET = 'notify = ["agentpulse", "ingest", "codex"]';

export function executeSetupCommand(
  args: readonly string[],
  io: CommandIo,
): number {
  const [platform, flag, ...extra] = args;

  if (flag !== "--print" || extra.length > 0) {
    throw new Error("Usage: agentpulse setup <claude-code|codex> --print");
  }

  if (platform === "claude-code") {
    io.write(CLAUDE_CODE_SETUP_SNIPPET);
    return 0;
  }

  if (platform === "codex") {
    io.write(CODEX_SETUP_SNIPPET);
    return 0;
  }

  throw new Error(`Unsupported setup platform: ${String(platform)}`);
}

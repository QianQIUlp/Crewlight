import { z } from "zod";

export const AGENT_IDENTITY_MAX_LENGTH = 2_048;
export const AGENT_PATH_MAX_LENGTH = 4_096;
export const AGENT_DISPLAY_MAX_LENGTH = 4_096;

const identityStringSchema = z.string().min(1).max(AGENT_IDENTITY_MAX_LENGTH);
const projectPathSchema = z.string().min(1).max(AGENT_PATH_MAX_LENGTH);
const displayStringSchema = z.string().min(1).max(AGENT_DISPLAY_MAX_LENGTH);

export const agentStatusSchema = z.enum([
  "idle",
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
  "completed",
  "failed",
  "rate_limited",
  "unknown",
]);

export const agentSourceSchema = z.enum([
  "claude-code",
  "codex",
  "opencode",
  "cursor",
  "vscode-agent",
  "gemini-cli",
  "aider",
  "antigravity",
  "generic-cli",
  "copilot-cli",
  "codebuddy",
  "kiro-cli",
  "kimi-cli",
  "qwen-code",
  "codewhale",
  "mimo-code",
  "pi-agent",
  "openclaw",
  "hermes-agent",
  "qoder",
  "qoderwork",
  "reasonix-cli",
  "opencode-compat",
  "custom",
]);

export const agentSurfaceSchema = z.enum([
  "unknown",
  "cli",
  "ide-extension",
  "desktop",
  "cloud",
  "manual",
]);

export const urgencySchema = z.enum(["low", "normal", "high"]);

const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const agentEventInputSchema = z
  .object({
    id: identityStringSchema.optional(),
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    sessionId: identityStringSchema.optional(),
    projectPath: projectPathSchema.optional(),
    workspaceName: displayStringSchema.optional(),
    status: agentStatusSchema,
    taskTitle: displayStringSchema.optional(),
    title: displayStringSchema.optional(),
    message: displayStringSchema.optional(),
    rawEvent: z.unknown().optional(),
    urgency: urgencySchema.optional(),
    timestamp: timestampSchema.optional(),
    remoteAlias: identityStringSchema.optional(),
  })
  .strict();

export const agentEventSchema = z
  .object({
    id: identityStringSchema,
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    sessionId: identityStringSchema.optional(),
    sessionKey: identityStringSchema,
    projectPath: projectPathSchema.optional(),
    workspaceName: displayStringSchema.optional(),
    status: agentStatusSchema,
    taskTitle: displayStringSchema.optional(),
    title: displayStringSchema.optional(),
    message: displayStringSchema.optional(),
    urgency: urgencySchema,
    timestamp: timestampSchema,
    remoteAlias: identityStringSchema.optional(),
  })
  .strict();

export const agentSessionSchema = z
  .object({
    sessionKey: identityStringSchema,
    sessionId: identityStringSchema.optional(),
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    projectPath: projectPathSchema.optional(),
    workspaceName: displayStringSchema.optional(),
    status: agentStatusSchema,
    taskTitle: displayStringSchema.optional(),
    title: displayStringSchema.optional(),
    lastEventAt: timestampSchema,
    startedAt: timestampSchema.optional(),
    completedAt: timestampSchema.optional(),
    lastMessage: displayStringSchema.optional(),
    error: displayStringSchema.optional(),
    remoteAlias: identityStringSchema.optional(),
  })
  .strict();

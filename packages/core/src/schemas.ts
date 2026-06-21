import { z } from "zod";

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

export const agentEventInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    sessionId: z.string().min(1).optional(),
    projectPath: z.string().min(1).optional(),
    workspaceName: z.string().min(1).optional(),
    status: agentStatusSchema,
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    rawEvent: z.unknown().optional(),
    urgency: urgencySchema.optional(),
    timestamp: z.number().int().nonnegative().optional(),
  })
  .strict();

export const agentEventSchema = z
  .object({
    id: z.string().min(1),
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    sessionId: z.string().min(1).optional(),
    sessionKey: z.string().min(1),
    projectPath: z.string().min(1).optional(),
    workspaceName: z.string().min(1).optional(),
    status: agentStatusSchema,
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    urgency: urgencySchema,
    timestamp: z.number().int().nonnegative(),
  })
  .strict();

export const agentSessionSchema = z
  .object({
    sessionKey: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    source: agentSourceSchema,
    surface: agentSurfaceSchema,
    projectPath: z.string().min(1).optional(),
    workspaceName: z.string().min(1).optional(),
    status: agentStatusSchema,
    title: z.string().min(1).optional(),
    lastEventAt: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative().optional(),
    completedAt: z.number().int().nonnegative().optional(),
    lastMessage: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
  })
  .strict();

import {
  type AgentEventInput,
  type AgentSource,
  type AgentStatus,
} from "@crewlight/core";
import { z } from "zod";

export const multiAgentHookInputSchema = z.object({
  hook_event_name: z.string().min(1),
  session_id: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
});

export type MultiAgentHookInput = z.infer<typeof multiAgentHookInputSchema>;

export type MultiAgentAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  // PascalCase events (Claude/Codex/Gemini/Copilot-like)
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["BeforeTool", "using_tool"],
  ["PostToolUse", "running"],
  ["AfterTool", "running"],
  ["PermissionRequest", "waiting_permission"],
  ["Notification", "waiting_input"],
  ["Stop", "completed"],
  ["SessionEnd", "idle"],
  ["StopFailure", "failed"],

  // lowercase/dashed/dotted events (Reasonix/Pi/Hermes/CodeWhale-like)
  ["start", "running"],
  ["run", "running"],
  ["thinking", "running"],
  ["working", "using_tool"],
  ["tool", "using_tool"],
  ["done", "completed"],
  ["stop", "completed"],
  ["end", "completed"],
  ["failed", "failed"],
  ["error", "failed"],
  ["permission", "waiting_permission"],
  ["ask", "waiting_permission"],
  ["input", "waiting_input"],
]);

export function mapMultiAgentEvent(
  source: AgentSource,
  input: unknown,
): MultiAgentAdapterResult {
  const parsed = multiAgentHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: `Invalid ${source} hook payload` };
  }

  const payload = parsed.data;
  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: `Unsupported ${source} hook event`,
    };
  }

  const title = payload.hook_event_name;
  const message = payload.tool_name
    ? `Using tool: ${payload.tool_name}`
    : undefined;
  const projectPath = payload.projectPath ?? payload.cwd;

  return {
    kind: "event",
    event: {
      source,
      surface: "cli",
      status,
      ...(payload.session_id ? { sessionId: payload.session_id } : {}),
      ...(projectPath ? { projectPath } : {}),
      title,
      ...(message ? { message } : {}),
    },
  };
}

export function ingestMultiAgentHookJson(
  source: AgentSource,
  json: string,
): MultiAgentAdapterResult {
  try {
    return mapMultiAgentEvent(source, JSON.parse(json));
  } catch {
    return {
      kind: "invalid",
      reason: `Invalid ${source} hook JSON`,
    };
  }
}

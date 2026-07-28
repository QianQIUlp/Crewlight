import { createHash } from "node:crypto";

import type { AgentEventInput } from "@crewlight/core";

import { codexNotifyInputSchema } from "./codex-notify-input.js";

export type CodexAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

export const CODEX_MESSAGE_LIMIT = 200;

export function truncateCodexMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= CODEX_MESSAGE_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, CODEX_MESSAGE_LIMIT - 1)}…`;
}

function stableTurnEventId(threadId: string, turnId: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([threadId, turnId]))
    .digest("hex")
    .slice(0, 24);
  return `stable:codex-turn:${digest}`;
}

export function mapCodexNotification(input: unknown): CodexAdapterResult {
  const parsed = codexNotifyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Codex notify payload" };
  }

  const payload = parsed.data;
  if (payload.type !== "agent-turn-complete") {
    return { kind: "ignored", reason: "Unsupported Codex notification type" };
  }

  return {
    kind: "event",
    event: {
      ...(payload["thread-id"] && payload["turn-id"]
        ? {
            id: stableTurnEventId(payload["thread-id"], payload["turn-id"]),
          }
        : {}),
      source: "codex",
      surface: "cli",
      status: "completed",
      title: payload.type,
      message: "Codex turn completed",
      ...(payload["thread-id"] ? { sessionId: payload["thread-id"] } : {}),
      ...(payload.cwd ? { projectPath: payload.cwd } : {}),
    },
  };
}

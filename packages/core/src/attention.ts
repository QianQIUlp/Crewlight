import type { AgentEvent, AgentSession, AgentStatus } from "./types.js";

export const ATTENTION_STALE_AFTER_MS = 5 * 60 * 1000;
export const ATTENTION_READY_WINDOW_MS = 10 * 60 * 1000;

export const ATTENTION_PRIORITY_ORDER = [
  "needs_action",
  "error",
  "stale",
  "active",
  "ready",
  "hidden",
] as const;

export type AttentionPriority = (typeof ATTENTION_PRIORITY_ORDER)[number];

export type NotificationKind =
  | "input"
  | "permission"
  | "failed"
  | "rate_limit"
  | "ready";

export interface AttentionEvaluation {
  priority: AttentionPriority;
  shouldNotify: boolean;
  notificationKind?: NotificationKind;
  visibleUntil?: number;
}

export interface AttentionInput {
  currentSession: AgentSession;
  previousSession?: AgentSession;
  event?: AgentEvent;
  now: number;
}

function notificationKindForStatus(
  status: AgentStatus,
): NotificationKind | undefined {
  switch (status) {
    case "waiting_input":
      return "input";
    case "waiting_permission":
      return "permission";
    case "failed":
      return "failed";
    case "rate_limited":
      return "rate_limit";
    case "completed":
      return "ready";
    default:
      return undefined;
  }
}

function completedVisibleUntil(session: AgentSession): number {
  return (
    (session.completedAt ?? session.lastEventAt) + ATTENTION_READY_WINDOW_MS
  );
}

/**
 * Derive the single attention contract consumed by service, dashboard and
 * companion surfaces. Derived time state is intentionally not stored on the
 * normalized session.
 */
export function evaluateAttention({
  currentSession,
  previousSession,
  event,
  now,
}: AttentionInput): AttentionEvaluation {
  const notificationKind = notificationKindForStatus(currentSession.status);
  const shouldNotify = Boolean(
    event &&
    event.status === currentSession.status &&
    notificationKind &&
    (previousSession === undefined ||
      previousSession.status !== currentSession.status),
  );

  switch (currentSession.status) {
    case "waiting_input":
    case "waiting_permission":
      return {
        priority: "needs_action",
        shouldNotify,
        notificationKind,
      };

    case "failed":
    case "rate_limited":
      return {
        priority: "error",
        shouldNotify,
        notificationKind,
      };

    case "running":
    case "using_tool":
      return {
        priority:
          Math.max(0, now - currentSession.lastEventAt) >=
          ATTENTION_STALE_AFTER_MS
            ? "stale"
            : "active",
        shouldNotify: false,
      };

    case "completed": {
      const visibleUntil = completedVisibleUntil(currentSession);
      const priority = now < visibleUntil ? "ready" : "hidden";
      return {
        priority,
        shouldNotify,
        notificationKind,
        ...(priority === "ready" ? { visibleUntil } : {}),
      };
    }

    case "idle":
    case "unknown":
      return { priority: "hidden", shouldNotify: false };
  }
}

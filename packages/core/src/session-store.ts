import type { AgentEvent, AgentSession, AgentStatus } from "./types.js";

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
]);

const TERMINAL_STATUSES = new Set<AgentStatus>(["completed", "failed"]);

export class SessionStore {
  readonly #sessions = new Map<string, AgentSession>();

  apply(event: AgentEvent): AgentSession {
    const current = this.#sessions.get(event.sessionKey);

    if (current && event.timestamp < current.lastEventAt) {
      return current;
    }

    const active = ACTIVE_STATUSES.has(event.status);
    const terminal = TERMINAL_STATUSES.has(event.status);
    const reopening = Boolean(
      current && active && TERMINAL_STATUSES.has(current.status),
    );

    const session: AgentSession = {
      sessionKey: event.sessionKey,
      source: event.source,
      surface: event.surface,
      status: event.status,
      lastEventAt: event.timestamp,
      ...((event.sessionId ?? current?.sessionId)
        ? { sessionId: event.sessionId ?? current?.sessionId }
        : {}),
      ...((event.projectPath ?? current?.projectPath)
        ? { projectPath: event.projectPath ?? current?.projectPath }
        : {}),
      ...((event.workspaceName ?? current?.workspaceName)
        ? { workspaceName: event.workspaceName ?? current?.workspaceName }
        : {}),
      ...((event.title ?? current?.title)
        ? { title: event.title ?? current?.title }
        : {}),
      ...((event.message ?? current?.lastMessage)
        ? { lastMessage: event.message ?? current?.lastMessage }
        : {}),
      ...(active
        ? {
            startedAt: reopening
              ? event.timestamp
              : (current?.startedAt ?? event.timestamp),
          }
        : current?.startedAt !== undefined
          ? { startedAt: current.startedAt }
          : {}),
      ...(terminal
        ? { completedAt: event.timestamp }
        : !active && current?.completedAt !== undefined
          ? { completedAt: current.completedAt }
          : {}),
      ...(event.status === "failed"
        ? { error: event.message ?? event.title ?? "Agent failed" }
        : !active && event.status !== "completed" && current?.error
          ? { error: current.error }
          : {}),
    };

    this.#sessions.set(event.sessionKey, session);
    return session;
  }

  get(sessionKey: string): AgentSession | undefined {
    return this.#sessions.get(sessionKey);
  }

  list(): AgentSession[] {
    return [...this.#sessions.values()].sort(
      (left, right) => right.lastEventAt - left.lastEventAt,
    );
  }
}

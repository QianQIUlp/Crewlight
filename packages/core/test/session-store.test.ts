import { describe, expect, it } from "vitest";

import { normalizeAgentEvent, SessionStore } from "../src/index.js";

function event(
  status: "completed" | "failed" | "running",
  timestamp: number,
  message?: string,
) {
  return normalizeAgentEvent({
    source: "custom",
    surface: "manual",
    sessionId: "session-1",
    status,
    timestamp,
    message,
  });
}

describe("SessionStore", () => {
  it("tracks terminal state and reopens it with a newer active event", () => {
    const store = new SessionStore();

    store.apply(event("running", 100, "started"));
    const completed = store.apply(event("completed", 200, "done"));
    const reopened = store.apply(event("running", 300, "restarted"));

    expect(completed.completedAt).toBe(200);
    expect(reopened.status).toBe("running");
    expect(reopened.startedAt).toBe(300);
    expect(reopened).not.toHaveProperty("completedAt");
    expect(reopened).not.toHaveProperty("error");
  });

  it("retains failure details", () => {
    const store = new SessionStore();
    const failed = store.apply(event("failed", 200, "command failed"));

    expect(failed.error).toBe("command failed");
    expect(failed.completedAt).toBe(200);
  });

  it("retains task titles and keeps event titles scoped to the latest event", () => {
    const store = new SessionStore();
    const titled = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "session-1",
      status: "running",
      taskTitle: "Review dashboard output",
      title: "SessionStart",
      timestamp: 100,
    });
    const completed = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "session-1",
      status: "completed",
      timestamp: 200,
    });

    store.apply(titled);
    const session = store.apply(completed);

    expect(session.taskTitle).toBe("Review dashboard output");
    expect(session).not.toHaveProperty("title");
  });

  it("ignores events older than the latest session event", () => {
    const store = new SessionStore();

    const completed = store.apply(event("completed", 200, "done"));
    const stale = store.apply(event("running", 100, "old"));

    expect(stale).toEqual(completed);
    expect(store.get(completed.sessionKey)?.status).toBe("completed");
  });

  it("retains all sessions and returns newest first", () => {
    const store = new SessionStore();
    const older = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "older",
      status: "completed",
      timestamp: 100,
    });
    const newer = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "newer",
      status: "failed",
      timestamp: 200,
    });

    store.apply(older);
    store.apply(newer);

    expect(store.list().map(({ sessionKey }) => sessionKey)).toEqual([
      newer.sessionKey,
      older.sessionKey,
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  normalizeAgentEvent,
  SessionStore,
  type AgentStatus,
} from "../src/index.js";

function event(status: AgentStatus, timestamp: number, message?: string) {
  return normalizeAgentEvent({
    source: "custom",
    surface: "manual",
    sessionId: "session-1",
    status,
    timestamp,
    message,
  });
}

function sessionEvent(
  sessionId: string,
  timestamp: number,
  id = `event-${sessionId}`,
) {
  return {
    ...normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId,
      status: "running",
      timestamp,
    }),
    id,
  };
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

  it.each(["completed", "failed"] as const)(
    "does not hide a %s terminal state with newer idle or unknown events",
    (terminalStatus) => {
      const store = new SessionStore();
      const terminal = store.apply(
        event(
          terminalStatus,
          200,
          terminalStatus === "failed" ? "boom" : "done",
        ),
      );

      const idle = store.apply(event("idle", 300, "idle"));
      const unknown = store.apply(event("unknown", 400, "unknown"));

      expect(idle).toEqual(terminal);
      expect(unknown).toEqual(terminal);
      expect(store.get(terminal.sessionKey)?.status).toBe(terminalStatus);
    },
  );

  it("deduplicates stable event ids without swallowing a later terminal turn", () => {
    const store = new SessionStore();
    const firstEvent = {
      ...event("completed", 200, "first turn"),
      id: "stable:turn-1",
    };
    const first = store.applyWithResult(firstEvent);
    const duplicate = store.applyWithResult({
      ...firstEvent,
      timestamp: 300,
    });
    const nextTurn = store.applyWithResult({
      ...event("completed", 400, "second turn"),
      id: "stable:turn-2",
    });

    expect(first.applied).toBe(true);
    expect(duplicate).toEqual({ applied: false, session: first.session });
    expect(nextTurn.applied).toBe(true);
    expect(nextTurn.session.lastEventAt).toBe(400);
  });

  it("deduplicates a stable event after more than 32 later events", () => {
    const store = new SessionStore();
    const firstEvent = {
      ...event("completed", 1, "first turn"),
      id: "stable:codex-turn:first",
    };

    const first = store.applyWithResult(firstEvent);
    for (let index = 2; index <= 40; index += 1) {
      store.apply({
        ...event("completed", index, `turn ${index}`),
        id: `stable:codex-turn:${index}`,
      });
    }
    const retained = store.get(first.session.sessionKey);
    const replay = store.applyWithResult({
      ...firstEvent,
      timestamp: 1_000,
    });

    expect(replay).toEqual({ applied: false, session: retained });
    expect(store.get(first.session.sessionKey)).toEqual(retained);
  });

  it("updates task titles on new requests and retains them across later events", () => {
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
    const retitled = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "session-1",
      status: "running",
      taskTitle: "Create a temp file",
      title: "UserPromptSubmit",
      timestamp: 300,
    });
    const stopped = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "session-1",
      status: "completed",
      title: "Stop",
      timestamp: 400,
    });

    store.apply(titled);
    const completedSession = store.apply(completed);
    store.apply(retitled);
    const stoppedSession = store.apply(stopped);

    expect(completedSession.taskTitle).toBe("Review dashboard output");
    expect(completedSession).not.toHaveProperty("title");
    expect(stoppedSession.taskTitle).toBe("Create a temp file");
    expect(stoppedSession.title).toBe("Stop");
  });

  it("ignores events older than the latest session event", () => {
    const store = new SessionStore();

    const completed = store.apply(event("completed", 200, "done"));
    const stale = store.apply(event("running", 100, "old"));

    expect(stale).toEqual(completed);
    expect(store.get(completed.sessionKey)?.status).toBe("completed");
  });

  it("allows later events after a far-future platform timestamp is receipt-bounded", () => {
    const store = new SessionStore();
    const future = normalizeAgentEvent(
      {
        source: "custom",
        surface: "manual",
        sessionId: "future-session",
        status: "running",
        timestamp: Number.MAX_SAFE_INTEGER,
      },
      () => 100,
    );
    const completed = normalizeAgentEvent(
      {
        source: "custom",
        surface: "manual",
        sessionId: "future-session",
        status: "completed",
        timestamp: 200,
      },
      () => 200,
    );

    store.apply(future);
    const session = store.apply(completed);

    expect(future.timestamp).toBe(100);
    expect(session.status).toBe("completed");
    expect(session.lastEventAt).toBe(200);
  });

  it("retains up to 1000 sessions and returns newest first", () => {
    const store = new SessionStore();
    const events = Array.from({ length: 1_000 }, (_, index) =>
      sessionEvent(`session-${index}`, index),
    );

    for (const item of events) {
      store.apply(item);
    }

    const sessions = store.list();
    expect(sessions).toHaveLength(1_000);
    expect(sessions[0]?.sessionKey).toBe(events[999]?.sessionKey);
    expect(sessions[999]?.sessionKey).toBe(events[0]?.sessionKey);
  });

  it("evicts the oldest session when the 1001st session is applied", () => {
    const store = new SessionStore();
    const oldest = sessionEvent("oldest", 0);

    store.apply(oldest);
    for (let index = 1; index <= 1_000; index += 1) {
      store.apply(sessionEvent(`newer-${index}`, index));
    }

    expect(store.list()).toHaveLength(1_000);
    expect(store.get(oldest.sessionKey)).toBeUndefined();
    expect(store.list()[0]?.lastEventAt).toBe(1_000);
  });

  it("cleans tracked event ids when evicting a session", () => {
    const store = new SessionStore();
    const evicted = sessionEvent("evicted", 0, "stable:reusable-event-id-1");
    const evictedFollowUp = {
      ...evicted,
      id: "stable:reusable-event-id-2",
      timestamp: 1,
    };

    store.apply(evicted);
    store.apply(evictedFollowUp);
    for (let index = 2; index <= 1_001; index += 1) {
      store.apply(sessionEvent(`retained-${index}`, index));
    }

    const reappeared = store.applyWithResult({
      ...evicted,
      timestamp: 2_000,
    });
    const reusedFollowUp = store.applyWithResult({
      ...evictedFollowUp,
      timestamp: 2_001,
    });

    expect(reappeared.applied).toBe(true);
    expect(reusedFollowUp.applied).toBe(true);
    expect(store.get(evicted.sessionKey)?.lastEventAt).toBe(2_001);
    expect(store.list()).toHaveLength(1_000);
  });

  it("bounds stable event ids by evicting their oldest retained session", () => {
    const store = new SessionStore({
      sessionLimit: 10,
      stableEventIdLimit: 2,
    });
    const oldest = sessionEvent("oldest", 1, "stable:oldest");
    const middle = sessionEvent("middle", 2, "stable:middle");
    const newest = sessionEvent("newest", 3, "stable:newest");

    store.apply(oldest);
    store.apply(middle);
    store.apply(newest);

    expect(store.get(oldest.sessionKey)).toBeUndefined();
    expect(store.get(middle.sessionKey)).toBeDefined();
    expect(store.get(newest.sessionKey)).toBeDefined();
    expect(store.applyWithResult({ ...oldest, timestamp: 4 }).applied).toBe(
      true,
    );
  });

  it("rejects invalid retention limits", () => {
    expect(() => new SessionStore({ sessionLimit: 0 })).toThrow(RangeError);
    expect(
      () => new SessionStore({ stableEventIdLimit: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it("uses a deterministic tie-break without evicting the just-written session", () => {
    const store = new SessionStore();
    const tiedEvents = Array.from({ length: 1_000 }, (_, index) =>
      sessionEvent(`tied-${String(index).padStart(4, "0")}`, 100),
    );
    for (const item of tiedEvents) {
      store.apply(item);
    }
    const justWritten = sessionEvent("tied-new", 100);
    const expectedEvicted = [...tiedEvents].sort((left, right) =>
      left.sessionKey < right.sessionKey ? -1 : 1,
    )[0]!;

    store.apply(justWritten);

    expect(store.list()).toHaveLength(1_000);
    expect(store.get(expectedEvicted.sessionKey)).toBeUndefined();
    expect(store.get(justWritten.sessionKey)).toBeDefined();
  });
});

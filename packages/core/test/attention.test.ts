import { describe, expect, it } from "vitest";

import {
  ATTENTION_READY_WINDOW_MS,
  ATTENTION_STALE_AFTER_MS,
  evaluateAttention,
  normalizeAgentEvent,
  SessionStore,
  type AgentStatus,
} from "../src/index.js";

function apply(status: AgentStatus, timestamp = 1_000) {
  const event = normalizeAgentEvent({
    source: "custom",
    surface: "manual",
    sessionId: "attention-session",
    status,
    timestamp,
  });
  return { event, session: new SessionStore().apply(event) };
}

describe("Attention Engine", () => {
  it.each([
    ["waiting_input", "needs_action", "input"],
    ["waiting_permission", "needs_action", "permission"],
    ["failed", "error", "failed"],
    ["rate_limited", "error", "rate_limit"],
  ] as const)("maps %s to %s", (status, priority, kind) => {
    const { event, session } = apply(status);
    expect(
      evaluateAttention({ currentSession: session, event, now: 1_000 }),
    ).toMatchObject({
      priority,
      notificationKind: kind,
      shouldNotify: true,
    });
  });

  it("maps active work to active then stale at the five minute boundary", () => {
    const { session } = apply("running");

    expect(
      evaluateAttention({
        currentSession: session,
        now: session.lastEventAt + ATTENTION_STALE_AFTER_MS - 1,
      }).priority,
    ).toBe("active");
    expect(
      evaluateAttention({
        currentSession: session,
        now: session.lastEventAt + ATTENTION_STALE_AFTER_MS,
      }).priority,
    ).toBe("stale");
  });

  it("keeps a completed turn ready for ten minutes and then hides it", () => {
    const { session } = apply("completed");
    const visibleUntil = session.lastEventAt + ATTENTION_READY_WINDOW_MS;

    expect(
      evaluateAttention({ currentSession: session, now: visibleUntil - 1 }),
    ).toMatchObject({ priority: "ready", visibleUntil });
    expect(
      evaluateAttention({ currentSession: session, now: visibleUntil }),
    ).toMatchObject({ priority: "hidden" });
  });

  it.each(["idle", "unknown"] as const)(
    "hides %s without implying confidence",
    (status) => {
      expect(
        evaluateAttention({
          currentSession: apply(status).session,
          now: 1_000,
        }),
      ).toEqual({
        priority: "hidden",
        shouldNotify: false,
      });
    },
  );

  it("notifies only when an applied event enters a new notification state", () => {
    const first = apply("completed");
    const duplicate = evaluateAttention({
      currentSession: first.session,
      previousSession: first.session,
      event: first.event,
      now: 1_001,
    });

    expect(duplicate.shouldNotify).toBe(false);
    expect(
      evaluateAttention({
        currentSession: first.session,
        event: first.event,
        now: first.session.lastEventAt,
      }).shouldNotify,
    ).toBe(true);
  });

  it("re-notifies after an active reopen and a later completed turn", () => {
    const store = new SessionStore();
    const completed = apply("completed");
    const activeEvent = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "attention-session",
      status: "running",
      timestamp: 2_000,
    });
    const active = store.apply(activeEvent);
    const nextEvent = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "attention-session",
      status: "completed",
      timestamp: 3_000,
    });
    const next = store.apply(nextEvent);

    expect(
      evaluateAttention({
        currentSession: completed.session,
        event: completed.event,
        now: 1_000,
      }).shouldNotify,
    ).toBe(true);
    expect(
      evaluateAttention({
        currentSession: active,
        previousSession: completed.session,
        event: activeEvent,
        now: 2_000,
      }).shouldNotify,
    ).toBe(false);
    expect(
      evaluateAttention({
        currentSession: next,
        previousSession: active,
        event: nextEvent,
        now: 3_000,
      }),
    ).toMatchObject({
      priority: "ready",
      notificationKind: "ready",
      shouldNotify: true,
    });
  });

  it("re-notifies when waiting work is resumed and asks again", () => {
    const store = new SessionStore();
    const waitingEvent = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "waiting-session",
      status: "waiting_input",
      timestamp: 1_000,
    });
    const waiting = store.apply(waitingEvent);
    const runningEvent = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "waiting-session",
      status: "running",
      timestamp: 2_000,
    });
    const running = store.apply(runningEvent);
    const nextWaitingEvent = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "waiting-session",
      status: "waiting_input",
      timestamp: 3_000,
    });
    const nextWaiting = store.apply(nextWaitingEvent);

    expect(
      evaluateAttention({
        currentSession: nextWaiting,
        previousSession: running,
        event: nextWaitingEvent,
        now: 3_000,
      }),
    ).toMatchObject({
      priority: "needs_action",
      notificationKind: "input",
      shouldNotify: true,
    });
    expect(waiting.status).toBe("waiting_input");
  });
});

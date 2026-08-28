import type { AgentEvent } from "@crewlight/core";
import type { Notifier, NotificationRequest } from "@crewlight/notifier";
import { describe, expect, it } from "vitest";

import { CrewlightService } from "../src/index.js";

class RecordingNotifier implements Notifier {
  readonly events: NotificationRequest[] = [];

  notify(request: NotificationRequest): void {
    this.events.push(request);
  }
}

class PendingNotifier implements Notifier {
  notify(): Promise<void> {
    return new Promise<void>(() => undefined);
  }
}

class ThrowingNotifier implements Notifier {
  notify(): void {
    throw new Error("notifier failed");
  }
}

describe("CrewlightService", () => {
  it("does not notify for an out-of-order event that the session store ignores", async () => {
    const notifier = new RecordingNotifier();
    const service = new CrewlightService({ notifier });

    const completed = await service.ingest({
      source: "custom",
      surface: "manual",
      sessionId: "ordered-session",
      status: "completed",
      timestamp: 200,
    });
    const stale = await service.ingest({
      source: "custom",
      surface: "manual",
      sessionId: "ordered-session",
      status: "running",
      timestamp: 100,
    });

    expect(completed.applied).toBe(true);
    expect(stale.applied).toBe(false);
    expect(stale.session.status).toBe("completed");
    expect(stale.session.lastEventAt).toBe(200);
    expect(notifier.events).toHaveLength(1);
    expect(notifier.events[0]?.event.status).toBe("completed");
  });

  it("does not notify twice for repeated terminal events", async () => {
    const notifier = new RecordingNotifier();
    const service = new CrewlightService({ notifier });

    const completed = await service.ingest({
      id: "terminal-event-1",
      source: "custom",
      surface: "manual",
      sessionId: "duplicate-terminal-session",
      status: "completed",
      timestamp: 200,
    });
    const duplicate = await service.ingest({
      id: "terminal-event-1",
      source: "custom",
      surface: "manual",
      sessionId: "duplicate-terminal-session",
      status: "completed",
      timestamp: 300,
    });

    expect(completed.applied).toBe(true);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.session.lastEventAt).toBe(200);
    expect(notifier.events).toHaveLength(1);

    const reopened = await service.ingest({
      id: "terminal-event-2",
      source: "custom",
      surface: "manual",
      sessionId: "duplicate-terminal-session",
      status: "running",
      timestamp: 400,
    });
    expect(reopened.applied).toBe(true);
    const nextTurn = await service.ingest({
      id: "terminal-event-3",
      source: "custom",
      surface: "manual",
      sessionId: "duplicate-terminal-session",
      status: "completed",
      timestamp: 500,
    });
    expect(nextTurn.applied).toBe(true);
    expect(notifier.events).toHaveLength(2);
  });

  it("suppresses a Stop plus notify completion for the same turn", async () => {
    const notifier = new RecordingNotifier();
    const service = new CrewlightService({ notifier });

    await service.ingest({
      id: "stop-random-id",
      source: "codex",
      surface: "cli",
      sessionId: "thread-1",
      status: "completed",
      title: "Stop",
      timestamp: 200,
    });
    const notify = await service.ingest({
      id: "stable:codex-turn:turn-1",
      source: "codex",
      surface: "cli",
      sessionId: "thread-1",
      status: "completed",
      title: "agent-turn-complete",
      timestamp: 300,
    });

    expect(notify.applied).toBe(true);
    expect(notifier.events).toHaveLength(1);
  });

  it("does not keep ingest responses waiting for notification delivery", async () => {
    const service = new CrewlightService({ notifier: new PendingNotifier() });

    const outcome = await Promise.race([
      service.ingest({
        source: "custom",
        surface: "manual",
        sessionId: "pending-notifier-session",
        status: "completed",
      }),
      new Promise<"still-pending">((resolve) => {
        setTimeout(() => resolve("still-pending"), 50);
      }),
    ]);

    expect(outcome).not.toBe("still-pending");
    expect(outcome).toMatchObject({ applied: true });
  });

  it("keeps an applied ingest successful when a notifier throws", async () => {
    const service = new CrewlightService({ notifier: new ThrowingNotifier() });

    await expect(
      service.ingest({
        source: "custom",
        surface: "manual",
        sessionId: "throwing-notifier-session",
        status: "failed",
      }),
    ).resolves.toMatchObject({ applied: true });
  });
});

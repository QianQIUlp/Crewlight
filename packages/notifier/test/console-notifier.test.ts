import { normalizeAgentEvent, SessionStore } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ConsoleNotifier } from "../src/index.js";

function event(status: "completed" | "running") {
  return normalizeAgentEvent({
    source: "custom",
    surface: "manual",
    sessionId: "notifier-test",
    status,
    message: `${status} message`,
    rawEvent: { secret: "do-not-print" },
  });
}

describe("console notification policy", () => {
  it("formats the notification request kind without owning policy", () => {
    const completed = event("completed");
    const session = new SessionStore().apply(completed);
    const lines: string[] = [];
    new ConsoleNotifier((line) => lines.push(line)).notify({
      event: completed,
      kind: "ready",
      session,
    });
    expect(lines[0]).toContain("Ready for review");
  });

  it("prints only the normalized safe event", () => {
    const lines: string[] = [];
    const notifier = new ConsoleNotifier((line) => lines.push(line));
    const store = new SessionStore();
    const completed = event("completed");

    notifier.notify({
      event: completed,
      kind: "ready",
      session: store.apply(completed),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("completed message");
    expect(lines[0]).not.toContain("do-not-print");
  });

  it("defensively emits a bounded single line when passed unsafe strings", () => {
    const lines: string[] = [];
    const notifier = new ConsoleNotifier((line) => lines.push(line));
    const completed = event("completed");
    const store = new SessionStore();
    const session = store.apply(completed);

    notifier.notify({
      event: {
        ...completed,
        message: `unsafe\u001b[31m\u009b\n${"detail".repeat(1_000)}`,
      },
      kind: "ready",
      session: {
        ...session,
        workspaceName: `remote\r\n\u2028workspace${"x".repeat(2_000)}`,
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u);
    expect(lines[0]).toContain("unsafe[31m");
    expect(lines[0]?.length).toBeLessThanOrEqual(2_200);
  });
});

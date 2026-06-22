import { normalizeAgentEvent, SessionStore } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ConsoleNotifier, shouldNotify } from "../src/index.js";

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
  it("notifies for actionable states and suppresses running", () => {
    expect(shouldNotify(event("completed"))).toBe(true);
    expect(shouldNotify(event("running"))).toBe(false);
  });

  it("prints only the normalized safe event", () => {
    const lines: string[] = [];
    const notifier = new ConsoleNotifier((line) => lines.push(line));
    const store = new SessionStore();
    const completed = event("completed");

    notifier.notify(completed, store.apply(completed));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("completed message");
    expect(lines[0]).not.toContain("do-not-print");
  });
});

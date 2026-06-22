import { describe, expect, it } from "vitest";

import type { DashboardPollResult } from "../src/client.js";
import { createCompanionPoller } from "../src/polling.js";
import {
  deriveCompanionViewModel,
  type CompanionViewModel,
} from "../src/state.js";

const onlineResult: DashboardPollResult = {
  kind: "online",
  data: {
    sessions: [
      {
        sessionKey: "custom:manual:session",
        source: "custom",
        surface: "manual",
        status: "running",
        lastEventAt: 1_000,
        lastEventAgeMs: 1_000,
        isStale: false,
        displayName: "Custom",
        displayWorkspace: "AgentPulse",
        attention: "passive",
      },
    ],
  },
};

describe("companion poller", () => {
  it("does not overlap polls", async () => {
    let resolveFirst: ((result: DashboardPollResult) => void) | undefined;
    let requestCount = 0;
    const poller = createCompanionPoller({
      fetchSnapshot: async () => {
        requestCount += 1;
        return await new Promise<DashboardPollResult>((resolve) => {
          resolveFirst = resolve;
        });
      },
      publish: () => undefined,
    });

    const firstPoll = poller.pollOnce();
    await Promise.resolve();
    await expect(poller.pollOnce()).resolves.toBe(false);
    expect(requestCount).toBe(1);
    expect(poller.isPolling()).toBe(true);

    resolveFirst?.(onlineResult);
    await expect(firstPoll).resolves.toBe(true);
    expect(poller.isPolling()).toBe(false);
  });

  it("fails closed after an unexpected error and recovers on success", async () => {
    const views: CompanionViewModel[] = [];
    let requestCount = 0;
    const poller = createCompanionPoller({
      fetchSnapshot: async () => {
        requestCount += 1;
        if (requestCount === 2) {
          throw new Error("private-error-body");
        }
        return onlineResult;
      },
      publish: (result) => {
        views.push(deriveCompanionViewModel(result, requestCount));
      },
    });

    await poller.pollOnce();
    await poller.pollOnce();
    await poller.pollOnce();

    expect(views.map((view) => view.state)).toEqual([
      "running",
      "offline",
      "running",
    ]);
    expect(views.map((view) => view.sessions.length)).toEqual([1, 0, 1]);
    expect(JSON.stringify(views)).not.toContain("private-error-body");
  });
});

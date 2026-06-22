import { describe, expect, it } from "vitest";

import { sanitizeDashboardResponse } from "../src/sanitize.js";

function dashboardSession() {
  return {
    sessionKey: "codex:cli:session",
    source: "codex",
    surface: "cli",
    status: "waiting_permission",
    lastEventAt: 2_000,
    lastEventAgeMs: 1_000,
    isStale: false,
    displayName: "Codex",
    displayWorkspace: "AgentPulse",
    attention: "action",
    actionKind: "permission",
    taskTitle: "Review companion",
    activityLabel: "Permission requested",
  };
}

describe("dashboard response sanitization", () => {
  it("projects only companion allowlisted fields", () => {
    const result = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [
        {
          ...dashboardSession(),
          lastMessage: "message-secret",
          error: "error-secret",
          prompt: "prompt-secret",
          transcript: "transcript-secret",
          rawEvent: { toolInput: "tool-secret" },
        },
      ],
      setup: { codex: "setup-secret" },
      doctor: { checks: [{ message: "doctor-secret" }] },
    });

    expect(result?.sessions[0]).toEqual(dashboardSession());
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result?.sessions[0]).not.toHaveProperty("lastMessage");
    expect(result?.sessions[0]).not.toHaveProperty("error");
  });

  it("normalizes and bounds display strings", () => {
    const result = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [
        {
          ...dashboardSession(),
          taskTitle: `  ${"x".repeat(140)}  `,
          displayWorkspace: "  AgentPulse   workspace  ",
        },
      ],
    });

    expect(result?.sessions[0]?.taskTitle).toHaveLength(120);
    expect(result?.sessions[0]?.displayWorkspace).toBe("AgentPulse workspace");
  });

  it("rejects malformed top-level and session shapes", () => {
    expect(sanitizeDashboardResponse({ sessions: [] })).toBeUndefined();
    expect(
      sanitizeDashboardResponse({
        health: { status: "ok" },
        sessions: [{ ...dashboardSession(), status: "future-state" }],
      }),
    ).toBeUndefined();
    expect(
      sanitizeDashboardResponse({
        health: { status: "ok" },
        sessions: [
          {
            ...dashboardSession(),
            attention: "passive",
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      sanitizeDashboardResponse({
        health: { status: "ok" },
        sessions: [
          {
            ...dashboardSession(),
            lastEventAgeMs: -1,
          },
        ],
      }),
    ).toBeUndefined();
  });
});

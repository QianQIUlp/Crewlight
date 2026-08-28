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
    durationMs: 1_000,
    displayName: "Codex",
    displayWorkspace: "Crewlight",
    priority: "needs_action",
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

    expect(result?.sessions[0]).toEqual({
      ...dashboardSession(),
      viewId: expect.stringMatching(/^session-\d+$/u),
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result?.sessions[0]).not.toHaveProperty("lastMessage");
    expect(result?.sessions[0]).not.toHaveProperty("error");
  });

  it("preserves valid remoteAlias and strips invalid ones", () => {
    const result = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [
        {
          ...dashboardSession(),
          remoteAlias: "prod.eu-west_123",
        },
        {
          ...dashboardSession(),
          remoteAlias: "invalid@host!",
        },
      ],
    });

    expect(result?.sessions[0]?.remoteAlias).toBe("prod.eu-west_123");
    expect(result?.sessions[1]?.remoteAlias).toBeUndefined();
  });

  it("keeps an opaque renderer identity stable without exposing sessionKey", () => {
    const first = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [dashboardSession()],
    });
    const second = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [dashboardSession()],
    });

    expect(second?.sessions[0]?.viewId).toBe(first?.sessions[0]?.viewId);
    expect(second?.sessions[0]?.viewId).not.toContain("codex:cli:session");
  });

  it("normalizes and bounds display strings", () => {
    const result = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [
        {
          ...dashboardSession(),
          taskTitle: `  ${"x".repeat(140)}  `,
          displayWorkspace: "  Crewlight   workspace  ",
        },
      ],
    });

    expect(result?.sessions[0]?.taskTitle).toHaveLength(120);
    expect(result?.sessions[0]?.displayWorkspace).toBe("Crewlight workspace");
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
            priority: "active",
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

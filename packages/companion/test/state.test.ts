import { describe, expect, it } from "vitest";

import {
  deriveCompanionViewModel,
  filterSessionViews,
  getSessionPriority,
  RECENT_COMPLETION_MS,
  sortSessions,
} from "../src/state.js";
import { sanitizeDashboardResponse } from "../src/sanitize.js";
import type { CompanionStatus, SanitizedSession } from "../src/sanitize.js";

function session(
  status: CompanionStatus,
  overrides: Partial<SanitizedSession> = {},
): SanitizedSession {
  return {
    sessionKey: `custom:manual:${status}`,
    source: "custom",
    surface: "manual",
    status,
    lastEventAt: 1_000,
    lastEventAgeMs: 1_000,
    isStale: false,
    displayName: "Custom",
    displayWorkspace: "Crewlight",
    attention: "passive",
    ...overrides,
  };
}

function online(sessions: SanitizedSession[]) {
  return { kind: "online" as const, data: { sessions } };
}

describe("companion state derivation", () => {
  it("ranks session attention states in the specified order", () => {
    const sessions = [
      session("unknown"),
      session("idle"),
      session("completed", { lastEventAgeMs: RECENT_COMPLETION_MS }),
      session("running"),
      session("running", { isStale: true }),
      session("failed"),
      session("waiting_input"),
      session("waiting_permission"),
    ];

    expect(sortSessions(sessions).map((item) => item.status)).toEqual([
      "waiting_permission",
      "waiting_input",
      "failed",
      "running",
      "running",
      "completed",
      "idle",
      "unknown",
    ]);
    expect(sessions.map(getSessionPriority)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("breaks equal-priority ties by newest event", () => {
    const older = session("running", {
      sessionKey: "older",
      lastEventAt: 1_000,
    });
    const newer = session("using_tool", {
      sessionKey: "newer",
      lastEventAt: 2_000,
    });

    expect(sortSessions([older, newer]).map((item) => item.sessionKey)).toEqual(
      ["newer", "older"],
    );
  });

  it("counts running, action, and failed sessions", () => {
    const view = deriveCompanionViewModel(
      online([
        session("running"),
        session("using_tool"),
        session("waiting_permission"),
        session("waiting_input"),
        session("failed"),
        session("rate_limited"),
      ]),
      10_000,
    );

    expect(view.counts).toEqual({ running: 2, action: 2, failed: 2 });
    expect(view.state).toBe("needs-you");
    expect(view.summary).toBe("Needs you");
  });

  it("treats five minutes as the inclusive recent-completion boundary", () => {
    expect(
      deriveCompanionViewModel(
        online([
          session("completed", { lastEventAgeMs: RECENT_COMPLETION_MS }),
        ]),
      ).state,
    ).toBe("completed");
    expect(
      deriveCompanionViewModel(
        online([
          session("completed", {
            lastEventAgeMs: RECENT_COMPLETION_MS + 1,
          }),
        ]),
      ).state,
    ).toBe("quiet");
  });

  it("raises stale running sessions above ordinary running work", () => {
    const view = deriveCompanionViewModel(
      online([
        session("running", {
          displayName: "Fresh",
          lastEventAt: 2_000,
        }),
        session("using_tool", {
          displayName: "Stale",
          isStale: true,
          staleReason: "No event for at least 5 minutes.",
          lastEventAt: 1_000,
        }),
      ]),
    );

    expect(view.state).toBe("stale");
    expect(view.mostImportant?.source).toBe("Stale");
    expect(view.diagnostic).toBe("No event for at least 5 minutes.");
  });

  it("identifies the highest-priority failure by agent", () => {
    const view = deriveCompanionViewModel(
      online([
        session("failed", {
          displayName: "Codex",
          lastEventAt: 2_000,
        }),
        session("rate_limited", {
          displayName: "Claude Code",
          lastEventAt: 1_000,
        }),
      ]),
    );

    expect(view.state).toBe("failed");
    expect(view.summary).toBe("Codex failed");
  });

  it("separates daemon and API failure states", () => {
    expect(
      deriveCompanionViewModel({
        kind: "offline",
        diagnostic: "network",
      }),
    ).toMatchObject({
      state: "offline",
      summary: "Daemon offline",
      diagnostic: "network",
    });
    expect(
      deriveCompanionViewModel({
        kind: "api-unavailable",
        diagnostic: "Start the daemon with --dashboard.",
      }),
    ).toMatchObject({
      state: "api-unavailable",
      summary: "Companion API unavailable",
      diagnostic: "Start the daemon with --dashboard.",
    });
  });

  it("includes authoritative window state without changing session state", () => {
    const view = deriveCompanionViewModel(online([session("running")]), 5_000, {
      expanded: true,
      alwaysOnTop: false,
    });

    expect(view).toMatchObject({
      expanded: true,
      alwaysOnTop: false,
      state: "running",
    });
  });

  it("projects sanitized sessions without renderer-facing session keys or raw data", () => {
    const data = sanitizeDashboardResponse({
      health: { status: "ok" },
      sessions: [
        {
          sessionKey: "codex:cli:session-key-secret",
          source: "codex",
          surface: "cli",
          status: "waiting_permission",
          lastEventAt: 2_000,
          lastEventAgeMs: 1_000,
          isStale: false,
          displayName: "Codex",
          displayWorkspace: "Crewlight",
          attention: "action",
          actionKind: "permission",
          activityLabel: "Permission requested",
          lastMessage: "message-secret",
          prompt: "prompt-secret",
          transcript: "transcript-secret",
          toolInput: "tool-secret",
          rawEvent: { payload: "payload-secret" },
        },
      ],
    });

    expect(data).toBeDefined();
    const serialized = JSON.stringify(
      deriveCompanionViewModel({ kind: "online", data: data! }, 5_000),
    );
    expect(serialized).not.toContain("session-key-secret");
    expect(serialized).not.toContain("message-secret");
    expect(serialized).not.toContain("prompt-secret");
    expect(serialized).not.toContain("transcript-secret");
    expect(serialized).not.toContain("tool-secret");
    expect(serialized).not.toContain("payload-secret");
  });

  it("filters projected sessions into product-facing groups", () => {
    const view = deriveCompanionViewModel(
      online([
        session("waiting_input"),
        session("running"),
        session("using_tool", { isStale: true }),
        session("completed"),
        session("failed"),
        session("idle"),
      ]),
    );

    expect(
      filterSessionViews(view.sessions, "attention").map((item) => item.status),
    ).toEqual(["waiting_input"]);
    expect(
      filterSessionViews(view.sessions, "running").map((item) => item.status),
    ).toEqual(["running"]);
    expect(
      filterSessionViews(view.sessions, "done").map((item) => item.status),
    ).toEqual(["completed"]);
    expect(
      filterSessionViews(view.sessions, "failed-stale").map(
        (item) => item.status,
      ),
    ).toEqual(["failed", "using_tool"]);
  });

  it("presents Cursor as a first-class IDE session", () => {
    const view = deriveCompanionViewModel(
      online([
        session("waiting_input", {
          sessionKey: "cursor:ide-extension:cursor-crewlight",
          source: "cursor",
          surface: "ide-extension",
          displayName: "Cursor",
          displayWorkspace: "Crewlight",
          taskTitle: "Cursor needs review",
          activityLabel: "Input requested",
          attention: "action",
          actionKind: "input",
        }),
      ]),
    );

    expect(view).toMatchObject({
      state: "needs-you",
      summary: "Needs you",
      mostImportant: {
        source: "Cursor",
        surface: "IDE extension",
        title: "Cursor needs review",
        workspace: "Crewlight",
        statusLabel: "Waiting for input",
        needsAction: true,
        tone: "action",
      },
    });
    expect(filterSessionViews(view.sessions, "attention")).toHaveLength(1);
  });
});

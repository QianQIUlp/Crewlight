import { describe, expect, it } from "vitest";

import {
  deriveCompanionViewModel,
  filterSessionViews,
  formatCompanionAge,
  formatCompanionDuration,
  getCompanionCopy,
  getSessionPriority,
  isSyntheticDemoSession,
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
    viewId: `view-${status}`,
    sessionKey: `custom:manual:${status}`,
    source: "custom",
    surface: "manual",
    status,
    lastEventAt: 1_000,
    lastEventAgeMs: 1_000,
    durationMs: 1_000,
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

  it("excludes synthetic demo sessions from real counts, state, and rows", () => {
    const realSession = session("running", {
      viewId: "real-codex",
      displayName: "Codex",
      displayWorkspace: "Crewlight",
      taskTitle: "Implement setup flow",
    });
    const demoByTitle = session("waiting_permission", {
      viewId: "demo-title",
      displayWorkspace: "Crewlight Demo",
      taskTitle: "[Demo] Updating README",
    });
    const demoByActivity = session("failed", {
      viewId: "demo-activity",
      displayWorkspace: "Crewlight Demo",
      activityLabel: "[Demo] Local setup failed",
    });
    const demoByWorkspace = session("using_tool", {
      viewId: "demo-workspace",
      displayWorkspace: "Crewlight Demo",
      taskTitle: "[Demo] Running Crewlight tests",
    });
    const demoPrefixOnRealWork = session("running", {
      displayWorkspace: "Customer project",
      taskTitle: "[Demo] is part of the real task name",
    });
    const demoWorkspaceWithRealWork = session("running", {
      displayWorkspace: "Crewlight Demo",
      taskTitle: "Real work in a similarly named workspace",
    });

    expect(isSyntheticDemoSession(demoByTitle)).toBe(true);
    expect(isSyntheticDemoSession(demoByActivity)).toBe(true);
    expect(isSyntheticDemoSession(demoByWorkspace)).toBe(true);
    expect(isSyntheticDemoSession(realSession)).toBe(false);
    expect(isSyntheticDemoSession(demoPrefixOnRealWork)).toBe(false);
    expect(isSyntheticDemoSession(demoWorkspaceWithRealWork)).toBe(false);

    const view = deriveCompanionViewModel(
      online([demoByTitle, demoByActivity, demoByWorkspace, realSession]),
    );

    expect(view.counts).toEqual({ running: 1, action: 0, failed: 0 });
    expect(view.state).toBe("running");
    expect(view.sessions.map((item) => item.id)).toEqual(["real-codex"]);
    expect(view.mostImportant?.id).toBe("real-codex");
  });

  it("does not let an all-demo snapshot claim that real work needs attention", () => {
    const view = deriveCompanionViewModel(
      online([
        session("waiting_input", {
          displayWorkspace: "Crewlight Demo",
          taskTitle: "[Demo] Reviewing companion UI",
        }),
        session("failed", {
          displayWorkspace: "Crewlight Demo",
          activityLabel: "[Demo] Local setup failed",
        }),
      ]),
    );

    expect(view).toMatchObject({
      state: "quiet",
      summary: "All quiet",
      counts: { running: 0, action: 0, failed: 0 },
      sessions: [],
    });
    expect(view.mostImportant).toBeUndefined();
  });

  it("can include synthetic demo sessions only when explicitly requested", () => {
    const view = deriveCompanionViewModel(
      online([
        session("waiting_permission", {
          displayWorkspace: "Crewlight Demo",
          taskTitle: "[Demo] Updating README",
        }),
      ]),
      5_000,
      { expanded: false, alwaysOnTop: true },
      { includeSyntheticDemoSessions: true },
    );

    expect(view.state).toBe("needs-you");
    expect(view.sessions).toHaveLength(1);
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
          lastEventAgeMs: 5 * 60 * 1000,
          staleReason: "No event for at least 5 minutes.",
          lastEventAt: 1_000,
        }),
      ]),
    );

    expect(view.state).toBe("stale");
    expect(view.mostImportant?.source).toBe("Stale");
    expect(view.diagnostic).toBe("Stale last updated 5m ago and may be stuck");
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

  it("keeps service failure details internal and presents friendly recovery copy", () => {
    const offline = deriveCompanionViewModel({
      kind: "offline",
      diagnostic: "network connection refused",
    });
    expect(offline).toMatchObject({
      state: "offline",
      summary: "Service unavailable",
      diagnostic: "Start Crewlight to reconnect.",
    });
    expect(JSON.stringify(offline)).not.toContain("connection refused");

    const unavailable = deriveCompanionViewModel({
      kind: "api-unavailable",
      diagnostic: "Dashboard API returned invalid JSON over HTTP 503.",
    });
    expect(unavailable).toMatchObject({
      state: "api-unavailable",
      summary: "Service unavailable",
      diagnostic: "Start Crewlight to reconnect.",
    });
    expect(`${unavailable.summary} ${unavailable.diagnostic}`).not.toMatch(
      /API|HTTP|JSON|dashboard/iu,
    );

    expect(
      deriveCompanionViewModel(
        { kind: "offline", diagnostic: "network" },
        5_000,
        { expanded: false, alwaysOnTop: true },
        { locale: "zh-CN" },
      ),
    ).toMatchObject({
      summary: "服务暂不可用",
      diagnostic: "启动 Crewlight 后会自动重新连接。",
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

  it("presents Cursor without exposing the backend surface label", () => {
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
        title: "Cursor needs review",
        workspace: "Crewlight",
        statusLabel: "Waiting for input",
        needsAction: true,
        tone: "action",
      },
    });
    expect(view.mostImportant).not.toHaveProperty("surface");
    expect(filterSessionViews(view.sessions, "attention")).toHaveLength(1);
  });

  it("derives Simplified Chinese companion labels from one locale option", () => {
    const view = deriveCompanionViewModel(
      online([
        session("waiting_permission", {
          activityLabel: "Permission requested",
          displayName: "Codex",
          surface: "ide-extension",
          taskTitle: "更新说明文档",
          lastEventAgeMs: 125_000,
          durationMs: 168_000,
        }),
      ]),
      5_000,
      { expanded: true, alwaysOnTop: false },
      { locale: "zh-CN" },
    );

    expect(view).toMatchObject({
      locale: "zh-CN",
      state: "needs-you",
      summary: "需要你处理",
      diagnostic: "Codex 需要授权",
      mostImportant: {
        activity: "需要授权",
        statusLabel: "需要授权",
        lastEventLabel: "2 分钟前",
        diagnosticHint: "需要你的授权",
      },
    });
    expect(view.mostImportant).not.toHaveProperty("surface");
    expect(formatCompanionAge(2_000, "zh-CN")).toBe("刚刚");
    expect(formatCompanionDuration(168_000, "zh-CN")).toBe("2分 48秒");
    expect(getCompanionCopy("zh-CN").sessions(6)).toBe("6 个任务");
    expect(getCompanionCopy("zh-CN").needsAttentionFilter).toBe("需要处理");
    expect(getCompanionCopy("zh-CN").openCrewlight).toBe("打开 Crewlight");
  });

  it("localizes generic source names instead of exposing CLI labels", () => {
    const view = deriveCompanionViewModel(
      online([
        session("running", {
          activityLabel: "Command running",
          displayName: "Generic CLI",
          source: "generic-cli",
        }),
      ]),
      5_000,
      undefined,
      { locale: "zh-CN" },
    );

    expect(view.sessions[0]).toMatchObject({
      activity: "命令运行中",
      source: "其他工具",
    });
  });

  it("does not expose the daemon's English stale reason in Chinese", () => {
    const view = deriveCompanionViewModel(
      online([
        session("running", {
          displayName: "Codex",
          isStale: true,
          lastEventAgeMs: 5 * 60 * 1000,
          staleReason: "No event for at least 5 minutes.",
        }),
      ]),
      5_000,
      { expanded: true, alwaysOnTop: false },
      { locale: "zh-CN" },
    );

    expect(view.diagnostic).toBe("Codex 最近一次更新在 5 分钟前，可能已停滞");
    expect(view.sessions[0]?.diagnosticHint).toBe(
      "最近一次更新在 5 分钟前，任务可能已停滞",
    );
  });
});

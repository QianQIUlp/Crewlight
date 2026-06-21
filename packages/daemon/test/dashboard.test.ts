import type {
  AgentSession,
  AgentSource,
  AgentStatus,
  AgentSurface,
} from "@agentpulse/core";
import { describe, expect, it } from "vitest";

import {
  getDashboardActivityLabel,
  getDashboardAttention,
  getDashboardDurationMs,
  getDashboardIdentityLine,
  getDashboardStaleState,
  getDashboardTaskTitle,
  getDisplayName,
  getDisplayWorkspace,
  getLastEventAgeMs,
  getShortSessionKey,
  getSurfaceLabel,
  serializeDashboardSession,
} from "../src/index.js";

const baseSession: AgentSession = {
  sessionKey: "custom:manual:session",
  source: "custom",
  surface: "manual",
  status: "running",
  lastEventAt: 500,
  startedAt: 100,
};

describe("dashboard session derivation", () => {
  it.each<[AgentStatus, string, string | undefined]>([
    ["running", "passive", undefined],
    ["using_tool", "passive", undefined],
    ["idle", "passive", undefined],
    ["unknown", "passive", undefined],
    ["completed", "done", undefined],
    ["waiting_input", "action", "input"],
    ["waiting_permission", "action", "permission"],
    ["failed", "error", undefined],
    ["rate_limited", "error", undefined],
  ])(
    "maps %s to %s attention",
    (status, expectedAttention, expectedActionKind) => {
      expect(getDashboardAttention(status)).toEqual({
        attention: expectedAttention,
        ...(expectedActionKind ? { actionKind: expectedActionKind } : {}),
      });
    },
  );

  it.each<[AgentSource, string]>([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["opencode", "OpenCode"],
    ["vscode-agent", "VS Code Agent"],
    ["generic-cli", "Generic CLI"],
    ["custom", "Custom"],
  ])("formats the %s source name", (source, displayName) => {
    expect(getDisplayName(source)).toBe(displayName);
  });

  it("falls back to the source identifier for a future source", () => {
    expect(getDisplayName("future-agent" as AgentSource)).toBe("future-agent");
  });

  it("uses the final eight session-key characters or the complete short key", () => {
    expect(getShortSessionKey("session:1234567890")).toBe("34567890");
    expect(getShortSessionKey("short")).toBe("short");
  });

  it.each<[AgentSurface, string]>([
    ["cli", "CLI"],
    ["ide-extension", "IDE extension"],
    ["desktop", "Desktop"],
    ["cloud", "Cloud"],
    ["manual", "Manual"],
    ["unknown", "Unknown"],
  ])("formats the %s surface label", (surface, label) => {
    expect(getSurfaceLabel(surface)).toBe(label);
  });

  it("prefers workspace names and supports Unix and Windows paths", () => {
    expect(
      getDisplayWorkspace({
        ...baseSession,
        workspaceName: "Named workspace",
        projectPath: "/workspace/ignored",
      }),
    ).toBe("Named workspace");
    expect(
      getDisplayWorkspace({
        ...baseSession,
        projectPath: "/workspace/agent-pulse/",
      }),
    ).toBe("agent-pulse");
    expect(
      getDisplayWorkspace({
        ...baseSession,
        projectPath: "C:\\work\\agent-pulse\\",
      }),
    ).toBe("agent-pulse");
    expect(getDisplayWorkspace(baseSession)).toBe("Unknown workspace");
  });

  it("formats the complete dashboard identity line", () => {
    expect(
      getDashboardIdentityLine({
        ...baseSession,
        sessionKey: "session:1234567890",
        surface: "ide-extension",
        workspaceName: "AgentPulse",
      }),
    ).toBe("AgentPulse · IDE extension · #34567890");
  });

  it("uses only explicit normalized task titles", () => {
    expect(
      getDashboardTaskTitle({
        ...baseSession,
        taskTitle: "  Review   dashboard output  ",
      }),
    ).toBe("Review dashboard output");
    expect(
      getDashboardTaskTitle({
        ...baseSession,
        title: "PermissionRequest",
      }),
    ).toBeUndefined();
  });

  it("humanizes event titles as activity labels", () => {
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        source: "codex",
        title: "SessionStart",
      }),
    ).toBe("Session started");
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        source: "codex",
        title: "Stop",
      }),
    ).toBe("Session completed");
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        source: "codex",
        title: "UserPromptSubmit",
      }),
    ).toBe("Request submitted");
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        source: "codex",
        title: "PreToolUse",
      }),
    ).toBe("Using tool");
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        source: "codex",
        title: "PermissionRequest",
      }),
    ).toBe("Permission requested");
  });

  it("uses status activity fallbacks without promoting arbitrary messages", () => {
    expect(
      getDashboardActivityLabel({
        ...baseSession,
        status: "waiting_input",
        lastMessage: "arbitrary command body --token secret",
      }),
    ).toBe("Input requested");
    expect(
      getDashboardTaskTitle({
        ...baseSession,
        lastMessage: "prompt-like arbitrary text",
      }),
    ).toBeUndefined();
  });

  it("clamps negative last-event ages to zero", () => {
    expect(getLastEventAgeMs(1_000, 900)).toBe(0);
  });

  it.each<[AgentStatus, number, string]>([
    ["running", 5 * 60 * 1000, "No event for at least 5 minutes."],
    ["using_tool", 5 * 60 * 1000, "No event for at least 5 minutes."],
    ["waiting_input", 10 * 60 * 1000, "No event for at least 10 minutes."],
    ["waiting_permission", 10 * 60 * 1000, "No event for at least 10 minutes."],
    ["unknown", 2 * 60 * 1000, "No event for at least 2 minutes."],
  ])(
    "applies the inclusive stale threshold for %s",
    (status, thresholdMs, staleReason) => {
      expect(getDashboardStaleState(status, thresholdMs - 1)).toEqual({
        isStale: false,
      });
      expect(getDashboardStaleState(status, thresholdMs)).toEqual({
        isStale: true,
        staleReason,
      });
      expect(getDashboardStaleState(status, thresholdMs + 1)).toEqual({
        isStale: true,
        staleReason,
      });
    },
  );

  it.each<AgentStatus>(["completed", "failed", "idle", "rate_limited"])(
    "keeps %s sessions non-stale regardless of age",
    (status) => {
      expect(getDashboardStaleState(status, Number.MAX_SAFE_INTEGER)).toEqual({
        isStale: false,
      });
    },
  );

  it("includes stale reasons only for stale sessions", () => {
    expect(getDashboardStaleState("running", 5 * 60 * 1000)).toHaveProperty(
      "staleReason",
    );
    expect(
      getDashboardStaleState("running", 5 * 60 * 1000 - 1),
    ).not.toHaveProperty("staleReason");
    expect(
      getDashboardStaleState("completed", Number.MAX_SAFE_INTEGER),
    ).not.toHaveProperty("staleReason");
  });

  it("calculates durations from status-specific end times", () => {
    expect(getDashboardDurationMs(baseSession, 900)).toBe(800);
    expect(
      getDashboardDurationMs(
        { ...baseSession, status: "waiting_permission", startedAt: undefined },
        900,
      ),
    ).toBe(400);
    expect(
      getDashboardDurationMs(
        {
          ...baseSession,
          status: "completed",
          completedAt: 700,
        },
        900,
      ),
    ).toBe(600);
    expect(
      getDashboardDurationMs(
        { ...baseSession, status: "failed", completedAt: undefined },
        900,
      ),
    ).toBe(400);
    expect(
      getDashboardDurationMs({ ...baseSession, status: "rate_limited" }, 900),
    ).toBe(400);
  });

  it("clamps negative durations to zero", () => {
    expect(
      getDashboardDurationMs(
        { ...baseSession, status: "completed", completedAt: 50 },
        900,
      ),
    ).toBe(0);
  });

  it("serializes only normalized fields with derived display values", () => {
    const serialized = serializeDashboardSession(
      {
        ...baseSession,
        source: "codex",
        status: "waiting_input",
        projectPath: "/workspace/safe-project",
        taskTitle: "Review dashboard output",
        title: "PermissionRequest",
        lastMessage: "Safe status",
        "input-messages": ["input-message-secret"],
        rawEvent: { prompt: "raw-event-secret" },
        prompt: "prompt-secret",
        transcript: "transcript-secret",
        toolInput: "tool-input-secret",
        toolOutput: "tool-output-secret",
      } as AgentSession & {
        "input-messages": string[];
        prompt: string;
        rawEvent: unknown;
        toolInput: string;
        toolOutput: string;
        transcript: string;
      },
      600_500,
    );

    expect(serialized).toMatchObject({
      shortSessionKey: ":session",
      displayName: "Codex",
      displayWorkspace: "safe-project",
      identityLine: "safe-project · Manual · #:session",
      taskTitle: "Review dashboard output",
      activityLabel: "Permission requested",
      durationMs: 600_400,
      lastEventAgeMs: 600_000,
      isStale: true,
      staleReason: "No event for at least 10 minutes.",
      attention: "action",
      actionKind: "input",
      lastMessage: "Safe status",
    });
    expect(serialized).not.toHaveProperty("rawEvent");
    expect(serialized).not.toHaveProperty("prompt");
    expect(serialized).not.toHaveProperty("input-messages");
    expect(serialized).not.toHaveProperty("transcript");
    expect(serialized).not.toHaveProperty("toolInput");
    expect(serialized).not.toHaveProperty("toolOutput");
    expect(JSON.stringify(serialized)).not.toContain("secret");
  });

  it("omits stale reasons from serialized non-stale sessions", () => {
    const serialized = serializeDashboardSession(baseSession, 900);

    expect(serialized).toMatchObject({
      lastEventAgeMs: 400,
      isStale: false,
    });
    expect(serialized).not.toHaveProperty("staleReason");
    expect(serialized).not.toHaveProperty("taskTitle");
    expect(serialized.activityLabel).toBe("Running");
  });
});

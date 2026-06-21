import type { AgentSession, AgentSource, AgentStatus } from "@agentpulse/core";
import { describe, expect, it } from "vitest";

import {
  getDashboardAttention,
  getDashboardDurationMs,
  getDisplayName,
  getDisplayWorkspace,
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
        lastMessage: "Safe status",
        rawEvent: { prompt: "secret" },
      } as AgentSession & { rawEvent: unknown },
      900,
    );

    expect(serialized).toMatchObject({
      displayName: "Codex",
      displayWorkspace: "safe-project",
      durationMs: 800,
      attention: "action",
      actionKind: "input",
      lastMessage: "Safe status",
    });
    expect(serialized).not.toHaveProperty("rawEvent");
    expect(JSON.stringify(serialized)).not.toContain("secret");
  });
});

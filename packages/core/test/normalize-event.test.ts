import { describe, expect, it } from "vitest";

import {
  AGENT_DISPLAY_MAX_LENGTH,
  AGENT_IDENTITY_MAX_LENGTH,
  AGENT_PATH_MAX_LENGTH,
  agentSessionSchema,
  deriveSessionKey,
  normalizeAgentEvent,
  type AgentEventInput,
} from "../src/index.js";

const baseInput: AgentEventInput = {
  source: "custom",
  surface: "manual",
  status: "running",
};

describe("normalizeAgentEvent", () => {
  it("namespaces external session ids by source and surface", () => {
    const custom = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-id",
    });
    const codex = normalizeAgentEvent({
      ...baseInput,
      source: "codex",
      surface: "cli",
      sessionId: "shared-id",
    });

    expect(custom.sessionId).toBe("shared-id");
    expect(custom.sessionKey).not.toBe("shared-id");
    expect(custom.sessionKey).not.toBe(codex.sessionKey);
  });

  it("namespaces remote sessions by remote alias without splitting local sessions", () => {
    const localFirst = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-remote-id",
    });
    const localSecond = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-remote-id",
    });
    const remoteA = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-remote-id",
      remoteAlias: "host-a",
    });
    const remoteARepeat = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-remote-id",
      remoteAlias: "host-a",
    });
    const remoteB = normalizeAgentEvent({
      ...baseInput,
      sessionId: "shared-remote-id",
      remoteAlias: "host-b",
    });

    expect(localFirst.sessionKey).toBe(localSecond.sessionKey);
    expect(remoteA.sessionKey).toBe(remoteARepeat.sessionKey);
    expect(remoteA.sessionKey).not.toBe(remoteB.sessionKey);
    expect(remoteA.sessionKey).not.toBe(localFirst.sessionKey);
  });

  it("namespaces remote project fallbacks by remote alias", () => {
    const remoteA = normalizeAgentEvent({
      ...baseInput,
      projectPath: "/workspace/shared",
      remoteAlias: "host-a",
    });
    const remoteB = normalizeAgentEvent({
      ...baseInput,
      projectPath: "/workspace/shared",
      remoteAlias: "host-b",
    });

    expect(remoteA.sessionKey).not.toBe(remoteB.sessionKey);
  });

  it.each([
    {
      label: "POSIX",
      input: "/srv/crewlight/../workspace/team project",
      expected: "/srv/workspace/team project",
    },
    {
      label: "Windows",
      input: String.raw`C:\Users\crewlight\..\workspace\team project`,
      expected: String.raw`C:\Users\workspace\team project`,
    },
  ])(
    "lexically normalizes a remote $label path without resolving it against the local host",
    ({ input, expected }) => {
      const event = normalizeAgentEvent({
        ...baseInput,
        projectPath: input,
        remoteAlias: "remote-host",
      });

      expect(event.projectPath).toBe(expected);
      expect(event.sessionKey).toBe(
        deriveSessionKey({
          ...baseInput,
          projectPath: input,
          remoteAlias: "remote-host",
        }),
      );
      expect(event.projectPath).toContain("team project");
      expect(event.projectPath).not.toContain(process.cwd());
    },
  );

  it("uses a stable normalized project fallback", () => {
    const first = normalizeAgentEvent({
      ...baseInput,
      projectPath: ".",
    });
    const second = normalizeAgentEvent({
      ...baseInput,
      projectPath: process.cwd(),
    });

    expect(first.sessionKey).toBe(second.sessionKey);
    expect(first.projectPath).toBe(process.cwd());
  });

  it("uses a temporary key without session or project identity", () => {
    const first = normalizeAgentEvent(baseInput);
    const second = normalizeAgentEvent(baseInput);

    expect(first.sessionKey).toMatch(/^temporary:/);
    expect(first.sessionKey).not.toBe(second.sessionKey);
  });

  it("rejects timestamps outside JavaScript's safe integer range", () => {
    expect(() =>
      normalizeAgentEvent({
        ...baseInput,
        timestamp: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
  });

  it("caps future timestamps at normalization time", () => {
    const event = normalizeAgentEvent(
      {
        ...baseInput,
        timestamp: 9_000_000,
      },
      () => 1_000,
    );

    expect(event.timestamp).toBe(1_000);
  });

  it("drops rawEvent at the normalization boundary", () => {
    const event = normalizeAgentEvent({
      ...baseInput,
      rawEvent: { secret: "transient" },
    });

    expect(event).not.toHaveProperty("rawEvent");
    expect(JSON.stringify(event)).not.toContain("transient");
  });

  it.each([
    {
      field: "id",
      unsafeValue: "event\u001b[31m\n-id",
      formerlyCollidingValue: "event[31m-id",
    },
    {
      field: "sessionId",
      unsafeValue: "session\r\n-id",
      formerlyCollidingValue: "session-id",
    },
    {
      field: "remoteAlias",
      unsafeValue: "remote\u001bhost",
      formerlyCollidingValue: "remotehost",
    },
    {
      field: "projectPath",
      unsafeValue: "/srv/team \u0085name/project",
      formerlyCollidingValue: "/srv/team name/project",
    },
  ] as const)(
    "rejects control characters in $field instead of normalizing distinct identity values together",
    ({ field, unsafeValue, formerlyCollidingValue }) => {
      expect(() =>
        normalizeAgentEvent({
          ...baseInput,
          sessionId: "collision-regression-session",
          [field]: unsafeValue,
        }),
      ).toThrow(/control characters/u);

      expect(() =>
        normalizeAgentEvent({
          ...baseInput,
          sessionId: "collision-regression-session",
          [field]: formerlyCollidingValue,
        }),
      ).not.toThrow();
    },
  );

  it("continues to strip terminal and line control characters from display strings", () => {
    const event = normalizeAgentEvent({
      ...baseInput,
      id: "event-id",
      sessionId: "session-id",
      projectPath: "/srv/team name/project",
      workspaceName: "workspace\u0000\u2028name",
      taskTitle: "task\u009b\u2029title",
      title: "title\u007fvalue",
      message: "message\tvalue",
      remoteAlias: "remote-host",
    });

    expect(event).toMatchObject({
      id: "event-id",
      sessionId: "session-id",
      projectPath: "/srv/team name/project",
      workspaceName: "workspacename",
      taskTitle: "tasktitle",
      title: "titlevalue",
      message: "messagevalue",
      remoteAlias: "remote-host",
    });
    expect(JSON.stringify(event)).not.toMatch(
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u,
    );
  });

  it("rejects overlong identity, path, and display input", () => {
    expect(() =>
      normalizeAgentEvent({
        ...baseInput,
        sessionId: "s".repeat(AGENT_IDENTITY_MAX_LENGTH + 1),
      }),
    ).toThrow();
    expect(() =>
      normalizeAgentEvent({
        ...baseInput,
        projectPath: `/${"p".repeat(AGENT_PATH_MAX_LENGTH)}`,
      }),
    ).toThrow();
    expect(() =>
      normalizeAgentEvent({
        ...baseInput,
        message: "m".repeat(AGENT_DISPLAY_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });

  it("rejects control-only identity strings", () => {
    expect(() =>
      normalizeAgentEvent({
        ...baseInput,
        sessionId: "\u001b\r\n\u009b\u2028",
      }),
    ).toThrow();
  });

  it("bounds identity and display strings in stored session schemas", () => {
    const session = {
      sessionKey: "session:key",
      sessionId: "s".repeat(AGENT_IDENTITY_MAX_LENGTH),
      source: "custom",
      surface: "manual",
      workspaceName: "w".repeat(AGENT_DISPLAY_MAX_LENGTH),
      status: "completed",
      lastEventAt: 1,
    };

    expect(agentSessionSchema.parse(session)).toEqual(session);
    expect(() =>
      agentSessionSchema.parse({
        ...session,
        workspaceName: "w".repeat(AGENT_DISPLAY_MAX_LENGTH + 1),
      }),
    ).toThrow();
  });

  it("retains explicit normalized task titles separately from event titles", () => {
    const event = normalizeAgentEvent({
      ...baseInput,
      taskTitle: "Review dashboard output",
      title: "SessionStart",
    });

    expect(event.taskTitle).toBe("Review dashboard output");
    expect(event.title).toBe("SessionStart");
  });

  it("applies the default urgency policy", () => {
    expect(
      normalizeAgentEvent({ ...baseInput, status: "using_tool" }).urgency,
    ).toBe("low");
    expect(
      normalizeAgentEvent({ ...baseInput, status: "completed" }).urgency,
    ).toBe("normal");
    expect(
      normalizeAgentEvent({ ...baseInput, status: "waiting_input" }).urgency,
    ).toBe("high");
  });

  it("accepts unknown surfaces for research-only sources", () => {
    const event = normalizeAgentEvent({
      source: "antigravity",
      surface: "unknown",
      status: "unknown",
      sessionId: "probe-session",
    });

    expect(event).toMatchObject({
      source: "antigravity",
      surface: "unknown",
      status: "unknown",
      sessionId: "probe-session",
    });
    expect(event.sessionKey).not.toBe("probe-session");
  });
});

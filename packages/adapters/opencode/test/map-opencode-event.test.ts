import { describe, expect, it } from "vitest";

import { ingestOpenCodePluginJson, mapOpenCodeEvent } from "../src/index.js";

describe("OpenCode plugin adapter", () => {
  it.each([
    ["session.created", "running"],
    ["session.updated", "running"],
    ["session.idle", "completed"],
    ["session.error", "failed"],
    ["permission.asked", "waiting_permission"],
    ["permission.replied", "running"],
    ["tool.execute.before", "using_tool"],
    ["tool.execute.after", "running"],
    ["message.updated", "running"],
  ] as const)("maps %s to %s", (eventType, status) => {
    expect(
      mapOpenCodeEvent({
        cwd: "/workspace/demo",
        timestamp: 123,
        event: {
          type: eventType,
          properties: { sessionID: "opencode-session" },
        },
      }),
    ).toMatchObject({
      kind: "event",
      event: {
        source: "opencode",
        surface: "unknown",
        status,
        title: eventType,
        sessionId: "opencode-session",
        projectPath: "/workspace/demo",
        timestamp: 123,
      },
    });
  });

  it.each([
    ["idle", "completed"],
    ["completed", "completed"],
    ["error", "failed"],
    ["failed", "failed"],
    ["busy", "running"],
    ["retry", "running"],
    ["unexpected", "running"],
    [undefined, "running"],
  ] as const)("maps session.status %s to %s", (statusType, status) => {
    expect(
      mapOpenCodeEvent({
        event: {
          type: "session.status",
          properties: {
            sessionID: "status-session",
            ...(statusType ? { status: { type: statusType } } : {}),
          },
        },
      }),
    ).toMatchObject({
      kind: "event",
      event: { status, sessionId: "status-session" },
    });
  });

  it("uses the explicit event before stdin event.type", () => {
    expect(
      ingestOpenCodePluginJson(
        JSON.stringify({
          event: {
            type: "tool.execute.before",
            properties: { info: { id: "override-session" } },
          },
        }),
        "session.idle",
      ),
    ).toMatchObject({
      kind: "event",
      event: {
        status: "completed",
        title: "session.idle",
        sessionId: "override-session",
      },
    });
  });

  it.each(["", "{", JSON.stringify({ event: "invalid" })])(
    "creates a best-effort event from an explicit event when stdin is unusable",
    (json) => {
      expect(ingestOpenCodePluginJson(json, "session.created")).toMatchObject({
        kind: "event",
        event: {
          source: "opencode",
          surface: "unknown",
          status: "running",
          title: "session.created",
        },
      });
    },
  );

  it("ignores unknown and missing event types", () => {
    expect(mapOpenCodeEvent({ event: { type: "session.deleted" } })).toEqual({
      kind: "ignored",
      reason: "Unsupported OpenCode event",
    });
    expect(mapOpenCodeEvent({})).toEqual({
      kind: "ignored",
      reason: "Unsupported OpenCode event",
    });
  });

  it("rejects malformed JSON and non-object payloads", () => {
    expect(ingestOpenCodePluginJson("{")).toEqual({
      kind: "invalid",
      reason: "Invalid OpenCode plugin JSON",
    });
    expect(mapOpenCodeEvent("invalid")).toEqual({
      kind: "invalid",
      reason: "Invalid OpenCode plugin payload",
    });
  });

  it("strips prompts, messages, tool details, raw events, and environment data", () => {
    const result = mapOpenCodeEvent({
      cwd: "/safe/path",
      event: {
        type: "tool.execute.before",
        properties: {
          sessionID: "safe-session",
          prompt: "secret-prompt",
          message: "secret-message",
          args: { command: "secret-command" },
          result: "secret-result",
          fileContents: "secret-file",
          env: { TOKEN: "secret-token" },
          rawEvent: { secret: true },
        },
      },
    });

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("rawEvent");
  });
});

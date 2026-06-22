import type { AgentStatus } from "@agentpulse/core";
import { describe, expect, it } from "vitest";

import { ingestCursorBridgeJson, mapCursorBridgeEvent } from "../src/index.js";

describe("Cursor manual bridge adapter", () => {
  it.each<[string, AgentStatus]>([
    ["running", "running"],
    ["start", "running"],
    ["active", "running"],
    ["tool", "using_tool"],
    ["using-tool", "using_tool"],
    ["waiting-input", "waiting_input"],
    ["needs-review", "waiting_input"],
    ["review", "waiting_input"],
    ["waiting-permission", "waiting_permission"],
    ["permission", "waiting_permission"],
    ["completed", "completed"],
    ["done", "completed"],
    ["success", "completed"],
    ["failed", "failed"],
    ["error", "failed"],
    ["rate-limited", "rate_limited"],
    ["idle", "idle"],
    ["unknown", "unknown"],
    ["note", "unknown"],
  ])("maps Cursor event %s to %s", (event, status) => {
    expect(mapCursorBridgeEvent({ event })).toEqual({
      kind: "event",
      event: {
        source: "cursor",
        surface: "ide-extension",
        status,
      },
    });
  });

  it("maps allowlisted identity and presentation fields", () => {
    expect(
      mapCursorBridgeEvent({
        event: "WAITING-INPUT",
        surface: "desktop",
        sessionId: "cursor-agentpulse",
        workspaceName: "AgentPulse",
        projectPath: "/workspace/AgentPulse",
        title: "Cursor needs review",
        message: "Manual bridge event",
        timestamp: 1_710_000_000_000,
      }),
    ).toEqual({
      kind: "event",
      event: {
        source: "cursor",
        surface: "desktop",
        status: "waiting_input",
        sessionId: "cursor-agentpulse",
        workspaceName: "AgentPulse",
        projectPath: "/workspace/AgentPulse",
        taskTitle: "Cursor needs review",
        message: "Manual bridge event",
        timestamp: 1_710_000_000_000,
      },
    });
  });

  it.each(["ide-extension", "desktop", "manual"])(
    "accepts the %s surface",
    (surface) => {
      expect(mapCursorBridgeEvent({ event: "running", surface })).toMatchObject(
        {
          kind: "event",
          event: { surface },
        },
      );
    },
  );

  it("rejects invalid surfaces and unsupported events", () => {
    expect(
      mapCursorBridgeEvent({ event: "running", surface: "cloud" }),
    ).toEqual({
      kind: "invalid",
      reason: "Invalid Cursor bridge payload",
    });
    expect(mapCursorBridgeEvent({ event: "automatic-magic" })).toEqual({
      kind: "ignored",
      reason: "Unsupported Cursor bridge event",
    });
  });

  it("strips unknown and sensitive fields from JSON input", () => {
    const result = ingestCursorBridgeJson(
      JSON.stringify({
        event: "running",
        sessionId: "safe-session",
        title: "Safe title",
        prompt: "secret prompt",
        transcript: "secret transcript",
        toolInput: { command: "secret command" },
        toolOutput: "secret output",
        rawEvent: { secret: true },
      }),
    );

    expect(result).toEqual({
      kind: "event",
      event: {
        source: "cursor",
        surface: "ide-extension",
        status: "running",
        sessionId: "safe-session",
        taskTitle: "Safe title",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects invalid JSON and missing events", () => {
    expect(ingestCursorBridgeJson("{")).toEqual({
      kind: "invalid",
      reason: "Invalid Cursor bridge JSON",
    });
    expect(ingestCursorBridgeJson("{}")).toEqual({
      kind: "invalid",
      reason: "Invalid Cursor bridge payload",
    });
  });
});

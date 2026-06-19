import { describe, expect, it } from "vitest";

import {
  CODEX_MESSAGE_LIMIT,
  ingestCodexNotifyJson,
  mapCodexNotification,
} from "../src/index.js";

describe("Codex notify adapter", () => {
  it("maps agent-turn-complete and its safe identity fields", () => {
    const result = mapCodexNotification({
      type: "agent-turn-complete",
      "thread-id": "codex-thread",
      "turn-id": "turn-1",
      cwd: "/tmp/codex-project",
      "last-assistant-message": "Done",
    });

    expect(result).toEqual({
      kind: "event",
      event: {
        source: "codex",
        surface: "cli",
        status: "completed",
        title: "agent-turn-complete",
        message: "Done",
        sessionId: "codex-thread",
        projectPath: "/tmp/codex-project",
      },
    });
  });

  it("truncates the assistant message to the configured limit", () => {
    const result = mapCodexNotification({
      type: "agent-turn-complete",
      "last-assistant-message": "x".repeat(CODEX_MESSAGE_LIMIT + 20),
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.message).toHaveLength(CODEX_MESSAGE_LIMIT);
      expect(result.event.message?.endsWith("…")).toBe(true);
    }
  });

  it("does not copy input messages or passthrough payloads", () => {
    const result = mapCodexNotification({
      type: "agent-turn-complete",
      "input-messages": ["private user prompt"],
      rawEvent: { secret: "raw-secret" },
    });

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("private user prompt");
    expect(JSON.stringify(result)).not.toContain("raw-secret");
    if (result.kind === "event") {
      expect(result.event.message).toBe("Codex turn completed");
    }
  });

  it("ignores unknown notification types", () => {
    expect(mapCodexNotification({ type: "approval-requested" }).kind).toBe(
      "ignored",
    );
  });

  it("safely rejects malformed JSON and invalid payloads", () => {
    expect(ingestCodexNotifyJson("{").kind).toBe("invalid");
    expect(ingestCodexNotifyJson('{"cwd":"/tmp"}').kind).toBe("invalid");
  });
});

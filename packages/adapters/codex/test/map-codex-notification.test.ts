import { readFileSync } from "node:fs";

import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestCodexNotifyJson, mapCodexNotification } from "../src/index.js";

describe("Codex notify adapter", () => {
  it("normalizes a sanitized fixture without retaining prompts or raw payload fields", () => {
    const fixture = readFileSync(
      new URL("./fixtures/agent-turn-complete.sanitized.json", import.meta.url),
      "utf8",
    );
    const result = ingestCodexNotifyJson(fixture);

    expect(result.kind).toBe("event");
    if (result.kind !== "event") {
      throw new Error("Expected fixture to map");
    }

    const event = normalizeAgentEvent(result.event);
    expect(event).toMatchObject({
      source: "codex",
      surface: "cli",
      status: "completed",
      sessionId: "fixture-codex-thread",
      projectPath: "/workspace/sanitized-project",
      title: "agent-turn-complete",
      message: "Codex turn completed",
    });
    expect(JSON.stringify(event)).not.toContain("Sanitized completion");
    expect(JSON.stringify(event)).not.toContain(
      "private-user-prompt-placeholder",
    );
    expect(JSON.stringify(event)).not.toContain("private-secret-placeholder");
  });

  it("maps agent-turn-complete and its safe identity fields", () => {
    const result = mapCodexNotification({
      type: "agent-turn-complete",
      "thread-id": "codex-thread",
      "turn-id": "turn-1",
      cwd: "/tmp/codex-project",
      "last-assistant-message": "Done",
    });

    expect(result).toMatchObject({
      kind: "event",
      event: {
        source: "codex",
        surface: "cli",
        status: "completed",
        title: "agent-turn-complete",
        message: "Codex turn completed",
        sessionId: "codex-thread",
        projectPath: "/tmp/codex-project",
      },
    });
    if (result.kind === "event") {
      expect(result.event.id).toMatch(/^stable:codex-turn:[a-f0-9]{24}$/u);
      expect(result.event.id).not.toContain("codex-thread");
      expect(result.event.id).not.toContain("turn-1");
    }
  });

  it("uses turn identity for retry deduplication without merging later turns", () => {
    const first = mapCodexNotification({
      type: "agent-turn-complete",
      "thread-id": "thread-1",
      "turn-id": "turn-1",
    });
    const retry = mapCodexNotification({
      type: "agent-turn-complete",
      "thread-id": "thread-1",
      "turn-id": "turn-1",
    });
    const nextTurn = mapCodexNotification({
      type: "agent-turn-complete",
      "thread-id": "thread-1",
      "turn-id": "turn-2",
    });

    expect(first.kind).toBe("event");
    expect(retry.kind).toBe("event");
    expect(nextTurn.kind).toBe("event");
    if (
      first.kind === "event" &&
      retry.kind === "event" &&
      nextTurn.kind === "event"
    ) {
      expect(first.event.id).toBe(retry.event.id);
      expect(nextTurn.event.id).not.toBe(first.event.id);
    }
  });

  it("does not forward the assistant message", () => {
    const result = mapCodexNotification({
      type: "agent-turn-complete",
      "last-assistant-message": "private assistant transcript",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.message).toBe("Codex turn completed");
      expect(JSON.stringify(result.event)).not.toContain(
        "private assistant transcript",
      );
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

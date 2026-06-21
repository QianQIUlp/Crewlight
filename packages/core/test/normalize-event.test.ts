import { describe, expect, it } from "vitest";

import { normalizeAgentEvent, type AgentEventInput } from "../src/index.js";

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

  it("drops rawEvent at the normalization boundary", () => {
    const event = normalizeAgentEvent({
      ...baseInput,
      rawEvent: { secret: "transient" },
    });

    expect(event).not.toHaveProperty("rawEvent");
    expect(JSON.stringify(event)).not.toContain("transient");
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

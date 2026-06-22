import type {
  AgentEvent,
  AgentEventInput,
  AgentSession,
} from "@crewlight/core";
import { deriveSessionKey } from "@crewlight/core";
import type { IngestResult } from "@crewlight/daemon";
import { describe, expect, it } from "vitest";

import { main } from "../src/app.js";
import type { CrewlightClient } from "../src/daemon-client.js";
import {
  createMultiAgentDemoEvents,
  executeDemoCommand,
  getDemoDashboardUrl,
  resolveDemoScenario,
} from "../src/commands/demo.js";
import type { CommandIo } from "../src/commands/types.js";

function captureIo() {
  const output: string[] = [];
  const warnings: string[] = [];
  const io: CommandIo = {
    write: (message) => output.push(message),
    warn: (message) => warnings.push(message),
  };
  return { io, output, warnings };
}

function ingestResult(event: AgentEventInput): IngestResult {
  return {
    event: event as AgentEvent,
    session: {
      sessionKey: deriveSessionKey(event),
      source: event.source,
      surface: event.surface,
      status: event.status,
      lastEventAt: event.timestamp ?? 0,
    } as AgentSession,
  };
}

describe("demo command", () => {
  it("registers the demo command and documents both supported forms", async () => {
    const help = captureIo();
    const invalid = captureIo();

    expect(await main(["--help"], help.io)).toBe(0);
    expect(help.output.join("\n")).toContain("crewlight demo [multi-agent]");
    expect(help.output.join("\n")).toContain(
      "crewlight demo --scenario multi-agent",
    );
    expect(await main(["demo", "unknown"], invalid.io)).toBe(1);
    expect(invalid.warnings.join("\n")).toContain("Unknown demo scenario");
    expect(invalid.warnings.join("\n")).not.toContain("Unknown command");
  });

  it("resolves the default and explicit multi-agent scenario forms", () => {
    expect(resolveDemoScenario([])).toBe("multi-agent");
    expect(resolveDemoScenario(["multi-agent"])).toBe("multi-agent");
    expect(resolveDemoScenario(["--scenario", "multi-agent"])).toBe(
      "multi-agent",
    );
  });

  it("rejects unknown, duplicate, and conflicting scenario selectors", () => {
    expect(() => resolveDemoScenario(["solo"])).toThrow(
      "Unknown demo scenario",
    );
    expect(() => resolveDemoScenario(["multi-agent", "extra"])).toThrow(
      "only one scenario",
    );
    expect(() =>
      resolveDemoScenario(["multi-agent", "--scenario", "multi-agent"]),
    ).toThrow("not both");
  });

  it("creates six deterministic, safe, visibly synthetic sessions", () => {
    const events = createMultiAgentDemoEvents(1_000_000);
    const repeated = createMultiAgentDemoEvents(2_000_000);

    expect(events).toHaveLength(6);
    expect(events.map((event) => event.source)).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "opencode",
      "custom",
      "generic-cli",
    ]);
    expect(events.map((event) => event.status)).toEqual([
      "using_tool",
      "waiting_permission",
      "waiting_input",
      "completed",
      "failed",
      "running",
    ]);
    expect(events.map((event) => event.sessionId)).toEqual([
      "demo:claude-code:tests",
      "demo:codex:readme-permission",
      "demo:cursor:review",
      "demo:opencode:complete",
      "demo:custom:setup-failure",
      "demo:generic-cli:stale-scan",
    ]);
    expect(events.map(deriveSessionKey)).toEqual(
      repeated.map(deriveSessionKey),
    );
    expect(
      events.every((event) => event.workspaceName === "Crewlight Demo"),
    ).toBe(true);
    expect(events.every((event) => event.taskTitle?.startsWith("[Demo]"))).toBe(
      true,
    );

    const serialized = JSON.stringify(events);
    for (const prohibited of [
      "projectPath",
      "message",
      "prompt",
      "transcript",
      "toolInput",
      "toolOutput",
      "rawEvent",
      "input-messages",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(events.at(-1)?.timestamp).toBe(640_000);
  });

  it("delivers the scenario and prints configured local next steps", async () => {
    const emitted: AgentEventInput[] = [];
    const capture = captureIo();
    const client: CrewlightClient = {
      sessions: async () => [],
      emit: async (event) => {
        emitted.push(event);
        return ingestResult(event);
      },
    };

    const code = await executeDemoCommand([], client, capture.io, {
      now: () => 1_000_000,
      env: {
        CREWLIGHT_HOST: "::1",
        CREWLIGHT_PORT: "4768",
      },
    });

    expect(code).toBe(0);
    expect(emitted).toHaveLength(6);
    expect(capture.warnings).toEqual([]);
    expect(capture.output.join("\n")).toContain(
      "Dashboard: http://[::1]:4768/dashboard",
    );
    expect(capture.output.join("\n")).toContain("pnpm companion:dev");
    expect(capture.output.join("\n")).toContain("crewlight demo multi-agent");
    expect(capture.output.join("\n")).toContain("restart");
    expect(capture.output.join("\n")).toContain("synthetic local demo data");
  });

  it("performs no event writes when daemon preflight fails", async () => {
    let emitCalls = 0;
    const capture = captureIo();
    const client: CrewlightClient = {
      sessions: async () => {
        throw new Error("private transport detail");
      },
      emit: async (event) => {
        emitCalls += 1;
        return ingestResult(event);
      },
    };

    const code = await executeDemoCommand([], client, capture.io);

    expect(code).toBe(1);
    expect(emitCalls).toBe(0);
    expect(capture.output).toEqual([]);
    expect(capture.warnings.join("\n")).toContain(
      "crewlight daemon --dashboard --notifier none",
    );
    expect(capture.warnings.join("\n")).not.toContain(
      "private transport detail",
    );
  });

  it("reports scoped partial delivery without leaking the daemon error", async () => {
    let emitCalls = 0;
    const capture = captureIo();
    const client: CrewlightClient = {
      sessions: async () => [],
      emit: async (event) => {
        emitCalls += 1;
        if (emitCalls === 3) {
          throw new Error("secret daemon body");
        }
        return ingestResult(event);
      },
    };

    const code = await executeDemoCommand(["multi-agent"], client, capture.io);

    expect(code).toBe(1);
    expect(emitCalls).toBe(3);
    expect(capture.warnings.join("\n")).toContain(
      "stopped after 2 of 6 synthetic events",
    );
    expect(capture.warnings.join("\n")).not.toContain("secret daemon body");
  });

  it("uses the default daemon endpoint for dashboard next steps", () => {
    expect(getDemoDashboardUrl({})).toBe("http://127.0.0.1:3768/dashboard");
  });
});

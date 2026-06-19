import type { AgentEvent, AgentSession } from "@agentpulse/core";
import { OsNotifier, type Notifier } from "@agentpulse/notifier";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentPulseService,
  startDaemon,
  type DaemonInstance,
} from "../src/index.js";

class SilentNotifier implements Notifier {
  notify(_event: AgentEvent, _session: AgentSession): void {}
}

let instance: DaemonInstance | undefined;

afterEach(async () => {
  await instance?.close();
  instance = undefined;
});

async function startTestDaemon(): Promise<DaemonInstance> {
  instance = await startDaemon(
    { host: "127.0.0.1", port: 0 },
    new AgentPulseService({ notifier: new SilentNotifier() }),
  );
  return instance;
}

describe("daemon HTTP server", () => {
  it("accepts events, strips rawEvent, and retains terminal sessions", async () => {
    const daemon = await startTestDaemon();
    const runningResponse = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "http-session",
        status: "running",
        rawEvent: { secret: "transient" },
      }),
    });
    const runningBody = await runningResponse.json();

    expect(runningResponse.status).toBe(202);
    expect(runningBody).not.toHaveProperty("event.rawEvent");
    expect(JSON.stringify(runningBody)).not.toContain("transient");

    await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "http-session",
        status: "completed",
      }),
    });

    const sessionsResponse = await fetch(`${daemon.url}/sessions`);
    const body = (await sessionsResponse.json()) as {
      sessions: AgentSession[];
    };

    expect(sessionsResponse.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]?.status).toBe("completed");
    expect(body.sessions[0]?.sessionId).toBe("http-session");
  });

  it("rejects invalid events", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "invalid", status: "running" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns not found for unsupported routes", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/health`);

    expect(response.status).toBe(404);
  });

  it("keeps ingest available when the OS notifier cannot load", async () => {
    const warnings: string[] = [];
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new AgentPulseService({
        notifier: new OsNotifier({
          loader: async () => {
            throw new Error("native runtime unavailable");
          },
          warning: (warning) => warnings.push(warning),
        }),
      }),
    );

    const response = await fetch(`${instance.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        status: "completed",
      }),
    });

    expect(response.status).toBe(202);
    expect(warnings).toHaveLength(1);
    expect(warnings.join("\n")).not.toContain("native runtime unavailable");
  });
});

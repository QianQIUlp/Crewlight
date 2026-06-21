import type { AgentEvent, AgentSession } from "@agentpulse/core";
import { OsNotifier, type Notifier } from "@agentpulse/notifier";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentPulseService,
  formatDaemonUrl,
  startDaemon,
  type DashboardApiResponse,
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
    const healthResponse = await fetch(`${daemon.url}/health`);
    const dashboardResponse = await fetch(`${daemon.url}/dashboard`);
    const dashboardApiResponse = await fetch(`${daemon.url}/dashboard/api`);

    expect(healthResponse.status).toBe(404);
    expect(dashboardResponse.status).toBe(404);
    expect(dashboardApiResponse.status).toBe(404);
  });

  it("serves dashboard routes only when enabled with no-store responses", async () => {
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new AgentPulseService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          setup: {
            claudeCode: '{"hooks":{"Stop":[]}}',
            codex: 'notify = ["agentpulse", "ingest", "codex"]',
            codexHooks:
              "Codex hooks setup unavailable.\nInstall AgentPulse into a simple no-space path.",
            openCode: "export const AgentPulsePlugin = async () => ({});",
            antigravityProbe:
              "printf '%s\\n' '{}' | agentpulse ingest antigravity-probe --event manual.probe --surface desktop",
          },
          doctor: async () => ({
            ok: true,
            checks: [
              {
                id: "daemon",
                status: "ok",
                message: "Daemon is reachable.",
              },
            ],
          }),
        },
      },
    );

    const page = await fetch(`${instance.url}/dashboard`);
    const stylesheet = await fetch(`${instance.url}/dashboard/styles.css`);
    const script = await fetch(`${instance.url}/dashboard/app.js`);
    const api = await fetch(`${instance.url}/dashboard/api`);
    const pageBody = await page.text();
    const scriptBody = await script.text();
    const body = await api.text();
    const parsed = JSON.parse(body) as DashboardApiResponse;

    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(pageBody).toContain('id="action-needed"');
    expect(pageBody).toContain('id="setup-opencode"');
    expect(pageBody).toContain('id="setup-antigravity-probe"');
    expect(pageBody).toContain("Research-only");
    expect(pageBody).toMatch(/not a\s+supported AgentPulse integration/u);
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("cache-control")).toBe("no-store");
    expect(script.status).toBe(200);
    expect(script.headers.get("cache-control")).toBe("no-store");
    expect(scriptBody).toContain("URLSearchParams");
    expect(scriptBody).not.toContain(".innerHTML");
    expect(api.status).toBe(200);
    expect(api.headers.get("cache-control")).toBe("no-store");
    expect(api.headers.get("content-type")).toContain("application/json");
    expect(body).toContain('"notifier":"none"');
    expect(body).toContain('"status":"ok"');
    expect(body).toContain("Codex hooks setup unavailable");
    expect(body).toContain("simple no-space path");
    expect(parsed.setup).toEqual({
      claudeCode: '{"hooks":{"Stop":[]}}',
      codex: 'notify = ["agentpulse", "ingest", "codex"]',
      codexHooks:
        "Codex hooks setup unavailable.\nInstall AgentPulse into a simple no-space path.",
      openCode: "export const AgentPulsePlugin = async () => ({});",
      antigravityProbe:
        "printf '%s\\n' '{}' | agentpulse ingest antigravity-probe --event manual.probe --surface desktop",
    });
  });

  it("exposes only normalized session fields through the dashboard API", async () => {
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new AgentPulseService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          setup: {
            claudeCode: "claude",
            codex: "codex",
            codexHooks: "codex-hooks",
            openCode: "opencode",
            antigravityProbe: "antigravity-probe",
          },
          doctor: async () => ({ ok: true, checks: [] }),
        },
      },
    );

    await fetch(`${instance.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "dashboard-session",
        projectPath: "/workspace/safe-project",
        status: "running",
        timestamp: 1_000,
        rawEvent: {
          prompt: "dashboard-secret-prompt",
          toolInput: "dashboard-secret-tool-input",
          transcript: "dashboard-secret-transcript",
        },
      }),
    });

    await fetch(`${instance.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "dashboard-session",
        status: "completed",
        message: "safe summary",
        timestamp: 5_000,
      }),
    });

    const response = await fetch(`${instance.url}/dashboard/api`);
    const body = await response.text();
    const parsed = JSON.parse(body) as {
      sessions: Array<Record<string, unknown>>;
    };

    expect(body).toContain("dashboard-session");
    expect(body).toContain("safe summary");
    expect(parsed.sessions[0]).toMatchObject({
      displayName: "Custom",
      displayWorkspace: "safe-project",
      durationMs: 4_000,
      attention: "done",
    });
    expect(body).not.toContain("dashboard-secret");
    expect(body).not.toContain("rawEvent");
    expect(body).not.toContain("toolInput");
    expect(body).not.toContain("transcript");
  });

  it("rejects dashboard binding outside loopback", async () => {
    await expect(
      startDaemon(
        { host: "0.0.0.0", port: 3768 },
        new AgentPulseService({ notifier: new SilentNotifier() }),
        {
          dashboard: {
            notifier: "none",
            setup: {
              claudeCode: "claude",
              codex: "codex",
              codexHooks: "codex-hooks",
              openCode: "opencode",
              antigravityProbe: "antigravity-probe",
            },
            doctor: async () => ({ ok: true, checks: [] }),
          },
        },
      ),
    ).rejects.toThrow("127.0.0.1");
  });

  it("formats IPv6 loopback daemon URLs correctly", () => {
    expect(formatDaemonUrl("::1", 3768)).toBe("http://[::1]:3768");
  });

  it("starts a dashboard on IPv6 loopback", async () => {
    instance = await startDaemon(
      { host: "::1", port: 0 },
      new AgentPulseService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          setup: {
            claudeCode: "claude",
            codex: "codex",
            codexHooks: "codex-hooks",
            openCode: "opencode",
            antigravityProbe: "antigravity-probe",
          },
          doctor: async () => ({ ok: true, checks: [] }),
        },
      },
    );

    const response = await fetch(`${instance.url}/dashboard`);
    expect(response.status).toBe(200);
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

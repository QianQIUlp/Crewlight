import { createConnection } from "node:net";

import type { AgentEvent, AgentSession } from "@crewlight/core";
import { OsNotifier, type Notifier } from "@crewlight/notifier";
import { afterEach, describe, expect, it } from "vitest";

import {
  CrewlightService,
  EVENT_BODY_TIMEOUT_MS,
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
    new CrewlightService({ notifier: new SilentNotifier() }),
  );
  return instance;
}

async function sendRawHttpRequest(
  port: number,
  request: string,
  timeoutMs = 1_000,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let response = "";
    let settled = false;

    const finish = (result: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      result();
    };

    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk: string) => {
      response += chunk;
    });
    socket.on("end", () => finish(() => resolve(response)));
    socket.on("error", (error) => finish(() => reject(error)));
    socket.on("timeout", () =>
      finish(() => reject(new Error("Timed out waiting for HTTP response"))),
    );
  });
}

function loopbackAuthority(daemon: DaemonInstance): string {
  return new URL(daemon.url).host;
}

describe("daemon HTTP server", () => {
  it.each(["http://[::1", "http://%"])(
    "returns a safe error for malformed absolute request target %s and stays available",
    async (requestTarget) => {
      const daemon = await startTestDaemon();
      const response = await sendRawHttpRequest(
        daemon.port,
        `GET ${requestTarget} HTTP/1.1\r\nHost: ${loopbackAuthority(daemon)}\r\nConnection: close\r\n\r\n`,
      );

      expect(response).toContain("HTTP/1.1 400 Bad Request");
      expect(response).toContain('{"error":"Invalid request target"}');

      const sessionsResponse = await fetch(`${daemon.url}/sessions`);
      expect(sessionsResponse.status).toBe(200);
    },
  );

  it("rejects a hostile Host header on the loopback API", async () => {
    const daemon = await startTestDaemon();
    const response = await sendRawHttpRequest(
      daemon.port,
      "GET /sessions HTTP/1.1\r\nHost: attacker.invalid\r\nConnection: close\r\n\r\n",
    );

    expect(response).toContain("HTTP/1.1 403 Forbidden");
    expect(response).toContain('{"error":"Forbidden"}');
    expect(response).not.toContain("sessions");
  });

  it.each(["//attacker.invalid/sessions", "http://attacker.invalid/sessions"])(
    "rejects a non-origin-form request-target %s on the loopback API",
    async (requestTarget) => {
      const daemon = await startTestDaemon();
      const response = await sendRawHttpRequest(
        daemon.port,
        `GET ${requestTarget} HTTP/1.1\r\nHost: ${loopbackAuthority(daemon)}\r\nConnection: close\r\n\r\n`,
      );

      expect(response).toContain("HTTP/1.1 403 Forbidden");
      expect(response).not.toContain('"sessions"');
    },
  );

  it("rejects hostile browser origins before event ingestion", async () => {
    const daemon = await startTestDaemon();
    const authority = loopbackAuthority(daemon);
    const response = await sendRawHttpRequest(
      daemon.port,
      `POST /events HTTP/1.1\r\nHost: ${authority}\r\nOrigin: http://attacker.invalid\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`,
    );

    expect(response).toContain("HTTP/1.1 403 Forbidden");
    const sessionsResponse = await fetch(`${daemon.url}/sessions`);
    await expect(sessionsResponse.json()).resolves.toEqual({ sessions: [] });
  });

  it("accepts a matching loopback browser origin", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: daemon.url,
      },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        status: "running",
        title: "same-origin event",
      }),
    });

    expect(response.status).toBe(202);
  });

  it("marks session responses as non-cacheable", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/sessions`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("requires an application/json content type for event ingestion", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Type must be application/json",
    });
  });

  it("returns a fixed error for malformed JSON event bodies", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{"secret":"must-not-appear",',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });

  it("rejects oversized event bodies with a fixed error", async () => {
    const daemon = await startTestDaemon();
    const response = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(64 * 1_024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Event body too large",
    });
  });

  it("rejects an oversized declared body without waiting for it to arrive", async () => {
    const daemon = await startTestDaemon();
    const startedAt = Date.now();
    const response = await sendRawHttpRequest(
      daemon.port,
      `POST /events HTTP/1.1\r\nHost: ${loopbackAuthority(daemon)}\r\nContent-Type: application/json\r\nContent-Length: 999999\r\n\r\n`,
    );

    expect(response).toContain("HTTP/1.1 413 Payload Too Large");
    expect(response).toContain('{"error":"Event body too large"}');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("rejects an oversized chunked body without waiting for its terminator", async () => {
    const daemon = await startTestDaemon();
    const oversizedChunk = "x".repeat(64 * 1_024 + 1);
    const response = await sendRawHttpRequest(
      daemon.port,
      `POST /events HTTP/1.1\r\nHost: ${loopbackAuthority(daemon)}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${oversizedChunk.length.toString(16)}\r\n${oversizedChunk}\r\n`,
    );

    expect(response).toContain("HTTP/1.1 413 Payload Too Large");
    expect(response).toContain('{"error":"Event body too large"}');
  });

  it("bounds incomplete event bodies", async () => {
    const daemon = await startTestDaemon();
    const startedAt = Date.now();
    const response = await sendRawHttpRequest(
      daemon.port,
      `POST /events HTTP/1.1\r\nHost: ${loopbackAuthority(daemon)}\r\nContent-Type: application/json\r\nContent-Length: 10\r\n\r\n{`,
      EVENT_BODY_TIMEOUT_MS * 3,
    );

    expect(response).toContain("HTTP/1.1 408 Request Timeout");
    expect(response).toContain('{"error":"Event body timed out"}');
    expect(Date.now() - startedAt).toBeLessThan(EVENT_BODY_TIMEOUT_MS * 2);
  });

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

  it("marks ignored stale events explicitly instead of accepting a contradictory update", async () => {
    const daemon = await startTestDaemon();
    await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "stale-http-session",
        status: "completed",
        timestamp: 200,
      }),
    });

    const staleResponse = await fetch(`${daemon.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "manual",
        sessionId: "stale-http-session",
        status: "running",
        timestamp: 100,
      }),
    });
    const body = (await staleResponse.json()) as {
      applied: boolean;
      event: AgentEvent;
      session: AgentSession;
    };

    expect(staleResponse.status).toBe(200);
    expect(body.applied).toBe(false);
    expect(body.event.status).toBe("running");
    expect(body.session.status).toBe("completed");
    expect(body.session.lastEventAt).toBe(200);
  });

  it("returns not found for unsupported routes", async () => {
    const daemon = await startTestDaemon();
    const healthResponse = await fetch(`${daemon.url}/health`);
    const dashboardResponse = await fetch(`${daemon.url}/dashboard`);
    const dashboardApiResponse = await fetch(`${daemon.url}/dashboard/api`);
    const dashboardCapabilitiesResponse = await fetch(
      `${daemon.url}/dashboard/capabilities`,
    );

    expect(healthResponse.status).toBe(404);
    expect(dashboardResponse.status).toBe(404);
    expect(dashboardApiResponse.status).toBe(404);
    expect(dashboardCapabilitiesResponse.status).toBe(404);
  });

  it("serves dashboard routes only when enabled with no-store responses", async () => {
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new CrewlightService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          taskTitleMode: "off",
          setup: {
            claudeCode: '{"hooks":{"Stop":[]}}',
            codex: 'notify = ["crewlight", "ingest", "codex"]',
            codexHooks:
              "Codex hooks setup unavailable.\nInstall Crewlight into a simple no-space path.",
            cursor:
              "crewlight ingest cursor --event running --surface ide-extension",
            openCode: "export const CrewlightPlugin = async () => ({});",
            antigravityProbe:
              "printf '%s\\n' '{}' | crewlight ingest antigravity-probe --event manual.probe --surface desktop",
            verification: {
              claudeCode: "verify-claude",
              codex: "verify-codex",
              cursor: "verify-cursor",
              antigravityProbe: "verify-antigravity",
            },
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
    const capabilities = await fetch(`${instance.url}/dashboard/capabilities`);
    const pageBody = await page.text();
    const stylesheetBody = await stylesheet.text();
    const scriptBody = await script.text();
    const body = await api.text();
    const parsed = JSON.parse(body) as DashboardApiResponse;
    const parsedCapabilities = await capabilities.json();

    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(pageBody).toContain('id="view-nav"');
    expect(pageBody).toContain('id="overview-link" href="/dashboard"');
    expect(pageBody).toContain(
      'id="compact-link" href="/dashboard?view=compact"',
    );
    expect(pageBody).toContain('id="overview-root"');
    expect(pageBody).toContain('id="compact-root"');
    expect(pageBody).toContain('id="focus-root"');
    expect(pageBody).toContain('id="compact-session-list"');
    expect(pageBody).toContain('id="action-needed"');
    expect(pageBody).toContain('id="locale-en"');
    expect(pageBody).toContain('id="locale-zh"');
    expect(pageBody).toContain('data-i18n="header.eyebrow"');
    expect(pageBody).toContain('data-i18n-aria-label="language.label"');
    expect(pageBody).toContain('id="setup-opencode"');
    expect(pageBody).toContain('id="setup-cursor"');
    expect(pageBody).toContain('id="verify-cursor"');
    expect(pageBody).toContain('id="conn-cursor"');
    expect(pageBody).toContain("Cursor currently uses manual status updates");
    expect(pageBody).toContain('id="setup-antigravity-probe"');
    expect(pageBody).toContain("Advanced manual example");
    expect(pageBody).toMatch(/not a supported one-click\s+connection/u);
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("cache-control")).toBe("no-store");
    expect(stylesheetBody).toContain(".compact-session-row");
    expect(stylesheetBody).toContain('.view-nav a[aria-current="page"]');
    expect(stylesheetBody).toContain(
      '.language-switch button[aria-pressed="true"]',
    );
    expect(script.status).toBe(200);
    expect(script.headers.get("cache-control")).toBe("no-store");
    expect(() => new Function(scriptBody)).not.toThrow();
    expect(scriptBody).toContain(
      "const params = new URLSearchParams(window.location.search)",
    );
    expect(scriptBody).toContain('const focusKey = params.get("focus")');
    expect(scriptBody).toContain('const view = params.get("view")');
    expect(scriptBody).toContain(
      'const LOCALE_STORAGE_KEY = "crewlight.dashboard.locale"',
    );
    expect(scriptBody).toContain(
      '(navigator.language || "en").toLowerCase().startsWith("zh")',
    );
    expect(scriptBody).toContain(
      "window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)",
    );
    expect(scriptBody).toContain('"nav.overview": "总览"');
    expect(scriptBody).toContain('"status.waitingPermission": "等待授权"');
    expect(scriptBody).toContain('"activity.permissionRequested": "需要授权"');
    expect(scriptBody).toContain("function createCompactSessionRow(session)");
    expect(scriptBody).toContain("function compactRank(session)");
    expect(scriptBody).toContain('else if (view === "compact")');
    expect(scriptBody.indexOf("if (focusKey)")).toBeLessThan(
      scriptBody.indexOf('else if (view === "compact")'),
    );
    expect(scriptBody).toContain('"&view=compact"');
    expect(scriptBody).toContain('returnToCompact ? "compact" : "overview"');
    expect(scriptBody).toContain('stale.textContent = t("attention.check")');
    expect(scriptBody).toContain("document.createElement");
    expect(scriptBody).toContain(".textContent");
    expect(scriptBody).toContain(
      "workspace.textContent = workspaceLabel(session.identityLine)",
    );
    expect(scriptBody).toContain("title.textContent = session.taskTitle");
    expect(scriptBody).toContain(
      'displayName(session) + " · " + session.taskTitle',
    );
    expect(scriptBody).toContain(
      "activity.textContent = activityLabel(session.activityLabel)",
    );
    expect(scriptBody).not.toContain("session.error || session.lastMessage");
    expect(scriptBody).not.toContain("session.lastMessage || session.error");
    expect(scriptBody).toContain(
      '"/dashboard?focus=" + encodeURIComponent(session.sessionKey)',
    );
    expect(scriptBody).toContain('"session.lastSeen": "Last seen"');
    expect(scriptBody).toContain(
      '"session.stuck": "Possibly stuck · no update for {duration}"',
    );
    expect(scriptBody).toContain("stale.textContent");
    expect(scriptBody).not.toContain(".innerHTML");
    expect(scriptBody).toContain("details.append(summary, technicalMessage)");
    expect(scriptBody).toContain(
      "technicalMessage.textContent = check.message",
    );
    expect(scriptBody).toContain(
      'session.source === "generic-cli" || session.source === "custom"',
    );
    expect(scriptBody).toContain('setText("setup-cursor", data.setup.cursor)');
    expect(scriptBody).toContain('setText("conn-cursor", getAge("cursor"))');
    expect(scriptBody).toContain(
      'setText("conn-antigravity", getAge("antigravity"))',
    );
    expect(scriptBody).not.toContain('getAge("antigravity-probe")');
    expect(api.status).toBe(200);
    expect(api.headers.get("cache-control")).toBe("no-store");
    expect(api.headers.get("content-type")).toContain("application/json");
    expect(body).toContain('"notifier":"none"');
    expect(body).toContain('"status":"ok"');
    expect(body).toContain("Codex hooks setup unavailable");
    expect(body).toContain("simple no-space path");
    expect(parsed.setup).toEqual({
      claudeCode: '{"hooks":{"Stop":[]}}',
      codex: 'notify = ["crewlight", "ingest", "codex"]',
      codexHooks:
        "Codex hooks setup unavailable.\nInstall Crewlight into a simple no-space path.",
      cursor: "crewlight ingest cursor --event running --surface ide-extension",
      openCode: "export const CrewlightPlugin = async () => ({});",
      antigravityProbe:
        "printf '%s\\n' '{}' | crewlight ingest antigravity-probe --event manual.probe --surface desktop",
      verification: {
        claudeCode: "verify-claude",
        codex: "verify-codex",
        cursor: "verify-cursor",
        antigravityProbe: "verify-antigravity",
      },
    });
    expect(capabilities.status).toBe(200);
    expect(capabilities.headers.get("cache-control")).toBe("no-store");
    expect(capabilities.headers.get("content-type")).toContain(
      "application/json",
    );
    expect(parsedCapabilities).toEqual({ taskTitleMode: "off" });
  });

  it("reports prompt-preview capability only when explicitly enabled", async () => {
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new CrewlightService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          taskTitleMode: "prompt-preview",
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

    const response = await fetch(`${instance.url}/dashboard/capabilities`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      taskTitleMode: "prompt-preview",
    });
  });

  it("exposes only normalized session fields through the dashboard API", async () => {
    instance = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new CrewlightService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          taskTitleMode: "off",
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
        taskTitle: "Review dashboard output",
        title: "SessionStart",
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
        title: "Stop",
        message: "safe summary",
        timestamp: 5_000,
      }),
    });

    await fetch(`${instance.url}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "custom",
        surface: "cloud",
        sessionId: "stale-dashboard-session",
        workspaceName: "Stale workspace",
        status: "unknown",
        timestamp: 1_000,
      }),
    });

    const response = await fetch(`${instance.url}/dashboard/api`);
    const body = await response.text();
    const parsed = JSON.parse(body) as {
      sessions: Array<Record<string, unknown>>;
    };

    expect(body).toContain("dashboard-session");
    expect(body).toContain("safe summary");
    const completedSession = parsed.sessions.find(
      (session) => session.sessionId === "dashboard-session",
    );
    const staleSession = parsed.sessions.find(
      (session) => session.sessionId === "stale-dashboard-session",
    );

    expect(completedSession).toMatchObject({
      displayName: "Custom",
      displayWorkspace: "safe-project",
      taskTitle: "Review dashboard output",
      activityLabel: "Session completed",
      durationMs: 4_000,
      attention: "done",
      isStale: false,
    });
    expect(completedSession?.shortSessionKey).toBe(
      String(completedSession?.sessionKey).slice(-8),
    );
    expect(completedSession?.identityLine).toBe("safe-project");
    expect(completedSession?.lastEventAgeMs).toEqual(expect.any(Number));
    expect(completedSession).not.toHaveProperty("staleReason");
    expect(staleSession).toMatchObject({
      displayWorkspace: "Stale workspace",
      identityLine: "Stale workspace",
      isStale: true,
      staleReason: "No event for at least 2 minutes.",
    });
    expect(staleSession).not.toHaveProperty("taskTitle");
    expect(staleSession).toMatchObject({
      activityLabel: "Status unknown",
    });
    expect(body).not.toContain("dashboard-secret");
    expect(body).not.toContain("rawEvent");
    expect(body).not.toContain("toolInput");
    expect(body).not.toContain("transcript");
    expect(body).not.toContain("input-messages");
  });

  it("rejects dashboard binding outside loopback", async () => {
    await expect(
      startDaemon(
        { host: "0.0.0.0", port: 3768 },
        new CrewlightService({ notifier: new SilentNotifier() }),
        {
          dashboard: {
            notifier: "none",
            taskTitleMode: "off",
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
      new CrewlightService({ notifier: new SilentNotifier() }),
      {
        dashboard: {
          notifier: "none",
          taskTitleMode: "off",
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
      new CrewlightService({
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

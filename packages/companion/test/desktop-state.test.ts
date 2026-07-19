import { describe, expect, it } from "vitest";

import type { DoctorReport } from "@crewlight/cli";

import { deriveDesktopViewModel } from "../src/desktop-state.js";
import { DEFAULT_DESKTOP_PREFERENCES } from "../src/desktop-preferences.js";
import type { ManagedServiceState } from "../src/service-manager.js";
import type { SanitizedSession } from "../src/sanitize.js";

const doctorReport: DoctorReport = {
  ok: true,
  checks: [
    {
      id: "daemon",
      status: "ok",
      message: "Crewlight daemon endpoint is reachable.",
    },
  ],
};

const serviceState: ManagedServiceState = {
  phase: "stopped",
  host: "127.0.0.1",
  port: 3768,
  notifier: "none",
  managed: false,
  stdoutSummary: [],
  stderrSummary: [],
};

const setup = {
  antigravityProbe: "probe",
  claudeCode: "claude",
  codex: "codex",
  codexHooks: "hooks",
  cursor: "cursor",
  openCode: "opencode",
  verification: {
    antigravityProbe: "verify-probe",
    claudeCode: "verify-claude",
    codex: "verify-codex",
    cursor: "verify-cursor",
  },
};

function session(
  status: SanitizedSession["status"],
  overrides: Partial<SanitizedSession> = {},
): SanitizedSession {
  return {
    sessionKey: `demo:${status}`,
    source: "codex",
    surface: "cli",
    status,
    lastEventAt: 1_000,
    lastEventAgeMs: 1_000,
    durationMs: 1_000,
    isStale: false,
    displayName: "Codex",
    displayWorkspace: "Crewlight",
    attention: status === "waiting_permission" ? "action" : "passive",
    ...(status === "waiting_permission"
      ? { actionKind: "permission" as const }
      : {}),
    ...overrides,
  };
}

describe("desktop view-model derivation", () => {
  it("chooses start service as the home CTA while offline", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: true,
          expanded: false,
          visible: false,
        },
        doctorReport,
        preferences: DEFAULT_DESKTOP_PREFERENCES,
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState,
        snapshot: {
          kind: "offline",
          diagnostic: "offline",
        },
        version: "v0.5.0",
      },
      setup,
    );

    expect(view.home.primaryAction.action).toBe("start-service");
    expect(view.onboarding.active).toBe(true);
  });

  it("prefers running the demo before showing the companion", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: true,
          expanded: false,
          visible: false,
        },
        doctorReport,
        preferences: {
          ...DEFAULT_DESKTOP_PREFERENCES,
          onboardingCompleted: true,
        },
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState: {
          ...serviceState,
          managed: true,
          phase: "running",
        },
        snapshot: {
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: [session("running", { taskTitle: "Normal work" })],
          },
        },
        version: "v0.5.0",
      },
      setup,
    );

    expect(view.home.primaryAction.action).toBe("run-demo");
  });

  it("detects deterministic demo sessions and highlights the preferred integration", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: true,
          expanded: true,
          visible: true,
        },
        doctorReport,
        preferences: {
          ...DEFAULT_DESKTOP_PREFERENCES,
          onboardingCompleted: true,
          preferredIntegration: "cursor",
        },
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState: {
          ...serviceState,
          managed: true,
          phase: "running",
        },
        snapshot: {
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: [
              session("waiting_permission", {
                taskTitle: "[Demo] Updating README",
              }),
              session("running", {
                source: "cursor",
                displayName: "Cursor",
                surface: "ide-extension",
                taskTitle: "[Demo] Reviewing UI",
              }),
            ],
          },
        },
        version: "v0.5.0",
      },
      setup,
    );

    expect(view.demo.hasSyntheticSessions).toBe(true);
    expect(view.home.primaryAction.action).toBe("show-companion");
    expect(
      view.integrations.find((card) => card.id === "cursor")?.highlight,
    ).toBe(true);
  });
});

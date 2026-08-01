import { describe, expect, it } from "vitest";

import type { DoctorReport } from "@crewlight/cli";

import {
  deriveDesktopViewModel,
  formatDesktopDuration,
} from "../src/desktop-state.js";
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
    viewId: `view-${status}`,
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
        remoteHosts: [],
      },
      setup,
    );

    expect(view.home.primaryAction.action).toBe("start-service");
    expect(view.onboarding.active).toBe(true);
  });

  it("keeps the demo out of the primary Home action", () => {
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
        remoteHosts: [],
      },
      setup,
    );

    expect(view.home.primaryAction.action).toBe("show-companion");
    expect(view.onboarding.steps.map((step) => step.id)).not.toContain(
      "run-demo",
    );
  });

  it("recognizes an existing one-click integration without blocking onboarding", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: true,
          expanded: false,
          visible: false,
        },
        doctorReport,
        integrationInstallations: { codex: "configured" },
        preferences: DEFAULT_DESKTOP_PREFERENCES,
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
          data: { health: { status: "ok" }, sessions: [] },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(
      view.onboarding.steps.find((step) => step.id === "choose-integration")
        ?.complete,
    ).toBe(true);
    expect(view.onboarding.currentStepId).toBe("show-companion");
    expect(view.integrations.find((card) => card.id === "codex")).toMatchObject(
      { configureDisabled: true, configureLabel: "Configured" },
    );
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
                displayWorkspace: "Crewlight Demo",
                taskTitle: "[Demo] Updating README",
              }),
              session("running", {
                source: "cursor",
                displayName: "Cursor",
                displayWorkspace: "Crewlight Demo",
                surface: "ide-extension",
                taskTitle: "[Demo] Reviewing UI",
              }),
            ],
          },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(view.demo.hasSyntheticSessions).toBe(true);
    expect(view.demo.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          demoLabel: "Demo",
          title: "Updating README",
        }),
        expect.objectContaining({
          demoLabel: "Demo",
          title: "Reviewing UI",
        }),
      ]),
    );
    expect(view.home.counts).toEqual({
      attention: 0,
      failedOrStale: 0,
      running: 0,
      total: 0,
    });
    expect(view.home.previewSessions).toEqual([]);
    expect(view.home.primaryAction.action).toBe("show-companion");
    expect(
      view.integrations.find((card) => card.id === "codex")?.observed,
    ).toBe("Ready");
    expect(
      view.integrations.find((card) => card.id === "cursor")?.observed,
    ).toBe("Manual bridge available");
    expect(
      view.integrations.find((card) => card.id === "cursor")?.highlight,
    ).toBe(true);
  });

  it("propagates remoteAlias to session cards in desktop viewModel", () => {
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
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: [
              session("running", {
                taskTitle: "Remote worker",
                remoteAlias: "staging-server",
              }),
            ],
          },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(view.home.previewSessions[0]?.remoteAlias).toBe("staging-server");
  });

  it("derives Chinese navigation, status, onboarding, and session labels", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: false,
          expanded: false,
          visible: false,
        },
        doctorReport,
        preferences: {
          ...DEFAULT_DESKTOP_PREFERENCES,
          locale: "zh-CN",
        },
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState,
        snapshot: {
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: [session("waiting_permission")],
          },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(view.appearance.locale).toBe("zh-CN");
    expect(view.sections.find((section) => section.id === "home")?.label).toBe(
      "首页",
    );
    expect(view.header.serviceBadge.label).toBe("已检测到外部本地服务");
    expect(view.onboarding.steps[0]?.title).toBe("欢迎");
    expect(view.home.previewSessions[0]?.statusLabel).toBe("需要授权");
  });

  it("fully localizes deterministic demo cards in Chinese", () => {
    const demoCases = [
      {
        activityLabel: "[Demo] Running tests",
        source: "claude-code",
        status: "using_tool" as const,
        surface: "cli",
        taskTitle: "[Demo] Running Crewlight tests",
        title: "运行 Crewlight 测试",
        activity: "正在运行测试",
        surfaceLabel: "命令行",
      },
      {
        activityLabel: "[Demo] Permission to edit README",
        source: "codex",
        status: "waiting_permission" as const,
        surface: "cli",
        taskTitle: "[Demo] Updating README",
        title: "更新 README",
        activity: "请求编辑 README 的权限",
        surfaceLabel: "命令行",
      },
      {
        activityLabel: "[Demo] Companion review requested",
        source: "cursor",
        status: "waiting_input" as const,
        surface: "ide-extension",
        taskTitle: "[Demo] Reviewing companion UI",
        title: "检查悬浮伴侣界面",
        activity: "等待确认悬浮伴侣界面",
        surfaceLabel: "IDE 扩展",
      },
      {
        activityLabel: "[Demo] Adapter smoke completed",
        source: "opencode",
        status: "completed" as const,
        surface: "cli",
        taskTitle: "[Demo] Adapter smoke check",
        title: "适配器冒烟检查",
        activity: "适配器冒烟检查已完成",
        surfaceLabel: "命令行",
      },
      {
        activityLabel: "[Demo] Local setup failed",
        source: "custom",
        status: "failed" as const,
        surface: "manual",
        taskTitle: "[Demo] Local setup validation",
        title: "本地配置验证",
        activity: "本地配置验证失败",
        surfaceLabel: "手动",
      },
      {
        activityLabel: "[Demo] Background scan last reported",
        source: "generic-cli",
        status: "running" as const,
        surface: "cli",
        taskTitle: "[Demo] Background dependency scan",
        title: "后台依赖扫描",
        activity: "后台扫描最后一次上报",
        surfaceLabel: "命令行",
      },
    ];
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: false,
          expanded: false,
          visible: false,
        },
        doctorReport,
        preferences: {
          ...DEFAULT_DESKTOP_PREFERENCES,
          locale: "zh-CN",
        },
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState,
        snapshot: {
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: demoCases.map((demoCase, index) =>
              session(demoCase.status, {
                viewId: `demo-${index}`,
                sessionKey: `demo:${index}`,
                source: demoCase.source,
                surface: demoCase.surface,
                displayWorkspace: "Crewlight Demo",
                taskTitle: demoCase.taskTitle,
                activityLabel: demoCase.activityLabel,
              }),
            ),
          },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(view.home.counts.total).toBe(0);
    expect(view.demo.sessions).toHaveLength(demoCases.length);
    for (const demoCase of demoCases) {
      const card = view.demo.sessions.find(
        (candidate) => candidate.title === demoCase.title,
      );
      expect(card).toMatchObject({
        activity: demoCase.activity,
        demoLabel: "演示",
        surface: demoCase.surfaceLabel,
        workspace: "Crewlight 演示",
      });
    }
    expect(formatDesktopDuration(168_000, "zh-CN")).toBe("2 分 48 秒");
    expect(formatDesktopDuration(168_000, "en")).toBe("2m 48s");
  });

  it("does not expose the daemon's English stale reason in Chinese", () => {
    const view = deriveDesktopViewModel(
      {
        companion: {
          alwaysOnTop: false,
          expanded: false,
          visible: false,
        },
        doctorReport,
        preferences: {
          ...DEFAULT_DESKTOP_PREFERENCES,
          locale: "zh-CN",
        },
        runtimeSettings: {
          host: "127.0.0.1",
          port: 3768,
          notifier: "none",
        },
        serviceState,
        snapshot: {
          kind: "online",
          data: {
            health: { status: "ok" },
            sessions: [
              session("running", {
                isStale: true,
                lastEventAgeMs: 5 * 60 * 1000,
                staleReason: "No event for at least 5 minutes.",
              }),
            ],
          },
        },
        version: "v0.5.0",
        remoteHosts: [],
      },
      setup,
    );

    expect(view.home.previewSessions[0]?.diagnosticHint).toBe(
      "最近一次事件在 5 分钟前，任务可能已停滞",
    );
  });
});

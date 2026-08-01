import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle,
} from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DaemonClient,
  createAntigravityProbeCommand,
  createMultiAgentDemoEvents,
  createSetupSnippets,
  detectPnpmVersion,
  formatCodexHooksSetup,
  runDoctor,
  type DoctorReport,
  type DoctorRuntime,
  type SetupSnippets,
} from "@crewlight/cli";
import { formatDaemonUrl, isLoopbackHost } from "@crewlight/daemon";
import {
  isNotifierKind,
  probeOsNotifier,
  resolveWindowsToasterPath,
  type NotifierKind,
} from "@crewlight/notifier";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

import type { DesktopAction } from "./desktop-bridge.js";
import {
  createCodexJsonlMonitor,
  resolveCodexSessionsDirectory,
  type CodexJsonlMonitor,
} from "./codex-jsonl-monitor.js";
import {
  fetchDesktopSnapshot,
  type DesktopDashboardResult,
} from "./desktop-client.js";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  createDesktopPreferencesStore,
  sanitizeDesktopPreferences,
  type DesktopPreferences,
} from "./desktop-preferences.js";
import {
  buildDiagnosticSummary,
  deriveDesktopViewModel,
  type DesktopCompanionState,
  type DesktopNotice,
  type DesktopRuntimeSettings,
  type DesktopSetupSnippets,
  type DesktopViewModelInput,
} from "./desktop-state.js";
import { createCompanionEndpoint, isAllowedDashboardUrl } from "./endpoint.js";
import {
  inspectClaudeCodeIntegration,
  inspectCodexIntegration,
  installIntegration,
  type InstallableIntegration,
  type IntegrationInspectionResult,
  type IntegrationInstallerOptions,
} from "./integration-installer.js";
import {
  canStopManagedService,
  getCompanionDismissAction,
  isExternalServiceConnection,
} from "./lifecycle.js";
import {
  RemoteConnectionAttempts,
  changedOrRemovedRemoteAliases,
  reconcileRemoteHostState,
} from "./remote-host-state.js";
import {
  createDaemonServiceManager,
  type ManagedServiceState,
} from "./service-manager.js";
import {
  parseCrewlightRemoteHosts,
  type SshConfigHost,
} from "./ssh-config-parser.js";
import {
  createSshTunnel,
  type SshTunnel,
  type TunnelState,
} from "./ssh-tunnel.js";
import { createLocalHttpProxy, type LocalHttpProxy } from "./ssh-proxy.js";
import type { DesktopRemoteHost } from "./desktop-state.js";
import {
  deriveCompanionViewModel,
  type CompanionViewModel,
  type CompanionWindowState,
} from "./state.js";
import { resolveCrewlightCliContext } from "./runtime.js";

const MAIN_WINDOW_SIZE = { width: 1040, height: 720 };
const COMPANION_COMPACT_SIZE = { width: 372, height: 126 };
const COMPANION_EXPANDED_SIZE = { width: 432, height: 536 };
const POLL_INTERVAL_MS = 2_000;
const DOCTOR_REFRESH_MS = 15_000;
const COPY_TEXT_LIMIT = 32_000;

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const desktopPagePath = join(outputDirectory, "desktop.html");
const companionPagePath = join(outputDirectory, "index.html");
const desktopPageUrl = pathToFileURL(desktopPagePath).toString();
const companionPageUrl = pathToFileURL(companionPagePath).toString();
const cliContext = resolveCrewlightCliContext({
  isPackaged: app.isPackaged,
  nodeExecutable: process.env.npm_node_execpath,
});
const windowsToasterPath = resolveWindowsToasterPath(cliContext.setupRuntime);

let mainWindow: BrowserWindow | undefined;
let companionWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | undefined;
let companionExpanded = false;
let pollTimer: NodeJS.Timeout | undefined;
let polling = false;
let preferences: DesktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES };
let integrationInspections: Partial<
  Record<InstallableIntegration, IntegrationInspectionResult>
> = {};
let desiredRuntimeSettings: DesktopRuntimeSettings = {
  host: DEFAULT_DAEMON_HOST,
  port: DEFAULT_DAEMON_PORT,
  notifier: "none",
};
let connectionSettings = {
  host: DEFAULT_DAEMON_HOST,
  port: DEFAULT_DAEMON_PORT,
};
let latestSnapshot: DesktopDashboardResult = {
  kind: "offline",
  diagnostic: "Checking Crewlight.",
};
let latestNotice: DesktopNotice | undefined;
let latestDoctorReport: DoctorReport = {
  ok: false,
  checks: [
    {
      id: "desktop-doctor",
      status: "warning",
      message: "Doctor checks have not run yet.",
    },
  ],
};
let lastDoctorRefreshAt = 0;
let doctorRefreshPromise: Promise<void> | undefined;
let preferencesStore:
  | ReturnType<typeof createDesktopPreferencesStore>
  | undefined;
let codexJsonlMonitor: CodexJsonlMonitor | undefined;

let parsedSshConfigHosts: SshConfigHost[] = [];
let remoteHostsState: DesktopRemoteHost[] = [];
const activeTunnels = new Map<string, SshTunnel>();
const activeProxies = new Map<string, LocalHttpProxy>();
const remoteConnectionAttempts = new RemoteConnectionAttempts();
const remoteScanAttempts = new RemoteConnectionAttempts();

function disposeRemoteConnection(alias: string): void {
  remoteConnectionAttempts.invalidate(alias);
  const tunnel = activeTunnels.get(alias);
  activeTunnels.delete(alias);
  const proxy = activeProxies.get(alias);
  activeProxies.delete(alias);
  try {
    tunnel?.disconnect();
  } catch {}
  try {
    proxy?.close();
  } catch {}
}

async function scanRemoteHosts() {
  const scanAttempt = remoteScanAttempts.begin("ssh-config");
  const nextParsedHosts = await parseCrewlightRemoteHosts();
  if (quitting || !remoteScanAttempts.finish("ssh-config", scanAttempt)) {
    return;
  }
  for (const alias of changedOrRemovedRemoteAliases(
    parsedSshConfigHosts,
    nextParsedHosts,
  )) {
    disposeRemoteConnection(alias);
  }
  parsedSshConfigHosts = nextParsedHosts;
  remoteHostsState = reconcileRemoteHostState(
    parsedSshConfigHosts,
    remoteHostsState,
    preferences.remoteHosts,
    new Set(activeTunnels.keys()),
  );

  for (const host of remoteHostsState) {
    if (host.autoConnect && host.tunnelState === "disconnected") {
      void handleDesktopAction({ type: "remote:connect", alias: host.alias });
    }
  }

  refreshViewModels();
}

const setupBase = createSetupSnippets(
  undefined,
  cliContext.setupRuntime,
  "cli",
);
const setupSnippets = buildDesktopSetupSnippets(setupBase);
const serviceManager = createDaemonServiceManager(
  cliContext,
  desiredRuntimeSettings,
);
let serviceState: ManagedServiceState = serviceManager.snapshot();
let latestCompanionViewModel: CompanionViewModel = deriveCompanionViewModel(
  {
    kind: "offline",
    diagnostic: "Checking Crewlight.",
  },
  Date.now(),
  {
    expanded: false,
    alwaysOnTop: true,
  },
  { locale: preferences.locale },
);

function integrationInstallerOptions(): IntegrationInstallerOptions {
  const codexHome = process.env.CODEX_HOME?.trim();
  return {
    homeDirectory: app.getPath("home"),
    ...(codexHome ? { codexHome } : {}),
    platform: process.platform,
    snippets: setupBase,
  };
}

function integrationInstallationStatuses(): DesktopViewModelInput["integrationInstallations"] {
  return {
    "claude-code":
      integrationInspections["claude-code"]?.status ?? "not-configured",
    codex: integrationInspections.codex?.status ?? "not-configured",
  };
}

async function refreshIntegrationInspections(): Promise<void> {
  const options = integrationInstallerOptions();
  const [claudeCodeResult, codexResult] = await Promise.allSettled([
    inspectClaudeCodeIntegration(options),
    inspectCodexIntegration(options),
  ]);
  const failedInspection = (
    integration: InstallableIntegration,
  ): IntegrationInspectionResult => ({
    integration,
    message: "Crewlight could not inspect this integration path safely.",
    status: "error",
    targets: [],
  });
  const claudeCode =
    claudeCodeResult.status === "fulfilled"
      ? claudeCodeResult.value
      : failedInspection("claude-code");
  const codex =
    codexResult.status === "fulfilled"
      ? codexResult.value
      : failedInspection("codex");
  integrationInspections = { "claude-code": claudeCode, codex };
  if (
    claudeCodeResult.status === "rejected" ||
    codexResult.status === "rejected"
  ) {
    setNotice(
      "error",
      localizeMain(
        "Codex one-click setup is unavailable. Crewlight can still show live status.",
        "Codex 一键配置暂不可用，但 Crewlight 仍可显示实时状态。",
      ),
    );
  }
  refreshViewModels();
}

function buildDesktopSetupSnippets(base: SetupSnippets): DesktopSetupSnippets {
  return {
    antigravityProbe: createAntigravityProbeCommand(
      undefined,
      cliContext.setupRuntime,
    ),
    claudeCode: base.claudeCode,
    codex: base.codex,
    codexHooks: formatCodexHooksSetup(base.codexHooks),
    cursor: base.cursor,
    openCode: base.openCode,
    verification: {
      antigravityProbe: createAntigravityProbeCommand(
        undefined,
        cliContext.setupRuntime,
      ),
      claudeCode: base.verification.claudeCode,
      codex: base.verification.codex,
      cursor: base.verification.cursor,
    },
  };
}

function currentBaseUrl(
  host = connectionSettings.host,
  port = connectionSettings.port,
): string {
  return formatDaemonUrl(host, port);
}

function currentEndpoint() {
  return createCompanionEndpoint(
    connectionSettings.host,
    connectionSettings.port,
  );
}

function isSnapshotOnline(snapshot: DesktopDashboardResult): boolean {
  return snapshot.kind === "online";
}

function currentCompanionWindowState(): CompanionWindowState {
  return {
    expanded: companionExpanded,
    alwaysOnTop:
      companionWindow && !companionWindow.isDestroyed()
        ? companionWindow.isAlwaysOnTop()
        : true,
  };
}

function currentDesktopCompanionState(): DesktopCompanionState {
  return {
    alwaysOnTop: currentCompanionWindowState().alwaysOnTop,
    expanded: companionExpanded,
    ...(latestCompanionViewModel.mostImportant
      ? {
          topSession: `${latestCompanionViewModel.mostImportant.source} · ${latestCompanionViewModel.mostImportant.title}`,
        }
      : {}),
    updatedAt: latestCompanionViewModel.updatedAt,
    visible:
      companionWindow?.isVisible() ?? preferences.companionVisibilityPreference,
  };
}

function trustedSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  window: BrowserWindow | undefined,
  _pageUrl: string,
): boolean {
  // With sandbox: true, contextIsolation: true, and webSecurity: true, the
  // Electron sandbox already enforces that IPC can only come from our preload
  // script inside the designated BrowserWindow.  Checking webContents identity
  // is therefore sufficient.  Checking senderFrame identity or URL has proven
  // brittle across Windows Electron builds: JS wrapper object references for
  // the same underlying frame are not always the same object, and file:// URL
  // drive-letter casing on Windows is inconsistent, both of which produced
  // false rejections that silently broke all button interactions.
  return !!(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents
  );
}

function setNotice(tone: DesktopNotice["tone"], message: string): void {
  latestNotice = { tone, message };
  publishDesktopState();
}

function clearNotice(): void {
  latestNotice = undefined;
}

async function savePreferences(): Promise<void> {
  if (!preferencesStore) {
    return;
  }
  await preferencesStore.save(preferences);
}

async function updatePreferences(
  partial: Partial<DesktopPreferences>,
): Promise<void> {
  preferences = sanitizeDesktopPreferences({
    ...preferences,
    ...partial,
  });
  await savePreferences();
  refreshViewModels();
}

function dashboardClient(
  host = connectionSettings.host,
  port = connectionSettings.port,
) {
  return new DaemonClient({
    baseUrl: currentBaseUrl(host, port),
  });
}

function createLocalCodexJsonlMonitor(): CodexJsonlMonitor | undefined {
  try {
    const codexHome = process.env.CODEX_HOME?.trim();
    return createCodexJsonlMonitor({
      sessionsDirectory: resolveCodexSessionsDirectory({
        homeDirectory: app.getPath("home"),
        ...(codexHome ? { codexHome } : {}),
      }),
      publish: async (event) => {
        if (!isLoopbackHost(connectionSettings.host)) {
          return;
        }
        await dashboardClient().emit(event);
      },
    });
  } catch {
    setNotice(
      "error",
      localizeMain(
        "Codex live status is unavailable. Check the Crewlight folder and try again.",
        "Codex 实时状态暂不可用，请检查 Crewlight 路径后重试。",
      ),
    );
    return undefined;
  }
}

function createDoctorRuntime(): DoctorRuntime {
  return {
    standalone: () => app.isPackaged,
    nodeVersion: () => process.versions.node,
    pnpmVersion: () => {
      if (app.isPackaged) {
        return undefined;
      }
      return detectPnpmVersion();
    },
    cliBuilt: async () => {
      if (app.isPackaged) {
        return existsSync(cliContext.cliPath);
      }
      return (
        existsSync(cliContext.cliPath) &&
        /[\\/]dist[\\/]/u.test(cliContext.cliPath)
      );
    },
    daemonReachable: async () => {
      try {
        await dashboardClient().sessions();
        return true;
      } catch {
        return false;
      }
    },
    dashboardCapabilities: async () => {
      try {
        return await dashboardClient().dashboardCapabilities();
      } catch {
        return undefined;
      }
    },
    pathResolvedCrewlight: () => cliContext.cliPath,
    entryPath: () => cliContext.cliPath,
    daemonEnv: () => ({
      host: connectionSettings.host,
      port: connectionSettings.port,
    }),
    osNotifier: () => probeOsNotifier(undefined, undefined, windowsToasterPath),
    claudeSnippet: () => setupBase.claudeCode,
    codexSnippet: () => setupBase.codex,
    codexHooksSetup: () => setupBase.codexHooks,
  };
}

async function refreshDoctorReport(force = false): Promise<void> {
  if (doctorRefreshPromise) {
    return await doctorRefreshPromise;
  }
  if (!force && Date.now() - lastDoctorRefreshAt < DOCTOR_REFRESH_MS) {
    return;
  }

  doctorRefreshPromise = runDoctor(
    desiredRuntimeSettings.notifier,
    undefined,
    createDoctorRuntime(),
  )
    .then((report) => {
      latestDoctorReport = report;
      lastDoctorRefreshAt = Date.now();
    })
    .catch(() => {
      latestDoctorReport = {
        ok: false,
        checks: [
          {
            id: "desktop-doctor",
            status: "error",
            message: "Doctor checks could not be generated.",
            action: "Restart Crewlight Desktop, then rerun the local service.",
          },
        ],
      };
      lastDoctorRefreshAt = Date.now();
    })
    .finally(() => {
      doctorRefreshPromise = undefined;
      publishDesktopState();
    });

  await doctorRefreshPromise;
}

function publishCompanionState(): void {
  const window = companionWindow;
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoading()
  ) {
    return;
  }
  window.webContents.send("companion:view-model", latestCompanionViewModel);
}

function publishDesktopState(): void {
  const window = mainWindow;
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoading()
  ) {
    return;
  }

  const viewModel = deriveDesktopViewModel(
    {
      companion: currentDesktopCompanionState(),
      doctorReport: latestDoctorReport,
      ...(latestNotice ? { notice: latestNotice } : {}),
      preferences,
      integrationInstallations: integrationInstallationStatuses(),
      runtimeSettings: desiredRuntimeSettings,
      serviceState,
      snapshot: latestSnapshot,
      version: `v${app.getVersion()}`,
      remoteHosts: remoteHostsState,
    },
    setupSnippets,
  );
  window.webContents.send("desktop:state", viewModel);
}

function refreshViewModels(): void {
  latestCompanionViewModel = deriveCompanionViewModel(
    latestSnapshot.kind === "online"
      ? { kind: "online", data: { sessions: latestSnapshot.data.sessions } }
      : latestSnapshot,
    Date.now(),
    currentCompanionWindowState(),
    { locale: preferences.locale },
  );
  publishCompanionState();
  publishDesktopState();
}

async function pollDashboardOnce(): Promise<void> {
  if (polling) {
    return;
  }
  polling = true;
  try {
    const wasOnline = isSnapshotOnline(latestSnapshot);
    latestSnapshot = await fetchDesktopSnapshot(currentEndpoint());
    refreshViewModels();
    if (!wasOnline && isSnapshotOnline(latestSnapshot)) {
      void codexJsonlMonitor?.replayLatest();
    }
    void refreshDoctorReport(false);
  } finally {
    polling = false;
  }
}

function startPolling(): void {
  void pollDashboardOnce();
  pollTimer = setInterval(() => {
    void pollDashboardOnce();
  }, POLL_INTERVAL_MS);
}

async function openDashboard(): Promise<void> {
  const endpoint = currentEndpoint();
  if (!isAllowedDashboardUrl(endpoint.dashboardUrl, endpoint)) {
    setNotice(
      "error",
      localizeMain("Couldn't open the detailed view.", "无法打开详细视图。"),
    );
    return;
  }

  try {
    await shell.openExternal(endpoint.dashboardUrl);
  } catch {
    setNotice(
      "error",
      localizeMain("Couldn't open the detailed view.", "无法打开详细视图。"),
    );
  }
}

function companionBounds(size: { width: number; height: number }): Rectangle {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    width: size.width,
    height: size.height,
    x: display.x + display.width - size.width - 24,
    y: display.y + display.height - size.height - 24,
  };
}

function resizeCompanion(expanded: boolean): void {
  const window = companionWindow;
  if (!window || window.isDestroyed() || companionExpanded === expanded) {
    return;
  }
  companionExpanded = expanded;
  const size = expanded ? COMPANION_EXPANDED_SIZE : COMPANION_COMPACT_SIZE;
  const currentBounds = window.getBounds();
  window.setBounds({
    width: size.width,
    height: size.height,
    x: currentBounds.x + currentBounds.width - size.width,
    y: currentBounds.y + currentBounds.height - size.height,
  });
  refreshViewModels();
}

async function showCompanion(persistPreference = true): Promise<void> {
  if (!companionWindow || companionWindow.isDestroyed()) {
    return;
  }
  companionWindow.show();
  companionWindow.focus();
  if (persistPreference) {
    await updatePreferences({ companionVisibilityPreference: true });
  }
  refreshViewModels();
}

async function hideCompanion(persistPreference = true): Promise<void> {
  if (!companionWindow || companionWindow.isDestroyed()) {
    return;
  }
  companionWindow.hide();
  if (persistPreference) {
    await updatePreferences({ companionVisibilityPreference: false });
  }
  refreshViewModels();
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

async function setCompanionAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  if (!companionWindow || companionWindow.isDestroyed()) {
    return;
  }
  companionWindow.setAlwaysOnTop(alwaysOnTop);
  refreshViewModels();
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible()
        ? localizeMain("Hide Crewlight Desktop", "隐藏 Crewlight 桌面版")
        : localizeMain("Show Crewlight Desktop", "显示 Crewlight 桌面版"),
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          showMainWindow();
        }
      },
    },
    {
      label: companionWindow?.isVisible()
        ? localizeMain("Hide companion", "隐藏悬浮伴侣")
        : localizeMain("Show companion", "显示悬浮伴侣"),
      click: () => {
        if (companionWindow?.isVisible()) {
          void hideCompanion();
        } else {
          void showCompanion();
        }
      },
    },
    { type: "separator" },
    {
      label: localizeMain("Start Crewlight", "启动 Crewlight"),
      enabled: !isExternalServiceConnection(
        serviceState,
        isSnapshotOnline(latestSnapshot),
      ),
      click: () => {
        void startLocalService();
      },
    },
    {
      label: localizeMain("Stop Crewlight", "停止 Crewlight"),
      enabled: canStopManagedService(serviceState),
      click: () => {
        void stopLocalService();
      },
    },
    { type: "separator" },
    {
      label: localizeMain("Open detailed view", "打开详细视图"),
      click: () => {
        void openDashboard();
      },
    },
    { type: "separator" },
    {
      label: localizeMain("Quit", "退出"),
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray(): void {
  if (!tray || tray.isDestroyed()) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

async function createTray(): Promise<void> {
  const iconPath = join(outputDirectory, "crewlight-icon.png");
  let icon: Electron.NativeImage;
  if (process.platform === "win32" && existsSync(iconPath)) {
    icon = nativeImage
      .createFromPath(iconPath)
      .resize({ width: 16, height: 16 });
  } else {
    // Fallback: inline SVG for non-Windows platforms
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
      '<circle cx="16" cy="16" r="11" fill="none" stroke="#d7e3f4" stroke-width="4"/>',
      '<circle cx="16" cy="16" r="4" fill="#65d6ad"/>',
      "</svg>",
    ].join("");
    icon = nativeImage
      .createFromDataURL(
        `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      )
      .resize({ width: 16, height: 16 });
  }
  void iconPath; // suppress unused warning

  tray = new Tray(icon);
  tray.setToolTip("Crewlight Desktop");
  tray.on("click", () => {
    showMainWindow();
  });
  refreshTray();
}

function lockDownWebContents(window: BrowserWindow): void {
  window.setMenuBarVisibility(false);
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => {
      callback(false);
    },
  );
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

function createDesktopWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: MAIN_WINDOW_SIZE.width,
    height: MAIN_WINDOW_SIZE.height,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#091117",
    show: false,
    title: "Crewlight Desktop",
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(outputDirectory, "desktop-preload.cjs"),
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  lockDownWebContents(window);
  window.webContents.on("did-finish-load", publishDesktopState);
  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("show", refreshTray);
  window.on("hide", refreshTray);
  window.on("close", (event) => {
    if (!quitting) {
      const trayAvailable = !!tray && !tray.isDestroyed();
      if (getCompanionDismissAction(trayAvailable) === "hide") {
        event.preventDefault();
        window.hide();
        refreshTray();
      } else {
        event.preventDefault();
        quitting = true;
        app.quit();
      }
    }
  });
  void window.loadFile(desktopPagePath);
  return window;
}

function createCompanionWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...companionBounds(COMPANION_COMPACT_SIZE),
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    transparent: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(outputDirectory, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  lockDownWebContents(window);
  window.webContents.on("did-finish-load", publishCompanionState);
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      void hideCompanion();
    }
  });
  window.on("show", () => {
    refreshTray();
  });
  window.on("hide", () => {
    refreshTray();
  });
  void window.loadFile(companionPagePath);
  return window;
}

async function startLocalService(): Promise<boolean> {
  clearNotice();
  if (
    isExternalServiceConnection(serviceState, isSnapshotOnline(latestSnapshot))
  ) {
    setNotice(
      "info",
      localizeMain("Crewlight is already running.", "Crewlight 已在运行。"),
    );
    return false;
  }
  connectionSettings = {
    host: desiredRuntimeSettings.host,
    port: desiredRuntimeSettings.port,
  };
  const started = await serviceManager.start(desiredRuntimeSettings);
  if (started) {
    setNotice(
      "success",
      localizeMain("Starting Crewlight…", "正在启动 Crewlight…"),
    );
    void codexJsonlMonitor?.replayLatest();
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      localizeMain(
        "Crewlight couldn't start. Open Troubleshooting for help.",
        "Crewlight 启动失败，请打开“故障排查”查看。",
      ),
    );
  }
  return started;
}

async function stopLocalService(): Promise<boolean> {
  clearNotice();
  if (!canStopManagedService(serviceState)) {
    setNotice(
      "info",
      latestSnapshot.kind === "online"
        ? localizeMain(
            "Crewlight was started elsewhere and is still running.",
            "Crewlight 由其他位置启动，仍在运行。",
          )
        : localizeMain("Crewlight is already stopped.", "Crewlight 已停止。"),
    );
    return false;
  }
  const stopped = await serviceManager.stop();
  if (stopped) {
    connectionSettings = {
      host: desiredRuntimeSettings.host,
      port: desiredRuntimeSettings.port,
    };
    latestSnapshot = {
      kind: "offline",
      diagnostic: "Crewlight is stopped.",
    };
    setNotice("info", localizeMain("Crewlight stopped.", "Crewlight 已停止。"));
    refreshViewModels();
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      localizeMain(
        "Crewlight couldn't stop. Try again.",
        "Crewlight 停止失败，请重试。",
      ),
    );
  }
  return stopped;
}

async function restartLocalService(): Promise<boolean> {
  clearNotice();
  if (
    isExternalServiceConnection(serviceState, isSnapshotOnline(latestSnapshot))
  ) {
    setNotice(
      "info",
      localizeMain(
        "Crewlight was started elsewhere and can't be restarted here.",
        "Crewlight 由其他位置启动，无法在这里重启。",
      ),
    );
    return false;
  }
  connectionSettings = {
    host: desiredRuntimeSettings.host,
    port: desiredRuntimeSettings.port,
  };
  const restarted = await serviceManager.restart(desiredRuntimeSettings);
  if (restarted) {
    setNotice(
      "success",
      localizeMain("Restarting Crewlight…", "正在重启 Crewlight…"),
    );
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      localizeMain(
        "Crewlight couldn't restart. Try again.",
        "Crewlight 重启失败，请重试。",
      ),
    );
  }
  return restarted;
}

async function runDemo(): Promise<boolean> {
  clearNotice();
  const client = dashboardClient();
  try {
    await client.sessions();
  } catch {
    setNotice(
      "error",
      localizeMain(
        "Start Crewlight, then run the demo again.",
        "请先启动 Crewlight，再运行演示。",
      ),
    );
    return false;
  }

  const events = createMultiAgentDemoEvents();
  try {
    for (const event of events) {
      await client.emit(event);
    }
  } catch {
    setNotice(
      "error",
      localizeMain("Demo failed. Try again.", "演示失败，请重试。"),
    );
    return false;
  }

  setNotice(
    "success",
    localizeMain(
      `Loaded ${events.length} sample tasks.`,
      `已载入 ${events.length} 个示例任务。`,
    ),
  );
  void pollDashboardOnce();
  return true;
}

function localizeMain(english: string, chinese: string): string {
  return preferences.locale === "zh-CN" ? chinese : english;
}

async function configureIntegration(
  integration: InstallableIntegration,
): Promise<boolean> {
  clearNotice();
  let result;
  try {
    result = await installIntegration(
      integration,
      integrationInstallerOptions(),
    );
  } catch {
    setNotice(
      "error",
      localizeMain(
        "Crewlight couldn't check this agent's setup. Nothing changed.",
        "Crewlight 无法检查这个代理的配置，未做任何改动。",
      ),
    );
    return false;
  }

  await refreshIntegrationInspections();
  if (!result.ok) {
    const partiallyInstalled = result.files.some(
      (file) => file.status === "installed",
    );
    const backupPaths = result.files.flatMap((file) =>
      file.backupPath ? [file.backupPath] : [],
    );
    const backupDetails =
      backupPaths.length > 0
        ? localizeMain(
            ` Backup: ${backupPaths.join(", ")}`,
            ` 备份位置：${backupPaths.join("，")}`,
          )
        : "";
    const message = partiallyInstalled
      ? `${localizeMain(
          "Setup was only partly completed. Crewlight stopped before replacing anything else; use the backup to restore if needed.",
          "接入只完成了一部分。Crewlight 已停止后续改动；如需恢复，请使用备份。",
        )}${backupDetails}`
      : result.status === "unavailable"
        ? localizeMain(
            "This Crewlight location cannot be used safely by Codex. Move the portable folder to a path without spaces or special characters, then try again.",
            "Codex 无法安全使用当前 Crewlight 路径。请把便携版文件夹移到不含空格或特殊字符的路径后重试。",
          )
        : result.status === "refused"
          ? localizeMain(
              "Existing settings need review, so Crewlight left them unchanged. Use Copy setup text if you need to combine them.",
              "发现需要人工确认的已有配置，因此 Crewlight 没有改动它。需要合并时可使用“复制配置内容”。",
            )
          : localizeMain(
              "Crewlight couldn't finish setup. Existing files were kept or backed up.",
              "Crewlight 未能完成接入；原文件已保留或备份。",
            );
    setNotice("error", message);
    return false;
  }

  await updatePreferences({ preferredIntegration: integration });
  setNotice(
    "success",
    integration === "codex"
      ? localizeMain(
          "Codex is connected. Live status works now; restart Codex once to add permission reminders.",
          "Codex 已接入，实时状态现在就能显示；重启一次 Codex 后还可获得授权提醒。",
        )
      : localizeMain(
          "Claude Code is connected. Restart it once to begin showing live status.",
          "Claude Code 已接入，请重启一次以开始显示实时状态。",
        ),
  );
  return true;
}

async function applyServiceSettingUpdate(
  partial: Partial<DesktopRuntimeSettings>,
): Promise<boolean> {
  desiredRuntimeSettings = {
    ...desiredRuntimeSettings,
    ...partial,
  };

  if (serviceState.phase === "running" || latestSnapshot.kind === "online") {
    setNotice(
      "info",
      localizeMain(
        "Setting updated. Restart Crewlight to apply it.",
        "设置已更新，重启 Crewlight 后生效。",
      ),
    );
  } else {
    connectionSettings = {
      host: desiredRuntimeSettings.host,
      port: desiredRuntimeSettings.port,
    };
    void pollDashboardOnce();
  }
  publishDesktopState();
  return true;
}

async function handleDesktopAction(action: DesktopAction): Promise<boolean> {
  if (action.type === "service:start") {
    return await startLocalService();
  }
  if (action.type === "service:stop") {
    return await stopLocalService();
  }
  if (action.type === "service:restart") {
    return await restartLocalService();
  }
  if (action.type === "demo:run") {
    return await runDemo();
  }
  if (action.type === "integration:configure") {
    if (
      action.integration !== "claude-code" &&
      action.integration !== "codex"
    ) {
      return false;
    }
    return await configureIntegration(action.integration);
  }
  if (action.type === "companion:show") {
    await showCompanion();
    return true;
  }
  if (action.type === "companion:hide") {
    await hideCompanion();
    return true;
  }
  if (action.type === "companion:bring-to-front") {
    await showCompanion(false);
    companionWindow?.focus();
    return true;
  }
  if (action.type === "companion:toggle-always-on-top") {
    await setCompanionAlwaysOnTop(!currentCompanionWindowState().alwaysOnTop);
    return true;
  }
  if (action.type === "companion:set-expanded") {
    resizeCompanion(action.expanded);
    return true;
  }
  if (action.type === "shell:open-dashboard") {
    await openDashboard();
    return true;
  }
  if (action.type === "shell:open-repository") {
    await shell.openExternal("https://github.com/QianQIUlp/Crewlight");
    return true;
  }
  if (action.type === "copy:diagnostic-summary") {
    clipboard.writeText(
      buildDiagnosticSummary(
        serviceState,
        desiredRuntimeSettings,
        latestDoctorReport,
      ),
    );
    setNotice(
      "success",
      localizeMain("Diagnostics copied.", "诊断信息已复制。"),
    );
    return true;
  }
  if (action.type === "copy:text") {
    if (action.text.length > COPY_TEXT_LIMIT) {
      setNotice(
        "error",
        localizeMain("This text is too large to copy.", "内容过长，无法复制。"),
      );
      return false;
    }
    clipboard.writeText(action.text);
    setNotice(
      "success",
      localizeMain("Setup text copied.", "配置内容已复制。"),
    );
    return true;
  }
  if (action.type === "preferences:set-theme") {
    await updatePreferences({ theme: action.theme });
    return true;
  }
  if (action.type === "preferences:set-accent") {
    await updatePreferences({ accent: action.accent });
    return true;
  }
  if (action.type === "preferences:set-density") {
    await updatePreferences({ density: action.density });
    return true;
  }
  if (action.type === "preferences:set-last-section") {
    await updatePreferences({ lastSection: action.section });
    return true;
  }
  if (action.type === "preferences:set-locale") {
    await updatePreferences({ locale: action.locale });
    return true;
  }
  if (action.type === "preferences:set-companion-visibility") {
    await updatePreferences({
      companionVisibilityPreference: action.visible,
    });
    if (action.visible) {
      await showCompanion(false);
    } else {
      await hideCompanion(false);
    }
    return true;
  }
  if (action.type === "preferences:set-service-auto-start") {
    await updatePreferences({ serviceAutoStart: action.enabled });
    return true;
  }
  if (action.type === "preferences:select-integration") {
    await updatePreferences({
      preferredIntegration: action.integration,
    });
    return true;
  }
  if (action.type === "preferences:reset") {
    preferences = { ...DEFAULT_DESKTOP_PREFERENCES };
    desiredRuntimeSettings = {
      host: DEFAULT_DAEMON_HOST,
      port: DEFAULT_DAEMON_PORT,
      notifier: "none",
    };
    connectionSettings = {
      host: DEFAULT_DAEMON_HOST,
      port: DEFAULT_DAEMON_PORT,
    };
    await savePreferences();
    await hideCompanion(false);
    setNotice("info", localizeMain("Preferences reset.", "偏好设置已重置。"));
    publishDesktopState();
    return true;
  }
  if (action.type === "onboarding:start-over") {
    await updatePreferences({
      onboardingCompleted: false,
      lastSection: "home",
    });
    return true;
  }
  if (action.type === "onboarding:complete") {
    await updatePreferences({ onboardingCompleted: true, lastSection: "home" });
    return true;
  }
  if (action.type === "onboarding:skip-step") {
    return true;
  }
  if (action.type === "remote:rescan") {
    await scanRemoteHosts();
    return true;
  }
  if (action.type === "remote:connect") {
    const host = remoteHostsState.find((h) => h.alias === action.alias);
    const parsed = parsedSshConfigHosts.find((h) => h.alias === action.alias);
    if (!host || !parsed) {
      return false;
    }

    disposeRemoteConnection(action.alias);
    const connectionAttempt = remoteConnectionAttempts.begin(action.alias);

    host.tunnelState = "connecting";
    host.tunnelMessage = undefined;
    publishDesktopState();

    let proxy: LocalHttpProxy | undefined;
    try {
      proxy = await createLocalHttpProxy({
        alias: action.alias,
        remotePort: 3768,
        targetHost: connectionSettings.host === "::1" ? "::1" : "127.0.0.1",
        targetPort: connectionSettings.port,
      });
      if (
        !remoteConnectionAttempts.isCurrent(action.alias, connectionAttempt)
      ) {
        proxy.close();
        return false;
      }
      activeProxies.set(action.alias, proxy);

      let tunnel: SshTunnel | undefined;
      tunnel = createSshTunnel({
        host: parsed,
        remotePort: 3768,
        localPort: proxy.port,
        onStateChange: (state) => {
          if (tunnel && activeTunnels.get(action.alias) !== tunnel) {
            return;
          }
          host.tunnelState = state.kind;
          if (state.kind === "error") {
            host.tunnelMessage = localizeMain(
              "Couldn't connect. Check the host and try again.",
              "连接失败，请检查主机后重试。",
            );
          } else if (state.kind === "disconnected") {
            host.tunnelMessage = state.reason
              ? localizeMain(
                  "Connection closed. Try again when you're ready.",
                  "连接已断开，可以随时重试。",
                )
              : undefined;
          } else {
            host.tunnelMessage = undefined;
          }

          if (state.kind === "connected") {
            void tunnel?.checkRemoteCli().then((hasCli) => {
              if (activeTunnels.get(action.alias) !== tunnel) {
                return;
              }
              host.hasCli = hasCli;
              publishDesktopState();
            });
          }
          publishDesktopState();
        },
      });

      activeTunnels.set(action.alias, tunnel);
      remoteConnectionAttempts.finish(action.alias, connectionAttempt);
      return true;
    } catch {
      const isCurrentAttempt = remoteConnectionAttempts.finish(
        action.alias,
        connectionAttempt,
      );
      if (activeProxies.get(action.alias) === proxy) {
        activeProxies.delete(action.alias);
      }
      try {
        proxy?.close();
      } catch {}
      if (!isCurrentAttempt) {
        return false;
      }
      host.tunnelState = "error";
      host.tunnelMessage = localizeMain(
        "Couldn't connect. Check the host and try again.",
        "连接失败，请检查主机后重试。",
      );
      publishDesktopState();
      return false;
    }
  }
  if (action.type === "remote:disconnect") {
    disposeRemoteConnection(action.alias);
    const host = remoteHostsState.find((h) => h.alias === action.alias);
    if (host) {
      host.tunnelState = "disconnected";
      host.tunnelMessage = undefined;
      host.hasCli = undefined;
    }
    publishDesktopState();
    return true;
  }
  if (action.type === "remote:set-auto-connect") {
    const nextRemoteHosts = [...(preferences.remoteHosts || [])];
    const index = nextRemoteHosts.findIndex((h) => h.alias === action.alias);
    if (index >= 0) {
      const existing = nextRemoteHosts[index]!;
      nextRemoteHosts[index] = {
        ...existing,
        autoConnect: action.enabled,
      };
    } else {
      nextRemoteHosts.push({
        alias: action.alias,
        autoConnect: action.enabled,
      });
    }
    await updatePreferences({ remoteHosts: nextRemoteHosts });

    const host = remoteHostsState.find((h) => h.alias === action.alias);
    if (host) {
      host.autoConnect = action.enabled;
    }
    publishDesktopState();
    return true;
  }
  if (action.type === "remote:dismiss-install-prompt") {
    const nextRemoteHosts = [...(preferences.remoteHosts || [])];
    const index = nextRemoteHosts.findIndex((h) => h.alias === action.alias);
    if (index >= 0) {
      const existing = nextRemoteHosts[index]!;
      nextRemoteHosts[index] = {
        ...existing,
        installPromptDismissed: true,
      };
    } else {
      nextRemoteHosts.push({
        alias: action.alias,
        autoConnect: false,
        installPromptDismissed: true,
      });
    }
    await updatePreferences({ remoteHosts: nextRemoteHosts });

    const host = remoteHostsState.find((h) => h.alias === action.alias);
    if (host) {
      host.installPromptDismissed = true;
    }
    publishDesktopState();
    return true;
  }

  if (action.type === "service:set-host") {
    if (action.host !== "127.0.0.1" && action.host !== "::1") {
      setNotice(
        "error",
        localizeMain("Only this computer is supported.", "仅支持本机地址。"),
      );
      return false;
    }
    return await applyServiceSettingUpdate({ host: action.host });
  }
  if (action.type === "service:set-port") {
    if (
      !Number.isInteger(action.port) ||
      action.port < 1 ||
      action.port > 65_535
    ) {
      setNotice(
        "error",
        localizeMain(
          "Enter a connection port from 1 to 65535.",
          "请输入 1 到 65535 之间的连接端口。",
        ),
      );
      return false;
    }
    return await applyServiceSettingUpdate({ port: action.port });
  }
  if (action.type === "service:set-notifier") {
    if (!isNotifierKind(action.notifier)) {
      return false;
    }
    return await applyServiceSettingUpdate({ notifier: action.notifier });
  }
  return false;
}

function registerIpc(): void {
  ipcMain.handle("companion:get-view-model", (event) => {
    if (!trustedSender(event, companionWindow, companionPageUrl)) {
      throw new Error("Untrusted companion IPC sender.");
    }
    return latestCompanionViewModel;
  });
  ipcMain.on("companion:set-expanded", (event, value: unknown) => {
    if (
      trustedSender(event, companionWindow, companionPageUrl) &&
      typeof value === "boolean"
    ) {
      resizeCompanion(value);
    }
  });
  ipcMain.on("companion:hide", (event) => {
    if (trustedSender(event, companionWindow, companionPageUrl)) {
      void hideCompanion();
    }
  });
  ipcMain.on("companion:toggle-always-on-top", (event) => {
    if (trustedSender(event, companionWindow, companionPageUrl)) {
      void setCompanionAlwaysOnTop(!currentCompanionWindowState().alwaysOnTop);
    }
  });
  ipcMain.handle("companion:copy-daemon-command", (event) => {
    if (!trustedSender(event, companionWindow, companionPageUrl)) {
      throw new Error("Untrusted companion IPC sender.");
    }
    clipboard.writeText(
      `${cliContext.displayCommand} daemon --dashboard --host ${desiredRuntimeSettings.host} --port ${desiredRuntimeSettings.port} --notifier ${desiredRuntimeSettings.notifier}`,
    );
    setNotice(
      "success",
      localizeMain("Start command copied.", "启动命令已复制。"),
    );
    return true;
  });
  ipcMain.on("companion:open-main-window", (event) => {
    if (trustedSender(event, companionWindow, companionPageUrl)) {
      showMainWindow();
    }
  });
  ipcMain.on("companion:quit", (event) => {
    if (trustedSender(event, companionWindow, companionPageUrl)) {
      quitting = true;
      app.quit();
    }
  });

  ipcMain.handle("desktop:get-state", (event) => {
    if (!trustedSender(event, mainWindow, desktopPageUrl)) {
      throw new Error("Untrusted desktop IPC sender.");
    }
    return deriveDesktopViewModel(
      {
        companion: currentDesktopCompanionState(),
        doctorReport: latestDoctorReport,
        ...(latestNotice ? { notice: latestNotice } : {}),
        preferences,
        integrationInstallations: integrationInstallationStatuses(),
        runtimeSettings: desiredRuntimeSettings,
        serviceState,
        snapshot: latestSnapshot,
        version: `v${app.getVersion()}`,
        remoteHosts: remoteHostsState,
      },
      setupSnippets,
    );
  });
  ipcMain.handle("desktop:perform", async (event, action: unknown) => {
    if (!trustedSender(event, mainWindow, desktopPageUrl)) {
      throw new Error("Untrusted desktop IPC sender.");
    }
    if (typeof action !== "object" || action === null || !("type" in action)) {
      return false;
    }
    return await handleDesktopAction(action as DesktopAction);
  });
}

serviceManager.subscribe((nextState) => {
  const phaseChanged =
    serviceState.phase !== nextState.phase ||
    serviceState.managed !== nextState.managed;
  serviceState = nextState;
  refreshViewModels();
  refreshTray();
  if (phaseChanged) {
    void refreshDoctorReport(true);
  }
});

async function disposeApplicationResources(): Promise<void> {
  remoteConnectionAttempts.invalidateAll();
  remoteScanAttempts.invalidateAll();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  await codexJsonlMonitor?.stop();
  codexJsonlMonitor = undefined;
  for (const alias of new Set([
    ...activeTunnels.keys(),
    ...activeProxies.keys(),
  ])) {
    disposeRemoteConnection(alias);
  }
  await serviceManager.dispose();
}

const ownsSingleInstance = app.requestSingleInstanceLock();
if (!ownsSingleInstance) {
  quitting = true;
  shutdownComplete = true;
  app.quit();
} else {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.qianqiulp.crewlight.desktop");
  }

  app.on("second-instance", () => {
    showMainWindow();
    if (preferences.companionVisibilityPreference) {
      void showCompanion(false);
    }
  });

  app.on("before-quit", (event) => {
    quitting = true;
    if (shutdownComplete) {
      return;
    }
    event.preventDefault();
    if (!shutdownPromise) {
      shutdownPromise = disposeApplicationResources().catch(() => {});
      void shutdownPromise.then(() => {
        shutdownComplete = true;
        app.quit();
      });
    }
  });

  app.on("window-all-closed", () => {
    const trayAvailable = !!tray && !tray.isDestroyed();
    if (getCompanionDismissAction(trayAvailable) === "quit" && !quitting) {
      quitting = true;
      app.quit();
    }
  });

  app.on("activate", () => {
    showMainWindow();
    if (preferences.companionVisibilityPreference) {
      void showCompanion(false);
    }
  });

  await app.whenReady();
  preferencesStore = createDesktopPreferencesStore(
    join(app.getPath("userData"), "desktop-preferences.json"),
  );
  preferences = await preferencesStore.load();
  desiredRuntimeSettings = {
    host: DEFAULT_DAEMON_HOST,
    port: DEFAULT_DAEMON_PORT,
    notifier: "none",
  };
  connectionSettings = {
    host: desiredRuntimeSettings.host,
    port: desiredRuntimeSettings.port,
  };
  await refreshIntegrationInspections();
  Menu.setApplicationMenu(null);
  registerIpc();
  mainWindow = createDesktopWindow();
  companionWindow = createCompanionWindow();
  try {
    await createTray();
  } catch {
    tray = undefined;
  }
  startPolling();
  codexJsonlMonitor = createLocalCodexJsonlMonitor();
  codexJsonlMonitor?.start();
  await refreshDoctorReport(true);
  void scanRemoteHosts();

  if (preferences.companionVisibilityPreference) {
    await showCompanion(false);
  }

  if (preferences.serviceAutoStart) {
    await pollDashboardOnce();
    if (!isSnapshotOnline(latestSnapshot)) {
      await startLocalService();
    }
  }

  refreshViewModels();
}

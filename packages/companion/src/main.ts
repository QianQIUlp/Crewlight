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
import { formatDaemonUrl } from "@crewlight/daemon";
import {
  isNotifierKind,
  probeOsNotifier,
  resolveWindowsToasterPath,
  type NotifierKind,
} from "@crewlight/notifier";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

import type { DesktopAction } from "./desktop-bridge.js";
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
  diagnostic: "Checking the local Crewlight daemon.",
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
    diagnostic: "Checking the local Crewlight daemon.",
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
  const [claudeCode, codex] = await Promise.all([
    inspectClaudeCodeIntegration(options),
    inspectCodexIntegration(options),
  ]);
  integrationInspections = { "claude-code": claudeCode, codex };
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
    latestSnapshot = await fetchDesktopSnapshot(currentEndpoint());
    refreshViewModels();
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
    setNotice("error", "Crewlight Desktop refused an unsafe dashboard URL.");
    return;
  }

  try {
    await shell.openExternal(endpoint.dashboardUrl);
  } catch {
    setNotice(
      "error",
      "Crewlight Desktop could not open the browser dashboard.",
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
        ? "Hide Crewlight Desktop"
        : "Show Crewlight Desktop",
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          showMainWindow();
        }
      },
    },
    {
      label: companionWindow?.isVisible() ? "Hide Companion" : "Show Companion",
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
      label: "Start Local Service",
      enabled: !isExternalServiceConnection(
        serviceState,
        isSnapshotOnline(latestSnapshot),
      ),
      click: () => {
        void startLocalService();
      },
    },
    {
      label: "Stop Local Service",
      enabled: canStopManagedService(serviceState),
      click: () => {
        void stopLocalService();
      },
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => {
        void openDashboard();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
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
      "An externally started daemon is already connected and was left running.",
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
      "Starting the local Crewlight service with the dashboard API enabled.",
    );
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      "Crewlight Desktop could not start the local service. Check the Doctor section.",
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
        ? "The connected daemon was started outside Crewlight Desktop and was left running. Stop it from the terminal that owns it."
        : "No Crewlight Desktop-managed local service is running.",
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
      diagnostic:
        "Run crewlight daemon --dashboard. Crewlight Desktop will retry.",
    };
    setNotice("info", "Stopped the managed local Crewlight service.");
    refreshViewModels();
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      "Crewlight Desktop could not stop the managed local service cleanly.",
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
      "The connected daemon was started outside Crewlight Desktop and cannot be restarted here.",
    );
    return false;
  }
  connectionSettings = {
    host: desiredRuntimeSettings.host,
    port: desiredRuntimeSettings.port,
  };
  const restarted = await serviceManager.restart(desiredRuntimeSettings);
  if (restarted) {
    setNotice("success", "Restarting the local Crewlight service.");
    void refreshDoctorReport(true);
  } else {
    setNotice(
      "error",
      "Crewlight Desktop could not restart the local service.",
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
      "The local daemon is unavailable. Start the service, then rerun the demo.",
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
      "The demo could not publish every synthetic event. Check the local daemon and rerun it.",
    );
    return false;
  }

  setNotice(
    "success",
    `Loaded ${events.length} deterministic synthetic sessions into the local daemon.`,
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
        "Crewlight could not check the standard user configuration path. No files were changed.",
        "Crewlight 无法检查标准用户配置路径，未修改任何文件。",
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
          "Only part of the configuration was installed. Crewlight stopped without overwriting the remaining file; use the created backup if you need to restore it.",
          "只有部分配置写入成功。Crewlight 已停止操作，没有覆盖剩余文件；如需恢复，请使用已创建的备份。",
        )}${backupDetails}`
      : result.status === "unavailable"
        ? localizeMain(
            "This Crewlight location cannot be used safely by Codex. Move the portable folder to a path without spaces or special characters, then try again.",
            "Codex 无法安全使用当前 Crewlight 路径。请把便携版文件夹移到不含空格或特殊字符的路径后重试。",
          )
        : result.status === "refused"
          ? localizeMain(
              "Existing settings need review, so Crewlight left them unchanged. Use Copy manual setup if you need to combine them.",
              "发现需要人工确认的已有配置，因此 Crewlight 没有改动它。需要合并时可使用“复制手动配置”。",
            )
          : localizeMain(
              "Crewlight could not finish the configuration. Existing files were left intact or backed up.",
              "Crewlight 未能完成配置；已有文件保持不变，或已创建备份。",
            );
    setNotice("error", message);
    return false;
  }

  await updatePreferences({ preferredIntegration: integration });
  setNotice(
    "success",
    integration === "codex"
      ? localizeMain(
          "Codex is configured. Restart Codex; if it asks for trust, approve only when the displayed command points to Crewlight.",
          "Codex 接入已配置。请重启 Codex；如果它弹出安全确认，请仅在显示的命令指向 Crewlight 时允许。",
        )
      : localizeMain(
          "Claude Code is configured. Restart Claude Code to load the connection. Existing settings were backed up when needed.",
          "Claude Code 接入已配置。请重启 Claude Code 以加载接入；需要时已自动备份原配置。",
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
      "Updated the session setting. Restart the local service to apply the new host, port, or notifier.",
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
    setNotice("success", "Copied the current diagnostic summary.");
    return true;
  }
  if (action.type === "copy:text") {
    if (action.text.length > COPY_TEXT_LIMIT) {
      setNotice(
        "error",
        "Crewlight Desktop refused to copy an oversized text payload.",
      );
      return false;
    }
    clipboard.writeText(action.text);
    setNotice("success", "Copied the requested setup text.");
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
    setNotice(
      "info",
      "Reset desktop UI preferences to their first-run defaults.",
    );
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
            host.tunnelMessage = state.message;
          } else if (state.kind === "disconnected") {
            host.tunnelMessage = state.reason;
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
    } catch (error) {
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
      host.tunnelMessage =
        error instanceof Error
          ? `Remote connection setup failed: ${error.message}`
          : "Remote connection setup failed.";
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
      setNotice("error", "Crewlight Desktop accepts loopback hosts only.");
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
      setNotice("error", "Enter a valid local port from 1 through 65535.");
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
    setNotice("success", "Copied the local daemon command.");
    return true;
  });
  ipcMain.on("companion:open-dashboard", (event) => {
    if (trustedSender(event, companionWindow, companionPageUrl)) {
      void openDashboard();
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

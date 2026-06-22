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
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchCompanionSnapshot } from "./client.js";
import { isAllowedDashboardUrl, resolveCompanionEndpoint } from "./endpoint.js";
import { getCompanionDismissAction } from "./lifecycle.js";
import { createCompanionPoller } from "./polling.js";
import {
  deriveCompanionViewModel,
  type CompanionViewModel,
  type CompanionWindowState,
} from "./state.js";

const POLL_INTERVAL_MS = 2_000;
const WINDOW_MARGIN = 16;
const COMPACT_SIZE = { width: 372, height: 126 };
const EXPANDED_SIZE = { width: 432, height: 536 };
const DAEMON_COMMAND = "crewlight daemon --dashboard --notifier none";
const outputDirectory = dirname(fileURLToPath(import.meta.url));
const companionPagePath = join(outputDirectory, "index.html");
const companionPageUrl = pathToFileURL(companionPagePath).toString();
const endpoint = resolveCompanionEndpoint();

let companionWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let quitting = false;
let expanded = false;
let latestViewModel: CompanionViewModel = deriveCompanionViewModel(
  {
    kind: "offline",
    diagnostic: "Checking the local Crewlight daemon.",
  },
  Date.now(),
);
const poller = createCompanionPoller({
  fetchSnapshot: () => fetchCompanionSnapshot(endpoint),
  publish: (result) => {
    latestViewModel = deriveCompanionViewModel(
      result,
      Date.now(),
      getWindowState(),
    );
    sendViewModel();
  },
  warn: () => {
    console.warn("Crewlight companion polling failed; retrying.");
  },
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampBounds(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const maximumX = Math.max(
    workArea.x,
    workArea.x + workArea.width - bounds.width,
  );
  const maximumY = Math.max(
    workArea.y,
    workArea.y + workArea.height - bounds.height,
  );
  return {
    width: bounds.width,
    height: bounds.height,
    x: clamp(bounds.x, workArea.x, maximumX),
    y: clamp(bounds.y, workArea.y, maximumY),
  };
}

function defaultWindowBounds(): Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    width: COMPACT_SIZE.width,
    height: COMPACT_SIZE.height,
    x: workArea.x + workArea.width - COMPACT_SIZE.width - WINDOW_MARGIN,
    y: workArea.y + workArea.height - COMPACT_SIZE.height - WINDOW_MARGIN,
  };
}

function hasUsableTray(): boolean {
  return Boolean(tray && !tray.isDestroyed());
}

function getWindowState(): CompanionWindowState {
  const window = companionWindow;
  return {
    expanded,
    alwaysOnTop:
      window && !window.isDestroyed() ? window.isAlwaysOnTop() : true,
  };
}

function syncWindowState(): void {
  latestViewModel = {
    ...latestViewModel,
    ...getWindowState(),
  };
  sendViewModel();
}

function resizeCompanion(nextExpanded: boolean): void {
  const window = companionWindow;
  if (!window || window.isDestroyed() || expanded === nextExpanded) {
    return;
  }

  const current = window.getBounds();
  const size = nextExpanded ? EXPANDED_SIZE : COMPACT_SIZE;
  const proposed = {
    width: size.width,
    height: size.height,
    x: current.x + current.width - size.width,
    y: current.y + current.height - size.height,
  };
  const workArea = screen.getDisplayMatching(current).workArea;
  window.setBounds(clampBounds(proposed, workArea), true);
  expanded = nextExpanded;
  syncWindowState();
}

function showCompanion(): void {
  const window = companionWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  window.show();
  window.moveTop();
  rebuildTrayMenu();
}

function hideCompanion(): void {
  const window = companionWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  if (getCompanionDismissAction(hasUsableTray()) === "hide") {
    window.hide();
    rebuildTrayMenu();
  } else {
    quitting = true;
    app.quit();
  }
}

function setAlwaysOnTop(alwaysOnTop: boolean): boolean {
  const window = companionWindow;
  if (!window || window.isDestroyed()) {
    return false;
  }
  window.setAlwaysOnTop(alwaysOnTop);
  const enabled = window.isAlwaysOnTop();
  syncWindowState();
  rebuildTrayMenu();
  return enabled;
}

function buildTrayMenu(): Menu {
  const windowVisible = companionWindow?.isVisible() ?? false;
  const alwaysOnTop = companionWindow?.isAlwaysOnTop() ?? true;
  return Menu.buildFromTemplate([
    {
      label: windowVisible ? "Hide Companion" : "Show Companion",
      click: () => {
        if (companionWindow?.isVisible()) {
          hideCompanion();
        } else {
          showCompanion();
        }
      },
    },
    {
      label: "Always on Top",
      type: "checkbox",
      checked: alwaysOnTop,
      click: (item) => {
        setAlwaysOnTop(item.checked);
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

function rebuildTrayMenu(): void {
  const currentTray = tray;
  if (!currentTray || currentTray.isDestroyed()) {
    return;
  }
  currentTray.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    '<circle cx="16" cy="16" r="11" fill="none" stroke="#d7e3f4" stroke-width="4"/>',
    '<circle cx="16" cy="16" r="4" fill="#65d6ad"/>',
    "</svg>",
  ].join("");
  const icon = nativeImage
    .createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    )
    .resize({ width: 16, height: 16 });

  if (icon.isEmpty()) {
    throw new Error("Tray icon could not be created.");
  }
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  let candidate: Tray | undefined;
  try {
    candidate = new Tray(icon);
    candidate.setToolTip("Crewlight Companion");
    candidate.on("click", () => {
      if (companionWindow?.isVisible()) {
        hideCompanion();
      } else {
        showCompanion();
      }
    });
    candidate.setContextMenu(buildTrayMenu());
    companionWindow?.setSkipTaskbar(true);
    tray = candidate;
  } catch (error) {
    candidate?.destroy();
    tray = undefined;
    companionWindow?.setSkipTaskbar(false);
    throw error;
  }
}

async function openDashboard(): Promise<void> {
  const dashboardUrl = endpoint.dashboardUrl;
  if (!isAllowedDashboardUrl(dashboardUrl, endpoint)) {
    console.warn("Crewlight companion refused an unsafe dashboard URL.");
    return;
  }

  try {
    await shell.openExternal(dashboardUrl);
  } catch {
    console.warn("Crewlight companion could not open the dashboard.");
  }
}

function sendViewModel(): void {
  const window = companionWindow;
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoading()
  ) {
    return;
  }
  try {
    window.webContents.send("companion:view-model", latestViewModel);
  } catch {
    console.warn("Crewlight companion could not update its window.");
  }
}

function startPolling(): void {
  void poller.pollOnce();
  pollTimer = setInterval(() => {
    void poller.pollOnce();
  }, POLL_INTERVAL_MS);
}

function isTrustedIpcSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const window = companionWindow;
  const senderFrame = event.senderFrame;
  return Boolean(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    senderFrame &&
    senderFrame === window.webContents.mainFrame &&
    senderFrame.url === companionPageUrl,
  );
}

function registerIpc(): void {
  ipcMain.handle("companion:get-view-model", (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted companion IPC sender.");
    }
    return latestViewModel;
  });
  ipcMain.on("companion:set-expanded", (event, value: unknown) => {
    if (isTrustedIpcSender(event) && typeof value === "boolean") {
      resizeCompanion(value);
    }
  });
  ipcMain.on("companion:hide", (event) => {
    if (isTrustedIpcSender(event)) {
      hideCompanion();
    }
  });
  ipcMain.on("companion:toggle-always-on-top", (event) => {
    if (isTrustedIpcSender(event)) {
      setAlwaysOnTop(!(companionWindow?.isAlwaysOnTop() ?? true));
    }
  });
  ipcMain.handle("companion:copy-daemon-command", (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted companion IPC sender.");
    }
    try {
      clipboard.writeText(DAEMON_COMMAND);
      return true;
    } catch {
      console.warn("Crewlight companion could not copy the daemon command.");
      return false;
    }
  });
  ipcMain.on("companion:open-dashboard", (event) => {
    if (isTrustedIpcSender(event)) {
      void openDashboard();
    }
  });
  ipcMain.on("companion:quit", (event) => {
    if (isTrustedIpcSender(event)) {
      quitting = true;
      app.quit();
    }
  });
}

function createCompanionWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...defaultWindowBounds(),
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

  window.setMenuBarVisibility(false);
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
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
  window.webContents.on("did-finish-load", sendViewModel);
  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("close", (event) => {
    if (!quitting && getCompanionDismissAction(hasUsableTray()) === "hide") {
      event.preventDefault();
      window.hide();
      rebuildTrayMenu();
    } else if (!quitting) {
      quitting = true;
    }
  });
  window.on("closed", () => {
    companionWindow = undefined;
  });
  void window.loadFile(companionPagePath).catch(() => {
    console.warn("Crewlight companion could not load its local window.");
    quitting = true;
    app.quit();
  });
  return window;
}

for (const issue of endpoint.issues) {
  console.warn(`Crewlight companion: ${issue}`);
}

app.on("before-quit", () => {
  quitting = true;
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});

app.on("window-all-closed", () => {
  if (!hasUsableTray()) {
    app.quit();
  }
});

app.on("activate", () => {
  if (!companionWindow) {
    companionWindow = createCompanionWindow();
  } else {
    showCompanion();
  }
});

await app.whenReady();
Menu.setApplicationMenu(null);
registerIpc();
companionWindow = createCompanionWindow();
try {
  createTray();
} catch (error) {
  console.warn(
    `Crewlight companion tray unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}
startPolling();

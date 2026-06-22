import type { CompanionBridge } from "./bridge.js";
import type { CompanionViewModel } from "./state.js";

const { contextBridge, ipcRenderer } =
  require("electron") as typeof import("electron");

const bridge = {
  getViewModel: () =>
    ipcRenderer.invoke(
      "companion:get-view-model",
    ) as Promise<CompanionViewModel>,
  onViewModel: (listener: (viewModel: CompanionViewModel) => void) => {
    ipcRenderer.on(
      "companion:view-model",
      (_event: Electron.IpcRendererEvent, viewModel: CompanionViewModel) => {
        listener(viewModel);
      },
    );
  },
  setExpanded: (expanded: boolean) => {
    ipcRenderer.send("companion:set-expanded", expanded);
  },
  hide: () => {
    ipcRenderer.send("companion:hide");
  },
  toggleAlwaysOnTop: () => {
    ipcRenderer.send("companion:toggle-always-on-top");
  },
  copyDaemonCommand: () =>
    ipcRenderer.invoke("companion:copy-daemon-command") as Promise<boolean>,
  openDashboard: () => {
    ipcRenderer.send("companion:open-dashboard");
  },
  quit: () => {
    ipcRenderer.send("companion:quit");
  },
} satisfies CompanionBridge;

contextBridge.exposeInMainWorld("crewlight", bridge);

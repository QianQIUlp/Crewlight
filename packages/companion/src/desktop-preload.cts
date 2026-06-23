import type {
  CrewlightDesktopBridge,
  DesktopAction,
} from "./desktop-bridge.js";
import type { DesktopViewModel } from "./desktop-state.js";

const { contextBridge, ipcRenderer } =
  require("electron") as typeof import("electron");

const bridge = {
  getState: () =>
    ipcRenderer.invoke("desktop:get-state") as Promise<DesktopViewModel>,
  onState: (listener: (state: DesktopViewModel) => void) => {
    ipcRenderer.on(
      "desktop:state",
      (_event: Electron.IpcRendererEvent, state: DesktopViewModel) => {
        listener(state);
      },
    );
  },
  perform: (action: DesktopAction) =>
    ipcRenderer.invoke("desktop:perform", action) as Promise<boolean>,
} satisfies CrewlightDesktopBridge;

contextBridge.exposeInMainWorld("crewlightDesktop", bridge);

import type {
  DesktopAccent,
  DesktopDensity,
  DesktopSection,
  DesktopTheme,
  PreferredIntegration,
} from "./desktop-preferences.js";
import type { DesktopViewModel } from "./desktop-state.js";

export type DesktopAction =
  | { type: "companion:bring-to-front" }
  | { type: "companion:hide" }
  | { type: "companion:set-expanded"; expanded: boolean }
  | { type: "companion:show" }
  | { type: "companion:toggle-always-on-top" }
  | { type: "copy:diagnostic-summary" }
  | { type: "copy:text"; text: string }
  | { type: "demo:run" }
  | { type: "onboarding:complete" }
  | { type: "onboarding:skip-step" }
  | { type: "onboarding:start-over" }
  | {
      type: "preferences:select-integration";
      integration: PreferredIntegration;
    }
  | { type: "preferences:set-accent"; accent: DesktopAccent }
  | { type: "preferences:set-companion-visibility"; visible: boolean }
  | { type: "preferences:set-density"; density: DesktopDensity }
  | { type: "preferences:set-last-section"; section: DesktopSection }
  | { type: "preferences:set-service-auto-start"; enabled: boolean }
  | { type: "preferences:set-theme"; theme: DesktopTheme }
  | { type: "preferences:reset" }
  | { type: "service:restart" }
  | { type: "service:set-host"; host: string }
  | { type: "service:set-notifier"; notifier: "console" | "none" | "os" }
  | { type: "service:set-port"; port: number }
  | { type: "service:start" }
  | { type: "service:stop" }
  | { type: "shell:open-dashboard" }
  | { type: "shell:open-repository" }
  | { type: "remote:connect"; alias: string }
  | { type: "remote:disconnect"; alias: string }
  | { type: "remote:rescan" }
  | { type: "remote:set-auto-connect"; alias: string; enabled: boolean }
  | { type: "remote:dismiss-install-prompt"; alias: string };

export interface CrewlightDesktopBridge {
  getState(): Promise<DesktopViewModel>;
  onState(listener: (state: DesktopViewModel) => void): void;
  perform(action: DesktopAction): Promise<boolean>;
}

declare global {
  interface Window {
    crewlightDesktop: CrewlightDesktopBridge;
  }
}

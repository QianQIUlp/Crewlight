import type { CompanionViewModel } from "./state.js";

export interface CompanionBridge {
  getViewModel(): Promise<CompanionViewModel>;
  onViewModel(listener: (viewModel: CompanionViewModel) => void): void;
  setExpanded(expanded: boolean): void;
  hide(): void;
  toggleAlwaysOnTop(): void;
  openDashboard(): void;
  quit(): void;
}

declare global {
  interface Window {
    agentPulse: CompanionBridge;
  }
}

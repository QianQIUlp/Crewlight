export type CompanionDismissAction = "hide" | "quit";

export function getCompanionDismissAction(
  trayAvailable: boolean,
): CompanionDismissAction {
  return trayAvailable ? "hide" : "quit";
}

export function canStopManagedService(state: {
  managed: boolean;
  phase: string;
}): boolean {
  return (
    state.managed &&
    (state.phase === "starting" ||
      state.phase === "running" ||
      state.phase === "error")
  );
}

export function isExternalServiceConnection(
  state: { managed: boolean },
  daemonOnline: boolean,
): boolean {
  return daemonOnline && !state.managed;
}

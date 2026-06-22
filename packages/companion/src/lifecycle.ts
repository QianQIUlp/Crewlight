export type CompanionDismissAction = "hide" | "quit";

export function getCompanionDismissAction(
  trayAvailable: boolean,
): CompanionDismissAction {
  return trayAvailable ? "hide" : "quit";
}

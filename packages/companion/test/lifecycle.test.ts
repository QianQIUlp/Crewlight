import { describe, expect, it } from "vitest";

import {
  canStopManagedService,
  getCompanionDismissAction,
  isExternalServiceConnection,
} from "../src/lifecycle.js";

describe("companion lifecycle policy", () => {
  it("hides when a usable tray can restore the window", () => {
    expect(getCompanionDismissAction(true)).toBe("hide");
  });

  it("quits when no tray can restore a hidden window", () => {
    expect(getCompanionDismissAction(false)).toBe("quit");
  });

  it("does not claim ownership of an externally started daemon", () => {
    expect(canStopManagedService({ managed: false, phase: "running" })).toBe(
      false,
    );
    expect(canStopManagedService({ managed: true, phase: "running" })).toBe(
      true,
    );
    expect(canStopManagedService({ managed: true, phase: "error" })).toBe(true);
    expect(canStopManagedService({ managed: true, phase: "stopping" })).toBe(
      false,
    );
    expect(isExternalServiceConnection({ managed: false }, true)).toBe(true);
    expect(isExternalServiceConnection({ managed: true }, true)).toBe(false);
    expect(isExternalServiceConnection({ managed: false }, false)).toBe(false);
  });
});

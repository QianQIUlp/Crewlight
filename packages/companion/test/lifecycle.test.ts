import { describe, expect, it } from "vitest";

import { getCompanionDismissAction } from "../src/lifecycle.js";

describe("companion lifecycle policy", () => {
  it("hides when a usable tray can restore the window", () => {
    expect(getCompanionDismissAction(true)).toBe("hide");
  });

  it("quits when no tray can restore a hidden window", () => {
    expect(getCompanionDismissAction(false)).toBe("quit");
  });
});

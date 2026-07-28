import { describe, expect, it } from "vitest";

import { DisclosureState } from "../src/interaction.js";

describe("companion disclosure state", () => {
  it("toggles and preserves an expanded session across rerenders", () => {
    const state = new DisclosureState();
    expect(state.toggle("session-1")).toBe(true);
    expect(state.isExpanded("session-1")).toBe(true);
    state.retain(["session-1", "session-2"]);
    expect(state.isExpanded("session-1")).toBe(true);
    expect(state.toggle("session-1")).toBe(false);
  });

  it("forgets disclosures for sessions that no longer exist", () => {
    const state = new DisclosureState();
    state.toggle("removed");
    state.retain(["current"]);
    expect(state.isExpanded("removed")).toBe(false);
  });
});

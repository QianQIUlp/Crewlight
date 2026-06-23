import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESKTOP_PREFERENCES,
  sanitizeDesktopPreferences,
  serializeDesktopPreferences,
} from "../src/desktop-preferences.js";

describe("desktop preferences", () => {
  it("falls back to bounded defaults for malformed or unsupported values", () => {
    expect(
      sanitizeDesktopPreferences({
        theme: "terminal",
        accent: "secret-purple",
        density: "dense",
        lastSection: "overview",
        companionVisibilityPreference: "yes",
        serviceAutoStart: "sometimes",
        preferredIntegration: "hidden-bridge",
        onboardingCompleted: "done",
      }),
    ).toEqual(DEFAULT_DESKTOP_PREFERENCES);
  });

  it("serializes only allowlisted local UI keys", () => {
    const serialized = serializeDesktopPreferences(
      sanitizeDesktopPreferences({
        ...DEFAULT_DESKTOP_PREFERENCES,
        theme: "dark",
        rawEvent: { prompt: "must-not-persist" },
        transcript: "must-not-persist",
        toolInput: "must-not-persist",
      }),
    );

    expect(serialized).toContain('"theme": "dark"');
    expect(serialized).not.toContain("must-not-persist");
    expect(serialized).not.toContain("rawEvent");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("toolInput");
  });
});

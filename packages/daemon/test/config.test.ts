import { describe, expect, it } from "vitest";

import { resolveDaemonConfig } from "../src/index.js";

describe("daemon config", () => {
  it("defaults to the console notifier", () => {
    expect(resolveDaemonConfig({}, {})).toMatchObject({
      notifier: "console",
    });
  });

  it("uses the environment notifier when no override exists", () => {
    expect(
      resolveDaemonConfig({}, { AGENTPULSE_NOTIFIER: "os" }),
    ).toMatchObject({ notifier: "os" });
  });

  it("gives explicit overrides precedence over the environment", () => {
    expect(
      resolveDaemonConfig({ notifier: "none" }, { AGENTPULSE_NOTIFIER: "os" }),
    ).toMatchObject({ notifier: "none" });
  });

  it("rejects invalid notifier kinds", () => {
    expect(() =>
      resolveDaemonConfig({}, { AGENTPULSE_NOTIFIER: "desktop" }),
    ).toThrow("Invalid notifier kind");
  });
});

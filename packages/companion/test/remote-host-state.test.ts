import { describe, expect, it } from "vitest";

import {
  RemoteConnectionAttempts,
  changedOrRemovedRemoteAliases,
  reconcileRemoteHostState,
} from "../src/remote-host-state.js";

describe("remote host rescan state", () => {
  it("identifies removed and connection-changing host definitions", () => {
    expect(
      changedOrRemovedRemoteAliases(
        [
          { alias: "removed", hostname: "one.example" },
          { alias: "changed", hostname: "old.example" },
          { alias: "stable", hostname: "stable.example" },
        ],
        [
          { alias: "changed", hostname: "new.example" },
          { alias: "stable", hostname: "stable.example" },
        ],
      ),
    ).toEqual(new Set(["removed", "changed"]));
  });

  it("preserves the live state object used by an active tunnel callback", () => {
    const existing = {
      alias: "stable",
      hostname: "old-label.example",
      tunnelState: "connected" as const,
      hasCli: true,
    };
    const result = reconcileRemoteHostState(
      [{ alias: "stable", hostname: "new-label.example" }],
      [existing],
      [],
      new Set(["stable"]),
    );

    expect(result[0]).toBe(existing);
    expect(result[0]).toMatchObject({
      hostname: "new-label.example",
      tunnelState: "connected",
      hasCli: true,
    });
  });

  it("invalidates a superseded or cancelled asynchronous connection attempt", () => {
    const attempts = new RemoteConnectionAttempts();
    const first = attempts.begin("remote");
    const second = attempts.begin("remote");

    expect(attempts.isCurrent("remote", first)).toBe(false);
    expect(attempts.finish("remote", first)).toBe(false);
    expect(attempts.isCurrent("remote", second)).toBe(true);
    expect(attempts.finish("remote", second)).toBe(true);
    expect(attempts.isCurrent("remote", second)).toBe(false);

    const cancelled = attempts.begin("remote");
    attempts.invalidate("remote");
    expect(attempts.isCurrent("remote", cancelled)).toBe(false);
  });
});

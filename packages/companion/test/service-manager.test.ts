import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
}));

import { createDaemonServiceManager } from "../src/service-manager.js";

class FakeStream extends EventEmitter {
  setEncoding(): void {}
}

class FakeChild extends EventEmitter {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly pid = 4321;
  readonly kill = vi.fn(() => true);
}

const cli = {
  args: ["/workspace/packages/cli/dist/index.js"],
  cliPath: "/workspace/packages/cli/dist/index.js",
  command: "node",
  displayCommand: "node /workspace/packages/cli/dist/index.js",
  setupRuntime: {
    entryPath: "/workspace/packages/cli/dist/index.js",
    execPath: "node",
    isSea: () => false,
    platform: "linux" as const,
  },
};

const settings = {
  host: "127.0.0.1",
  notifier: "none" as const,
  port: 3768,
};

describe("desktop daemon service manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    childProcessMocks.spawn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bounds dispose when a managed child never emits exit", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    await expect(manager.start(settings)).resolves.toBe(true);

    const disposed = vi.fn();
    void manager.dispose().then(disposed);
    await vi.advanceTimersByTimeAsync(7_000);

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("settles a normal stop when the managed child exits", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    await manager.start(settings);

    const stopped = manager.stop();
    child.emit("exit", 0, "SIGTERM");

    await expect(stopped).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      managed: false,
      phase: "stopped",
    });
  });
});

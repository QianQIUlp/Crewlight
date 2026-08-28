import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
}));

import {
  createDaemonServiceManager,
  DAEMON_START_TIMEOUT_MS,
} from "../src/service-manager.js";

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

function emitReady(child: FakeChild): void {
  child.emit("spawn");
  child.stdout.emit("data", "Crewlight daemon list");
  child.stdout.emit("data", "ening at http://127.0.0.1:3768\r\n");
}

describe("desktop daemon service manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    childProcessMocks.spawn.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("waits for a complete, possibly chunked daemon readiness line", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);

    const firstStart = manager.start(settings);
    const concurrentStart = manager.start(settings);
    expect(concurrentStart).toBe(firstStart);
    expect(childProcessMocks.spawn).toHaveBeenCalledOnce();

    child.emit("spawn");
    child.stdout.emit("data", "Crewlight daemon list");
    expect(manager.snapshot()).toMatchObject({
      phase: "starting",
      managed: true,
      pid: 4321,
    });

    child.stdout.emit("data", "ening at http://127.0.0.1:3768\r\n");

    await expect(firstStart).resolves.toBe(true);
    await expect(concurrentStart).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      phase: "running",
      managed: true,
      pid: 4321,
    });
  });

  it("fails startup when the child reports a spawn error", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);

    const started = manager.start(settings);
    child.emit("error", new Error("spawn ENOENT"));

    await expect(started).resolves.toBe(false);
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: false,
      lastError: "spawn ENOENT",
    });
  });

  it("fails startup when the daemon exits before readiness", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);

    const started = manager.start(settings);
    child.emit("spawn");
    child.emit("exit", 1, null);

    await expect(started).resolves.toBe(false);
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: false,
      exitCode: 1,
      lastError: "The local Crewlight service exited with code 1.",
    });
  });

  it("cancels the readiness wait when startup is stopped", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);

    const started = manager.start(settings);
    child.emit("spawn");
    const stopped = manager.stop();

    await expect(started).resolves.toBe(false);
    child.emit("exit", 0, "SIGTERM");
    await expect(stopped).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      phase: "stopped",
      managed: false,
    });
  });

  it("keeps managing a readiness-timeout child until exit is confirmed", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);

    const started = manager.start(settings);
    child.emit("spawn");
    await vi.advanceTimersByTimeAsync(DAEMON_START_TIMEOUT_MS);

    await expect(started).resolves.toBe(false);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      lastError: expect.stringContaining("did not report readiness"),
    });

    await vi.advanceTimersByTimeAsync(7_000);
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
      lastError: expect.stringContaining("did not confirm exit"),
    });

    const stopped = manager.stop();
    await vi.advanceTimersByTimeAsync(7_000);
    await expect(stopped).resolves.toBe(false);
    expect(child.kill).toHaveBeenNthCalledWith(3, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(4, "SIGKILL");
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
      lastError: expect.stringContaining("did not exit after a forced stop"),
    });

    const disposed = manager.dispose();
    await vi.advanceTimersByTimeAsync(7_000);
    await expect(disposed).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenNthCalledWith(5, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(6, "SIGKILL");
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
    });
  });

  it("bounds dispose when a managed child never emits exit", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(child);
    await expect(started).resolves.toBe(true);

    const disposed = vi.fn();
    void manager.dispose().then(disposed);
    await vi.advanceTimersByTimeAsync(7_000);

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(disposed).toHaveBeenCalledOnce();
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
    });
  });

  it("bounds stop and dispose without dropping the child when it errors while stopping", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(child);
    await expect(started).resolves.toBe(true);

    const stopped = manager.stop();
    const disposed = manager.dispose();
    child.emit("error", new Error("failed while stopping"));

    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
      lastError: "failed while stopping",
    });

    await vi.advanceTimersByTimeAsync(7_000);
    await expect(stopped).resolves.toBe(false);
    await expect(disposed).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      pid: 4321,
      lastError: expect.stringContaining("did not exit after a forced stop"),
    });
  });

  it("clears a transient stop error when the child later confirms exit", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(child);
    await expect(started).resolves.toBe(true);

    const stopped = manager.stop();
    child.emit("error", new Error("transient stop error"));
    expect(manager.snapshot()).toMatchObject({
      phase: "error",
      managed: true,
      lastError: "transient stop error",
    });

    child.emit("exit", 0, "SIGTERM");
    await expect(stopped).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      phase: "stopped",
      managed: false,
      pid: undefined,
      lastError: undefined,
    });
  });

  it("settles a normal stop when the managed child exits", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(child);
    await started;

    const stopped = manager.stop();
    child.emit("exit", 0, "SIGTERM");

    await expect(stopped).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      managed: false,
      phase: "stopped",
    });
  });

  it("queues a start requested while stopping until the old child exits", async () => {
    const firstChild = new FakeChild();
    const secondChild = new FakeChild();
    childProcessMocks.spawn
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(firstChild);
    await expect(started).resolves.toBe(true);

    const stopped = manager.stop();
    const restarted = manager.start(settings);
    expect(childProcessMocks.spawn).toHaveBeenCalledOnce();

    firstChild.emit("exit", 0, "SIGTERM");
    await expect(stopped).resolves.toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);

    emitReady(secondChild);
    await expect(restarted).resolves.toBe(true);
    expect(manager.snapshot()).toMatchObject({
      phase: "running",
      managed: true,
      pid: 4321,
    });
  });

  it("does not restart a queued start while disposing", async () => {
    const child = new FakeChild();
    childProcessMocks.spawn.mockReturnValue(child);
    const manager = createDaemonServiceManager(cli, settings);
    const started = manager.start(settings);
    emitReady(child);
    await expect(started).resolves.toBe(true);

    const stopped = manager.stop();
    const queuedStart = manager.start(settings);
    const disposed = manager.dispose();
    child.emit("exit", 0, "SIGTERM");

    await expect(stopped).resolves.toBe(true);
    await expect(queuedStart).resolves.toBe(false);
    await expect(disposed).resolves.toBeUndefined();
    expect(childProcessMocks.spawn).toHaveBeenCalledOnce();
    expect(manager.snapshot()).toMatchObject({
      phase: "stopped",
      managed: false,
    });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSshTunnel } from "../src/ssh-tunnel.js";

// Setup global store for mock instances
(globalThis as any).mockClientInstances = [];

vi.mock("ssh2", () => {
  const { EventEmitter } = require("node:events");
  class MockClient extends EventEmitter {
    connectConfigs: any[] = [];
    forwardInCalls: any[] = [];
    execCalls: any[] = [];
    ended = false;

    constructor() {
      super();
      (globalThis as any).mockClientInstances.push(this);
    }

    connect(config: any) {
      this.connectConfigs.push(config);
      process.nextTick(() => {
        if (config.host === "fail-host") {
          this.emit("error", new Error("Connection failed"));
          this.emit("close");
        } else {
          this.emit("ready");
        }
      });
    }

    forwardIn(bindAddr: string, bindPort: number, cb: (err?: Error) => void) {
      this.forwardInCalls.push({ bindAddr, bindPort });
      process.nextTick(() => {
        if (bindPort === 9999) {
          cb(new Error("Port forwarding rejected"));
        } else {
          cb();
        }
      });
    }

    exec(command: string, cb: (err: Error | null, stream: any) => void) {
      this.execCalls.push(command);
      const mockStream = new EventEmitter();
      process.nextTick(() => {
        cb(null, mockStream);
        if (command.includes("crewlight")) {
          mockStream.emit("data", Buffer.from("/usr/bin/crewlight\n"));
        } else {
          mockStream.emit("data", Buffer.from(""));
        }
        mockStream.emit("close", 0);
      });
    }

    end() {
      this.ended = true;
      process.nextTick(() => {
        this.emit("close");
      });
    }
  }

  return {
    Client: MockClient,
  };
});

describe("ssh tunnel", () => {
  beforeEach(() => {
    (globalThis as any).mockClientInstances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("establishes tunnel and transitions to connected state", async () => {
    const states: any[] = [];
    const tunnel = createSshTunnel({
      host: {
        alias: "my-host",
        hostname: "my-host.com",
        user: "my-user",
        port: 2222,
      },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: (state) => states.push(state),
    });

    // Let connection callbacks run
    await vi.runAllTimersAsync();

    expect(states).toContainEqual({ kind: "connecting" });
    expect(states).toContainEqual({ kind: "connected", localPort: 12345 });

    const client = (globalThis as any).mockClientInstances[0];
    expect(client).toBeDefined();
    expect(client?.connectConfigs[0]).toMatchObject({
      host: "my-host.com",
      port: 2222,
      username: "my-user",
    });
    expect(client?.forwardInCalls[0]).toEqual({
      bindAddr: "127.0.0.1",
      bindPort: 3768,
    });

    const hasCli = await tunnel.checkRemoteCli();
    expect(hasCli).toBe(true);
    expect(client?.execCalls).toContain("which crewlight");

    tunnel.disconnect();
    expect(client?.ended).toBe(true);
  });

  it("handles errors and retries up to 3 times then disconnects", async () => {
    const states: any[] = [];
    const tunnel = createSshTunnel({
      host: {
        alias: "fail-host",
        hostname: "fail-host",
        user: "user",
      },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: (state) => states.push(state),
    });

    // Run connection and retry timers
    await vi.runAllTimersAsync();

    // 1 initial + 3 retries = 4 connection attempts
    expect((globalThis as any).mockClientInstances).toHaveLength(4);
    expect(states).toContainEqual({
      kind: "error",
      message: "Connection failed",
    });
    expect(states).toContainEqual({
      kind: "disconnected",
      reason: "Connection closed",
    });

    tunnel.disconnect();
  });
});

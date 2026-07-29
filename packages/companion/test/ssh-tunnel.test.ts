import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseKnownHosts } from "../src/known-hosts.js";
import {
  createSshTunnel,
  REMOTE_CLI_PROBE_TIMEOUT_MS,
} from "../src/ssh-tunnel.js";

// Setup global store for mock instances
(globalThis as any).mockClientInstances = [];
(globalThis as any).mockRemotePlatform = "posix";
(globalThis as any).mockStalledCommands = new Set<string>();
(globalThis as any).mockExecStreams = [];

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
        if (
          config.host === "untrusted-host" &&
          !config.hostVerifier(Buffer.from("unknown-host-key"))
        ) {
          this.emit("error", new Error("Host denied"));
          this.emit("close");
        } else if (config.host === "fail-host") {
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
      mockStream.stderr = { resume: vi.fn() };
      mockStream.close = vi.fn();
      mockStream.destroy = vi.fn();
      (globalThis as any).mockExecStreams.push({ command, stream: mockStream });
      process.nextTick(() => {
        cb(null, mockStream);
        if ((globalThis as any).mockStalledCommands.has(command)) {
          return;
        }
        const remotePlatform = (globalThis as any).mockRemotePlatform;
        const foundOnPosix =
          remotePlatform === "posix" && command === "command -v crewlight";
        const foundOnWindows =
          remotePlatform === "windows" && command === "where.exe crewlight";
        if (foundOnPosix) {
          mockStream.emit("data", Buffer.from("/usr/bin/crewlight\n"));
        } else if (foundOnWindows) {
          mockStream.emit(
            "data",
            Buffer.from("C:\\Tools\\Crewlight\\crewlight.exe\r\n"),
          );
        }
        mockStream.emit("close", foundOnPosix || foundOnWindows ? 0 : 1);
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
    utils: {
      parseKey: () => ({ getPrivatePEM: () => "private-key" }),
    },
  };
});

describe("ssh tunnel", () => {
  beforeEach(() => {
    (globalThis as any).mockClientInstances = [];
    (globalThis as any).mockRemotePlatform = "posix";
    (globalThis as any).mockStalledCommands = new Set<string>();
    (globalThis as any).mockExecStreams = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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
    expect(client?.connectConfigs[0]?.hostVerifier).toEqual(
      expect.any(Function),
    );
    expect(client?.forwardInCalls[0]).toEqual({
      bindAddr: "127.0.0.1",
      bindPort: 3768,
    });

    const hasCli = await tunnel.checkRemoteCli();
    expect(hasCli).toBe(true);
    expect(client?.execCalls).toEqual(["command -v crewlight"]);

    tunnel.disconnect();
    expect(client?.ended).toBe(true);
  });

  it("falls back to a fixed Windows OpenSSH PATH probe without interpolating host data", async () => {
    (globalThis as any).mockRemotePlatform = "windows";
    const tunnel = createSshTunnel({
      host: {
        alias: "windows-host; echo injected",
        hostname: "windows.example",
      },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: () => {},
    });
    await vi.runAllTimersAsync();

    const hasCli = await tunnel.checkRemoteCli();
    const client = (globalThis as any).mockClientInstances[0];

    expect(hasCli).toBe(true);
    expect(client?.execCalls).toEqual([
      "command -v crewlight",
      "where.exe crewlight",
    ]);
    expect(client?.execCalls.join(" ")).not.toContain("windows-host");
    expect(client?.execCalls.join(" ")).not.toContain("injected");
    tunnel.disconnect();
  });

  it("times out a stalled POSIX probe and continues with the Windows fallback", async () => {
    (globalThis as any).mockRemotePlatform = "windows";
    (globalThis as any).mockStalledCommands = new Set(["command -v crewlight"]);
    const tunnel = createSshTunnel({
      host: { alias: "windows-host", hostname: "windows.example" },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: () => {},
    });
    await vi.runAllTimersAsync();

    const hasCli = tunnel.checkRemoteCli();
    await vi.advanceTimersByTimeAsync(REMOTE_CLI_PROBE_TIMEOUT_MS);

    await expect(hasCli).resolves.toBe(true);
    const client = (globalThis as any).mockClientInstances[0];
    expect(client?.execCalls).toEqual([
      "command -v crewlight",
      "where.exe crewlight",
    ]);
    expect(
      (globalThis as any).mockExecStreams[0].stream.close,
    ).toHaveBeenCalledOnce();
    tunnel.disconnect();
  });

  it("returns false after both fixed remote CLI probes time out", async () => {
    (globalThis as any).mockStalledCommands = new Set([
      "command -v crewlight",
      "where.exe crewlight",
    ]);
    const tunnel = createSshTunnel({
      host: { alias: "stalled-host" },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: () => {},
    });
    await vi.runAllTimersAsync();

    const hasCli = tunnel.checkRemoteCli();
    await vi.runAllTimersAsync();

    await expect(hasCli).resolves.toBe(false);
    const streams = (globalThis as any).mockExecStreams;
    expect(streams).toHaveLength(2);
    expect(streams[0].stream.close).toHaveBeenCalledOnce();
    expect(streams[1].stream.close).toHaveBeenCalledOnce();
    tunnel.disconnect();
  });

  it("does not let a timed-out probe reverse a disconnected result", async () => {
    (globalThis as any).mockStalledCommands = new Set(["command -v crewlight"]);
    const tunnel = createSshTunnel({
      host: { alias: "disconnecting-host" },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: () => {},
    });
    await vi.runAllTimersAsync();

    const hasCli = tunnel.checkRemoteCli();
    tunnel.disconnect();
    await vi.runAllTimersAsync();

    await expect(hasCli).resolves.toBe(false);
    const client = (globalThis as any).mockClientInstances[0];
    expect(client?.execCalls).toEqual(["command -v crewlight"]);
    expect(
      (globalThis as any).mockExecStreams[0].stream.close,
    ).toHaveBeenCalledOnce();
  });

  it("uses known_hosts verification and fails closed for a changed key", async () => {
    const trustedKey = Buffer.from("trusted-key");
    const tunnel = createSshTunnel({
      host: { alias: "my-host", hostname: "my-host.com" },
      remotePort: 3768,
      localPort: 12345,
      knownHosts: parseKnownHosts(
        `my-host.com ssh-ed25519 ${trustedKey.toString("base64")}\n`,
      ),
      onStateChange: () => {},
    });

    await vi.runAllTimersAsync();
    const config = (globalThis as any).mockClientInstances[0]
      ?.connectConfigs[0];
    expect(config.hostVerifier(trustedKey)).toBe(true);
    expect(config.hostVerifier(Buffer.from("changed-key"))).toBe(false);
    tunnel.disconnect();
  });

  it("offers both an explicit identity file and SSH agent authentication", async () => {
    const identityFile = join(tmpdir(), `crewlight-identity-${Date.now()}`);
    writeFileSync(identityFile, "private-key", "utf8");
    const previousAgent = process.env.SSH_AUTH_SOCK;
    process.env.SSH_AUTH_SOCK = "/tmp/crewlight-agent.sock";
    try {
      const tunnel = createSshTunnel({
        host: { alias: "my-host", identityFile },
        remotePort: 3768,
        localPort: 12345,
        onStateChange: () => {},
      });
      await vi.runAllTimersAsync();

      expect(
        (globalThis as any).mockClientInstances[0]?.connectConfigs[0],
      ).toMatchObject({
        agent: "/tmp/crewlight-agent.sock",
        privateKey: Buffer.from("private-key"),
      });
      tunnel.disconnect();
    } finally {
      if (previousAgent === undefined) {
        delete process.env.SSH_AUTH_SOCK;
      } else {
        process.env.SSH_AUTH_SOCK = previousAgent;
      }
      rmSync(identityFile, { force: true });
    }
  });

  it("falls back to the SSH agent when an explicit identity file is unreadable", async () => {
    const states: any[] = [];
    const previousAgent = process.env.SSH_AUTH_SOCK;
    process.env.SSH_AUTH_SOCK = "/tmp/crewlight-agent.sock";
    try {
      const tunnel = createSshTunnel({
        host: {
          alias: "my-host",
          identityFile: "/no/such/file/exists/at/all",
        },
        remotePort: 3768,
        localPort: 12345,
        onStateChange: (state) => states.push(state),
      });
      await vi.runAllTimersAsync();

      expect(
        (globalThis as any).mockClientInstances[0]?.connectConfigs[0],
      ).toMatchObject({ agent: "/tmp/crewlight-agent.sock" });
      expect(states).not.toContainEqual(
        expect.objectContaining({
          kind: "error",
          message: expect.stringContaining("Failed to read private key"),
        }),
      );
      tunnel.disconnect();
    } finally {
      if (previousAgent === undefined) {
        delete process.env.SSH_AUTH_SOCK;
      } else {
        process.env.SSH_AUTH_SOCK = previousAgent;
      }
    }
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

  it("does not retry a host-key verification failure", async () => {
    const states: any[] = [];
    const tunnel = createSshTunnel({
      host: { alias: "untrusted-host" },
      remotePort: 3768,
      localPort: 12345,
      knownHosts: [],
      onStateChange: (state) => states.push(state),
    });

    await vi.runAllTimersAsync();
    expect((globalThis as any).mockClientInstances).toHaveLength(1);
    expect(states).toContainEqual({
      kind: "error",
      message:
        "SSH host key is unknown. Connection refused; verify it with OpenSSH before connecting.",
    });
    tunnel.disconnect();
  });

  it("emits error when forwardIn is rejected", async () => {
    const states: any[] = [];
    const tunnel = createSshTunnel({
      host: {
        alias: "my-host",
        hostname: "my-host.com",
        user: "my-user",
        port: 2222,
      },
      remotePort: 9999, // triggers forwardIn rejection
      localPort: 12345,
      onStateChange: (state) => states.push(state),
    });

    await vi.runAllTimersAsync();

    expect(states).toContainEqual(
      expect.objectContaining({
        kind: "error",
        message: expect.stringContaining("ForwardIn failed"),
      }),
    );
    tunnel.disconnect();
  });

  it("emits error immediately when identityFile cannot be read", async () => {
    const states: any[] = [];
    const previousAgent = process.env.SSH_AUTH_SOCK;
    delete process.env.SSH_AUTH_SOCK;
    try {
      const tunnel = createSshTunnel({
        host: {
          alias: "my-host",
          hostname: "my-host.com",
          user: "my-user",
          port: 2222,
          identityFile: "/no/such/file/exists/at/all",
        },
        remotePort: 3768,
        localPort: 12345,
        onStateChange: (state) => states.push(state),
      });

      await vi.runAllTimersAsync();

      expect(states).toContainEqual(
        expect.objectContaining({
          kind: "error",
          message: expect.stringContaining("Failed to read private key"),
        }),
      );
      tunnel.disconnect();
    } finally {
      if (previousAgent !== undefined) {
        process.env.SSH_AUTH_SOCK = previousAgent;
      }
    }
  });

  it("checkRemoteCli returns false when not connected", async () => {
    const tunnel = createSshTunnel({
      host: {
        alias: "fail-host",
        hostname: "fail-host",
        user: "user",
      },
      remotePort: 3768,
      localPort: 12345,
      onStateChange: () => {},
    });

    // Don't wait for connection to complete
    const hasCli = await tunnel.checkRemoteCli();
    expect(hasCli).toBe(false);
    tunnel.disconnect();
  });
});

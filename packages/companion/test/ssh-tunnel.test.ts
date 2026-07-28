import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseKnownHosts } from "../src/known-hosts.js";
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
    utils: {
      parseKey: () => ({ getPrivatePEM: () => "private-key" }),
    },
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
    expect(client?.connectConfigs[0]?.hostVerifier).toEqual(
      expect.any(Function),
    );
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

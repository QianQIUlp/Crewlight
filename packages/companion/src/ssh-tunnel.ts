import net from "node:net";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { loadSshIdentity } from "./ssh-auth.js";
import {
  knownHostCandidates,
  loadKnownHosts,
  verifyKnownHostKey,
  type KnownHostEntry,
} from "./known-hosts.js";
import type { SshConfigHost } from "./ssh-config-parser.js";

export interface SshTunnelOptions {
  host: SshConfigHost;
  remotePort: number;
  localPort: number;
  knownHosts?: readonly KnownHostEntry[];
  knownHostsPath?: string;
  onStateChange: (state: TunnelState) => void;
}

export type TunnelState =
  | { kind: "connecting" }
  | { kind: "connected"; localPort: number }
  | { kind: "disconnected"; reason: string }
  | { kind: "error"; message: string };

export interface SshTunnel {
  disconnect(): void;
  checkRemoteCli(): Promise<boolean>;
}

const REMOTE_CLI_PROBE_COMMANDS = [
  "command -v crewlight",
  "where.exe crewlight",
] as const;
const REMOTE_CLI_PROBE_OUTPUT_LIMIT = 4_096;
export const REMOTE_CLI_PROBE_TIMEOUT_MS = 1_000;

function closeProbeChannel(stream: ClientChannel): void {
  const channel = stream as ClientChannel & {
    close?: () => void;
    destroy?: () => unknown;
  };
  try {
    if (typeof channel.close === "function") {
      channel.close();
      return;
    }
  } catch {
    // Fall through to the generic stream teardown below.
  }
  try {
    channel.destroy?.();
  } catch {
    // The probe has already timed out, so teardown errors are non-fatal.
  }
}

function probeRemoteCommand(
  connection: Client,
  command: (typeof REMOTE_CLI_PROBE_COMMANDS)[number],
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let stream: ClientChannel | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (result: boolean, closeStream = false): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      if (closeStream && stream) {
        closeProbeChannel(stream);
      }
      resolve(result);
    };

    timeout = setTimeout(
      () => finish(false, true),
      REMOTE_CLI_PROBE_TIMEOUT_MS,
    );

    try {
      connection.exec(command, (error, openedStream) => {
        if (settled) {
          if (openedStream) {
            closeProbeChannel(openedStream);
          }
          return;
        }
        if (error) {
          finish(false);
          return;
        }

        stream = openedStream;
        let output = "";
        stream.on("data", (data: Buffer | string) => {
          if (output.length >= REMOTE_CLI_PROBE_OUTPUT_LIMIT) {
            return;
          }
          output = `${output}${data.toString()}`.slice(
            0,
            REMOTE_CLI_PROBE_OUTPUT_LIMIT,
          );
        });
        stream.stderr?.resume?.();
        stream.once("error", () => finish(false, true));
        stream.once("close", (code: number) => {
          finish(code === 0 && output.trim().length > 0);
        });
      });
    } catch {
      finish(false, true);
    }
  });
}

export function createSshTunnel(options: SshTunnelOptions): SshTunnel {
  const { host, remotePort, localPort, onStateChange } = options;
  let conn: Client | null = null;
  let retryCount = 0;
  let isConnected = false;
  const maxRetries = 3;
  let shouldReconnect = true;
  let hostKeyFailure: "changed" | "unknown" | undefined;

  function connect() {
    if (!shouldReconnect) {
      return;
    }
    onStateChange({ kind: "connecting" });

    conn = new Client();

    const hostname = host.hostname ?? host.alias;
    const port = host.port ?? 22;
    const knownHosts =
      options.knownHosts ?? loadKnownHosts(options.knownHostsPath);
    const candidates = knownHostCandidates(hostname, port, host.alias);
    hostKeyFailure = undefined;
    const connectConfig: ConnectConfig = {
      host: hostname,
      port,
      username: host.user ?? process.env.USER ?? "root",
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer) => {
        const verification = verifyKnownHostKey(knownHosts, candidates, key);
        hostKeyFailure = verification.ok ? undefined : verification.reason;
        if (!verification.ok) {
          shouldReconnect = false;
        }
        return verification.ok;
      },
    };

    const agentSocket = process.env.SSH_AUTH_SOCK;
    if (agentSocket) {
      connectConfig.agent = agentSocket;
    }

    if (host.identityFile) {
      const identity = loadSshIdentity(host.identityFile, !!agentSocket);
      if (!identity.ok) {
        onStateChange({ kind: "error", message: identity.message });
        return;
      }
      if (identity.privateKey) {
        connectConfig.privateKey = identity.privateKey;
      }
    }

    conn
      .on("ready", () => {
        conn!.forwardIn("127.0.0.1", remotePort, (err) => {
          if (err) {
            onStateChange({
              kind: "error",
              message: `ForwardIn failed: ${err.message}`,
            });
            conn!.end();
            return;
          }
          retryCount = 0;
          isConnected = true;
          onStateChange({ kind: "connected", localPort });
        });
      })
      .on("tcp connection", (_info, accept, reject) => {
        const localSocket = net.connect(localPort, "127.0.0.1", () => {
          const remoteStream = accept();
          remoteStream.pipe(localSocket).pipe(remoteStream);
        });
        localSocket.on("error", () => {
          reject();
        });
      })
      .on("error", (err) => {
        const message =
          hostKeyFailure === "changed"
            ? "SSH host key changed. Connection refused; verify the host and update known_hosts manually."
            : hostKeyFailure === "unknown"
              ? "SSH host key is unknown. Connection refused; verify it with OpenSSH before connecting."
              : err.message;
        onStateChange({ kind: "error", message });
      })
      .on("close", () => {
        isConnected = false;
        if (!shouldReconnect) {
          return;
        }
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(connect, 3000);
        } else {
          onStateChange({ kind: "disconnected", reason: "Connection closed" });
        }
      });

    try {
      conn.connect(connectConfig);
    } catch (error) {
      onStateChange({
        kind: "error",
        message:
          error instanceof Error ? error.message : "SSH connection failed",
      });
    }
  }

  connect();

  return {
    disconnect() {
      shouldReconnect = false;
      isConnected = false;
      if (conn) {
        conn.end();
        conn = null;
      }
    },
    async checkRemoteCli(): Promise<boolean> {
      const activeConnection = conn;
      if (!activeConnection || !isConnected) {
        return false;
      }

      for (const command of REMOTE_CLI_PROBE_COMMANDS) {
        if (await probeRemoteCommand(activeConnection, command)) {
          return conn === activeConnection && isConnected;
        }
        if (conn !== activeConnection || !isConnected) {
          return false;
        }
      }
      return false;
    },
  };
}

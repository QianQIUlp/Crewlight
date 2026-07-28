import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";
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
    checkRemoteCli(): Promise<boolean> {
      return new Promise((resolve) => {
        if (!conn || !isConnected) {
          resolve(false);
          return;
        }
        conn.exec("which crewlight", (err, stream) => {
          if (err) {
            resolve(false);
            return;
          }
          let output = "";
          stream.on("data", (data: Buffer | string) => {
            output += data.toString();
          });
          stream.on("close", (code: number) => {
            resolve(code === 0 && output.trim().length > 0);
          });
        });
      });
    },
  };
}

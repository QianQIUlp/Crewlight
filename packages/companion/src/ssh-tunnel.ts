import net from "node:net";
import { readFileSync } from "node:fs";
import { Client } from "ssh2";
import type { SshConfigHost } from "./ssh-config-parser.js";

export interface SshTunnelOptions {
  host: SshConfigHost;
  remotePort: number;
  localPort: number;
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
  const maxRetries = 3;
  let shouldReconnect = true;

  function connect() {
    if (!shouldReconnect) {
      return;
    }
    onStateChange({ kind: "connecting" });

    conn = new Client();

    const connectConfig: any = {
      host: host.hostname ?? host.alias,
      port: host.port ?? 22,
      username: host.user ?? process.env.USER ?? "root",
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    };

    if (host.identityFile) {
      try {
        connectConfig.privateKey = readFileSync(host.identityFile);
      } catch (err: any) {
        onStateChange({
          kind: "error",
          message: `Failed to read private key: ${err.message}`,
        });
        return;
      }
    } else if (process.env.SSH_AUTH_SOCK) {
      connectConfig.agent = process.env.SSH_AUTH_SOCK;
    }

    conn
      .on("ready", () => {
        retryCount = 0;
        conn!.forwardIn("127.0.0.1", remotePort, (err) => {
          if (err) {
            onStateChange({
              kind: "error",
              message: `ForwardIn failed: ${err.message}`,
            });
            conn!.end();
            return;
          }
          onStateChange({ kind: "connected", localPort });
        });
      })
      .on("tcp connection", (info, accept, reject) => {
        const localSocket = net.connect(localPort, "127.0.0.1", () => {
          const remoteStream = accept();
          remoteStream.pipe(localSocket).pipe(remoteStream);
        });
        localSocket.on("error", () => {
          reject();
        });
      })
      .on("error", (err) => {
        onStateChange({ kind: "error", message: err.message });
      })
      .on("close", () => {
        if (shouldReconnect && retryCount < maxRetries) {
          retryCount++;
          setTimeout(connect, 3000);
        } else {
          onStateChange({ kind: "disconnected", reason: "Connection closed" });
        }
      });

    try {
      conn.connect(connectConfig);
    } catch (err: any) {
      onStateChange({ kind: "error", message: err.message });
    }
  }

  connect();

  return {
    disconnect() {
      shouldReconnect = false;
      if (conn) {
        conn.end();
        conn = null;
      }
    },
    checkRemoteCli(): Promise<boolean> {
      return new Promise((resolve) => {
        if (!conn) {
          resolve(false);
          return;
        }
        conn.exec("which crewlight", (err, stream) => {
          if (err) {
            resolve(false);
            return;
          }
          let output = "";
          stream.on("data", (data: any) => {
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

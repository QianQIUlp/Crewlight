import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";
import { isNotifierKind, type NotifierKind } from "@crewlight/notifier";

export interface DaemonListenConfig {
  host: string;
  port: number;
}

export interface DaemonConfig extends DaemonListenConfig {
  notifier: NotifierKind;
}

export type DaemonConfigOverrides = Partial<Omit<DaemonConfig, "notifier">> & {
  notifier?: string;
};

export function resolveDaemonConfig(
  overrides: DaemonConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): DaemonConfig {
  const host = overrides.host ?? env.CREWLIGHT_HOST ?? DEFAULT_DAEMON_HOST;
  const portValue = overrides.port ?? env.CREWLIGHT_PORT ?? DEFAULT_DAEMON_PORT;
  const port = typeof portValue === "number" ? portValue : Number(portValue);

  if (!host) {
    throw new Error("Daemon host cannot be empty");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid daemon port: ${String(portValue)}`);
  }

  const notifierValue =
    overrides.notifier ?? env.CREWLIGHT_NOTIFIER ?? "console";
  if (!isNotifierKind(notifierValue)) {
    throw new Error(`Invalid notifier kind: ${String(notifierValue)}`);
  }

  return { host, port, notifier: notifierValue };
}

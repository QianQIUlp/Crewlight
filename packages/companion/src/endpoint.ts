import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

export interface CompanionEndpoint {
  host: string;
  port: number;
  baseUrl: string;
  dashboardApiUrl: string;
  dashboardUrl: string;
  issues: string[];
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

export function createCompanionEndpoint(
  host: string,
  port: number,
  issues: string[] = [],
): CompanionEndpoint {
  const baseUrl = `http://${formatHost(host)}:${port}`;
  return {
    host,
    port,
    baseUrl,
    dashboardApiUrl: `${baseUrl}/dashboard/api`,
    dashboardUrl: `${baseUrl}/dashboard`,
    issues,
  };
}

export function resolveCompanionEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): CompanionEndpoint {
  const requestedHost = env.CREWLIGHT_HOST;
  const requestedPort = env.CREWLIGHT_PORT;
  const issues: string[] = [];

  let host = DEFAULT_DAEMON_HOST;
  if (requestedHost !== undefined) {
    if (isLoopbackHost(requestedHost)) {
      host = requestedHost;
    } else {
      issues.push(
        `Ignoring non-loopback CREWLIGHT_HOST=${requestedHost}; using ${DEFAULT_DAEMON_HOST}.`,
      );
    }
  }

  let port = DEFAULT_DAEMON_PORT;
  if (requestedPort !== undefined) {
    const parsed = Number(requestedPort);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535) {
      port = parsed;
    } else {
      issues.push(
        `Ignoring invalid CREWLIGHT_PORT=${requestedPort}; using ${DEFAULT_DAEMON_PORT}.`,
      );
    }
  }

  return createCompanionEndpoint(host, port, issues);
}

function normalizeUrlHostname(hostname: string): string {
  return hostname === "[::1]" ? "::1" : hostname;
}

export function isAllowedDashboardUrl(
  value: string,
  endpoint: CompanionEndpoint,
): boolean {
  try {
    const parsed = new URL(value);
    const port = parsed.port ? Number(parsed.port) : 80;
    const hostname = normalizeUrlHostname(parsed.hostname);

    return (
      parsed.protocol === "http:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      isLoopbackHost(hostname) &&
      hostname === endpoint.host &&
      Number.isInteger(port) &&
      port === endpoint.port &&
      parsed.pathname === "/dashboard" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

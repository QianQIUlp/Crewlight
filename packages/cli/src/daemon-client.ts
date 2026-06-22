import type { AgentEventInput, AgentSession } from "@crewlight/core";
import {
  formatDaemonUrl,
  type DashboardCapabilities,
  type IngestResult,
} from "@crewlight/daemon";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

export const DASHBOARD_CAPABILITIES_TIMEOUT_MS = 200;

function disabledDashboardCapabilities(): DashboardCapabilities {
  return { taskTitleMode: "off" };
}

export interface CrewlightClient {
  dashboardCapabilities?(): Promise<DashboardCapabilities>;
  emit(event: AgentEventInput): Promise<IngestResult>;
  sessions(): Promise<AgentSession[]>;
}

export interface DaemonClientOptions {
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

function daemonBaseUrl(env: NodeJS.ProcessEnv): string {
  const host = env.CREWLIGHT_HOST ?? DEFAULT_DAEMON_HOST;
  const port = Number(env.CREWLIGHT_PORT ?? DEFAULT_DAEMON_PORT);
  return formatDaemonUrl(host, port);
}

export class DaemonClient implements CrewlightClient {
  readonly #baseUrl: string;

  constructor(options: DaemonClientOptions = {}) {
    this.#baseUrl = (
      options.baseUrl ?? daemonBaseUrl(options.env ?? process.env)
    ).replace(/\/$/, "");
  }

  async emit(event: AgentEventInput): Promise<IngestResult> {
    return this.#request<IngestResult>("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  }

  async dashboardCapabilities(): Promise<DashboardCapabilities> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      DASHBOARD_CAPABILITIES_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${this.#baseUrl}/dashboard/capabilities`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return disabledDashboardCapabilities();
      }

      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "taskTitleMode" in body &&
        ((body as { taskTitleMode?: unknown }).taskTitleMode === "off" ||
          (body as { taskTitleMode?: unknown }).taskTitleMode ===
            "prompt-preview")
      ) {
        return {
          taskTitleMode: (body as DashboardCapabilities).taskTitleMode,
        };
      }
    } catch {
      // Capability discovery must never block or fail host workflows.
    } finally {
      clearTimeout(timeout);
    }

    return disabledDashboardCapabilities();
  }

  async sessions(): Promise<AgentSession[]> {
    const result = await this.#request<{ sessions: AgentSession[] }>(
      "/sessions",
    );
    return result.sessions;
  }

  async #request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.#baseUrl}${path}`, init);
    } catch {
      throw new Error(
        `Cannot reach the Crewlight daemon at ${this.#baseUrl}. Start it with \`crewlight daemon --notifier console\`, or verify CREWLIGHT_HOST and CREWLIGHT_PORT.`,
      );
    }

    const body = (await response.json()) as T | { error?: string };
    if (!response.ok) {
      const message =
        "error" in (body as object) &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${response.status}`;
      throw new Error(`Crewlight daemon rejected the request: ${message}`);
    }

    return body as T;
  }
}

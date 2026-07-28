import type { AgentEventInput, AgentSession } from "@crewlight/core";
import {
  formatDaemonUrl,
  type DashboardCapabilities,
  type IngestResult,
} from "@crewlight/daemon";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

export const DASHBOARD_CAPABILITIES_TIMEOUT_MS = 200;
export const DAEMON_REQUEST_TIMEOUT_MS = 1_000;

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
  requestTimeoutMs?: number;
}

function daemonBaseUrl(env: NodeJS.ProcessEnv): string {
  const host = env.CREWLIGHT_HOST ?? DEFAULT_DAEMON_HOST;
  const port = Number(env.CREWLIGHT_PORT ?? DEFAULT_DAEMON_PORT);
  return formatDaemonUrl(host, port);
}

function positiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Daemon request timeout must be a positive number");
  }
  return value;
}

export class DaemonClient implements CrewlightClient {
  readonly #baseUrl: string;
  readonly #requestTimeoutMs: number;

  constructor(options: DaemonClientOptions = {}) {
    this.#baseUrl = (
      options.baseUrl ?? daemonBaseUrl(options.env ?? process.env)
    ).replace(/\/$/, "");
    this.#requestTimeoutMs = positiveTimeout(
      options.requestTimeoutMs ?? DAEMON_REQUEST_TIMEOUT_MS,
    );
  }

  async emit(event: AgentEventInput): Promise<IngestResult> {
    return this.#request<IngestResult>("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  }

  async dashboardCapabilities(): Promise<DashboardCapabilities> {
    return (
      (await this.probeDashboardCapabilities()) ??
      disabledDashboardCapabilities()
    );
  }

  async probeDashboardCapabilities(): Promise<
    DashboardCapabilities | undefined
  > {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<undefined>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, DASHBOARD_CAPABILITIES_TIMEOUT_MS);
    });

    const request = async (): Promise<DashboardCapabilities | undefined> => {
      try {
        const response = await fetch(
          `${this.#baseUrl}/dashboard/capabilities`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          return undefined;
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
      }

      return undefined;
    };

    try {
      return await Promise.race([request(), deadline]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async sessions(): Promise<AgentSession[]> {
    const result = await this.#request<{ sessions: AgentSession[] }>(
      "/sessions",
    );
    return result.sessions;
  }

  async #request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutError = () =>
      new Error(
        `Request to the Crewlight daemon at ${this.#baseUrl} timed out. Start it with \`crewlight daemon --notifier console\`, or verify CREWLIGHT_HOST and CREWLIGHT_PORT.`,
      );

    const request = async (): Promise<T> => {
      let response: Response;
      try {
        response = await fetch(`${this.#baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
        });
      } catch {
        if (timedOut) {
          throw timeoutError();
        }
        throw new Error(
          `Cannot reach the Crewlight daemon at ${this.#baseUrl}. Start it with \`crewlight daemon --notifier console\`, or verify CREWLIGHT_HOST and CREWLIGHT_PORT.`,
        );
      }

      let body: T | { error?: string };
      try {
        body = (await response.json()) as T | { error?: string };
      } catch {
        if (timedOut) {
          throw timeoutError();
        }
        throw new Error(
          `Crewlight daemon at ${this.#baseUrl} returned an invalid response. Restart it, then run \`crewlight doctor\`.`,
        );
      }

      if (!response.ok) {
        const message =
          "error" in (body as object) &&
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `HTTP ${response.status}`;
        throw new Error(`Crewlight daemon rejected the request: ${message}`);
      }

      return body as T;
    };

    let rejectTimeout: ((reason: Error) => void) | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectTimeout?.(timeoutError());
    }, this.#requestTimeoutMs);

    try {
      return await Promise.race([request(), deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

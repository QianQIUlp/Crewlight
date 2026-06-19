import type { AgentEventInput, AgentSession } from "@agentpulse/core";
import type { IngestResult } from "@agentpulse/daemon";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@agentpulse/shared";

export interface AgentPulseClient {
  emit(event: AgentEventInput): Promise<IngestResult>;
  sessions(): Promise<AgentSession[]>;
}

export interface DaemonClientOptions {
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

function daemonBaseUrl(env: NodeJS.ProcessEnv): string {
  const host = env.AGENTPULSE_HOST ?? DEFAULT_DAEMON_HOST;
  const port = env.AGENTPULSE_PORT ?? String(DEFAULT_DAEMON_PORT);
  return `http://${host}:${port}`;
}

export class DaemonClient implements AgentPulseClient {
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot reach AgentPulse daemon: ${reason}`);
    }

    const body = (await response.json()) as T | { error?: string };
    if (!response.ok) {
      const message =
        "error" in (body as object) &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${response.status}`;
      throw new Error(`AgentPulse daemon rejected the request: ${message}`);
    }

    return body as T;
  }
}

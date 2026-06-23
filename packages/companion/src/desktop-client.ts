import type { CompanionEndpoint } from "./endpoint.js";
import {
  sanitizeDashboardSnapshot,
  type SanitizedDashboardSnapshot,
} from "./sanitize.js";

export type DesktopDashboardResult =
  | { kind: "online"; data: SanitizedDashboardSnapshot }
  | { kind: "offline"; diagnostic: string }
  | { kind: "api-unavailable"; diagnostic: string };

export interface DesktopDashboardRequestOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1_500;
const OFFLINE_DIAGNOSTIC =
  "Run crewlight daemon --dashboard. Crewlight Desktop will retry.";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export async function fetchDesktopSnapshot(
  endpoint: CompanionEndpoint,
  options: DesktopDashboardRequestOptions = {},
): Promise<DesktopDashboardResult> {
  const request = options.fetch ?? fetch;
  const timeoutMs =
    options.timeoutMs !== undefined &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;

  try {
    const operation = (async (): Promise<DesktopDashboardResult> => {
      const response = await request(endpoint.dashboardApiUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 404) {
        return {
          kind: "api-unavailable",
          diagnostic: "Restart with: crewlight daemon --dashboard.",
        };
      }
      if (!response.ok) {
        return {
          kind: "api-unavailable",
          diagnostic: `Dashboard API returned HTTP ${response.status}. Restart with --dashboard.`,
        };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (timedOut || isAbortError(error)) {
          throw error;
        }
        return {
          kind: "api-unavailable",
          diagnostic:
            "Dashboard API returned invalid JSON. Restart with --dashboard.",
        };
      }

      const data = sanitizeDashboardSnapshot(body);
      if (!data) {
        return {
          kind: "api-unavailable",
          diagnostic:
            "Dashboard API response is unsupported. Restart with --dashboard.",
        };
      }

      return { kind: "online", data };
    })();

    const timeoutResult = new Promise<DesktopDashboardResult>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({
          kind: "offline",
          diagnostic: `${OFFLINE_DIAGNOSTIC} Request timed out after ${timeoutMs}ms.`,
        });
      }, timeoutMs);
    });

    return await Promise.race([operation, timeoutResult]);
  } catch (error) {
    return {
      kind: "offline",
      diagnostic:
        timedOut || isAbortError(error)
          ? `${OFFLINE_DIAGNOSTIC} Request timed out after ${timeoutMs}ms.`
          : OFFLINE_DIAGNOSTIC,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

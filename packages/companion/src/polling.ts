import type { DashboardPollResult } from "./client.js";

const UNEXPECTED_POLL_DIAGNOSTIC =
  "The companion could not complete the local daemon poll. Check that the daemon is running with --dashboard; the companion will retry.";

export interface CompanionPollerOptions {
  fetchSnapshot(): Promise<DashboardPollResult>;
  publish(result: DashboardPollResult): void;
  warn?(): void;
}

export interface CompanionPoller {
  isPolling(): boolean;
  pollOnce(): Promise<boolean>;
}

export function createCompanionPoller(
  options: CompanionPollerOptions,
): CompanionPoller {
  let polling = false;

  return {
    isPolling: () => polling,
    pollOnce: async () => {
      if (polling) {
        return false;
      }

      polling = true;
      try {
        let result: DashboardPollResult;
        try {
          result = await options.fetchSnapshot();
        } catch {
          result = {
            kind: "offline",
            diagnostic: UNEXPECTED_POLL_DIAGNOSTIC,
          };
          options.warn?.();
        }

        try {
          options.publish(result);
        } catch {
          options.warn?.();
        }
        return true;
      } finally {
        polling = false;
      }
    },
  };
}

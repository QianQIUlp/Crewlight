import { normalizeAgentEvent, SessionStore } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import {
  ConsoleNotifier,
  createNotifier,
  formatOsNotification,
  NoopNotifier,
  OS_NOTIFICATION_MESSAGE_LIMIT,
  OS_NOTIFICATION_TITLE_LIMIT,
  OS_NOTIFIER_WARNINGS,
  OsNotifier,
  probeOsNotifier,
} from "../src/index.js";

function completedEvent(message = "done") {
  return normalizeAgentEvent({
    source: "custom",
    surface: "manual",
    sessionId: "os-notifier",
    projectPath: `/tmp/${"project".repeat(50)}`,
    status: "completed",
    message,
  });
}

function sessionFor(message = "done") {
  const event = completedEvent(message);
  return { event, session: new SessionStore().apply(event) };
}

function requestFor(
  event: ReturnType<typeof completedEvent>,
  session: ReturnType<typeof sessionFor>["session"],
) {
  return { event, session, kind: "ready" as const };
}

describe("OS notifier", () => {
  it("probes module availability without sending a notification", async () => {
    let sends = 0;
    const available = await probeOsNotifier(async () => ({
      notify: () => {
        sends += 1;
      },
    }));
    const missing = await probeOsNotifier(async () => {
      throw new Error("module detail");
    });
    const unsupported = await probeOsNotifier(async () => ({ default: {} }));

    expect(available).toEqual({ available: true });
    expect(missing).toEqual({ available: false, reason: "import" });
    expect(unsupported).toEqual({ available: false, reason: "shape" });
    expect(sends).toBe(0);
  });

  it("bounds a notifier availability probe whose loader never settles", async () => {
    await expect(
      probeOsNotifier(() => new Promise<never>(() => {}), 5),
    ).resolves.toEqual({ available: false, reason: "import" });
  });

  it("limits notification title and message length", () => {
    const { event, session } = sessionFor("message".repeat(100));
    const notification = formatOsNotification(requestFor(event, session));

    expect(notification.title.length).toBeLessThanOrEqual(
      OS_NOTIFICATION_TITLE_LIMIT,
    );
    expect(notification.message.length).toBeLessThanOrEqual(
      OS_NOTIFICATION_MESSAGE_LIMIT,
    );
  });

  it("loads the runtime lazily and sends only actionable events", async () => {
    const sent: unknown[] = [];
    let loads = 0;
    const notifier = new OsNotifier({
      loader: async () => {
        loads += 1;
        return {
          default: {
            notify: (
              notification: unknown,
              callback: (error?: Error | null) => void,
            ) => {
              sent.push(notification);
              callback();
            },
          },
        };
      },
    });
    const completed = sessionFor();
    await notifier.notify(requestFor(completed.event, completed.session));
    await notifier.notify(requestFor(completed.event, completed.session));

    expect(loads).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it.each([
    {
      expected: OS_NOTIFIER_WARNINGS.import,
      loader: async () => {
        throw new Error("module detail");
      },
    },
    {
      expected: OS_NOTIFIER_WARNINGS.shape,
      loader: async () => ({ default: {} }),
    },
  ])("contains loader failures: $expected", async ({ expected, loader }) => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader,
      warning: (warning) => warnings.push(warning),
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([expected]);
    expect(warnings.join("\n")).not.toContain("module detail");
    expect(warnings[0]).toContain("crewlight daemon --notifier console");
  });

  it("contains synchronous runtime failures", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader: async () => ({
        notify: () => {
          throw new Error("runtime detail");
        },
      }),
      warning: (warning) => warnings.push(warning),
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.runtime]);
    expect(warnings.join("\n")).not.toContain("runtime detail");
  });

  it("contains callback failures", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader: async () => ({
        notify: (_notification: unknown, callback: (error: Error) => void) =>
          callback(new Error("callback detail")),
      }),
      warning: (warning) => warnings.push(warning),
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.callback]);
    expect(warnings.join("\n")).not.toContain("callback detail");
  });

  it("contains callback timeouts", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader: async () => ({ notify: () => {} }),
      timeoutMs: 5,
      warning: (warning) => warnings.push(warning),
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.timeout]);
  });

  it("applies the timeout while the notifier module is still loading", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader: () => new Promise<never>(() => {}),
      timeoutMs: 5,
      warning: (warning) => warnings.push(warning),
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.timeout]);
  });

  it("suppresses an import warning that arrives after the loading timeout", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    let rejectLoader: ((reason: Error) => void) | undefined;
    const notifier = new OsNotifier({
      loader: () =>
        new Promise<never>((_resolve, reject) => {
          rejectLoader = reject;
        }),
      timeoutMs: 5,
      warning: (warning) => warnings.push(warning),
    });

    await notifier.notify(requestFor(event, session));
    rejectLoader?.(new Error("late import detail"));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.timeout]);
  });

  it("suppresses a late shape warning while caching the loader result", async () => {
    const warnings: string[] = [];
    const { event, session } = sessionFor();
    let loads = 0;
    let resolveLoader: ((module: unknown) => void) | undefined;
    const notifier = new OsNotifier({
      loader: () => {
        loads += 1;
        return new Promise<unknown>((resolve) => {
          resolveLoader = resolve;
        });
      },
      timeoutMs: 5,
      warning: (warning) => warnings.push(warning),
    });

    await notifier.notify(requestFor(event, session));
    resolveLoader?.({ default: {} });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.timeout]);

    await notifier.notify(requestFor(event, session));
    expect(loads).toBe(1);
    expect(warnings).toEqual([
      OS_NOTIFIER_WARNINGS.timeout,
      OS_NOTIFIER_WARNINGS.shape,
    ]);
  });

  it("contains failures from the warning output itself", async () => {
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      loader: async () => {
        throw new Error("module unavailable");
      },
      warning: () => {
        throw new Error("warning output unavailable");
      },
    });

    await expect(
      notifier.notify(requestFor(event, session)),
    ).resolves.toBeUndefined();
  });
});

describe("notifier factory", () => {
  it("creates console, OS, and no-op notifier kinds", () => {
    expect(createNotifier("console")).toBeInstanceOf(ConsoleNotifier);
    expect(createNotifier("os")).toBeInstanceOf(OsNotifier);
    expect(createNotifier("none")).toBeInstanceOf(NoopNotifier);
  });
});

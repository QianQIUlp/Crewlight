import { normalizeAgentEvent, SessionStore } from "@crewlight/core";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
  isUsableWindowsToasterAsset,
  resolveWindowsToasterPath,
  WINDOWS_TOASTER_SHA256,
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

describe("OS notifier", () => {
  it("resolves the packaged Windows helper beside the standalone binary", () => {
    expect(
      resolveWindowsToasterPath({
        execPath: "C:\\Program Files\\Crewlight\\crewlight.exe",
        isSea: () => true,
        platform: "win32",
      }),
    ).toBe("C:\\Program Files\\Crewlight\\resources\\snoretoast-x64.exe");
    expect(
      resolveWindowsToasterPath({
        execPath: "/opt/crewlight",
        isSea: () => true,
        platform: "linux",
      }),
    ).toBeUndefined();
    expect(
      resolveWindowsToasterPath({
        execPath: "C:\\workspace\\node.exe",
        isSea: () => false,
        platform: "win32",
      }),
    ).toBeUndefined();
  });

  it("constructs WindowsToaster with the packaged helper path", async () => {
    const constructors: unknown[] = [];
    const sent: unknown[] = [];
    class WindowsToaster {
      readonly notify = (
        notification: unknown,
        callback: (error?: Error | null) => void,
      ) => {
        sent.push(notification);
        callback();
      };

      constructor(options: unknown) {
        constructors.push(options);
      }
    }
    const { event, session } = sessionFor();
    const notifier = new OsNotifier({
      assetVerifier: async () => true,
      loader: async () => ({ default: { WindowsToaster } }),
      windowsToasterPath: process.execPath,
    });

    await notifier.notify(event, session);

    expect(constructors).toEqual([
      { customPath: process.execPath, withFallback: false },
    ]);
    expect(sent).toHaveLength(1);
  });

  it("reports a missing packaged Windows helper without loading the module", async () => {
    let loads = 0;
    const path = `${process.execPath}.missing-crewlight-snoretoast`;
    const result = await probeOsNotifier(
      async () => {
        loads += 1;
        return { notify: () => {} };
      },
      undefined,
      path,
    );

    expect(result).toEqual({ available: false, reason: "asset" });
    expect(loads).toBe(0);
  });

  it("accepts only the pinned packaged helper hash", async () => {
    const require = createRequire(import.meta.url);
    const notifierRoot = dirname(require.resolve("node-notifier/package.json"));
    const helperPath = join(
      notifierRoot,
      "vendor",
      "snoreToast",
      "snoretoast-x64.exe",
    );
    const mismatchedBytes = {
      readFile: async () => Buffer.from("unexpected helper"),
      stat: async () => ({ isFile: () => true, size: 17 }),
    };

    expect(WINDOWS_TOASTER_SHA256).toMatch(/^[a-f\d]{64}$/u);
    await expect(isUsableWindowsToasterAsset(helperPath)).resolves.toBe(true);
    await expect(
      isUsableWindowsToasterAsset("helper.exe", mismatchedBytes),
    ).resolves.toBe(false);
  });

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
    const notification = formatOsNotification(event, session);

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
    const running = normalizeAgentEvent({
      source: "custom",
      surface: "manual",
      sessionId: "running",
      status: "running",
    });

    await notifier.notify(running, new SessionStore().apply(running));
    expect(loads).toBe(0);

    await notifier.notify(completed.event, completed.session);
    await notifier.notify(completed.event, completed.session);

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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
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

    await notifier.notify(event, session);
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

    await notifier.notify(event, session);
    resolveLoader?.({ default: {} });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(warnings).toEqual([OS_NOTIFIER_WARNINGS.timeout]);

    await notifier.notify(event, session);
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

    await expect(notifier.notify(event, session)).resolves.toBeUndefined();
  });
});

describe("notifier factory", () => {
  it("creates console, OS, and no-op notifier kinds", () => {
    expect(createNotifier("console")).toBeInstanceOf(ConsoleNotifier);
    expect(createNotifier("os")).toBeInstanceOf(OsNotifier);
    expect(createNotifier("none")).toBeInstanceOf(NoopNotifier);
  });
});

import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { stableCodexTurnEventId } from "@crewlight/cli";

import { deriveSessionKey } from "../../core/src/session-key.js";
import {
  createCodexJsonlMonitor,
  resolveCodexSessionsDirectory,
  type CodexJsonlMonitorOptions,
} from "../src/codex-jsonl-monitor.js";

type MonitorEvent = Parameters<CodexJsonlMonitorOptions["publish"]>[0];

const SESSION_ID = "019fbc6d-2aa2-7f21-94cd-7774f0ea9351";
const FILE_NAME = `rollout-2026-08-01T16-24-58-${SESSION_ID}.jsonl`;
const tempRoots: string[] = [];

async function createSessionsDirectory(): Promise<{
  file: string;
  root: string;
  sessions: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "crewlight-codex-jsonl-"));
  tempRoots.push(root);
  const sessions = join(root, ".codex", "sessions");
  const day = join(sessions, "2026", "08", "01");
  await mkdir(day, { recursive: true });
  return { file: join(day, FILE_NAME), root, sessions };
}

function record(
  type: string,
  payload: Record<string, unknown>,
  timestamp: number,
): string {
  return JSON.stringify({
    type,
    timestamp: new Date(timestamp).toISOString(),
    payload,
  });
}

async function writeRecords(
  file: string,
  records: readonly string[],
  mtime: number,
): Promise<void> {
  await writeFile(file, `${records.join("\n")}\n`, "utf8");
  await utimes(file, new Date(mtime), new Date(mtime));
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("Codex JSONL monitor", () => {
  it("resolves only the fixed CODEX_HOME sessions directory", async () => {
    const { root } = await createSessionsDirectory();
    expect(resolveCodexSessionsDirectory({ homeDirectory: root })).toBe(
      join(root, ".codex", "sessions"),
    );
    expect(
      resolveCodexSessionsDirectory({
        codexHome: join(root, "custom-codex"),
        homeDirectory: root,
      }),
    ).toBe(join(root, "custom-codex", "sessions"));
    expect(() =>
      resolveCodexSessionsDirectory({ homeDirectory: "relative-home" }),
    ).toThrow("homeDirectory must be an absolute path");
    expect(() =>
      resolveCodexSessionsDirectory({
        codexHome: "relative-codex-home",
        homeDirectory: root,
      }),
    ).toThrow("codexHome must be an absolute path");
  });

  it("backfills one latest allowlisted state without replaying history", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    const privateValue = "PRIVATE-PROMPT-AND-TOOL-DATA";
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          {
            id: SESSION_ID,
            cwd: root,
            originator: "Codex Desktop",
            base_instructions: privateValue,
          },
          now - 4_000,
        ),
        record("event_msg", { type: "task_started" }, now - 3_000),
        record(
          "response_item",
          { type: "function_call", arguments: privateValue },
          now - 2_000,
        ),
        record(
          "response_item",
          { type: "function_call", arguments: privateValue },
          now - 1_000,
        ),
      ],
      now - 500,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });

    await expect(monitor.pollOnce()).resolves.toBe(true);
    expect(events).toEqual([
      expect.objectContaining({
        source: "codex",
        surface: "cli",
        sessionId: SESSION_ID,
        projectPath: root,
        status: "using_tool",
        timestamp: now - 1_000,
      }),
    ]);
    expect(events[0]?.id).toMatch(/^stable:codex-jsonl:[a-f0-9]{24}$/u);
    expect(deriveSessionKey(events[0]!)).toBe(
      deriveSessionKey({
        sessionId: SESSION_ID,
        source: "codex",
        surface: "cli",
      }),
    );
    expect(JSON.stringify(events)).not.toContain(privateValue);
    expect(events[0]).not.toHaveProperty("rawEvent");
    expect(events[0]).not.toHaveProperty("message");
    expect(events[0]).not.toHaveProperty("taskTitle");
    expect(events[0]).not.toHaveProperty("title");
  });

  it("does not replay terminal history as a fresh completion on startup", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 2_000,
        ),
        record("event_msg", { type: "task_started" }, now - 1_000),
        record("event_msg", { type: "task_complete" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });

    await monitor.pollOnce();
    await monitor.replayLatest();
    expect(events).toEqual([]);
  });

  it("tails appended complete lines and waits for a partial line", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 1_000,
        ),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual(["running"]);

    now += 1_000;
    const toolLine = record(
      "response_item",
      { type: "function_call", arguments: "not-forwarded" },
      now,
    );
    await appendFile(file, toolLine, "utf8");
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual(["running"]);

    await appendFile(file, "\n", "utf8");
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual([
      "running",
      "using_tool",
    ]);

    now += 1_000;
    await appendFile(
      file,
      `${record(
        "response_item",
        { type: "function_call_output", output: "not-forwarded" },
        now,
      )}\n`,
      "utf8",
    );
    await monitor.pollOnce();
    now += 1_000;
    await appendFile(
      file,
      `${record("event_msg", { type: "task_complete" }, now)}\n`,
      "utf8",
    );
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual([
      "running",
      "using_tool",
      "running",
      "completed",
    ]);
    expect(JSON.stringify(events)).not.toContain("not-forwarded");
  });

  it("publishes rapid consecutive completed turns and shares notify identity", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    const firstTurnId = "019fbc71-7637-7930-8908-a7f90f2749b7";
    const secondTurnId = "019fbc72-a6dd-7810-8fc6-55104332c71f";
    await writeRecords(
      file,
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    now += 1_000;
    await appendFile(
      file,
      `${record(
        "event_msg",
        { type: "task_complete", turn_id: firstTurnId },
        now,
      )}\n`,
      "utf8",
    );
    await monitor.pollOnce();

    now += 1_000;
    await appendFile(
      file,
      `${record(
        "event_msg",
        { type: "task_started", turn_id: secondTurnId },
        now - 100,
      )}\n${record(
        "event_msg",
        { type: "task_complete", turn_id: secondTurnId },
        now,
      )}\n`,
      "utf8",
    );
    await monitor.pollOnce();

    const completed = events.filter((event) => event.status === "completed");
    expect(completed).toHaveLength(2);
    expect(completed.map((event) => event.id)).toEqual([
      stableCodexTurnEventId(SESSION_ID, firstTurnId),
      stableCodexTurnEventId(SESSION_ID, secondTurnId),
    ]);
  });

  it("preserves split UTF-8, accepts CRLF, and exposes only waiting-input state", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 1_000,
        ),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    now += 1_000;
    const privateQuestion = "请选择不能泄露的问题内容";
    const input = Buffer.from(
      `${record(
        "response_item",
        {
          type: "custom_tool_call",
          name: "request_user_input",
          arguments: privateQuestion,
        },
        now,
      )}\r\n`,
      "utf8",
    );
    const multibyte = Buffer.from("选", "utf8");
    const characterOffset = input.indexOf(multibyte);
    expect(characterOffset).toBeGreaterThan(0);
    const splitAt = characterOffset + 1;
    await appendFile(file, input.subarray(0, splitAt));
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual(["running"]);

    await appendFile(file, input.subarray(splitAt));
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual([
      "running",
      "waiting_input",
    ]);
    expect(JSON.stringify(events)).not.toContain(privateQuestion);
  });

  it("drops an oversized line and resumes at the next valid record", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 1_000,
        ),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    now += 1_000;
    await appendFile(
      file,
      `${"x".repeat(600 * 1_024)}\n${record(
        "event_msg",
        { type: "task_complete" },
        now,
      )}\n`,
      "utf8",
    );
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual([
      "running",
      "completed",
    ]);
  });

  it("tracks multiple rollout files independently", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    const secondSessionId = "019fbc6d-1390-7561-8fbb-080b563c0d5f";
    const secondFile = join(
      sessions,
      "2026",
      "08",
      "01",
      `rollout-2026-08-01T16-24-52-${secondSessionId}.jsonl`,
    );
    await writeRecords(
      file,
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    await writeRecords(
      secondFile,
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record(
          "response_item",
          { type: "custom_tool_call", name: "request_user_input" },
          now,
        ),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });

    await monitor.pollOnce();
    expect(
      events
        .map((event) => [event.sessionId, event.status])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual(
      [
        [SESSION_ID, "running"],
        [secondSessionId, "waiting_input"],
      ].sort(([left], [right]) => left.localeCompare(right)),
    );
  });

  it("keeps a hard cap of fifty sanitized file trackers", async () => {
    const { root, sessions } = await createSessionsDirectory();
    const day = join(sessions, "2026", "08", "01");
    let now = Date.now();
    const rolloutPath = (index: number) => {
      const sessionId = `00000000-0000-4000-8000-${index
        .toString(16)
        .padStart(12, "0")}`;
      return join(
        day,
        `rollout-2026-08-01T16-24-${index
          .toString()
          .padStart(2, "0")}-${sessionId}.jsonl`,
      );
    };
    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        writeRecords(
          rolloutPath(index),
          [
            record("session_meta", { cwd: root }, now - 2_000),
            record("event_msg", { type: "task_started" }, now - 1_000),
          ],
          now - 1_000,
        ),
      ),
    );
    let available = false;
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => {
        if (!available) {
          throw new Error("daemon offline");
        }
        events.push(event);
      },
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    now += 1_000;
    await writeRecords(
      rolloutPath(50),
      [
        record("session_meta", { cwd: root }, now - 100),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    await monitor.pollOnce();

    available = true;
    await monitor.replayLatest();
    expect(events).toHaveLength(50);
  });

  it("ignores stale and non-rollout files", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    const staleTime = now - 10 * 60_000;
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          staleTime,
        ),
        record("event_msg", { type: "task_started" }, staleTime),
      ],
      staleTime,
    );
    await writeFile(join(root, ".codex", "sessions", "private.jsonl"), "{}\n");
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });

    await monitor.pollOnce();
    expect(events).toEqual([]);
  });

  it("retains and replays the latest event after daemon delivery fails", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 1_000,
        ),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    let available = false;
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => {
        if (!available) {
          throw new Error("daemon offline");
        }
        events.push(event);
      },
      sessionsDirectory: sessions,
    });

    await monitor.pollOnce();
    expect(events).toEqual([]);
    available = true;
    await monitor.replayLatest();
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("running");
  });

  it("does not overlap polls and waits for in-flight delivery when stopped", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    await writeRecords(
      file,
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const deliveryEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const deliveryGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: async (event) => {
        entered?.();
        await deliveryGate;
        events.push(event);
      },
      sessionsDirectory: sessions,
    });

    const firstPoll = monitor.pollOnce();
    await deliveryEntered;
    await expect(monitor.pollOnce()).resolves.toBe(false);
    let stopped = false;
    const stop = monitor.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release?.();
    await expect(firstPoll).resolves.toBe(true);
    await stop;
    expect(events).toHaveLength(1);

    now += 1_000;
    await appendFile(
      file,
      `${record("event_msg", { type: "task_complete" }, now)}\n`,
      "utf8",
    );
    await monitor.pollOnce();
    expect(events).toHaveLength(1);
  });

  it("waits for an in-flight reconnect replay when stopped", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    const now = Date.now();
    await writeRecords(
      file,
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    let online = false;
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const deliveryEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const deliveryGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: async () => {
        if (!online) {
          throw new Error("daemon offline");
        }
        entered?.();
        await deliveryGate;
      },
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();
    online = true;

    const replay = monitor.replayLatest();
    await deliveryEntered;
    let stopped = false;
    const stop = monitor.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release?.();
    await replay;
    await stop;
    expect(stopped).toBe(true);
  });

  it("discovers sessions immediately when the fixed directory appears later", async () => {
    const root = await mkdtemp(join(tmpdir(), "crewlight-codex-jsonl-late-"));
    tempRoots.push(root);
    const sessions = join(root, ".codex", "sessions");
    const events: MonitorEvent[] = [];
    const now = Date.now();
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    const day = join(sessions, "2026", "08", "01");
    await mkdir(day, { recursive: true });
    await writeRecords(
      join(day, FILE_NAME),
      [
        record("session_meta", { cwd: root }, now - 1_000),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual(["running"]);
  });

  it("recovers when an active rollout file is truncated and rewritten", async () => {
    const { file, root, sessions } = await createSessionsDirectory();
    let now = Date.now();
    await writeRecords(
      file,
      [
        record(
          "session_meta",
          { cwd: root, originator: "Codex Desktop" },
          now - 1_000,
        ),
        record("event_msg", { type: "task_complete" }, now),
      ],
      now,
    );
    const events: MonitorEvent[] = [];
    const monitor = createCodexJsonlMonitor({
      now: () => now,
      publish: (event) => events.push(event),
      sessionsDirectory: sessions,
    });
    await monitor.pollOnce();

    now += 1_000;
    await writeRecords(
      file,
      [
        record("session_meta", { cwd: root, originator: "Codex Desktop" }, now),
        record("event_msg", { type: "task_started" }, now),
      ],
      now,
    );
    await monitor.pollOnce();
    expect(events.map((event) => event.status)).toEqual(["running"]);
  });
});

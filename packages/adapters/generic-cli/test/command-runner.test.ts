import type { AgentEventInput } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { runCommand } from "../src/index.js";

function captureEvents() {
  const events: AgentEventInput[] = [];
  return {
    events,
    emit: (event: AgentEventInput) => {
      events.push(event);
    },
  };
}

describe("runCommand", () => {
  it("emits running and completed for exit code zero", async () => {
    const capture = captureEvents();
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(capture.events.map(({ status }) => status)).toEqual([
      "running",
      "completed",
    ]);
    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(capture.events[1]?.message).toContain("exitCode=0");
    expect(capture.events[1]?.message).toMatch(/durationMs=\d+/);
  });

  it("emits failed with a non-zero exit code and duration", async () => {
    const capture = captureEvents();
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(capture.events.map(({ status }) => status)).toEqual([
      "running",
      "failed",
    ]);
    expect(result.exitCode).toBe(7);
    expect(capture.events[1]?.message).toContain("exitCode=7");
    expect(capture.events[1]?.message).toMatch(/durationMs=\d+/);
  });

  it("emits failed with a terminating signal", async () => {
    const capture = captureEvents();
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.kill(process.pid, 'SIGTERM')"],
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(result.status).toBe("failed");
    expect(result.signal).toBe("SIGTERM");
    expect(capture.events[1]?.message).toContain("signal=SIGTERM");
    expect(capture.events[1]?.message).toMatch(/durationMs=\d+/);
  });

  it("emits failed for a spawn error without a running event", async () => {
    const capture = captureEvents();
    const result = await runCommand({
      command: `missing-crewlight-command-${Date.now()}`,
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(capture.events.map(({ status }) => status)).toEqual(["failed"]);
    expect(result.spawnError).toBeTruthy();
    expect(capture.events[0]?.message).toContain("spawnError=");
    expect(capture.events[0]?.message).toContain("exitCode=unavailable");
    expect(capture.events[0]?.message).toMatch(/durationMs=\d+/);
  });

  it("does not block the command when event delivery fails", async () => {
    const errors: unknown[] = [];
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      emit: () => {
        throw new Error("daemon unavailable");
      },
      onEmitError: (error) => errors.push(error),
      stdio: "ignore",
    });

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(errors).toHaveLength(2);
  });

  it("creates a unique external session id for each run", async () => {
    const first = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      emit: () => {},
      stdio: "ignore",
    });
    const second = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      emit: () => {},
      stdio: "ignore",
    });

    expect(first.sessionId).toMatch(/^generic-cli:/);
    expect(first.sessionId).not.toBe(second.sessionId);
  });
});

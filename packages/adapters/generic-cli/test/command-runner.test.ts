import type { AgentEventInput } from "@crewlight/core";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveWindowsCommandInvocation, runCommand } from "../src/index.js";

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
  it("uses cmd.exe only for Windows batch shims with ordinary argv", () => {
    const invocation = resolveWindowsCommandInvocation(
      "pnpm",
      ["--filter", "name with spaces", "[workspace]"],
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      () => "C:\\Program Files\\nodejs\\pnpm.cmd",
    );

    expect(invocation.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(invocation.args.slice(0, 4)).toEqual(["/d", "/s", "/v:off", "/c"]);
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args[4]).toContain("pnpm.cmd");
  });

  it("keeps Windows executables on the shell-free spawn path", () => {
    expect(
      resolveWindowsCommandInvocation(
        "node",
        ["--version"],
        {},
        () => "C:\\Program Files\\nodejs\\node.exe",
      ),
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["--version"],
    });
  });

  it.each([
    String.raw`x\" & echo CREWLIGHT_INJECTION & rem "`,
    "%PATH%",
    "!CREWLIGHT_TEST!",
    "left|right",
    "safe\r\nnext",
    "nul\0value",
  ])(
    "rejects unsafe Windows batch argument %j before invoking cmd.exe",
    (argument) => {
      expect(() =>
        resolveWindowsCommandInvocation(
          "tool.cmd",
          [argument],
          {},
          () => "C:\\Tools\\tool.cmd",
        ),
      ).toThrow("shell metacharacters or line breaks");
    },
  );

  it.runIf(process.platform === "win32")(
    "preserves hostile arguments when resolving a bare batch command from the supplied PATH",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "crewlight-cmd-test-"));
      const scriptPath = join(directory, "capture.mjs");
      const shimDirectory = join(
        directory,
        "tool & %CREWLIGHT_TEST% with spaces",
      );
      const commandPath = join(shimDirectory, "capture-tool.cmd");
      const expectedArgs = [
        "plain",
        "space value",
        "comma,value",
        "star*value",
        "[brackets]",
        "C:\\path with spaces\\file.txt",
      ];
      await mkdir(shimDirectory);
      await writeFile(
        scriptPath,
        "console.log(JSON.stringify(process.argv.slice(2)));\n",
        "utf8",
      );
      await writeFile(
        commandPath,
        ["@echo off", `"${process.execPath}" "${scriptPath}" %*`, ""].join(
          "\r\n",
        ),
        "utf8",
      );
      const env = {
        ...process.env,
        CREWLIGHT_TEST: "must-not-expand",
        PATH: shimDirectory,
        Path: shimDirectory,
        PATHEXT: ".COM;.EXE;.BAT;.CMD",
      };

      try {
        const invocation = resolveWindowsCommandInvocation(
          "capture-tool",
          expectedArgs,
          env,
        );
        const result = spawnSync(invocation.command, invocation.args, {
          encoding: "utf8",
          env,
          windowsVerbatimArguments: invocation.windowsVerbatimArguments,
          windowsHide: true,
        });

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout.trim())).toEqual(expectedArgs);
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "resolves a batch shim from the requested cwd and preserves its non-zero exit",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "crewlight-cwd-cmd-test-"),
      );
      const commandPath = join(directory, "cwd-only-tool.bat");
      const capture = captureEvents();
      await writeFile(commandPath, "@echo off\r\nexit /b 7\r\n", "utf8");

      try {
        const result = await runCommand({
          command: "cwd-only-tool",
          cwd: directory,
          emit: capture.emit,
          env: {
            ...process.env,
            PATH: "",
            Path: "",
            PATHEXT: ".COM;.EXE;.BAT;.CMD",
          },
          stdio: "ignore",
        });

        expect(result).toMatchObject({
          exitCode: 7,
          signal: null,
          status: "failed",
        });
        expect(capture.events.map(({ status }) => status)).toEqual([
          "running",
          "failed",
        ]);
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "classifies rejected batch arguments without starting a child",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "crewlight-unsafe-cmd-test-"),
      );
      const commandPath = join(directory, "unsafe-tool.cmd");
      const capture = captureEvents();
      await writeFile(commandPath, "@echo off\r\nexit /b 0\r\n", "utf8");

      try {
        const result = await runCommand({
          command: commandPath,
          args: ["left&right"],
          emit: capture.emit,
          stdio: "ignore",
        });

        expect(result).toMatchObject({
          exitCode: null,
          signal: null,
          startFailure: "unsafe-windows-batch-argument",
          status: "failed",
        });
        expect(capture.events.map(({ status }) => status)).toEqual(["failed"]);
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );

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

  it("emits failed when the child terminates itself", async () => {
    const capture = captureEvents();
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.kill(process.pid, 'SIGTERM')"],
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(result.status).toBe("failed");
    if (process.platform === "win32") {
      expect(result.signal).toBeNull();
      expect(capture.events[1]?.message).toContain("exitCode=");
    } else {
      expect(result.signal).toBe("SIGTERM");
      expect(capture.events[1]?.message).toContain("signal=SIGTERM");
    }
    expect(capture.events[1]?.message).toMatch(/durationMs=\d+/);
  });

  it("emits failed for a spawn error without a running event", async () => {
    const capture = captureEvents();
    const missingCommand = `missing-crewlight-command-${Date.now()}`;
    const result = await runCommand({
      command: missingCommand,
      emit: capture.emit,
      stdio: "ignore",
    });

    expect(capture.events.map(({ status }) => status)).toEqual(["failed"]);
    expect(result.spawnError).toBeTruthy();
    expect(capture.events[0]?.message).toContain("spawnError=");
    expect(capture.events[0]?.message).toContain("exitCode=unavailable");
    expect(capture.events[0]?.message).toMatch(/durationMs=\d+/);
    expect(JSON.stringify(capture.events)).not.toContain(missingCommand);
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

  it("contains failures from the event-error reporter", async () => {
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      emit: () => {
        throw new Error("daemon unavailable");
      },
      onEmitError: () => {
        throw new Error("reporter unavailable");
      },
      stdio: "ignore",
    });

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
  });

  it("does not copy the wrapped command or its arguments into events", async () => {
    const capture = captureEvents();
    const secret = "crewlight-secret-token";

    await runCommand({
      command: process.execPath,
      args: ["-e", "process.exit(0)", "--", "--token", secret],
      emit: capture.emit,
      stdio: "ignore",
    });

    const serialized = JSON.stringify(capture.events);
    expect(serialized).not.toContain(process.execPath);
    expect(serialized).not.toContain("process.exit(0)");
    expect(serialized).not.toContain("--token");
    expect(serialized).not.toContain(secret);
    expect(capture.events.map(({ message }) => message)).toEqual([
      "Command started",
      expect.stringMatching(/^Command completed; exitCode=0; durationMs=\d+$/u),
    ]);
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

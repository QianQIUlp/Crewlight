import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { win32 } from "node:path";

const [action, ...args] = process.argv.slice(2);

if (action === "start") {
  const [binary, pidFile, stdoutPath, stderrPath, ...daemonArgs] = args;
  if (!binary || !pidFile || !stdoutPath || !stderrPath) {
    throw new Error("Missing Windows daemon start arguments.");
  }

  const stdout = openSync(stdoutPath, "a");
  const stderr = openSync(stderrPath, "a");
  const child = spawn(binary, daemonArgs, {
    detached: true,
    env: process.env,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  child.unref();
  closeSync(stdout);
  closeSync(stderr);
  writeFileSync(pidFile, `${child.pid}\n`);
  process.exit(0);
}

if (action === "stop") {
  const [pidFile] = args;
  if (!pidFile) {
    throw new Error("Missing Windows daemon pid file.");
  }
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error("Invalid Windows daemon pid.");
  }

  const taskkill = win32.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "taskkill.exe",
  );
  const stopped = spawnSync(taskkill, ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  if (stopped.status !== 0) {
    try {
      process.kill(pid, 0);
      process.exit(2);
    } catch {
      process.exit(0);
    }
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      process.exit(0);
    }
  }
  process.exit(3);
}

if (action === "managed-smoke") {
  const [binary, stdoutPath, stderrPath, ...daemonArgs] = args;
  if (!binary || !stdoutPath || !stderrPath) {
    throw new Error("Missing Windows managed daemon smoke arguments.");
  }

  let stdout = "";
  let stderr = "";
  let ready = false;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const child = spawn(binary, [...daemonArgs, "--managed-stdio"], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    appendFileSync(stdoutPath, chunk, "utf8");
    if (!ready && stdout.includes("Crewlight daemon listening at ")) {
      ready = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    appendFileSync(stderrPath, chunk, "utf8");
  });
  child.stdin.on("error", (error) => {
    if (!ready) {
      rejectReady(error);
    }
  });
  child.once("error", rejectReady);
  child.once("exit", (code, signal) => {
    if (!ready) {
      rejectReady(
        new Error(
          `Managed daemon exited before readiness (code=${String(code)}, signal=${String(signal)}).`,
        ),
      );
    }
  });

  const timeout = (promise, milliseconds, message) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);

  try {
    await timeout(
      readyPromise,
      10_000,
      "Managed daemon did not report readiness.",
    );
    child.stdin.write("shutdown\n", "utf8");
    child.stdin.end();
    const exit = await timeout(
      new Promise((resolve) =>
        child.once("exit", (code, signal) => resolve({ code, signal })),
      ),
      10_000,
      "Managed daemon did not exit after the shutdown command.",
    );
    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(
        `Managed daemon shutdown was not clean (code=${String(exit.code)}, signal=${String(exit.signal)}).`,
      );
    }
    if (!stdout.includes("Crewlight daemon stopped")) {
      throw new Error("Managed daemon did not confirm graceful shutdown.");
    }
    process.exit(0);
  } catch (error) {
    try {
      child.kill("SIGKILL");
    } catch {
      // The child may already be gone.
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} stderr=${stderr.slice(0, 500)}`,
    );
  }
}

throw new Error(`Unsupported Windows daemon control action: ${String(action)}`);

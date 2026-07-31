import { execFileSync } from "node:child_process";
import { win32 } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  throw new Error("The Windows standalone smoke test requires Windows.");
}

const root = fileURLToPath(new URL("..", import.meta.url));
const powershell = win32.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

function normalizedWindowsEnvironment(environment) {
  const entries = Object.entries(environment).filter(
    (entry) => entry[1] !== undefined,
  );
  entries.sort(([left], [right]) => {
    const leftUppercase = left === left.toUpperCase();
    const rightUppercase = right === right.toUpperCase();
    return Number(leftUppercase) - Number(rightUppercase);
  });
  return Object.fromEntries(
    entries.map(([key, value]) => [key.toUpperCase(), value]),
  );
}

execFileSync(
  powershell,
  [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    win32.join(root, "scripts", "smoke-standalone.ps1"),
  ],
  {
    cwd: root,
    env: {
      ...normalizedWindowsEnvironment(process.env),
      CREWLIGHT_NODE_HARNESS: process.execPath,
      CREWLIGHT_PROCESS_RUNNER: fileURLToPath(
        new URL("./windows-process-runner.mjs", import.meta.url),
      ),
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

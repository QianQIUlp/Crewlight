import { spawnSync } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";

if (process.platform !== "win32") {
  throw new Error("The exact Windows process runner requires Windows.");
}

const encodedPayload = process.argv[2];
if (!encodedPayload) {
  throw new Error("Missing Windows process runner payload.");
}

const payload = JSON.parse(
  Buffer.from(encodedPayload, "base64").toString("utf8"),
);
if (
  typeof payload !== "object" ||
  payload === null ||
  typeof payload.file !== "string" ||
  !Array.isArray(payload.args) ||
  !payload.args.every((value) => typeof value === "string") ||
  typeof payload.stdout !== "string" ||
  typeof payload.stderr !== "string" ||
  (payload.stdin !== undefined && typeof payload.stdin !== "string")
) {
  throw new Error("Invalid Windows process runner payload.");
}

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

const stdin = payload.stdin ? openSync(payload.stdin, "r") : undefined;
const stdout = openSync(payload.stdout, "w");
const stderr = openSync(payload.stderr, "w");
let result;
try {
  result = spawnSync(payload.file, payload.args, {
    env: normalizedWindowsEnvironment(process.env),
    stdio: [stdin ?? "ignore", stdout, stderr],
    windowsHide: true,
  });
} finally {
  if (stdin !== undefined) {
    closeSync(stdin);
  }
  closeSync(stdout);
  closeSync(stderr);
}

if (result.error) {
  writeFileSync(
    payload.stderr,
    "The Windows smoke process could not be started.\n",
    "utf8",
  );
  process.exit(127);
}
process.exit(result.status ?? 128);

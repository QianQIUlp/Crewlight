import { appendFileSync, mkdirSync, type MakeDirectoryOptions } from "node:fs";
import { join } from "node:path";

export interface FatalLogLocations {
  directories: string[];
  redactPaths: string[];
}

export interface FatalLogRuntime {
  appendFile(path: string, data: string, encoding: BufferEncoding): void;
  mkdir(path: string, options: MakeDirectoryOptions): void;
  now(): Date;
  report(message: string): void;
}

const defaultRuntime: FatalLogRuntime = {
  appendFile: (path, data, encoding) => appendFileSync(path, data, encoding),
  mkdir: (path, options) => {
    mkdirSync(path, options);
  },
  now: () => new Date(),
  report: (message) => console.error(message),
};

export function resolveFatalLogLocations(
  getAppPath: (name: "home" | "userData") => string,
  tempDirectory: string,
  additionalRedactPaths: readonly string[] = [],
): FatalLogLocations {
  const directories: string[] = [];
  const discoveredPaths: string[] = [];
  for (const name of ["userData", "home"] as const) {
    try {
      const directory = getAppPath(name);
      if (directory && !directories.includes(directory)) {
        directories.push(directory);
        discoveredPaths.push(directory);
      }
    } catch {
      // Electron path discovery can fail during startup. Try the other
      // independent location before falling back to the system temp folder.
    }
  }
  const fallbackDirectory = join(tempDirectory, "Crewlight");
  if (!directories.includes(fallbackDirectory)) {
    directories.push(fallbackDirectory);
  }
  return {
    directories,
    redactPaths: [
      ...discoveredPaths,
      tempDirectory,
      ...additionalRedactPaths,
    ].filter(Boolean),
  };
}

const MAX_FATAL_DETAIL_LENGTH = 8_192;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sanitizeFatalDetail(
  error: unknown,
  redactPaths: readonly string[],
): string {
  let detail =
    error instanceof Error
      ? error.stack || `${error.name}: ${error.message}`
      : `Unhandled ${typeof error} rejection (detail omitted)`;

  detail = detail
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "?")
    .replace(
      /\b(token|secret|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu,
      "$1=<redacted>",
    );
  const variants = redactPaths
    .flatMap((path) => [path, path.replace(/\\/gu, "/")])
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const path of new Set(variants)) {
    detail = detail.replace(
      new RegExp(escapeRegExp(path), "giu"),
      "<redacted-path>",
    );
  }
  return detail.slice(0, MAX_FATAL_DETAIL_LENGTH);
}

export function writeFatalErrorLog(
  error: unknown,
  locations: FatalLogLocations,
  runtime: FatalLogRuntime = defaultRuntime,
): string[] {
  const detail = sanitizeFatalDetail(error, locations.redactPaths);
  const message = `[${runtime.now().toISOString()}] Fatal Startup Error:\n${detail}\n\n`;
  const writtenPaths: string[] = [];

  const writeTo = (directory: string): boolean => {
    try {
      runtime.mkdir(directory, { recursive: true });
      const logPath = join(directory, "crewlight-error.log");
      runtime.appendFile(logPath, message, "utf8");
      writtenPaths.push(logPath);
      return true;
    } catch {
      return false;
    }
  };

  for (const directory of locations.directories) {
    if (writeTo(directory)) {
      break;
    }
  }
  if (writtenPaths.length === 0) {
    runtime.report(`Crewlight fatal startup error:\n${detail}`);
  }

  return writtenPaths;
}

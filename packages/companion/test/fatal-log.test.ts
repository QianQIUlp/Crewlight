import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  resolveFatalLogLocations,
  writeFatalErrorLog,
  type FatalLogRuntime,
} from "../src/fatal-log.js";

function runtime(overrides: Partial<FatalLogRuntime> = {}): FatalLogRuntime {
  return {
    appendFile: vi.fn(),
    mkdir: vi.fn(),
    now: () => new Date("2026-07-30T12:00:00.000Z"),
    report: vi.fn(),
    ...overrides,
  };
}

describe("fatal startup logging", () => {
  it("discovers home and userData independently", () => {
    const getPath = vi.fn((name: "home" | "userData") => {
      if (name === "home") {
        throw new Error("home unavailable");
      }
      return "C:\\Users\\demo\\AppData\\Roaming\\Crewlight";
    });

    expect(resolveFatalLogLocations(getPath, "C:\\Temp")).toEqual({
      directories: [
        "C:\\Users\\demo\\AppData\\Roaming\\Crewlight",
        join("C:\\Temp", "Crewlight"),
      ],
      redactPaths: ["C:\\Users\\demo\\AppData\\Roaming\\Crewlight", "C:\\Temp"],
    });
    expect(getPath).toHaveBeenCalledTimes(2);
  });

  it("continues to the next private location when the preferred write fails", () => {
    const appendFile = vi.fn((path: string) => {
      if (!path.includes("AppData")) {
        throw new Error("preferred location denied");
      }
    });
    const testRuntime = runtime({ appendFile });

    const written = writeFatalErrorLog(
      new Error("startup exploded"),
      {
        directories: [
          "C:\\Users\\demo",
          "C:\\Users\\demo\\AppData\\Roaming\\Crewlight",
          "C:\\Temp\\Crewlight",
        ],
        redactPaths: ["C:\\Users\\demo", "C:\\Temp"],
      },
      testRuntime,
    );

    expect(written).toEqual([
      join(
        "C:\\Users\\demo\\AppData\\Roaming\\Crewlight",
        "crewlight-error.log",
      ),
    ]);
    expect(appendFile).toHaveBeenCalledTimes(2);
    expect(testRuntime.report).not.toHaveBeenCalled();
  });

  it("falls back to temp and finally stderr without losing the fatal detail", () => {
    const tempRuntime = runtime({
      appendFile: vi.fn((path: string) => {
        if (!path.startsWith("C:\\Temp\\")) {
          throw new Error("primary denied");
        }
      }),
    });
    expect(
      writeFatalErrorLog(
        "original fatal detail",
        {
          directories: ["C:\\Denied", "C:\\Temp\\Crewlight"],
          redactPaths: ["C:\\Temp"],
        },
        tempRuntime,
      ),
    ).toEqual([join("C:\\Temp\\Crewlight", "crewlight-error.log")]);

    const failedRuntime = runtime({
      appendFile: vi.fn(() => {
        throw new Error("all denied");
      }),
    });
    expect(
      writeFatalErrorLog(
        new Error("original fatal detail"),
        {
          directories: ["C:\\Denied", "C:\\AlsoDenied"],
          redactPaths: [],
        },
        failedRuntime,
      ),
    ).toEqual([]);
    expect(failedRuntime.report).toHaveBeenCalledWith(
      expect.stringContaining("original fatal detail"),
    );
  });

  it("bounds and redacts persisted fatal details", () => {
    const appendFile = vi.fn();
    const testRuntime = runtime({ appendFile });

    writeFatalErrorLog(
      new Error(
        `failed at C:\\Users\\alice\\.ssh\\id_ed25519 token=super-secret-value\u001b[31m ${"x".repeat(20_000)}`,
      ),
      {
        directories: ["C:\\AppData\\Crewlight"],
        redactPaths: ["C:\\Users\\alice"],
      },
      testRuntime,
    );

    const persisted = String(appendFile.mock.calls[0]?.[1]);
    expect(persisted).toContain("<redacted-path>");
    expect(persisted).toContain("token=<redacted>");
    expect(persisted).not.toContain("super-secret-value");
    expect(persisted).not.toContain("\u001b");
    expect(persisted.length).toBeLessThan(8_400);
    expect(appendFile).toHaveBeenCalledOnce();
  });

  it("does not stringify arbitrary non-Error rejection values", () => {
    const appendFile = vi.fn();
    writeFatalErrorLog(
      { secret: "must-not-persist" },
      { directories: ["C:\\AppData\\Crewlight"], redactPaths: [] },
      runtime({ appendFile }),
    );

    const persisted = String(appendFile.mock.calls[0]?.[1]);
    expect(persisted).toContain("detail omitted");
    expect(persisted).not.toContain("must-not-persist");
  });
});

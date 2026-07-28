import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { CrewlightClient } from "../src/daemon-client.js";
import { executeIngestCommand } from "../src/commands/ingest.js";
import {
  MAX_STDIN_BYTES,
  readStdin,
  STDIN_READ_TIMEOUT_MS,
} from "../src/commands/types.js";

describe("readStdin", () => {
  it("reads bounded UTF-8 input", async () => {
    const input = Readable.from([Buffer.from("hello "), Buffer.from("世界")]);

    await expect(
      readStdin(input, { maxBytes: 64, timeoutMs: 100 }),
    ).resolves.toBe("hello 世界");
  });

  it("rejects input beyond the byte cap", async () => {
    const input = Readable.from([Buffer.alloc(5), Buffer.alloc(5)]);

    await expect(
      readStdin(input, { maxBytes: 8, timeoutMs: 100 }),
    ).rejects.toThrow(/maximum supported size/iu);
  });

  it("rejects input that never reaches EOF within the deadline", async () => {
    const input = new Readable({
      read() {
        // Deliberately keep the stream open without producing data.
      },
    });

    await expect(
      readStdin(input, { maxBytes: 8, timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/iu);
  });

  it("exports finite production safety bounds", () => {
    expect(MAX_STDIN_BYTES).toBeGreaterThan(0);
    expect(MAX_STDIN_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(STDIN_READ_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STDIN_READ_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("turns bounded-reader failures into a safe non-blocking hook warning", async () => {
    const output: string[] = [];
    const warnings: string[] = [];
    const client: CrewlightClient = {
      emit: async () => {
        throw new Error("event delivery must not be attempted");
      },
      sessions: async () => [],
    };

    const code = await executeIngestCommand(
      ["gemini-cli"],
      client,
      {
        write: (message) => output.push(message),
        warn: (message) => warnings.push(message),
      },
      () =>
        readStdin(Readable.from([Buffer.alloc(9)]), {
          maxBytes: 8,
          timeoutMs: 100,
        }),
    );

    expect(code).toBe(0);
    expect(output).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unable to read platform input");
    expect(warnings.join("\n")).not.toContain("maximum supported size");
  });
});

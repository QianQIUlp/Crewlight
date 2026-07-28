import { addAbortSignal, type Readable } from "node:stream";

export interface CommandIo {
  write(message: string): void;
  warn(message: string): void;
}

export type StdinReader = () => Promise<string>;

export const MAX_STDIN_BYTES = 1024 * 1024;
export const STDIN_READ_TIMEOUT_MS = 2_000;

export interface StdinReadOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

export const consoleIo: CommandIo = {
  write: console.log,
  warn: console.error,
};

export async function readStdin(
  input: Readable = process.stdin,
  options: StdinReadOptions = {},
): Promise<string> {
  const maxBytes = positiveLimit(
    options.maxBytes ?? MAX_STDIN_BYTES,
    "Platform input byte limit",
  );
  const timeoutMs = positiveLimit(
    options.timeoutMs ?? STDIN_READ_TIMEOUT_MS,
    "Platform input timeout",
  );
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const boundedInput = addAbortSignal(controller.signal, input);

  try {
    for await (const chunk of boundedInput) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new Error(
          `Platform input exceeds the maximum supported size of ${maxBytes} bytes.`,
        );
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Timed out while reading platform input after ${timeoutMs}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return Buffer.concat(chunks).toString("utf8");
}

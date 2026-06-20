export interface CommandIo {
  write(message: string): void;
  warn(message: string): void;
}

export type StdinReader = () => Promise<string>;

export const consoleIo: CommandIo = {
  write: console.log,
  warn: console.error,
};

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

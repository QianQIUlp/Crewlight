export interface CommandIo {
  write(message: string): void;
  warn(message: string): void;
}

export const consoleIo: CommandIo = {
  write: console.log,
  warn: console.error,
};

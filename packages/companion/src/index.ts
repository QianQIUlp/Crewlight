import { app } from "electron";
import { tmpdir } from "node:os";

import { resolveFatalLogLocations, writeFatalErrorLog } from "./fatal-log.js";

function logFatalError(error: unknown): void {
  const locations = resolveFatalLogLocations(
    (name) => app.getPath(name),
    tmpdir(),
    [process.execPath, process.resourcesPath],
  );
  writeFatalErrorLog(error, locations);
}

function exitAfterFatalError(): void {
  process.exitCode = 1;
  app.exit(1);
}

process.on("uncaughtException", (error) => {
  logFatalError(error);
  exitAfterFatalError();
});

process.on("unhandledRejection", (reason) => {
  logFatalError(reason);
  exitAfterFatalError();
});

// Dynamically import the main application module so that any import/syntax
// errors during its resolution are caught by the handlers registered above.
import("./main.js").catch((error) => {
  logFatalError(error);
  exitAfterFatalError();
});

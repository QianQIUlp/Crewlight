import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function logFatalError(error: unknown): void {
  try {
    const homeLogPath = path.join(app.getPath("home"), "crewlight-error.log");
    const message = `[${new Date().toISOString()}] Fatal Startup Error:\n${
      error instanceof Error ? error.stack || error.message : String(error)
    }\n\n`;

    fs.appendFileSync(homeLogPath, message, "utf8");

    const userDataPath = app.getPath("userData");
    if (userDataPath) {
      fs.mkdirSync(userDataPath, { recursive: true });
      const appDataLogPath = path.join(userDataPath, "crewlight-error.log");
      fs.appendFileSync(appDataLogPath, message, "utf8");
    }
  } catch (err) {
    console.error("Failed to write fatal error log:", err);
  }
}

process.on("uncaughtException", (error) => {
  logFatalError(error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  logFatalError(reason);
  app.quit();
});

// Dynamically import the main application module so that any import/syntax
// errors during its resolution are caught by the handlers registered above.
import("./main.js").catch((error) => {
  logFatalError(error);
  app.quit();
});

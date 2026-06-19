import { ConsoleNotifier, type ConsoleWriter } from "./console-notifier.js";
import { NoopNotifier } from "./noop-notifier.js";
import type { Notifier } from "./notifier.js";
import type { NotifierKind } from "./notifier-kind.js";
import {
  OsNotifier,
  type OsNotifierModuleLoader,
  type OsNotifierWarningWriter,
} from "./os-notifier.js";

export interface CreateNotifierOptions {
  consoleWriter?: ConsoleWriter;
  osLoader?: OsNotifierModuleLoader;
  osTimeoutMs?: number;
  warning?: OsNotifierWarningWriter;
}

export function createNotifier(
  kind: NotifierKind,
  options: CreateNotifierOptions = {},
): Notifier {
  switch (kind) {
    case "console":
      return new ConsoleNotifier(options.consoleWriter);
    case "os":
      return new OsNotifier({
        ...(options.osLoader ? { loader: options.osLoader } : {}),
        ...(options.osTimeoutMs !== undefined
          ? { timeoutMs: options.osTimeoutMs }
          : {}),
        ...(options.warning ? { warning: options.warning } : {}),
      });
    case "none":
      return new NoopNotifier();
  }
}

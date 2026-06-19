import type { Notifier } from "./notifier.js";

export class NoopNotifier implements Notifier {
  notify(): void {}
}

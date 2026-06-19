import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { AgentEventInput } from "./types.js";

type SessionIdentity = Pick<
  AgentEventInput,
  "projectPath" | "sessionId" | "source" | "surface"
>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function normalizeProjectPath(projectPath: string): string {
  return resolve(projectPath);
}

export function deriveSessionKey(identity: SessionIdentity): string {
  if (identity.sessionId) {
    const value = [
      "session",
      identity.source,
      identity.surface,
      identity.sessionId,
    ].join("\0");
    return `session:${digest(value)}`;
  }

  if (identity.projectPath) {
    const value = [
      "project",
      identity.source,
      identity.surface,
      normalizeProjectPath(identity.projectPath),
    ].join("\0");
    return `project:${digest(value)}`;
  }

  return `temporary:${randomUUID()}`;
}

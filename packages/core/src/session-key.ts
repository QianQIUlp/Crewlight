import { createHash, randomUUID } from "node:crypto";
import { posix, resolve, win32 } from "node:path";

import type { AgentEventInput } from "./types.js";

type SessionIdentity = Pick<
  AgentEventInput,
  "projectPath" | "remoteAlias" | "sessionId" | "source" | "surface"
>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizeRemoteProjectPath(projectPath: string): string {
  const looksLikeWindowsPath =
    /^[A-Za-z]:[\\/]/u.test(projectPath) || projectPath.startsWith("\\\\");

  if (looksLikeWindowsPath || projectPath.includes("\\")) {
    return win32.normalize(projectPath);
  }

  return posix.normalize(projectPath);
}

function normalizeProjectPathForIdentity(
  projectPath: string,
  remoteAlias?: string,
): string {
  const normalized = normalizeProjectPath(projectPath, remoteAlias);
  const usesWindowsPathSemantics = remoteAlias
    ? /^[A-Za-z]:[\\/]/u.test(projectPath) ||
      projectPath.startsWith("\\\\") ||
      projectPath.includes("\\")
    : process.platform === "win32";

  return usesWindowsPathSemantics ? normalized.toLowerCase() : normalized;
}

export function normalizeProjectPath(
  projectPath: string,
  remoteAlias?: string,
): string {
  if (remoteAlias) {
    return normalizeRemoteProjectPath(projectPath);
  }

  return resolve(projectPath);
}

export function deriveSessionKey(identity: SessionIdentity): string {
  if (identity.sessionId) {
    if (identity.remoteAlias) {
      const value = JSON.stringify([
        "remote-session",
        identity.remoteAlias,
        identity.source,
        identity.surface,
        identity.sessionId,
      ]);
      return `session:${digest(value)}`;
    }

    const value = [
      "session",
      identity.source,
      identity.surface,
      identity.sessionId,
    ].join("\0");
    return `session:${digest(value)}`;
  }

  if (identity.projectPath) {
    if (identity.remoteAlias) {
      const value = JSON.stringify([
        "remote-project",
        identity.remoteAlias,
        identity.source,
        identity.surface,
        normalizeProjectPathForIdentity(
          identity.projectPath,
          identity.remoteAlias,
        ),
      ]);
      return `project:${digest(value)}`;
    }

    const value = [
      "project",
      identity.source,
      identity.surface,
      normalizeProjectPathForIdentity(identity.projectPath),
    ].join("\0");
    return `project:${digest(value)}`;
  }

  return `temporary:${randomUUID()}`;
}

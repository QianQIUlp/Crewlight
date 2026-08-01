import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface KnownHostEntry {
  hostPatterns: string[];
  key: Buffer;
  keyType: string;
  marker?: string;
}

export type KnownHostVerification =
  | { ok: true }
  | { ok: false; reason: "changed" | "unknown" };

function decodeBase64(value: string): Buffer | undefined {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 ? decoded : undefined;
}

export function parseKnownHosts(content: string): KnownHostEntry[] {
  const entries: KnownHostEntry[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split(/\s+/u);
    const marker = fields[0]?.startsWith("@") ? fields.shift() : undefined;
    const hosts = fields[0];
    const keyType = fields[1];
    const encodedKey = fields[2];
    if (!hosts || !keyType || !encodedKey) {
      continue;
    }
    const key = decodeBase64(encodedKey);
    if (!key) {
      continue;
    }

    entries.push({
      hostPatterns: hosts.split(",").filter(Boolean),
      key,
      keyType,
      ...(marker ? { marker } : {}),
    });
  }
  return entries;
}

export function loadKnownHosts(
  filePath = join(homedir(), ".ssh", "known_hosts"),
): KnownHostEntry[] {
  try {
    return parseKnownHosts(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function equalBuffers(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function matchesHashedHost(pattern: string, candidate: string): boolean {
  const fields = pattern.split("|");
  if (fields.length !== 4 || fields[0] !== "" || fields[1] !== "1") {
    return false;
  }
  const salt = decodeBase64(fields[2] ?? "");
  const expected = decodeBase64(fields[3] ?? "");
  if (!salt || !expected) {
    return false;
  }
  const actual = createHmac("sha1", salt).update(candidate).digest();
  return equalBuffers(actual, expected);
}

function globExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  return new RegExp(
    `^${escaped.replace(/\*/gu, ".*").replace(/\\\?/gu, ".")}$`,
    "iu",
  );
}

function matchesHostPattern(pattern: string, candidate: string): boolean {
  return pattern.startsWith("|1|")
    ? matchesHashedHost(pattern, candidate)
    : globExpression(pattern).test(candidate);
}

function entryMatchesHost(
  entry: KnownHostEntry,
  candidates: readonly string[],
): boolean {
  let positiveMatch = false;
  for (const rawPattern of entry.hostPatterns) {
    const negated = rawPattern.startsWith("!");
    const pattern = negated ? rawPattern.slice(1) : rawPattern;
    const matches = candidates.some((candidate) =>
      matchesHostPattern(pattern, candidate),
    );
    if (negated && matches) {
      return false;
    }
    positiveMatch ||= !negated && matches;
  }
  return positiveMatch;
}

export function knownHostCandidates(hostname: string, port: number): string[] {
  return [port === 22 ? hostname : `[${hostname}]:${port}`];
}

export function verifyKnownHostKey(
  entries: readonly KnownHostEntry[],
  candidates: readonly string[],
  key: Buffer,
): KnownHostVerification {
  const matchingEntries = entries.filter((entry) =>
    entryMatchesHost(entry, candidates),
  );
  for (const entry of matchingEntries) {
    if (entry.marker === "@revoked" && equalBuffers(entry.key, key)) {
      return { ok: false, reason: "changed" };
    }
  }
  for (const entry of matchingEntries) {
    if (entry.marker !== undefined) {
      continue;
    }
    if (equalBuffers(entry.key, key)) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason: matchingEntries.length > 0 ? "changed" : "unknown",
  };
}

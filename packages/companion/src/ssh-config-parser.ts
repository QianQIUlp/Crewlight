import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface SshConfigHost {
  alias: string;
  hostname?: string;
  user?: string;
  port?: number;
  identityFile?: string;
}

export async function parseCrewlightRemoteHosts(
  configPath?: string,
): Promise<SshConfigHost[]> {
  const path = configPath ?? join(homedir(), ".ssh", "config");
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/u);
  const hosts: SshConfigHost[] = [];
  let pendingMarker = false;
  let currentMarked = false;
  let currentHost: SshConfigHost | null = null;

  const appendCurrentHost = () => {
    if (currentHost && currentMarked) {
      hosts.push(currentHost);
    }
    currentHost = null;
    currentMarked = false;
  };

  const cleanValue = (value: string): string => {
    const trimmed = value.trim();
    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  const resolveIdentityFile = (value: string): string => {
    let identityFile = cleanValue(value).replace(/%d/gu, homedir());
    if (identityFile === "~") {
      return homedir();
    }
    if (identityFile.startsWith("~/")) {
      return join(homedir(), identityFile.slice(2));
    }
    if (!isAbsolute(identityFile)) {
      identityFile = resolve(dirname(path), identityFile);
    }
    return identityFile;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("#")) {
      const commentContent = trimmed.slice(1).trim();
      if (/^CrewlightRemote:\s*yes$/i.test(commentContent)) {
        if (currentHost && /^\s/u.test(line)) {
          currentMarked = true;
        } else {
          pendingMarker = true;
        }
      }
      continue;
    }

    const tokens = trimmed.split(/\s+/u);
    const key = (tokens[0] || "").toLowerCase();
    const value = tokens.slice(1).join(" ");

    if (key === "host") {
      appendCurrentHost();
      currentHost = {
        alias: value.split(/\s+/u)[0] || "unknown",
      };
      currentMarked = pendingMarker;
      pendingMarker = false;
    } else if (currentHost) {
      if (key === "hostname") {
        currentHost.hostname = cleanValue(value);
      } else if (key === "user") {
        currentHost.user = cleanValue(value);
      } else if (key === "port") {
        const parsedPort = Number(value);
        if (
          Number.isInteger(parsedPort) &&
          parsedPort >= 1 &&
          parsedPort <= 65_535
        ) {
          currentHost.port = parsedPort;
        }
      } else if (key === "identityfile") {
        currentHost.identityFile = resolveIdentityFile(value);
      }
    }
  }

  appendCurrentHost();

  return hosts;
}

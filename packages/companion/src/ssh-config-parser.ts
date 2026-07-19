import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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
  let isCandidate = false;
  let currentHost: SshConfigHost | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Check for comment trigger
    if (trimmed.startsWith("#")) {
      const commentContent = trimmed.slice(1).trim();
      if (/^CrewlightRemote:\s*yes$/i.test(commentContent)) {
        isCandidate = true;
      }
      continue;
    }

    const tokens = trimmed.split(/\s+/u);
    const key = (tokens[0] || "").toLowerCase();
    const value = tokens.slice(1).join(" ");

    if (key === "host") {
      if (currentHost) {
        hosts.push(currentHost);
        currentHost = null;
      }
      if (isCandidate) {
        currentHost = {
          alias: value.split(/\s+/u)[0] || "unknown",
        };
        isCandidate = false; // consume candidate state
      }
    } else if (currentHost) {
      if (key === "hostname") {
        currentHost.hostname = value;
      } else if (key === "user") {
        currentHost.user = value;
      } else if (key === "port") {
        const parsedPort = parseInt(value, 10);
        if (!isNaN(parsedPort)) {
          currentHost.port = parsedPort;
        }
      } else if (key === "identityfile") {
        // Expand tilde if present
        let idFile = value;
        if (idFile.startsWith("~/")) {
          idFile = join(homedir(), idFile.slice(2));
        }
        currentHost.identityFile = idFile;
      }
    }
  }

  if (currentHost) {
    hosts.push(currentHost);
  }

  return hosts;
}

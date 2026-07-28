import { describe, expect, it } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCrewlightRemoteHosts } from "../src/ssh-config-parser.js";

describe("ssh config parser", () => {
  it("parses CrewlightRemote hosts and ignores others", async () => {
    const tempConfigPath = join(tmpdir(), `ssh-config-test-${Date.now()}`);
    const mockConfigContent = `
# CrewlightRemote: yes
Host remote-one
  HostName 192.168.1.100
  User testuser
  Port 2222
  IdentityFile ~/.ssh/id_rsa_test

Host regular-ignored
  HostName google.com
  User root

# CrewlightRemote: yes
Host remote-two
  HostName remote2.example.com
  User admin
`;

    await writeFile(tempConfigPath, mockConfigContent, "utf8");

    try {
      const hosts = await parseCrewlightRemoteHosts(tempConfigPath);
      expect(hosts).toHaveLength(2);

      expect(hosts[0]).toEqual({
        alias: "remote-one",
        hostname: "192.168.1.100",
        user: "testuser",
        port: 2222,
        identityFile: expect.stringContaining("id_rsa_test"),
      });

      expect(hosts[1]).toEqual({
        alias: "remote-two",
        hostname: "remote2.example.com",
        user: "admin",
      });
    } finally {
      await rm(tempConfigPath, { force: true });
    }
  });

  it("handles empty or missing files gracefully", async () => {
    const missingPath = join(tmpdir(), "does-not-exist");
    const result = await parseCrewlightRemoteHosts(missingPath);
    expect(result).toEqual([]);
  });

  it("recognizes the documented marker inside a Host block", async () => {
    const tempConfigPath = join(tmpdir(), `ssh-config-marker-${Date.now()}`);
    const identityPath = join(tmpdir(), "crewlight remote key");
    await writeFile(
      tempConfigPath,
      [
        "Host documented-remote",
        "  HostName remote.example.com",
        `  IdentityFile \"${identityPath}\"`,
        "  # CrewlightRemote: yes",
        "",
        "Host ignored",
        "  HostName ignored.example.com",
      ].join("\n"),
      "utf8",
    );

    try {
      await expect(parseCrewlightRemoteHosts(tempConfigPath)).resolves.toEqual([
        {
          alias: "documented-remote",
          hostname: "remote.example.com",
          identityFile: identityPath,
        },
      ]);
    } finally {
      await rm(tempConfigPath, { force: true });
    }
  });

  it("resolves relative IdentityFile paths from the SSH config directory", async () => {
    const configDirectory = join(tmpdir(), `crewlight-ssh-${Date.now()}`);
    const tempConfigPath = join(configDirectory, "config");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(configDirectory, { recursive: true }),
    );
    await writeFile(
      tempConfigPath,
      [
        "# CrewlightRemote: yes",
        "Host relative-key",
        "  IdentityFile keys/id_ed25519",
      ].join("\n"),
      "utf8",
    );

    try {
      const hosts = await parseCrewlightRemoteHosts(tempConfigPath);
      expect(hosts[0]?.identityFile).toBe(
        join(configDirectory, "keys", "id_ed25519"),
      );
    } finally {
      await rm(configDirectory, { force: true, recursive: true });
    }
  });

  it("does not apply a dangling top-level marker to the preceding Host block", async () => {
    const tempConfigPath = join(tmpdir(), `ssh-config-dangling-${Date.now()}`);
    await writeFile(
      tempConfigPath,
      [
        "Host production",
        "  HostName production.example.com",
        "# CrewlightRemote: yes",
      ].join("\n"),
      "utf8",
    );

    try {
      await expect(parseCrewlightRemoteHosts(tempConfigPath)).resolves.toEqual(
        [],
      );
    } finally {
      await rm(tempConfigPath, { force: true });
    }
  });
});

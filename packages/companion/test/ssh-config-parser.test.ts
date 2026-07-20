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
});

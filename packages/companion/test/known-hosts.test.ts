import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseKnownHosts, verifyKnownHostKey } from "../src/known-hosts.js";

const trustedKey = Buffer.from("trusted-host-key");

describe("OpenSSH known_hosts verification", () => {
  it("accepts an exact ordinary host entry and rejects a changed key", () => {
    const entries = parseKnownHosts(
      `remote.example ssh-ed25519 ${trustedKey.toString("base64")}\n`,
    );

    expect(verifyKnownHostKey(entries, ["remote.example"], trustedKey)).toEqual(
      { ok: true },
    );
    expect(
      verifyKnownHostKey(entries, ["remote.example"], Buffer.from("changed")),
    ).toEqual({ ok: false, reason: "changed" });
  });

  it("matches OpenSSH hashed hostnames without weakening unknown-host failure", () => {
    const salt = Buffer.from("crewlight-known-host-salt");
    const digest = createHmac("sha1", salt)
      .update("[remote.example]:2222")
      .digest("base64");
    const entries = parseKnownHosts(
      `|1|${salt.toString("base64")}|${digest} ssh-ed25519 ${trustedKey.toString("base64")}\n`,
    );

    expect(
      verifyKnownHostKey(entries, ["[remote.example]:2222"], trustedKey),
    ).toEqual({ ok: true });
    expect(
      verifyKnownHostKey(entries, ["unknown.example"], trustedKey),
    ).toEqual({ ok: false, reason: "unknown" });
  });

  it("fails closed for empty or malformed files", () => {
    expect(verifyKnownHostKey([], ["remote.example"], trustedKey)).toEqual({
      ok: false,
      reason: "unknown",
    });
    expect(parseKnownHosts("not-a-valid-entry\n")).toEqual([]);
  });

  it("never re-allows a revoked key regardless of entry order", () => {
    const encoded = trustedKey.toString("base64");
    for (const lines of [
      [
        `@revoked remote.example ssh-ed25519 ${encoded}`,
        `remote.example ssh-ed25519 ${encoded}`,
      ],
      [
        `remote.example ssh-ed25519 ${encoded}`,
        `@revoked remote.example ssh-ed25519 ${encoded}`,
      ],
    ]) {
      const entries = parseKnownHosts(lines.join("\n"));
      expect(
        verifyKnownHostKey(entries, ["remote.example"], trustedKey),
      ).toEqual({ ok: false, reason: "changed" });
    }
  });

  it("does not trust unsupported known_hosts markers as ordinary keys", () => {
    const entries = parseKnownHosts(
      `@cert-authority remote.example ssh-ed25519 ${trustedKey.toString("base64")}\n`,
    );
    expect(verifyKnownHostKey(entries, ["remote.example"], trustedKey)).toEqual(
      { ok: false, reason: "changed" },
    );
  });

  it("requires bracketed host entries for non-default ports", async () => {
    const { knownHostCandidates } = await import("../src/known-hosts.js");
    const bareEntries = parseKnownHosts(
      `remote.example ssh-ed25519 ${trustedKey.toString("base64")}\n`,
    );
    expect(
      verifyKnownHostKey(
        bareEntries,
        knownHostCandidates("remote.example", 2222),
        trustedKey,
      ),
    ).toEqual({ ok: false, reason: "unknown" });

    const bracketedEntries = parseKnownHosts(
      `[remote.example]:2222 ssh-ed25519 ${trustedKey.toString("base64")}\n`,
    );
    expect(
      verifyKnownHostKey(
        bracketedEntries,
        knownHostCandidates("remote.example", 2222),
        trustedKey,
      ),
    ).toEqual({ ok: true });
  });
});

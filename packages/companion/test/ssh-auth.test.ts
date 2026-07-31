import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import ssh2 from "ssh2";
import { describe, expect, it } from "vitest";

import { loadSshIdentity } from "../src/ssh-auth.js";

const { utils } = ssh2;
const execFileAsync = promisify(execFile);

function generatePrivateKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    utils.generateKeyPair("ed25519", (error, keyPair) => {
      if (error) {
        reject(error);
      } else {
        resolve(keyPair.private);
      }
    });
  });
}

describe("SSH identity loading", () => {
  it("loads the compiled module through the native Node ESM loader", async () => {
    const compiledModule = pathToFileURL(
      resolve("packages/companion/dist/ssh-auth.js"),
    ).href;
    await expect(
      execFileAsync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `await import(${JSON.stringify(compiledModule)})`,
        ],
        { windowsHide: true },
      ),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("accepts a private key parsed by the production ssh2 parser", async () => {
    const path = join(tmpdir(), `crewlight-valid-key-${Date.now()}`);
    const privateKey = await generatePrivateKey();
    await writeFile(path, privateKey, "utf8");
    try {
      expect(loadSshIdentity(path, false)).toEqual({
        ok: true,
        privateKey: Buffer.from(privateKey),
      });
    } finally {
      await rm(path, { force: true });
    }
  });

  it("falls back to an agent for a readable but unusable private key", async () => {
    const path = join(tmpdir(), `crewlight-invalid-key-${Date.now()}`);
    await writeFile(path, "not a private key", "utf8");
    try {
      expect(loadSshIdentity(path, true)).toEqual({ ok: true });
      expect(loadSshIdentity(path, false)).toMatchObject({
        ok: false,
        message: expect.stringContaining("Failed to parse private key"),
      });
    } finally {
      await rm(path, { force: true });
    }
  });
});

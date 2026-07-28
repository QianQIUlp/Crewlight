import { readFileSync } from "node:fs";

import { utils } from "ssh2";

export type LoadedSshIdentity =
  | { ok: true; privateKey?: Buffer }
  | { ok: false; message: string };

function fallbackOrFailure(
  agentAvailable: boolean,
  message: string,
): LoadedSshIdentity {
  return agentAvailable ? { ok: true } : { ok: false, message };
}

export function loadSshIdentity(
  identityFile: string,
  agentAvailable: boolean,
): LoadedSshIdentity {
  let privateKey: Buffer;
  try {
    privateKey = readFileSync(identityFile);
  } catch (error) {
    return fallbackOrFailure(
      agentAvailable,
      `Failed to read private key: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  try {
    const parsed = utils.parseKey(privateKey);
    if (parsed instanceof Error || parsed.getPrivatePEM() === null) {
      const reason =
        parsed instanceof Error
          ? parsed.message
          : "the file does not contain a private key";
      return fallbackOrFailure(
        agentAvailable,
        `Failed to parse private key: ${reason}`,
      );
    }
  } catch (error) {
    return fallbackOrFailure(
      agentAvailable,
      `Failed to parse private key: ${error instanceof Error ? error.message : "unsupported key format"}`,
    );
  }

  return { ok: true, privateKey };
}

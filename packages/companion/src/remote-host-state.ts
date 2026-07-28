import type { RemoteHostPreference } from "./desktop-preferences.js";
import type { DesktopRemoteHost } from "./desktop-state.js";
import type { SshConfigHost } from "./ssh-config-parser.js";

export class RemoteConnectionAttempts {
  private readonly currentByAlias = new Map<string, symbol>();

  begin(alias: string): symbol {
    const attempt = Symbol(alias);
    this.currentByAlias.set(alias, attempt);
    return attempt;
  }

  isCurrent(alias: string, attempt: symbol): boolean {
    return this.currentByAlias.get(alias) === attempt;
  }

  finish(alias: string, attempt: symbol): boolean {
    if (!this.isCurrent(alias, attempt)) {
      return false;
    }
    this.currentByAlias.delete(alias);
    return true;
  }

  invalidate(alias: string): void {
    this.currentByAlias.delete(alias);
  }

  invalidateAll(): void {
    this.currentByAlias.clear();
  }
}

function sameConnectionDefinition(
  left: SshConfigHost,
  right: SshConfigHost,
): boolean {
  return (
    left.hostname === right.hostname &&
    left.user === right.user &&
    left.port === right.port &&
    left.identityFile === right.identityFile
  );
}

export function changedOrRemovedRemoteAliases(
  previous: readonly SshConfigHost[],
  next: readonly SshConfigHost[],
): Set<string> {
  const nextByAlias = new Map(next.map((host) => [host.alias, host]));
  return new Set(
    previous
      .filter((host) => {
        const nextHost = nextByAlias.get(host.alias);
        return !nextHost || !sameConnectionDefinition(host, nextHost);
      })
      .map((host) => host.alias),
  );
}

export function reconcileRemoteHostState(
  parsedHosts: readonly SshConfigHost[],
  current: readonly DesktopRemoteHost[],
  preferences: readonly RemoteHostPreference[],
  activeAliases: ReadonlySet<string>,
): DesktopRemoteHost[] {
  return parsedHosts.map((parsed) => {
    const existing = current.find((host) => host.alias === parsed.alias);
    const preference = preferences.find((host) => host.alias === parsed.alias);
    const active = activeAliases.has(parsed.alias);
    const next: DesktopRemoteHost = existing ?? {
      alias: parsed.alias,
      tunnelState: "disconnected",
    };
    Object.assign(next, {
      alias: parsed.alias,
      hostname: parsed.hostname,
      user: parsed.user,
      port: parsed.port,
      tunnelState: active
        ? (existing?.tunnelState ?? "connecting")
        : "disconnected",
      tunnelMessage: active ? existing?.tunnelMessage : undefined,
      hasCli: active ? existing?.hasCli : undefined,
      autoConnect: preference?.autoConnect ?? false,
      installPromptDismissed: preference?.installPromptDismissed ?? false,
    });
    return next;
  });
}

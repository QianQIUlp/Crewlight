import { parseArgs } from "node:util";

import type { AgentSession } from "@crewlight/core";

import type { CrewlightClient } from "../daemon-client.js";
import type { CommandIo } from "./types.js";

function formatSession(session: AgentSession): string {
  const workspace =
    session.workspaceName ?? session.projectPath ?? "unknown workspace";
  return [
    session.status.padEnd(18),
    session.source.padEnd(14),
    workspace,
    session.sessionKey,
    new Date(session.lastEventAt).toISOString(),
  ].join("  ");
}

export async function executeStatusCommand(
  args: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      json: { type: "boolean", default: false },
    },
    strict: true,
  });
  const sessions = await client.sessions();

  if (values.json) {
    io.write(JSON.stringify(sessions, null, 2));
    return 0;
  }

  if (sessions.length === 0) {
    io.write("No sessions observed by this daemon.");
    return 0;
  }

  io.write(
    "STATUS              SOURCE          WORKSPACE  SESSION KEY  LAST EVENT",
  );
  for (const session of sessions) {
    io.write(formatSession(session));
  }
  return 0;
}

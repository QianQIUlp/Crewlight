import { parseArgs } from "node:util";

import { agentEventInputSchema } from "@crewlight/core";

import type { CrewlightClient } from "../daemon-client.js";
import type { CommandIo } from "./types.js";

export async function executeEmitCommand(
  args: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      message: { type: "string" },
      "project-path": { type: "string" },
      "session-id": { type: "string" },
      source: { type: "string" },
      status: { type: "string" },
      surface: { type: "string" },
      title: { type: "string" },
      urgency: { type: "string" },
      "workspace-name": { type: "string" },
    },
    strict: true,
  });
  const input = agentEventInputSchema.parse({
    source: values.source,
    surface: values.surface,
    status: values.status,
    ...(values["session-id"] ? { sessionId: values["session-id"] } : {}),
    ...(values["project-path"] ? { projectPath: values["project-path"] } : {}),
    ...(values["workspace-name"]
      ? { workspaceName: values["workspace-name"] }
      : {}),
    ...(values.title ? { title: values.title } : {}),
    ...(values.message ? { message: values.message } : {}),
    ...(values.urgency ? { urgency: values.urgency } : {}),
  });
  const result = await client.emit(input);
  io.write(
    "accepted" in result
      ? `Accepted ${input.source}/${input.status} through the remote ingest proxy`
      : `Accepted ${result.event.source}/${result.event.status} for ${result.session.sessionKey}`,
  );
  return 0;
}

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { AgentEventInput } from "@agentpulse/core";
import { ZodError } from "zod";

import type { DaemonListenConfig } from "./config.js";
import { AgentPulseService } from "./service.js";

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: AgentPulseService,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/sessions") {
    sendJson(response, 200, { sessions: service.listSessions() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/events") {
    let input: unknown;

    try {
      input = await readJson(request);
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid JSON body",
      });
      return;
    }

    try {
      const result = await service.ingest(input as AgentEventInput);
      sendJson(response, 202, result);
    } catch (error) {
      if (error instanceof ZodError) {
        sendJson(response, 400, {
          error: "Invalid event",
          issues: error.issues,
        });
        return;
      }

      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

export function createDaemonServer(
  service: AgentPulseService = new AgentPulseService(),
): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, service);
  });
}

export interface DaemonInstance {
  host: string;
  port: number;
  server: Server;
  url: string;
  close(): Promise<void>;
}

export async function startDaemon(
  config: DaemonListenConfig,
  service: AgentPulseService = new AgentPulseService(),
): Promise<DaemonInstance> {
  const server = createDaemonServer(service);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(config.port, config.host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to determine daemon address");
  }

  const host = config.host;
  const port = address.port;
  const url = `http://${host}:${port}`;

  return {
    host,
    port,
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

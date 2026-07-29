import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { AgentEventInput } from "@crewlight/core";
import { ZodError } from "zod";

import type { DaemonListenConfig } from "./config.js";
import { handleDashboardRequest, type DashboardOptions } from "./dashboard.js";
import { CrewlightService } from "./service.js";

export interface DaemonServerOptions {
  dashboard?: DashboardOptions;
}

const MAX_EVENT_BODY_BYTES = 64 * 1_024;
export const EVENT_BODY_TIMEOUT_MS = 2_000;

class EventBodyTooLargeError extends Error {}
class EventBodyTimeoutError extends Error {}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

export function formatDaemonUrl(host: string, port: number): string {
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

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

function sendJsonAndClose(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  // Drain any bytes that are already in flight so closing the response does
  // not reset the connection before clients can read the fixed error body.
  request.resume();
  response.shouldKeepAlive = false;
  response.writeHead(statusCode, {
    connection: "close",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function declaredBodyTooLarge(request: IncomingMessage): boolean {
  const header = request.headers["content-length"];
  if (typeof header !== "string") {
    return false;
  }

  const contentLength = Number(header);
  return Number.isFinite(contentLength) && contentLength > MAX_EVENT_BODY_BYTES;
}

function readJson(request: IncomingMessage): Promise<unknown> {
  if (declaredBodyTooLarge(request)) {
    throw new EventBodyTooLargeError();
  }

  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = (): void => {
      clearTimeout(timeout);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
    };

    const finish = (error?: unknown, value?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error !== undefined) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const stopReading = (error: Error): void => {
      request.pause();
      finish(error);
    };

    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_EVENT_BODY_BYTES) {
        chunks.length = 0;
        stopReading(new EventBodyTooLargeError());
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = (): void => {
      try {
        finish(undefined, JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        finish(error);
      }
    };

    const onError = (error: Error): void => finish(error);
    const onAborted = (): void => finish(new Error("Request body aborted"));

    timeout = setTimeout(
      () => stopReading(new EventBodyTimeoutError()),
      EVENT_BODY_TIMEOUT_MS,
    );
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    request.once("aborted", onAborted);
  });
}

function hasJsonContentType(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];
  return (
    typeof contentType === "string" &&
    contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: CrewlightService,
  options: DaemonServerOptions,
  startedAt: number,
): Promise<void> {
  let url: URL;

  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    sendJson(response, 400, { error: "Invalid request target" });
    return;
  }

  if (
    request.method === "GET" &&
    options.dashboard &&
    (await handleDashboardRequest(
      url.pathname,
      response,
      service,
      options.dashboard,
      startedAt,
    ))
  ) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    sendJson(response, 200, { sessions: service.listSessions() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/events") {
    if (!hasJsonContentType(request)) {
      sendJsonAndClose(request, response, 415, {
        error: "Content-Type must be application/json",
      });
      return;
    }

    let input: unknown;

    try {
      input = await readJson(request);
    } catch (error) {
      if (error instanceof EventBodyTooLargeError) {
        sendJsonAndClose(request, response, 413, {
          error: "Event body too large",
        });
        return;
      }

      if (error instanceof EventBodyTimeoutError) {
        sendJsonAndClose(request, response, 408, {
          error: "Event body timed out",
        });
        return;
      }

      sendJson(response, 400, { error: "Invalid JSON body" });
      return;
    }

    try {
      const remoteAlias = request.headers["x-crewlight-remote-alias"];
      const eventInput = {
        ...(input as Record<string, unknown>),
        ...(typeof remoteAlias === "string" ? { remoteAlias } : {}),
      };
      const result = await service.ingest(eventInput as AgentEventInput);
      sendJson(response, result.applied ? 202 : 200, result);
    } catch (error) {
      if (error instanceof ZodError) {
        sendJson(response, 400, { error: "Invalid event" });
        return;
      }

      sendJson(response, 500, { error: "Internal server error" });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

export function createDaemonServer(
  service: CrewlightService = new CrewlightService(),
  options: DaemonServerOptions = {},
): Server {
  const startedAt = Date.now();
  return createServer((request, response) => {
    void handleRequest(request, response, service, options, startedAt).catch(
      () => {
        if (response.writableEnded) {
          return;
        }

        if (!response.headersSent) {
          sendJson(response, 500, { error: "Internal server error" });
          return;
        }

        response.destroy();
      },
    );
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
  service: CrewlightService = new CrewlightService(),
  options: DaemonServerOptions = {},
): Promise<DaemonInstance> {
  if (options.dashboard && !isLoopbackHost(config.host)) {
    throw new Error(
      "The Crewlight dashboard requires --host 127.0.0.1 or --host ::1.",
    );
  }

  const server = createDaemonServer(service, options);

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
  const url = formatDaemonUrl(host, port);

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

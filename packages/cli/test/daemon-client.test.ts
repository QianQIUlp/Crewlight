import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  DASHBOARD_CAPABILITIES_TIMEOUT_MS,
  DaemonClient,
} from "../src/daemon-client.js";

let server: Server | undefined;

afterEach(
  () =>
    new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
      server = undefined;
    }),
);

async function startServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ port: number; url: string }> {
  server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address");
  }
  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("DaemonClient dashboard capabilities", () => {
  it("uses the same explicit daemon base URL as event delivery", async () => {
    const paths: string[] = [];
    const target = await startServer((request, response) => {
      paths.push(request.url ?? "");
      response.writeHead(request.url === "/events" ? 202 : 200, {
        "content-type": "application/json",
      });
      response.end(
        request.url === "/dashboard/capabilities"
          ? JSON.stringify({ taskTitleMode: "prompt-preview" })
          : JSON.stringify({ event: {}, session: {} }),
      );
    });
    const client = new DaemonClient({ baseUrl: target.url });

    await expect(client.dashboardCapabilities()).resolves.toEqual({
      taskTitleMode: "prompt-preview",
    });
    await client.emit({
      source: "custom",
      surface: "manual",
      status: "running",
    });

    expect(paths).toEqual(["/dashboard/capabilities", "/events"]);
    expect(target.port).not.toBe(3768);
  });

  it("honors daemon host and port environment overrides", async () => {
    const target = await startServer((request, response) => {
      expect(request.url).toBe("/dashboard/capabilities");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ taskTitleMode: "prompt-preview" }));
    });
    const client = new DaemonClient({
      env: {
        AGENTPULSE_HOST: "127.0.0.1",
        AGENTPULSE_PORT: String(target.port),
      },
    });

    await expect(client.dashboardCapabilities()).resolves.toEqual({
      taskTitleMode: "prompt-preview",
    });
  });

  it.each([
    ["non-200", 503, JSON.stringify({ taskTitleMode: "prompt-preview" })],
    ["invalid JSON", 200, "not-json"],
    ["invalid shape", 200, JSON.stringify({ taskTitleMode: "enabled" })],
  ] as const)("resolves %s responses to off", async (_name, status, body) => {
    const target = await startServer((_request, response) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(body);
    });

    await expect(
      new DaemonClient({ baseUrl: target.url }).dashboardCapabilities(),
    ).resolves.toEqual({ taskTitleMode: "off" });
  });

  it("times out quickly and resolves to off", async () => {
    const target = await startServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ taskTitleMode: "prompt-preview" }));
      }, DASHBOARD_CAPABILITIES_TIMEOUT_MS * 4);
    });
    const startedAt = Date.now();

    await expect(
      new DaemonClient({ baseUrl: target.url }).dashboardCapabilities(),
    ).resolves.toEqual({ taskTitleMode: "off" });
    expect(Date.now() - startedAt).toBeLessThan(
      DASHBOARD_CAPABILITIES_TIMEOUT_MS * 3,
    );
  });

  it("resolves connection failures to off", async () => {
    await expect(
      new DaemonClient({
        baseUrl: "http://127.0.0.1:1",
      }).dashboardCapabilities(),
    ).resolves.toEqual({ taskTitleMode: "off" });
  });
});

import { createServer, request as createRequest } from "node:http";

import { describe, expect, it } from "vitest";

import {
  createLocalHttpProxy,
  forwardedRequestHeaders,
  isAllowedRemoteProxyAuthority,
  isAllowedRemoteProxyRequest,
} from "../src/ssh-proxy.js";

function postProxy(
  port: number,
  host: string,
  origin?: string,
): Promise<{
  body: string;
  headers: import("node:http").IncomingHttpHeaders;
  status: number;
}> {
  return new Promise((resolve, reject) => {
    const request = createRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/events",
        method: "POST",
        headers: {
          host,
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({
            body,
            headers: response.headers,
            status: response.statusCode ?? 0,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end(
      JSON.stringify({
        source: "custom",
        surface: "manual",
        status: "running",
      }),
    );
  });
}

describe("SSH local ingest proxy policy", () => {
  it("allows only JSON POST requests to the exact events route", () => {
    expect(
      isAllowedRemoteProxyRequest("POST", "/events", "application/json"),
    ).toBe(true);
    expect(
      isAllowedRemoteProxyRequest("GET", "/sessions", "application/json"),
    ).toBe(false);
    expect(
      isAllowedRemoteProxyRequest("POST", "/dashboard/api", "application/json"),
    ).toBe(false);
    expect(isAllowedRemoteProxyRequest("POST", "/events", "text/plain")).toBe(
      false,
    );
  });

  it("requires the exact remote loopback authority and same-origin browser requests", () => {
    expect(
      isAllowedRemoteProxyAuthority("127.0.0.1:3768", undefined, 3768),
    ).toBe(true);
    expect(
      isAllowedRemoteProxyAuthority(
        "127.0.0.1:3768",
        "http://127.0.0.1:3768",
        3768,
      ),
    ).toBe(true);
    expect(
      isAllowedRemoteProxyAuthority(
        "attacker.example:3768",
        "http://attacker.example:3768",
        3768,
      ),
    ).toBe(false);
    expect(
      isAllowedRemoteProxyAuthority(
        "127.0.0.1:3768",
        "http://attacker.example:3768",
        3768,
      ),
    ).toBe(false);
  });

  it("drops remote-controlled forwarding headers", () => {
    expect(
      forwardedRequestHeaders(
        {
          authorization: "Bearer secret",
          cookie: "private=value",
          "content-length": "99",
          "content-type": "application/json; charset=utf-8",
          host: "attacker.invalid",
          "x-crewlight-remote-alias": "spoofed",
        },
        "trusted-alias",
      ),
    ).toEqual({
      "content-type": "application/json; charset=utf-8",
      "x-crewlight-remote-alias": "trusted-alias",
    });
  });

  it("replaces the daemon response with a fixed acknowledgement", async () => {
    let targetRequests = 0;
    let forwardedAlias: string | undefined;
    const target = createServer((request, response) => {
      targetRequests += 1;
      forwardedAlias = request.headers["x-crewlight-remote-alias"] as
        | string
        | undefined;
      request.resume();
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": "secret=value",
      });
      response.end(
        JSON.stringify({
          applied: false,
          session: { taskTitle: "VICTIM_TASK_TITLE" },
        }),
      );
    });
    await new Promise<void>((resolve, reject) => {
      target.once("error", reject);
      target.listen(0, "127.0.0.1", resolve);
    });
    const address = target.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine target test port");
    }
    const proxy = await createLocalHttpProxy({
      alias: "trusted-remote",
      remotePort: 3768,
      targetHost: "127.0.0.1",
      targetPort: address.port,
    });

    try {
      const rebound = await postProxy(
        proxy.port,
        "attacker.example:3768",
        "http://attacker.example:3768",
      );
      expect(rebound.status).toBe(403);
      expect(targetRequests).toBe(0);

      const response = await postProxy(proxy.port, "127.0.0.1:3768");
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.parse(response.body)).toEqual({ accepted: true });
      expect(response.body).not.toContain("VICTIM_TASK_TITLE");
      expect(targetRequests).toBe(1);
      expect(forwardedAlias).toBe("trusted-remote");
    } finally {
      proxy.close();
      await new Promise<void>((resolve, reject) =>
        target.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

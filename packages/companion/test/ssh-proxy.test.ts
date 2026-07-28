import { describe, expect, it } from "vitest";

import {
  forwardedRequestHeaders,
  forwardedResponseHeaders,
  isAllowedRemoteProxyRequest,
} from "../src/ssh-proxy.js";

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

  it("returns only safe response metadata", () => {
    expect(
      forwardedResponseHeaders({
        "content-type": "application/json; charset=utf-8",
        "set-cookie": "secret=value",
        server: "private-runtime",
      }),
    ).toEqual({ "content-type": "application/json; charset=utf-8" });
  });
});

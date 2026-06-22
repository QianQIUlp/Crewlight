import { describe, expect, it } from "vitest";

import {
  isAllowedDashboardUrl,
  resolveCompanionEndpoint,
} from "../src/endpoint.js";

describe("companion endpoint resolution", () => {
  it("uses the default loopback dashboard endpoint", () => {
    expect(resolveCompanionEndpoint({})).toMatchObject({
      host: "127.0.0.1",
      port: 3768,
      baseUrl: "http://127.0.0.1:3768",
      dashboardApiUrl: "http://127.0.0.1:3768/dashboard/api",
      dashboardUrl: "http://127.0.0.1:3768/dashboard",
      issues: [],
    });
  });

  it("honors IPv4 and IPv6 loopback overrides", () => {
    expect(
      resolveCompanionEndpoint({
        AGENTPULSE_HOST: "::1",
        AGENTPULSE_PORT: "4768",
      }),
    ).toMatchObject({
      baseUrl: "http://[::1]:4768",
      issues: [],
    });
  });

  it("falls back safely for non-loopback hosts and invalid ports", () => {
    const endpoint = resolveCompanionEndpoint({
      AGENTPULSE_HOST: "0.0.0.0",
      AGENTPULSE_PORT: "invalid",
    });

    expect(endpoint.baseUrl).toBe("http://127.0.0.1:3768");
    expect(endpoint.issues).toHaveLength(2);
  });

  it("rejects empty, fractional, and out-of-range ports", () => {
    for (const port of ["", "0", "1.5", "65536", "not-a-port"]) {
      expect(resolveCompanionEndpoint({ AGENTPULSE_PORT: port })).toMatchObject(
        {
          port: 3768,
        },
      );
    }
  });

  it("allows only the configured loopback dashboard URL", () => {
    const ipv4 = resolveCompanionEndpoint({
      AGENTPULSE_HOST: "127.0.0.1",
      AGENTPULSE_PORT: "4768",
    });
    const ipv6 = resolveCompanionEndpoint({
      AGENTPULSE_HOST: "::1",
      AGENTPULSE_PORT: "4768",
    });

    expect(isAllowedDashboardUrl(ipv4.dashboardUrl, ipv4)).toBe(true);
    expect(isAllowedDashboardUrl(ipv6.dashboardUrl, ipv6)).toBe(true);

    for (const value of [
      "https://127.0.0.1:4768/dashboard",
      "http://localhost:4768/dashboard",
      "http://127.0.0.1:4769/dashboard",
      "http://127.0.0.1:4768/dashboard/api",
      "http://127.0.0.1:4768/dashboard?focus=session",
      "http://127.0.0.1:4768/dashboard#status",
      "http://user@127.0.0.1:4768/dashboard",
      "not-a-url",
    ]) {
      expect(isAllowedDashboardUrl(value, ipv4)).toBe(false);
    }
    expect(isAllowedDashboardUrl(ipv6.dashboardUrl, ipv4)).toBe(false);
  });
});

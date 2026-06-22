import { describe, expect, it } from "vitest";

import { fetchCompanionSnapshot } from "../src/client.js";
import { resolveCompanionEndpoint } from "../src/endpoint.js";

const endpoint = resolveCompanionEndpoint({});

function validResponse(): Response {
  return Response.json({
    health: { status: "ok" },
    sessions: [],
  });
}

describe("companion dashboard client", () => {
  it("returns sanitized online data for a valid response", async () => {
    await expect(
      fetchCompanionSnapshot(endpoint, {
        fetch: async () => validResponse(),
      }),
    ).resolves.toEqual({
      kind: "online",
      data: { sessions: [] },
    });
  });

  it("maps network failures to daemon offline", async () => {
    const result = await fetchCompanionSnapshot(endpoint, {
      fetch: async () => {
        throw new TypeError("connection refused");
      },
    });

    expect(result).toMatchObject({
      kind: "offline",
    });
    expect(result.diagnostic).toContain("agentpulse daemon --dashboard");
  });

  it("aborts slow requests and reports the timeout", async () => {
    const result = await fetchCompanionSnapshot(endpoint, {
      timeoutMs: 5,
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    });

    expect(result).toMatchObject({
      kind: "offline",
    });
    expect(result.diagnostic).toContain("timed out after 5ms");
    expect(result.diagnostic).toContain("will retry");
  });

  it("times out when response body parsing never completes", async () => {
    const result = await fetchCompanionSnapshot(endpoint, {
      timeoutMs: 5,
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            await new Promise<never>(() => {
              // Simulate a response that started but never completed.
            }),
        }) as Response,
    });

    expect(result).toMatchObject({ kind: "offline" });
    expect(result.diagnostic).toContain("timed out after 5ms");
    expect(result.diagnostic).not.toContain("partial-body-secret");
  });

  it("provides a dashboard startup hint for HTTP 404", async () => {
    await expect(
      fetchCompanionSnapshot(endpoint, {
        fetch: async () => new Response("Not found", { status: 404 }),
      }),
    ).resolves.toEqual({
      kind: "api-unavailable",
      diagnostic: "Restart with: agentpulse daemon --dashboard.",
    });
  });

  it("classifies non-200, invalid JSON, and invalid schema as API unavailable", async () => {
    await expect(
      fetchCompanionSnapshot(endpoint, {
        fetch: async () => new Response("private-error-body", { status: 503 }),
      }),
    ).resolves.toEqual({
      kind: "api-unavailable",
      diagnostic: "Dashboard API returned HTTP 503. Restart with --dashboard.",
    });

    await expect(
      fetchCompanionSnapshot(endpoint, {
        fetch: async () =>
          new Response("{", {
            headers: { "content-type": "application/json" },
          }),
      }),
    ).resolves.toEqual({
      kind: "api-unavailable",
      diagnostic:
        "Dashboard API returned invalid JSON. Restart with --dashboard.",
    });

    await expect(
      fetchCompanionSnapshot(endpoint, {
        fetch: async () => Response.json({ sessions: [] }),
      }),
    ).resolves.toEqual({
      kind: "api-unavailable",
      diagnostic:
        "Dashboard API response is unsupported. Restart with --dashboard.",
    });
  });

  it("never includes HTTP error bodies in diagnostics", async () => {
    const result = await fetchCompanionSnapshot(endpoint, {
      fetch: async () => new Response("error-body-secret", { status: 500 }),
    });

    expect(JSON.stringify(result)).not.toContain("error-body-secret");
  });
});

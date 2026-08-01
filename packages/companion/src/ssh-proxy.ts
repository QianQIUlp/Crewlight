import {
  createServer,
  request as createRequest,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
} from "node:http";

export interface LocalHttpProxy {
  close(): void;
  port: number;
}

export interface LocalHttpProxyOptions {
  alias: string;
  remotePort: number;
  targetHost: "127.0.0.1" | "::1";
  targetPort: number;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isAllowedRemoteProxyRequest(
  method: string | undefined,
  url: string | undefined,
  contentType: string | string[] | undefined,
): boolean {
  const normalizedContentType = firstHeaderValue(contentType)
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    method === "POST" &&
    url === "/events" &&
    normalizedContentType === "application/json"
  );
}

export function isAllowedRemoteProxyAuthority(
  host: string | string[] | undefined,
  origin: string | string[] | undefined,
  remotePort: number,
): boolean {
  const expectedAuthority = `127.0.0.1:${remotePort}`;
  const hostValue = firstHeaderValue(host);
  const originValue = firstHeaderValue(origin);
  return (
    hostValue === expectedAuthority &&
    (originValue === undefined || originValue === `http://${expectedAuthority}`)
  );
}

export function forwardedRequestHeaders(
  headers: IncomingHttpHeaders,
  alias: string,
): OutgoingHttpHeaders {
  const contentType = firstHeaderValue(headers["content-type"]);
  return {
    ...(contentType ? { "content-type": contentType } : {}),
    "x-crewlight-remote-alias": alias,
  };
}

function sendProxyAcknowledgement(
  response: import("node:http").ServerResponse,
): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ accepted: true }));
}

function sendProxyError(
  response: import("node:http").ServerResponse,
  statusCode: number,
  error: string,
): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ error }));
}

export function createLocalHttpProxy(
  options: LocalHttpProxyOptions,
): Promise<LocalHttpProxy> {
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(options.alias)) {
    return Promise.reject(new Error("Invalid SSH host alias"));
  }
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (
        !isAllowedRemoteProxyAuthority(
          request.headers.host,
          request.headers.origin,
          options.remotePort,
        )
      ) {
        sendProxyError(response, 403, "Remote proxy request rejected");
        request.resume();
        return;
      }
      if (
        !isAllowedRemoteProxyRequest(
          request.method,
          request.url,
          request.headers["content-type"],
        )
      ) {
        const status =
          request.url === "/events" && request.method !== "POST" ? 405 : 404;
        sendProxyError(response, status, "Remote proxy request rejected");
        request.resume();
        return;
      }

      const upstream = createRequest(
        {
          host: options.targetHost,
          port: options.targetPort,
          path: "/events",
          method: "POST",
          headers: forwardedRequestHeaders(request.headers, options.alias),
        },
        (upstreamResponse) => {
          const statusCode = upstreamResponse.statusCode ?? 502;
          upstreamResponse.resume();
          if (statusCode >= 200 && statusCode < 300) {
            sendProxyAcknowledgement(response);
            return;
          }
          sendProxyError(
            response,
            statusCode >= 400 && statusCode < 500 ? 400 : 502,
            "Local Crewlight daemon rejected the event",
          );
        },
      );
      upstream.on("error", () => {
        sendProxyError(response, 502, "Local Crewlight daemon unavailable");
      });
      request.on("aborted", () => upstream.destroy());
      request.on("error", () => upstream.destroy());
      request.pipe(upstream);
    });

    const onStartupError = (error: Error) => reject(error);
    server.once("error", onStartupError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onStartupError);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to determine SSH proxy port"));
        return;
      }
      resolve({
        port: address.port,
        close: () => {
          server.close();
        },
      });
    });
  });
}

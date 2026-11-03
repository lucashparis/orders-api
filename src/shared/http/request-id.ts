import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { FastifyInstance } from "fastify";

export const requestIdHeaderName = "x-request-id";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(request: Pick<IncomingMessage, "headers">): string {
  const incoming = request.headers[requestIdHeaderName];
  if (typeof incoming === "string" && requestIdPattern.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

export function registerRequestIdEcho(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(requestIdHeaderName, request.id);
  });
}

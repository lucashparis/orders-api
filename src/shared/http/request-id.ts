import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export const requestIdHeaderName = "x-request-id";

export function generateRequestId(): string {
  return randomUUID();
}

export function registerRequestIdEcho(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(requestIdHeaderName, request.id);
  });
}

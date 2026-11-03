import type { FastifyRequest } from "fastify";
import type { Environment, LogLevel } from "../../config/env.ts";

export type LogDestination = { write(line: string): void };

type LoggedRequest = Pick<FastifyRequest, "method" | "url">;

type RequestSummary = { method: string; path: string };

export type LoggerOptions = {
  level: LogLevel;
  serializers: { req: (request: LoggedRequest) => RequestSummary };
  transport?: { target: "pino-pretty" };
  stream?: LogDestination;
};

function removeQueryString(url: string): string {
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

export function serializeRequest(request: LoggedRequest): RequestSummary {
  return { method: request.method, path: removeQueryString(request.url) };
}

export function buildLoggerOptions(
  environment: Environment,
  destination?: LogDestination,
): LoggerOptions {
  const options = { level: environment.logLevel, serializers: { req: serializeRequest } };
  if (destination !== undefined) {
    return { ...options, stream: destination };
  }
  if (environment.nodeEnv === "development") {
    return { ...options, transport: { target: "pino-pretty" } };
  }
  return options;
}

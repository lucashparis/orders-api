import type { Environment, LogLevel } from "../../config/env.ts";

export type LoggerOptions = {
  level: LogLevel;
  transport?: { target: "pino-pretty" };
};

export function buildLoggerOptions(environment: Environment): LoggerOptions {
  if (environment.nodeEnv === "development") {
    return { level: environment.logLevel, transport: { target: "pino-pretty" } };
  }
  return { level: environment.logLevel };
}

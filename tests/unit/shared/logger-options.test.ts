import { describe, expect, test } from "vitest";
import type { Environment } from "../../../src/config/env.ts";
import { buildLoggerOptions } from "../../../src/shared/logger/logger-options.ts";

const baseEnvironment: Environment = {
  databaseUrl: "postgresql://orders:orders@localhost:5432/orders",
  port: 3000,
  host: "0.0.0.0",
  logLevel: "info",
  nodeEnv: "production",
  graphiqlEnabled: false,
};

describe("buildLoggerOptions", () => {
  test("uses pino-pretty only in development", () => {
    expect(buildLoggerOptions({ ...baseEnvironment, nodeEnv: "development" }).transport).toEqual({
      target: "pino-pretty",
    });
    expect("transport" in buildLoggerOptions({ ...baseEnvironment, nodeEnv: "production" })).toBe(
      false,
    );
  });

  test("forwards the configured log level", () => {
    expect(buildLoggerOptions({ ...baseEnvironment, logLevel: "debug" }).level).toBe("debug");
  });
});

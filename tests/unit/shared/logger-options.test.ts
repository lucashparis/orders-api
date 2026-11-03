import { describe, expect, test } from "vitest";
import type { Environment } from "../../../src/config/env.ts";
import { buildLoggerOptions, serializeRequest } from "../../../src/shared/logger/logger-options.ts";

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

  test("writes to the given destination instead of a transport", () => {
    const destination = { write: () => undefined };
    const options = buildLoggerOptions({ ...baseEnvironment, nodeEnv: "development" }, destination);
    expect(options.stream).toBe(destination);
    expect("transport" in options).toBe(false);
  });

  test("serializes requests with the method and the path only", () => {
    const serializer = buildLoggerOptions(baseEnvironment).serializers.req;
    expect(serializer({ method: "GET", url: "/graphql?query=secret" })).toEqual({
      method: "GET",
      path: "/graphql",
    });
  });
});

describe("serializeRequest", () => {
  test("keeps a path without a query string", () => {
    expect(serializeRequest({ method: "POST", url: "/graphql" })).toEqual({
      method: "POST",
      path: "/graphql",
    });
  });
});

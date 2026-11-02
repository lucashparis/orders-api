import { describe, expect, test } from "vitest";
import { loadEnvironment } from "../../../src/config/env.ts";

const databaseUrl = "postgresql://orders:orders@localhost:5432/orders";

describe("loadEnvironment defaults and parsing", () => {
  test("applies defaults when optional variables are absent", () => {
    expect(loadEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      databaseUrl,
      port: 3000,
      host: "0.0.0.0",
      logLevel: "info",
      nodeEnv: "production",
      graphiqlEnabled: false,
    });
  });

  test("names a missing DATABASE_URL", () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/);
  });

  test("parses PORT as a number and GRAPHIQL_ENABLED as a boolean", () => {
    const environment = loadEnvironment({
      DATABASE_URL: databaseUrl,
      PORT: "4100",
      GRAPHIQL_ENABLED: "true",
    });
    expect(environment.port).toBe(4100);
    expect(environment.graphiqlEnabled).toBe(true);
    expect(loadEnvironment({ DATABASE_URL: databaseUrl, GRAPHIQL_ENABLED: "false" })).toMatchObject(
      { graphiqlEnabled: false },
    );
  });
});

describe("loadEnvironment validation", () => {
  test("rejects an unknown LOG_LEVEL", () => {
    expect(() => loadEnvironment({ DATABASE_URL: "postgresql://x", LOG_LEVEL: "loud" })).toThrow(
      /LOG_LEVEL/,
    );
  });

  test("reports every invalid variable in a single error", () => {
    expect(() => loadEnvironment({ PORT: "abc", NODE_ENV: "staging" })).toThrow(
      /DATABASE_URL[\s\S]*PORT[\s\S]*NODE_ENV/,
    );
  });

  test("rejects an out-of-range PORT and a malformed GRAPHIQL_ENABLED", () => {
    expect(() => loadEnvironment({ DATABASE_URL: databaseUrl, PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadEnvironment({ DATABASE_URL: databaseUrl, GRAPHIQL_ENABLED: "yes" })).toThrow(
      /GRAPHIQL_ENABLED/,
    );
  });
});

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../../../src/app.ts";
import type { Environment } from "../../../src/config/env.ts";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { createPrismaClient } from "../../../src/shared/database/prisma-client.ts";
import { createTestPrismaClient } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";
import { probeModule, secondProbeModule } from "../../helpers/probe-modules.ts";
import { testEnvironment } from "../../helpers/test-environment.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const openApps: FastifyInstance[] = [];
const openClients: PrismaClient[] = [];

async function createApp(
  environment: Environment = testEnvironment,
  prisma: PrismaClient = createTestPrismaClient(),
): Promise<FastifyInstance> {
  openClients.push(prisma);
  const app = await buildApp({
    environment,
    prisma,
    createGraphqlModules: () => [probeModule, secondProbeModule],
  });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  await Promise.all(openClients.splice(0).map((prisma) => prisma.$disconnect()));
});

function nestChild(depth: number): string {
  return `{ root ${"{ child ".repeat(depth)}{ name }${" }".repeat(depth)} }`;
}

describe("health check", () => {
  test("reports ok when the database answers", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("reports unavailable when the database cannot be reached", async () => {
    const unreachable = createPrismaClient("postgresql://orders:orders@127.0.0.1:1/none");
    const app = await createApp(testEnvironment, unreachable);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
  });
});

describe("request id", () => {
  test("echoes the incoming request id on the response", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ secondRoot }", undefined, {
      "x-request-id": "req-test-123",
    });
    expect(result.headers["x-request-id"]).toBe("req-test-123");
  });

  test("generates a UUID when no request id is sent", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ secondRoot }");
    expect(result.headers["x-request-id"]).toMatch(uuidPattern);
  });

  test("sets the request id header on unknown routes", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });
});

describe("request id validation", () => {
  test("accepts the longest allowed request id", async () => {
    const app = await createApp();
    const longestId = `req:${"a".repeat(124)}`;
    const result = await executeGraphql(app, "{ secondRoot }", undefined, {
      "x-request-id": longestId,
    });
    expect(result.headers["x-request-id"]).toBe(longestId);
  });

  test.each([
    ["characters outside the allowed set", "req id<script>"],
    ["more than 128 characters", "a".repeat(129)],
  ])("replaces a request id with %s by a UUID", async (_reason, requestId) => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ secondRoot }", undefined, {
      "x-request-id": requestId,
    });
    expect(result.headers["x-request-id"]).toMatch(uuidPattern);
  });
});

describe("module composition", () => {
  test("keeps the Query fields contributed by every module", async () => {
    const app = await createApp();
    const result = await executeGraphql<{ secondRoot: string; root: { name: string } }>(
      app,
      "{ secondRoot root { name } }",
    );
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({ secondRoot: "second", root: { name: "root" } });
  });

  test("resolves Mutation fields extended by modules", async () => {
    const app = await createApp();
    const result = await executeGraphql<{ probeMutation: boolean }>(
      app,
      "mutation { probeMutation }",
    );
    expect(result.data).toEqual({ probeMutation: true });
  });
});

describe("error masking", () => {
  test("masks unexpected errors and hides the original message", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ failUnexpectedly }", undefined, {
      "x-request-id": "req-test-123",
    });
    expect(result.errors[0]).toEqual({
      message: "Internal server error",
      extensions: { code: "INTERNAL_SERVER_ERROR", requestId: "req-test-123" },
    });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(result.headers["x-request-id"]).toBe("req-test-123");
  });

  test("masks resolver errors whose message imitates a syntax error", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ fakeSyntaxError }", undefined, {
      "x-request-id": "req-test-456",
    });
    expect(result.errors[0]).toEqual({
      message: "Internal server error",
      extensions: { code: "INTERNAL_SERVER_ERROR", requestId: "req-test-456" },
    });
  });
});

describe("bad user input", () => {
  test("keeps bad user input errors", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ rejectInput }");
    expect(result.errors[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(result.errors[0]?.message).toBe("first must be between 1 and 100.");
  });
});

describe("request parsing", () => {
  test("reports syntax errors as parse failures", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ root {");
    expect(result.errors[0]?.extensions?.code).toBe("GRAPHQL_PARSE_FAILED");
  });

  test("sets the request id header on parse failure responses", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ root {", undefined, {
      "x-request-id": "req-parse-1",
    });
    expect(result.statusCode).toBe(400);
    expect(result.headers["x-request-id"]).toBe("req-parse-1");
  });
});

describe("request validation", () => {
  test("reports unknown fields as validation failures", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, "{ unknownField }");
    expect(result.errors[0]?.extensions?.code).toBe("GRAPHQL_VALIDATION_FAILED");
  });

  test("rejects queries nested deeper than the limit", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, nestChild(11));
    expect(result.errors[0]?.extensions?.code).toBe("GRAPHQL_VALIDATION_FAILED");
  });

  test("accepts queries within the depth limit", async () => {
    const app = await createApp();
    const result = await executeGraphql(app, nestChild(3));
    expect(result.errors).toEqual([]);
  });
});

describe("graphiql", () => {
  test("is not served when disabled", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/graphiql" });
    expect(response.statusCode).toBe(404);
  });

  test("is served when enabled", async () => {
    const app = await createApp({ ...testEnvironment, graphiqlEnabled: true });
    const response = await app.inject({ method: "GET", url: "/graphiql" });
    expect(response.statusCode).toBe(200);
  });
});

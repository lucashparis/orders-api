import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../../../src/app.ts";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { createApplicationModules } from "../../../src/modules/application-modules.ts";
import { createPrismaClient } from "../../../src/shared/database/prisma-client.ts";
import { loggingTestEnvironment } from "../../helpers/app.ts";
import { createTestPrismaClient } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";
import {
  createLogCapture,
  findEventEntries,
  type LogCapture,
  type LogEntry,
} from "../../helpers/log-capture.ts";
import { probeModule, unexpectedFailureMessage } from "../../helpers/probe-modules.ts";

const listUsersQuery = "query ListUsers { users { edges { node { id } } } }";
const anonymousUsersQuery = "{ users { edges { node { id } } } }";
const failingQuery = "query FailUnexpectedly { failUnexpectedly }";
const invalidPageQuery = "query InvalidPage { users(first: 101) { edges { node { id } } } }";
const unknownFieldQuery = "query UnknownField { unknownField }";
const brokenSyntaxQuery = "query BrokenSyntax { users {";
const twoOperationsDocument = `
  query FirstListing { users { edges { node { id } } } }
  query SecondListing { users { pageInfo { hasNextPage } } }
`;
const createUserMutation = `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { __typename }
  }
`;
const privateEmail = "private.person@example.com";
const requestId = "req-operation-1";
const unreachableDatabaseUrl = "postgresql://orders:orders@127.0.0.1:1/none";

type ObservedApp = { app: FastifyInstance; capture: LogCapture };

const openApps: FastifyInstance[] = [];
const openClients: PrismaClient[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  await Promise.all(openClients.splice(0).map((prisma) => prisma.$disconnect()));
});

async function createObservedApp(
  prisma: PrismaClient = createTestPrismaClient(),
): Promise<ObservedApp> {
  const capture = createLogCapture();
  openClients.push(prisma);
  const app = await buildApp({
    environment: loggingTestEnvironment,
    prisma,
    createGraphqlModules: (dependencies) => [
      ...createApplicationModules(dependencies),
      probeModule,
    ],
    logDestination: capture.destination,
  });
  openApps.push(app);
  return { app, capture };
}

async function captureOperation(
  document: string,
  variables?: Record<string, unknown>,
): Promise<LogCapture> {
  const { app, capture } = await createObservedApp();
  await executeGraphql(app, document, variables, { "x-request-id": requestId });
  return capture;
}

async function readOperationEntries(
  document: string,
  variables?: Record<string, unknown>,
): Promise<LogEntry[]> {
  return findEventEntries(await captureOperation(document, variables), "graphql.operation");
}

function operationEntry(operation: string | null, outcome: string): unknown {
  return expect.objectContaining({
    level: 30,
    reqId: requestId,
    operation,
    outcome,
    durationMs: expect.any(Number),
  });
}

function findErrorEntries(capture: LogCapture): LogEntry[] {
  return capture.readEntries().filter((entry) => entry.level === 50 || entry.err !== undefined);
}

describe("graphql operation log", () => {
  test("logs a successful query", async () => {
    const entries = await readOperationEntries(listUsersQuery);
    expect(entries).toEqual([operationEntry("ListUsers", "success")]);
  });

  test("logs a business error returned by a mutation", async () => {
    const entries = await readOperationEntries(createUserMutation, {
      input: { name: "", email: "not-an-email" },
    });
    expect(entries).toEqual([operationEntry("CreateUser", "business_error")]);
  });

  test("logs a masked error as an internal error", async () => {
    const entries = await readOperationEntries(failingQuery);
    expect(entries).toEqual([operationEntry("FailUnexpectedly", "internal_error")]);
  });

  test("names an operation without a name as anonymous", async () => {
    const entries = await readOperationEntries(anonymousUsersQuery);
    expect(entries).toEqual([operationEntry("anonymous", "success")]);
  });
});

describe("graphql operation log for request errors", () => {
  test("logs invalid arguments as a request error", async () => {
    const entries = await readOperationEntries(invalidPageQuery);
    expect(entries).toEqual([operationEntry("InvalidPage", "request_error")]);
  });

  test("logs a document rejected before execution without an operation name", async () => {
    const entries = await readOperationEntries(unknownFieldQuery);
    expect(entries).toEqual([operationEntry(null, "request_error")]);
  });

  test("names the operation selected by operationName", async () => {
    const { app, capture } = await createObservedApp();
    await app.inject({
      method: "POST",
      url: "/graphql",
      payload: { query: twoOperationsDocument, operationName: "SecondListing" },
    });
    expect(findEventEntries(capture, "graphql.operation")).toEqual([
      expect.objectContaining({ operation: "SecondListing", outcome: "success" }),
    ]);
  });
});

describe("graphql error log", () => {
  test("logs a masked error once at error level with the original error", async () => {
    const capture = await captureOperation(failingQuery);
    const mentions = capture
      .readEntries()
      .filter((entry) => JSON.stringify(entry).includes(unexpectedFailureMessage));
    expect(mentions).toEqual([
      expect.objectContaining({
        level: 50,
        reqId: requestId,
        requestId,
        path: "failUnexpectedly",
        err: expect.objectContaining({ message: unexpectedFailureMessage }),
      }),
    ]);
  });

  test("does not log expected errors as errors", async () => {
    const { app, capture } = await createObservedApp();
    await executeGraphql(app, invalidPageQuery);
    await executeGraphql(app, unknownFieldQuery);
    await executeGraphql(app, brokenSyntaxQuery);
    expect(findErrorEntries(capture)).toEqual([]);
    expect(findEventEntries(capture, "graphql.operation")).toHaveLength(3);
  });
});

describe("request log privacy", () => {
  test("never logs variables or the query text", async () => {
    const capture = await captureOperation(createUserMutation, {
      input: { name: "", email: privateEmail },
    });
    expect(capture.readText()).not.toContain(privateEmail);
    expect(capture.readText()).not.toContain("createUser(input");
  });

  test("logs request paths without the query string", async () => {
    const { app, capture } = await createObservedApp();
    const query = `{ users(after: "${privateEmail}") { pageInfo { hasNextPage } } }`;
    await app.inject({ method: "GET", url: `/graphql?query=${encodeURIComponent(query)}` });
    expect(capture.readText()).not.toContain(encodeURIComponent(privateEmail));
    expect(capture.readText()).not.toContain(privateEmail);
    expect(capture.readEntries()).toContainEqual(
      expect.objectContaining({ req: { method: "GET", path: "/graphql" } }),
    );
  });
});

describe("health probe log", () => {
  test("does not log probes", async () => {
    const { app, capture } = await createObservedApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(capture.readEntries()).toEqual([]);
  });

  test("logs an unreachable database once at warn level", async () => {
    const unreachable = createPrismaClient(unreachableDatabaseUrl);
    const { app, capture } = await createObservedApp(unreachable);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(capture.readEntries()).toEqual([
      expect.objectContaining({ level: 40, event: "health.database_unreachable" }),
    ]);
  });
});

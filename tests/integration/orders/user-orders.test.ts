import type { FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi as vitestUtilities,
} from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { loadUserOrders } from "../../../src/modules/orders/orders.loaders.ts";
import type { UserRecord } from "../../../src/modules/users/users.types.ts";
import { encodeCursor } from "../../../src/shared/pagination/cursor.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { createTestPrismaClient, truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";

const usersWithOrdersQuery = `
  query UsersWithOrders($first: Int, $after: String) {
    users {
      edges {
        node {
          id
          orders(first: $first, after: $after) {
            edges { cursor node { id totalInCents } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
`;

const aliasedOrdersQuery = `
  query AliasedOrders {
    users {
      edges {
        node {
          id
          latest: orders(first: 1) { edges { node { id } } pageInfo { hasNextPage } }
          recent: orders(first: 3) { edges { node { id } } pageInfo { hasNextPage } }
        }
      }
    }
  }
`;

const invalidFirst = 101;
const invalidCursor = "not-a-cursor";
const badUserInputCode = "BAD_USER_INPUT";

type OrdersConnection = {
  edges: { cursor: string; node: { id: string; totalInCents: number } }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type UsersWithOrdersData = {
  users: { edges: { node: { id: string; orders: OrdersConnection } }[] };
};

type AliasedConnection = {
  edges: { node: { id: string } }[];
  pageInfo: { hasNextPage: boolean };
};

type AliasedOrdersData = {
  users: {
    edges: { node: { id: string; latest: AliasedConnection; recent: AliasedConnection } }[];
  };
};

type Scenario = {
  ana: UserRecord;
  bruno: UserRecord;
  carla: UserRecord;
  anaOrderIds: number[];
  brunoOrderId: number;
};

let prisma: PrismaClient;
let app: FastifyInstance;

beforeAll(async () => {
  prisma = createTestPrismaClient();
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
});

afterEach(() => {
  vitestUtilities.restoreAllMocks();
});

function createUserFixture(name: string): Promise<UserRecord> {
  return prisma.user.create({ data: { name, email: `${name.toLowerCase()}@example.com` } });
}

async function createOrderFixture(userId: number, totalCents: number): Promise<number> {
  const order = await prisma.order.create({ data: { userId, totalCents } });
  return order.id;
}

async function createScenario(): Promise<Scenario> {
  const ana = await createUserFixture("Ana");
  const bruno = await createUserFixture("Bruno");
  const carla = await createUserFixture("Carla");
  const oldestAnaOrderId = await createOrderFixture(ana.id, 100);
  const brunoOrderId = await createOrderFixture(bruno.id, 200);
  const middleAnaOrderId = await createOrderFixture(ana.id, 300);
  const newestAnaOrderId = await createOrderFixture(ana.id, 400);
  return {
    ana,
    bruno,
    carla,
    anaOrderIds: [newestAnaOrderId, middleAnaOrderId, oldestAnaOrderId],
    brunoOrderId,
  };
}

function listUsersWithOrders(variables: { first?: number; after?: string }) {
  return executeGraphql<UsersWithOrdersData>(app, usersWithOrdersQuery, variables);
}

function findOrders(data: UsersWithOrdersData | null, userId: number): OrdersConnection {
  const entry = data?.users.edges.find((edge) => edge.node.id === String(userId));
  if (entry === undefined) {
    throw new Error(`User ${userId} was not returned`);
  }
  return entry.node.orders;
}

function readOrderIds(connection: OrdersConnection): string[] {
  return connection.edges.map((edge) => edge.node.id);
}

function readNodeIds(connection: { edges: { node: { id: number } }[] }): number[] {
  return connection.edges.map((edge) => edge.node.id);
}

describe("User.orders first page", () => {
  test("returns the newest orders of each user with their own page state", async () => {
    const scenario = await createScenario();
    const result = await listUsersWithOrders({ first: 2 });
    const anaOrders = findOrders(result.data, scenario.ana.id);
    const brunoOrders = findOrders(result.data, scenario.bruno.id);
    expect(result.errors).toEqual([]);
    expect(readOrderIds(anaOrders)).toEqual(scenario.anaOrderIds.slice(0, 2).map(String));
    expect(anaOrders.pageInfo.hasNextPage).toBe(true);
    expect(anaOrders.pageInfo.endCursor).toBe(encodeCursor(scenario.anaOrderIds[1] ?? 0));
    expect(readOrderIds(brunoOrders)).toEqual([String(scenario.brunoOrderId)]);
    expect(brunoOrders.pageInfo.hasNextPage).toBe(false);
  });
});

describe("User.orders edges", () => {
  test("returns the total and cursor of each order", async () => {
    const scenario = await createScenario();
    const result = await listUsersWithOrders({ first: 1 });
    const anaOrders = findOrders(result.data, scenario.ana.id);
    expect(anaOrders.edges).toEqual([
      {
        cursor: encodeCursor(scenario.anaOrderIds[0] ?? 0),
        node: { id: String(scenario.anaOrderIds[0]), totalInCents: 400 },
      },
    ]);
  });

  test("returns an empty connection for a user without orders", async () => {
    const scenario = await createScenario();
    const result = await listUsersWithOrders({});
    expect(findOrders(result.data, scenario.carla.id)).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });
});

describe("User.orders next page", () => {
  test("returns the orders older than the cursor", async () => {
    const scenario = await createScenario();
    const firstPage = await listUsersWithOrders({ first: 2 });
    const endCursor = findOrders(firstPage.data, scenario.ana.id).pageInfo.endCursor ?? "";
    const result = await listUsersWithOrders({ first: 2, after: endCursor });
    const anaOrders = findOrders(result.data, scenario.ana.id);
    expect(readOrderIds(anaOrders)).toEqual([String(scenario.anaOrderIds[2])]);
    expect(anaOrders.pageInfo.hasNextPage).toBe(false);
    expect(readOrderIds(findOrders(result.data, scenario.bruno.id))).toEqual([
      String(scenario.brunoOrderId),
    ]);
  });
});

describe("User.orders batching", () => {
  test("serves different arguments of the same field in one request", async () => {
    const scenario = await createScenario();
    const result = await executeGraphql<AliasedOrdersData>(app, aliasedOrdersQuery);
    const ana = result.data?.users.edges.find((edge) => edge.node.id === String(scenario.ana.id));
    expect(result.errors).toEqual([]);
    expect(ana?.node.latest.edges.map((edge) => edge.node.id)).toEqual([
      String(scenario.anaOrderIds[0]),
    ]);
    expect(ana?.node.latest.pageInfo.hasNextPage).toBe(true);
    expect(ana?.node.recent.edges.map((edge) => edge.node.id)).toEqual(
      scenario.anaOrderIds.map(String),
    );
    expect(ana?.node.recent.pageInfo.hasNextPage).toBe(false);
  });
});

describe("User.orders loader", () => {
  test("runs one query for all users that share the same arguments", async () => {
    const scenario = await createScenario();
    const spy = vitestUtilities.spyOn(prisma, "$queryRaw");
    const connections = await loadUserOrders(prisma, [
      { obj: scenario.carla, params: { first: 2 } },
      { obj: scenario.ana, params: { first: 2 } },
      { obj: scenario.bruno, params: { first: 2 } },
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(connections.map(readNodeIds)).toEqual([
      [],
      scenario.anaOrderIds.slice(0, 2),
      [scenario.brunoOrderId],
    ]);
  });
});

describe("User.orders loader argument groups", () => {
  test("runs one query per distinct pair of arguments and keeps the order of the queries", async () => {
    const scenario = await createScenario();
    const spy = vitestUtilities.spyOn(prisma, "$queryRaw");
    const newestCursor = encodeCursor(scenario.anaOrderIds[0] ?? 0);
    const connections = await loadUserOrders(prisma, [
      { obj: scenario.ana, params: { first: 1 } },
      { obj: scenario.bruno, params: {} },
      { obj: scenario.ana, params: { first: 1, after: newestCursor } },
    ]);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(connections.map(readNodeIds)).toEqual([
      [scenario.anaOrderIds[0]],
      [scenario.brunoOrderId],
      [scenario.anaOrderIds[1]],
    ]);
  });
});

describe("User.orders validation", () => {
  test("rejects a page size above the maximum", async () => {
    await createScenario();
    const result = await listUsersWithOrders({ first: invalidFirst });
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.extensions?.code).toBe(badUserInputCode);
  });

  test("rejects a malformed cursor", async () => {
    await createScenario();
    const result = await listUsersWithOrders({ after: invalidCursor });
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.extensions?.code).toBe(badUserInputCode);
  });
});

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";
import { createQueryCountingPrismaClient } from "../../helpers/query-counter.ts";

const usersWithOrdersAndProductsQuery = `
  query UsersWithOrdersAndProducts {
    users {
      edges {
        node {
          id
          orders {
            edges {
              node {
                id
                items { quantity product { id name } }
              }
            }
          }
        }
      }
    }
  }
`;

const expectedQueryCount = 4;

type Shape = { users: number; ordersPerUser: number; itemsPerOrder: number };

type NestedListingData = {
  users: {
    edges: {
      node: {
        orders: { edges: { node: { items: { product: { id: string } }[] } }[] };
      };
    }[];
  };
};

const countingClient = createQueryCountingPrismaClient();
const { prisma, readQueryCount, resetQueryCount } = countingClient;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
});

async function seedProducts(database: PrismaClient, count: number): Promise<number[]> {
  const products = await Promise.all(
    Array.from({ length: count }, (_unused, index) =>
      database.product.create({
        data: { name: `Product ${index}`, priceCents: 1000, stock: 100 },
      }),
    ),
  );
  return products.map((product) => product.id);
}

async function seedUserWithOrders(
  database: PrismaClient,
  position: number,
  shape: Shape,
  productIds: number[],
): Promise<void> {
  const user = await database.user.create({
    data: { name: `User ${position}`, email: `user${position}@example.com` },
  });
  for (let orderIndex = 0; orderIndex < shape.ordersPerUser; orderIndex += 1) {
    await database.order.create({
      data: {
        userId: user.id,
        totalCents: 1000 * shape.itemsPerOrder,
        items: {
          create: productIds.slice(0, shape.itemsPerOrder).map((productId) => ({
            productId,
            quantity: 1,
            unitPriceCents: 1000,
          })),
        },
      },
    });
  }
}

async function seedUsersWithOrders(database: PrismaClient, shape: Shape): Promise<void> {
  const productIds = await seedProducts(database, shape.itemsPerOrder);
  for (let position = 0; position < shape.users; position += 1) {
    await seedUserWithOrders(database, position, shape, productIds);
  }
}

async function listNestedAndCountQueries(shape: Shape): Promise<number> {
  await seedUsersWithOrders(prisma, shape);
  resetQueryCount();
  const response = await executeGraphql<NestedListingData>(app, usersWithOrdersAndProductsQuery);
  expect(response.errors).toEqual([]);
  expect(response.data?.users.edges).toHaveLength(shape.users);
  return readQueryCount();
}

describe("nested listing users, orders, items and product", () => {
  test("resolves users, orders, items and products with exactly four queries", async () => {
    const queryCount = await listNestedAndCountQueries({
      users: 3,
      ordersPerUser: 2,
      itemsPerOrder: 2,
    });
    expect(queryCount).toBe(expectedQueryCount);
  });

  test("keeps four queries when the number of users doubles", async () => {
    const queryCount = await listNestedAndCountQueries({
      users: 6,
      ordersPerUser: 2,
      itemsPerOrder: 2,
    });
    expect(queryCount).toBe(expectedQueryCount);
  });
});

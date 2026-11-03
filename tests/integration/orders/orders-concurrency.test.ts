import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { createTestPrismaClient, truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";

const createOrderMutation = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      __typename
      ... on Order { id }
      ... on InsufficientStockError { code }
    }
  }
`;

type RequestedItem = { productId: number; quantity: number };

type CreateOrderData = { createOrder: { __typename: string } };

type OrderOutcome = { typename: string | undefined; errors: unknown[] };

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

async function createUserFixture(): Promise<number> {
  const user = await prisma.user.create({ data: { name: "Ana Souza", email: "ana@example.com" } });
  return user.id;
}

async function createProductFixture(name: string, stock: number): Promise<number> {
  const product = await prisma.product.create({ data: { name, priceCents: 1990, stock } });
  return product.id;
}

async function placeOrder(
  server: FastifyInstance,
  userId: number,
  items: RequestedItem[],
): Promise<OrderOutcome> {
  const result = await executeGraphql<CreateOrderData>(server, createOrderMutation, {
    input: {
      userId: String(userId),
      items: items.map((item) => ({ productId: String(item.productId), quantity: item.quantity })),
    },
  });
  return { typename: result.data?.createOrder.__typename, errors: result.errors };
}

function countByTypename(outcomes: OrderOutcome[], typename: string): number {
  return outcomes.filter((outcome) => outcome.typename === typename).length;
}

function collectErrors(outcomes: OrderOutcome[]): unknown[] {
  return outcomes.flatMap((outcome) => outcome.errors);
}

async function readStock(database: PrismaClient, productId: number): Promise<number> {
  const product = await database.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true },
  });
  return product.stock;
}

describe("createOrder under concurrent demand for one product", () => {
  test("sells exactly the available stock under 50 concurrent orders", async () => {
    const userId = await createUserFixture();
    const productId = await createProductFixture("Keyboard", 10);
    const outcomes = await Promise.all(
      Array.from({ length: 50 }, () => placeOrder(app, userId, [{ productId, quantity: 1 }])),
    );
    expect(collectErrors(outcomes)).toEqual([]);
    expect(countByTypename(outcomes, "Order")).toBe(10);
    expect(countByTypename(outcomes, "InsufficientStockError")).toBe(40);
    expect(await readStock(prisma, productId)).toBe(0);
    expect(await prisma.order.count()).toBe(10);
  });
});

describe("createOrder under crossed concurrent orders", () => {
  test("completes crossed orders without deadlock", async () => {
    const userId = await createUserFixture();
    const firstProductId = await createProductFixture("Keyboard", 100);
    const secondProductId = await createProductFixture("Mouse", 100);
    const forwardItems = [
      { productId: firstProductId, quantity: 1 },
      { productId: secondProductId, quantity: 1 },
    ];
    const reversedItems = [
      { productId: secondProductId, quantity: 1 },
      { productId: firstProductId, quantity: 1 },
    ];
    const rounds = Array.from({ length: 20 }, () =>
      Promise.all([placeOrder(app, userId, forwardItems), placeOrder(app, userId, reversedItems)]),
    );
    const outcomes = (await Promise.all(rounds)).flat();
    expect(collectErrors(outcomes)).toEqual([]);
    expect(countByTypename(outcomes, "Order")).toBe(40);
    expect(await readStock(prisma, firstProductId)).toBe(60);
    expect(await readStock(prisma, secondProductId)).toBe(60);
  });
});

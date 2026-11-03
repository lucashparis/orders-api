import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { loadOrderItems } from "../../../src/modules/orders/orders.loaders.ts";
import { findItemsByOrderIds } from "../../../src/modules/orders/orders.repository.ts";
import { createOrdersService } from "../../../src/modules/orders/orders.service.ts";
import type { OrderRecord } from "../../../src/modules/orders/orders.types.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { createTestPrismaClient, truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";

const createOrderMutation = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      __typename
      ... on Order {
        id
        totalInCents
        createdAt
        items { quantity unitPriceInCents product { id name } }
      }
      ... on ValidationError { code message fields { field message } }
      ... on UserNotFoundError { code message userId }
      ... on ProductNotFoundError { code message productIds }
      ... on InsufficientStockError { code message items { productId requested available } }
      ... on OrderTotalLimitExceededError { code message limitInCents }
    }
  }
`;

const maximumAmountInCents = 2_147_483_647;
const unknownUserId = "999999";
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type RequestedItem = { productId: number; quantity: number };

type CreateOrderResult = {
  __typename: string;
  id?: string;
  totalInCents?: number;
  createdAt?: string;
  items?: Record<string, unknown>[];
  code?: string;
  message?: string;
  fields?: { field: string; message: string }[];
  userId?: string;
  productIds?: string[];
  limitInCents?: number;
};

type CreateOrderData = { createOrder: CreateOrderResult };

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

async function createProductFixture(
  name: string,
  priceCents: number,
  stock: number,
): Promise<number> {
  const product = await prisma.product.create({ data: { name, priceCents, stock } });
  return product.id;
}

async function createOrderFixture(userId: number, productIds: number[]): Promise<OrderRecord> {
  const order = await prisma.order.create({
    data: {
      userId,
      totalCents: 0,
      items: {
        create: productIds.map((productId) => ({ productId, quantity: 1, unitPriceCents: 0 })),
      },
    },
  });
  return {
    id: order.id,
    userId: order.userId,
    totalInCents: order.totalCents,
    createdAt: order.createdAt,
  };
}

async function readStocks(productIds: number[]): Promise<number[]> {
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    orderBy: { id: "asc" },
  });
  return products.map((product) => product.stock);
}

function toOrderInput(userId: number | string, items: RequestedItem[]) {
  return {
    userId: String(userId),
    items: items.map((item) => ({ productId: String(item.productId), quantity: item.quantity })),
  };
}

async function placeOrder(
  userId: number | string,
  items: RequestedItem[],
): Promise<CreateOrderResult | undefined> {
  const result = await executeGraphql<CreateOrderData>(app, createOrderMutation, {
    input: toOrderInput(userId, items),
  });
  expect(result.errors).toEqual([]);
  return result.data?.createOrder;
}

async function captureLogLines(
  run: (logger: FastifyBaseLogger) => Promise<unknown>,
): Promise<string[]> {
  const lines: string[] = [];
  const stream = { write: (line: string) => lines.push(line) };
  const loggerHost = Fastify({ logger: { level: "info", stream } });
  try {
    await run(loggerHost.log);
  } finally {
    await loggerHost.close();
  }
  return lines;
}

function parseLogLines(lines: string[]): unknown[] {
  return lines.map((line): unknown => JSON.parse(line));
}

describe("createOrder", () => {
  test("creates the order with captured prices and decrements stock", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const mouseId = await createProductFixture("Mouse", 500, 3);
    const created = await placeOrder(userId, [
      { productId: keyboardId, quantity: 2 },
      { productId: mouseId, quantity: 1 },
    ]);
    expect(created).toMatchObject({ __typename: "Order", totalInCents: 4480 });
    expect(created?.id).toBeTypeOf("string");
    expect(created?.createdAt).toMatch(isoTimestampPattern);
    expect(created?.items).toEqual([
      {
        quantity: 2,
        unitPriceInCents: 1990,
        product: { id: String(keyboardId), name: "Keyboard" },
      },
      { quantity: 1, unitPriceInCents: 500, product: { id: String(mouseId), name: "Mouse" } },
    ]);
    expect(await readStocks([keyboardId, mouseId])).toEqual([3, 2]);
  });

  test("keeps the requested item sequence when product ids are not ascending", async () => {
    const userId = await createUserFixture();
    const cableId = await createProductFixture("Cable", 300, 4);
    const monitorId = await createProductFixture("Monitor", 89900, 2);
    const created = await placeOrder(userId, [
      { productId: monitorId, quantity: 1 },
      { productId: cableId, quantity: 3 },
    ]);
    expect(created?.items).toEqual([
      { quantity: 1, unitPriceInCents: 89900, product: { id: String(monitorId), name: "Monitor" } },
      { quantity: 3, unitPriceInCents: 300, product: { id: String(cableId), name: "Cable" } },
    ]);
    expect(created?.totalInCents).toBe(90800);
  });
});

describe("createOrder price snapshot", () => {
  test("keeps the unit price paid after the product price changes", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const created = await placeOrder(userId, [{ productId: keyboardId, quantity: 1 }]);
    await prisma.product.update({ where: { id: keyboardId }, data: { priceCents: 2500 } });
    const items = await findItemsByOrderIds(prisma, [Number(created?.id)]);
    expect(items).toEqual([
      expect.objectContaining({ productId: keyboardId, quantity: 1, unitPriceInCents: 1990 }),
    ]);
  });
});

describe("createOrder user check", () => {
  test("rejects an unknown user", async () => {
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const rejected = await placeOrder(unknownUserId, [{ productId: keyboardId, quantity: 1 }]);
    expect(rejected).toEqual({
      __typename: "UserNotFoundError",
      code: "USER_NOT_FOUND",
      message: "User not found.",
      userId: unknownUserId,
    });
    expect(await readStocks([keyboardId])).toEqual([5]);
  });
});

describe("createOrder product checks", () => {
  test("lists every missing product in ascending order without touching stock", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const rejected = await placeOrder(userId, [
      { productId: keyboardId, quantity: 1 },
      { productId: 9002, quantity: 1 },
      { productId: 9001, quantity: 1 },
    ]);
    expect(rejected).toEqual({
      __typename: "ProductNotFoundError",
      code: "PRODUCT_NOT_FOUND",
      message: "One or more products were not found.",
      productIds: ["9001", "9002"],
    });
    expect(await readStocks([keyboardId])).toEqual([5]);
    expect(await prisma.order.count()).toBe(0);
  });

  test("reports missing products before stock shortages", async () => {
    const userId = await createUserFixture();
    const mouseId = await createProductFixture("Mouse", 500, 0);
    const rejected = await placeOrder(userId, [
      { productId: mouseId, quantity: 1 },
      { productId: 9001, quantity: 1 },
    ]);
    expect(rejected).toMatchObject({ __typename: "ProductNotFoundError", productIds: ["9001"] });
  });
});

describe("createOrder stock check", () => {
  test("lists every stock shortage without touching stock", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 1);
    const mouseId = await createProductFixture("Mouse", 500, 0);
    const cableId = await createProductFixture("Cable", 300, 9);
    const rejected = await placeOrder(userId, [
      { productId: cableId, quantity: 1 },
      { productId: mouseId, quantity: 1 },
      { productId: keyboardId, quantity: 2 },
    ]);
    expect(rejected).toEqual({
      __typename: "InsufficientStockError",
      code: "INSUFFICIENT_STOCK",
      message: "Insufficient stock for one or more items.",
      items: [
        { productId: String(keyboardId), requested: 2, available: 1 },
        { productId: String(mouseId), requested: 1, available: 0 },
      ],
    });
    expect(await readStocks([keyboardId, mouseId, cableId])).toEqual([1, 0, 9]);
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("createOrder validation", () => {
  test("rejects an order without items", async () => {
    const userId = await createUserFixture();
    const rejected = await placeOrder(userId, []);
    expect(rejected).toMatchObject({ __typename: "ValidationError", code: "BAD_USER_INPUT" });
    expect(rejected?.fields?.map((entry) => entry.field)).toEqual(["items"]);
  });
});

describe("createOrder total limit", () => {
  test("accepts a total exactly at the limit", async () => {
    const userId = await createUserFixture();
    const vaultId = await createProductFixture("Vault", maximumAmountInCents, 2);
    const created = await placeOrder(userId, [{ productId: vaultId, quantity: 1 }]);
    expect(created).toMatchObject({ __typename: "Order", totalInCents: maximumAmountInCents });
    expect(await readStocks([vaultId])).toEqual([1]);
  });

  test("rejects a total above the limit", async () => {
    const userId = await createUserFixture();
    const vaultId = await createProductFixture("Vault", maximumAmountInCents, 2);
    const rejected = await placeOrder(userId, [{ productId: vaultId, quantity: 2 }]);
    expect(rejected).toEqual({
      __typename: "OrderTotalLimitExceededError",
      code: "ORDER_TOTAL_LIMIT_EXCEEDED",
      message: "Order total exceeds the maximum allowed amount.",
      limitInCents: maximumAmountInCents,
    });
    expect(await readStocks([vaultId])).toEqual([2]);
  });
});

describe("createOrder total boundary", () => {
  test("rejects a total one cent above the limit", async () => {
    const userId = await createUserFixture();
    const vaultId = await createProductFixture("Vault", maximumAmountInCents, 2);
    const stickerId = await createProductFixture("Sticker", 1, 2);
    const rejected = await placeOrder(userId, [
      { productId: vaultId, quantity: 1 },
      { productId: stickerId, quantity: 1 },
    ]);
    expect(rejected?.__typename).toBe("OrderTotalLimitExceededError");
    expect(await readStocks([vaultId, stickerId])).toEqual([2, 2]);
  });
});

describe("createOrder logging", () => {
  test("logs the created order without the raw input", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const input = toOrderInput(userId, [{ productId: keyboardId, quantity: 2 }]);
    const lines = await captureLogLines((logger) =>
      createOrdersService({ prisma, logger }).createOrder(input),
    );
    expect(parseLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        event: "order.created",
        orderId: 1,
        userId,
        itemsCount: 1,
        totalInCents: 3980,
      }),
    ]);
    expect(lines.join("")).not.toContain("quantity");
  });

  test("logs the code of a rejected order", async () => {
    const lines = await captureLogLines(async (logger) => {
      const service = createOrdersService({ prisma, logger });
      await service.createOrder(toOrderInput(unknownUserId, [{ productId: 1, quantity: 1 }]));
      await service.createOrder(toOrderInput(unknownUserId, []));
    });
    expect(parseLogLines(lines)).toEqual([
      expect.objectContaining({ level: 30, event: "order.rejected", code: "USER_NOT_FOUND" }),
      expect.objectContaining({ level: 30, event: "order.rejected", code: "BAD_USER_INPUT" }),
    ]);
  });
});

describe("Order.items loader", () => {
  test("returns the items of each order in the order of the queries", async () => {
    const userId = await createUserFixture();
    const keyboardId = await createProductFixture("Keyboard", 1990, 5);
    const mouseId = await createProductFixture("Mouse", 500, 3);
    const firstOrder = await createOrderFixture(userId, [mouseId, keyboardId]);
    const secondOrder = await createOrderFixture(userId, [keyboardId]);
    const emptyOrder = await createOrderFixture(userId, []);
    const grouped = await loadOrderItems(prisma, [
      { obj: secondOrder },
      { obj: emptyOrder },
      { obj: firstOrder },
    ]);
    const productIdsPerOrder = grouped.map((items) => items.map((item) => item.productId));
    expect(productIdsPerOrder).toEqual([[keyboardId], [], [mouseId, keyboardId]]);
  });
});

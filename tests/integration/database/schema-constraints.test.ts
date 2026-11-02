import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createTestPrismaClient,
  readConstraintViolation,
  truncateAllTables,
} from "../../helpers/database.ts";

const prisma = createTestPrismaClient();

beforeEach(async () => {
  await truncateAllTables(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function insertUser(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO users (name, email) VALUES ('Ana', 'ana@example.com') RETURNING id`;
  return rows[0]?.id ?? 0;
}

async function insertProduct(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO products (name, price_cents, stock) VALUES ('Cap', 100, 10) RETURNING id`;
  return rows[0]?.id ?? 0;
}

async function insertOrder(): Promise<number> {
  const userId = await insertUser();
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO orders (user_id, total_cents) VALUES (${userId}, 100) RETURNING id`;
  return rows[0]?.id ?? 0;
}

function insertItem(orderId: number, productId: number, quantity: number): Promise<number> {
  return prisma.$executeRaw`INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
    VALUES (${orderId}, ${productId}, ${quantity}, 100)`;
}

describe("product and user check constraints", () => {
  test("rejects negative stock", async () => {
    const message = await readConstraintViolation(
      () =>
        prisma.$executeRaw`INSERT INTO products (name, price_cents, stock) VALUES ('Cap', 100, -1)`,
    );
    expect(message).toContain("products_stock_non_negative");
  });

  test("rejects negative price", async () => {
    const message = await readConstraintViolation(
      () =>
        prisma.$executeRaw`INSERT INTO products (name, price_cents, stock) VALUES ('Cap', -1, 1)`,
    );
    expect(message).toContain("products_price_cents_non_negative");
  });

  test("rejects uppercase email", async () => {
    const message = await readConstraintViolation(
      () => prisma.$executeRaw`INSERT INTO users (name, email) VALUES ('Ana', 'ANA@example.com')`,
    );
    expect(message).toContain("users_email_lowercase");
  });
});

describe("order item constraints", () => {
  test("rejects zero quantity", async () => {
    const orderId = await insertOrder();
    const productId = await insertProduct();
    const message = await readConstraintViolation(() => insertItem(orderId, productId, 0));
    expect(message).toContain("order_items_quantity_positive");
  });

  test("rejects the same product twice in one order", async () => {
    const orderId = await insertOrder();
    const productId = await insertProduct();
    await insertItem(orderId, productId, 1);
    const message = await readConstraintViolation(() => insertItem(orderId, productId, 2));
    expect(message).toContain("order_items_order_id_product_id_key");
  });
});

describe("key constraints", () => {
  test("rejects an order without user", async () => {
    const message = await readConstraintViolation(
      () => prisma.$executeRaw`INSERT INTO orders (total_cents) VALUES (100)`,
    );
    expect(message).toContain("user_id");
  });

  test("rejects an explicit id on insert", async () => {
    const message = await readConstraintViolation(
      () =>
        prisma.$executeRaw`INSERT INTO users (id, name, email) VALUES (1, 'Ana', 'ana@example.com')`,
    );
    expect(message).toContain("GENERATED ALWAYS");
  });
});

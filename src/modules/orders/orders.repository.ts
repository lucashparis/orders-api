import type { Order, OrderItem } from "../../generated/prisma/client.ts";
import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import type { LockedProduct, OrderItemRecord, OrderRecord, RequestedItem } from "./orders.types.ts";

export type NewOrder = {
  userId: number;
  totalInCents: number;
  items: Array<{ productId: number; quantity: number; unitPriceInCents: number }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function toLockedProduct(row: unknown): LockedProduct {
  if (
    !isRecord(row) ||
    !isInteger(row.id) ||
    !isInteger(row.price_cents) ||
    !isInteger(row.stock)
  ) {
    throw new Error("The product lock query returned a row without integer id, price and stock.");
  }
  return { id: row.id, priceInCents: row.price_cents, stock: row.stock };
}

function toRecentOrderRecord(row: unknown): OrderRecord {
  if (
    !isRecord(row) ||
    !isInteger(row.id) ||
    !isInteger(row.user_id) ||
    !isInteger(row.total_cents) ||
    !(row.created_at instanceof Date)
  ) {
    throw new Error("The recent orders query returned a row without the expected columns.");
  }
  return {
    id: row.id,
    userId: row.user_id,
    totalInCents: row.total_cents,
    createdAt: row.created_at,
  };
}

function toOrderRecord(row: Order): OrderRecord {
  return { id: row.id, userId: row.userId, totalInCents: row.totalCents, createdAt: row.createdAt };
}

function toOrderItemRecord(row: OrderItem): OrderItemRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    quantity: row.quantity,
    unitPriceInCents: row.unitPriceCents,
  };
}

export async function userExists(database: DatabaseClient, userId: number): Promise<boolean> {
  const user = await database.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user !== null;
}

export async function lockProducts(
  database: DatabaseClient,
  productIds: readonly number[],
): Promise<LockedProduct[]> {
  const rows = await database.$queryRaw<unknown[]>`
    SELECT id, price_cents, stock
    FROM products
    WHERE id = ANY(${productIds}::int[])
    ORDER BY id
    FOR NO KEY UPDATE
  `;
  return rows.map(toLockedProduct);
}

export async function decrementStock(
  database: DatabaseClient,
  requestedItems: readonly RequestedItem[],
): Promise<void> {
  const productIds = requestedItems.map((item) => item.productId);
  const quantities = requestedItems.map((item) => item.quantity);
  await database.$executeRaw`
    UPDATE products AS product
    SET stock = product.stock - requested.quantity
    FROM unnest(${productIds}::int[], ${quantities}::int[]) AS requested (product_id, quantity)
    WHERE product.id = requested.product_id
  `;
}

export async function insertOrder(database: DatabaseClient, order: NewOrder): Promise<OrderRecord> {
  const row = await database.order.create({
    data: {
      userId: order.userId,
      totalCents: order.totalInCents,
      items: {
        createMany: {
          data: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceInCents,
          })),
        },
      },
    },
  });
  return toOrderRecord(row);
}

export async function findItemsByOrderIds(
  database: DatabaseClient,
  orderIds: readonly number[],
): Promise<OrderItemRecord[]> {
  const rows = await database.orderItem.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { id: "asc" },
  });
  return rows.map(toOrderItemRecord);
}

export async function findRecentOrdersByUserIds(
  database: DatabaseClient,
  userIds: readonly number[],
  pageRequest: PageRequest,
): Promise<OrderRecord[]> {
  const rows = await database.$queryRaw<unknown[]>`
    SELECT id, user_id, total_cents, created_at
    FROM (
      SELECT id, user_id, total_cents, created_at,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS position
      FROM orders
      WHERE user_id = ANY(${userIds}::int[]) AND (${pageRequest.afterId}::int IS NULL OR id < ${pageRequest.afterId}::int)
    ) AS ranked
    WHERE position <= ${pageRequest.pageSize + 1}
    ORDER BY user_id, id DESC
  `;
  return rows.map(toRecentOrderRecord);
}

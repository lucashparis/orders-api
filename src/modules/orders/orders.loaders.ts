import type { MercuriusLoaders } from "mercurius";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import { findProductsByIds } from "../products/products.repository.ts";
import type { ProductRecord } from "../products/products.types.ts";
import { findItemsByOrderIds } from "./orders.repository.ts";
import type { OrderItemRecord, OrderRecord } from "./orders.types.ts";

type LoaderQuery<Parent> = { obj: Parent };

function groupItemsByOrderId(
  items: readonly OrderItemRecord[],
): ReadonlyMap<number, OrderItemRecord[]> {
  const itemsByOrderId = new Map<number, OrderItemRecord[]>();
  for (const item of items) {
    const orderItems = itemsByOrderId.get(item.orderId) ?? [];
    orderItems.push(item);
    itemsByOrderId.set(item.orderId, orderItems);
  }
  return itemsByOrderId;
}

export async function loadOrderItems(
  database: DatabaseClient,
  queries: readonly LoaderQuery<OrderRecord>[],
): Promise<OrderItemRecord[][]> {
  const orderIds = [...new Set(queries.map((query) => query.obj.id))];
  const itemsByOrderId = groupItemsByOrderId(await findItemsByOrderIds(database, orderIds));
  return queries.map((query) => itemsByOrderId.get(query.obj.id) ?? []);
}

export async function loadOrderItemProducts(
  database: DatabaseClient,
  queries: readonly LoaderQuery<OrderItemRecord>[],
): Promise<Array<ProductRecord | null>> {
  const productIds = [...new Set(queries.map((query) => query.obj.productId))];
  const products = await findProductsByIds(database, productIds);
  const productsById = new Map(products.map((product) => [product.id, product]));
  return queries.map((query) => productsById.get(query.obj.productId) ?? null);
}

export function createOrdersLoaders(prisma: PrismaClient): MercuriusLoaders {
  return {
    Order: {
      items: (queries: LoaderQuery<OrderRecord>[]) => loadOrderItems(prisma, queries),
    },
    OrderItem: {
      product: (queries: LoaderQuery<OrderItemRecord>[]) => loadOrderItemProducts(prisma, queries),
    },
  };
}

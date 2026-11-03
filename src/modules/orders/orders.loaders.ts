import type { MercuriusLoaders } from "mercurius";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import { buildConnection } from "../../shared/pagination/connection.ts";
import { type PageRequest, parsePageRequest } from "../../shared/pagination/page-request.ts";
import { findProductsByIds } from "../products/products.repository.ts";
import type { ProductRecord } from "../products/products.types.ts";
import type { UserRecord } from "../users/users.types.ts";
import { findItemsByOrderIds, findRecentOrdersByUserIds } from "./orders.repository.ts";
import type { OrderConnectionRecord, OrderItemRecord, OrderRecord } from "./orders.types.ts";

type LoaderQuery<Parent> = { obj: Parent };

type ConnectionArguments = { first?: number | null; after?: string | null };

type UserOrdersQuery = LoaderQuery<UserRecord> & { params: ConnectionArguments };

type GroupMember = { position: number; userId: number };

type QueryGroup = { pageRequest: PageRequest; members: GroupMember[] };

type PositionedConnection = { position: number; connection: OrderConnectionRecord };

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

function groupQueriesByArguments(queries: readonly UserOrdersQuery[]): QueryGroup[] {
  const groups = new Map<string, QueryGroup>();
  queries.forEach((query, position) => {
    const key = JSON.stringify([query.params.first ?? null, query.params.after ?? null]);
    const group = groups.get(key) ?? { pageRequest: parsePageRequest(query.params), members: [] };
    group.members.push({ position, userId: query.obj.id });
    groups.set(key, group);
  });
  return [...groups.values()];
}

function groupOrdersByUserId(orders: readonly OrderRecord[]): ReadonlyMap<number, OrderRecord[]> {
  const ordersByUserId = new Map<number, OrderRecord[]>();
  for (const order of orders) {
    const userOrders = ordersByUserId.get(order.userId) ?? [];
    userOrders.push(order);
    ordersByUserId.set(order.userId, userOrders);
  }
  return ordersByUserId;
}

async function loadGroupConnections(
  database: DatabaseClient,
  group: QueryGroup,
): Promise<PositionedConnection[]> {
  const userIds = [...new Set(group.members.map((member) => member.userId))];
  const orders = await findRecentOrdersByUserIds(database, userIds, group.pageRequest);
  const ordersByUserId = groupOrdersByUserId(orders);
  return group.members.map((member) => ({
    position: member.position,
    connection: buildConnection(
      ordersByUserId.get(member.userId) ?? [],
      group.pageRequest.pageSize,
    ),
  }));
}

export async function loadUserOrders(
  database: DatabaseClient,
  queries: readonly UserOrdersQuery[],
): Promise<OrderConnectionRecord[]> {
  const groups = groupQueriesByArguments(queries);
  const groupResults = await Promise.all(
    groups.map((group) => loadGroupConnections(database, group)),
  );
  return groupResults
    .flat()
    .sort((first, second) => first.position - second.position)
    .map((positioned) => positioned.connection);
}

export function createOrdersLoaders(prisma: PrismaClient): MercuriusLoaders {
  return {
    User: {
      orders: (queries: UserOrdersQuery[]) => loadUserOrders(prisma, queries),
    },
    Order: {
      items: (queries: LoaderQuery<OrderRecord>[]) => loadOrderItems(prisma, queries),
    },
    OrderItem: {
      product: (queries: LoaderQuery<OrderItemRecord>[]) => loadOrderItemProducts(prisma, queries),
    },
  };
}

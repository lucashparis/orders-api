import type { Product } from "../../generated/prisma/client.ts";
import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import type { CreateProductInput } from "./products.schemas.ts";
import type { ProductRecord } from "./products.types.ts";

function toProductRecord(row: Product): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    priceInCents: row.priceCents,
    stock: row.stock,
    createdAt: row.createdAt,
  };
}

export async function insertProduct(
  database: DatabaseClient,
  input: CreateProductInput,
): Promise<ProductRecord> {
  const row = await database.product.create({
    data: { name: input.name, priceCents: input.priceInCents, stock: input.stock },
  });
  return toProductRecord(row);
}

export async function findProductsAfter(
  database: DatabaseClient,
  pageRequest: PageRequest,
): Promise<ProductRecord[]> {
  const rows = await database.product.findMany({
    where: { id: { gt: pageRequest.afterId ?? 0 } },
    orderBy: { id: "asc" },
    take: pageRequest.pageSize + 1,
  });
  return rows.map(toProductRecord);
}

export async function findProductsByIds(
  database: DatabaseClient,
  productIds: readonly number[],
): Promise<ProductRecord[]> {
  const rows = await database.product.findMany({ where: { id: { in: [...productIds] } } });
  return rows.map(toProductRecord);
}

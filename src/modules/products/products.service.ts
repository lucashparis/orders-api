import type { PrismaClient } from "../../generated/prisma/client.ts";
import { toValidationFailure } from "../../shared/errors/validation-failure.ts";
import { buildConnection } from "../../shared/pagination/connection.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import { findProductsAfter, insertProduct } from "./products.repository.ts";
import { createProductInputSchema } from "./products.schemas.ts";
import type { CreateProductOutcome, ProductConnectionRecord } from "./products.types.ts";

export type ProductsService = {
  createProduct(input: unknown): Promise<CreateProductOutcome>;
  listProducts(pageRequest: PageRequest): Promise<ProductConnectionRecord>;
};

export function createProductsService(dependencies: { prisma: PrismaClient }): ProductsService {
  const { prisma } = dependencies;
  return {
    async createProduct(input) {
      const parsed = createProductInputSchema.safeParse(input);
      if (!parsed.success) {
        return toValidationFailure(parsed.error);
      }
      const product = await insertProduct(prisma, parsed.data);
      return { kind: "ProductCreated", product };
    },
    async listProducts(pageRequest) {
      const rows = await findProductsAfter(prisma, pageRequest);
      return buildConnection(rows, pageRequest.pageSize);
    },
  };
}

import type { Resolvers, ResolversParentTypes } from "../../generated/graphql.ts";
import { toErrorPayload } from "../../shared/graphql/error-payload.ts";
import type { GraphqlModule, ModuleDependencies } from "../../shared/graphql/graphql-module.ts";
import { parsePageRequest } from "../../shared/pagination/page-request.ts";
import { createProductsService } from "./products.service.ts";
import { productsTypeDefs } from "./products.type-defs.ts";
import type { CreateProductOutcome } from "./products.types.ts";

function toCreateProductResult(
  outcome: CreateProductOutcome,
): ResolversParentTypes["CreateProductResult"] {
  if (outcome.kind === "ProductCreated") {
    const product = { ...outcome.product, __typename: "Product" as const };
    return product;
  }
  return toErrorPayload(outcome);
}

export function createProductsModule(dependencies: ModuleDependencies): GraphqlModule {
  const service = createProductsService({ prisma: dependencies.prisma });
  const resolvers = {
    Query: {
      products: (_parent, args) => service.listProducts(parsePageRequest(args)),
    },
    Mutation: {
      createProduct: async (_parent, args) =>
        toCreateProductResult(await service.createProduct(args.input)),
    },
    Product: {
      createdAt: (product) => product.createdAt.toISOString(),
    },
  } satisfies Resolvers;
  return { typeDefs: productsTypeDefs, resolvers, loaders: {} };
}

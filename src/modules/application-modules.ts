import type { GraphqlModule, ModuleDependencies } from "../shared/graphql/graphql-module.ts";
import { createOrdersModule } from "./orders/orders.resolvers.ts";
import { createProductsModule } from "./products/products.resolvers.ts";
import { createUsersModule } from "./users/users.resolvers.ts";

export function createApplicationModules(dependencies: ModuleDependencies): GraphqlModule[] {
  return [
    createUsersModule(dependencies),
    createProductsModule(dependencies),
    createOrdersModule(dependencies),
  ];
}

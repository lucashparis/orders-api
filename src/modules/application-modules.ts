import type { GraphqlModule, ModuleDependencies } from "../shared/graphql/graphql-module.ts";
import { createUsersModule } from "./users/users.resolvers.ts";

export function createApplicationModules(dependencies: ModuleDependencies): GraphqlModule[] {
  return [createUsersModule(dependencies)];
}

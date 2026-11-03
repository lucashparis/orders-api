import type { Resolvers, ResolversParentTypes } from "../../generated/graphql.ts";
import { toErrorPayload } from "../../shared/graphql/error-payload.ts";
import type { GraphqlModule, ModuleDependencies } from "../../shared/graphql/graphql-module.ts";
import { parsePageRequest } from "../../shared/pagination/page-request.ts";
import { createUsersService } from "./users.service.ts";
import { usersTypeDefs } from "./users.type-defs.ts";
import type { CreateUserOutcome } from "./users.types.ts";

function toCreateUserResult(outcome: CreateUserOutcome): ResolversParentTypes["CreateUserResult"] {
  if (outcome.kind === "UserCreated") {
    const user = { ...outcome.user, __typename: "User" as const };
    return user;
  }
  return toErrorPayload(outcome);
}

export function createUsersModule(dependencies: ModuleDependencies): GraphqlModule {
  const service = createUsersService({ prisma: dependencies.prisma });
  const resolvers = {
    Query: {
      users: (_parent, args) => service.listUsers(parsePageRequest(args)),
    },
    Mutation: {
      createUser: async (_parent, args) => toCreateUserResult(await service.createUser(args.input)),
    },
    User: {
      createdAt: (user) => user.createdAt.toISOString(),
    },
  } satisfies Resolvers;
  return { typeDefs: usersTypeDefs, resolvers, loaders: {} };
}

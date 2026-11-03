import type { Resolvers, ResolversParentTypes } from "../../generated/graphql.ts";
import { toErrorPayload } from "../../shared/graphql/error-payload.ts";
import type { GraphqlModule, ModuleDependencies } from "../../shared/graphql/graphql-module.ts";
import { createOrdersLoaders } from "./orders.loaders.ts";
import { createOrdersService } from "./orders.service.ts";
import { ordersTypeDefs } from "./orders.type-defs.ts";
import type { CreateOrderOutcome } from "./orders.types.ts";

function toCreateOrderResult(
  outcome: CreateOrderOutcome,
): ResolversParentTypes["CreateOrderResult"] {
  if (outcome.kind === "OrderCreated") {
    const order = { ...outcome.order, __typename: "Order" as const };
    return order;
  }
  return toErrorPayload(outcome);
}

export function createOrdersModule(dependencies: ModuleDependencies): GraphqlModule {
  const service = createOrdersService(dependencies);
  const resolvers = {
    Mutation: {
      createOrder: async (_parent, args, context) =>
        toCreateOrderResult(await service.createOrder(args.input, context.reply.request.log)),
    },
    Order: {
      createdAt: (order) => order.createdAt.toISOString(),
    },
  } satisfies Resolvers;
  return {
    typeDefs: ordersTypeDefs,
    resolvers,
    loaders: createOrdersLoaders(dependencies.prisma),
  };
}

import Fastify, { type FastifyInstance } from "fastify";
import mercurius from "mercurius";
import { baseTypeDefs } from "./shared/graphql/base-type-defs.ts";
import { formatGraphqlErrors } from "./shared/graphql/error-formatter.ts";
import type { BuildAppOptions } from "./shared/graphql/graphql-module.ts";
import { mergeLoaders, mergeResolvers } from "./shared/graphql/merge-modules.ts";
import { registerOperationLog } from "./shared/graphql/operation-log.ts";
import { registerHealthRoute } from "./shared/http/health-route.ts";
import { registerRequestIdEcho, resolveRequestId } from "./shared/http/request-id.ts";
import { buildLoggerOptions } from "./shared/logger/logger-options.ts";

const maximumQueryDepth = 10;

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { environment, prisma, createGraphqlModules } = options;
  const app = Fastify({
    logger: buildLoggerOptions(environment, options.logDestination),
    requestIdHeader: false,
    genReqId: resolveRequestId,
  });
  registerRequestIdEcho(app);
  registerHealthRoute(app, prisma);
  const modules = createGraphqlModules({ prisma, logger: app.log });
  await app.register(mercurius, {
    schema: [baseTypeDefs, ...modules.map((graphqlModule) => graphqlModule.typeDefs)].join("\n"),
    resolvers: mergeResolvers(modules),
    loaders: mergeLoaders(modules),
    graphiql: environment.graphiqlEnabled,
    queryDepth: maximumQueryDepth,
    errorFormatter: formatGraphqlErrors,
  });
  registerOperationLog(app);
  return app;
}

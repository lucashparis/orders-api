import type { FastifyBaseLogger } from "fastify";
import type { IResolvers, MercuriusLoaders } from "mercurius";
import type { Environment } from "../../config/env.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";

export type ModuleDependencies = { prisma: PrismaClient; logger: FastifyBaseLogger };

export type GraphqlModule = {
  typeDefs: string;
  resolvers: IResolvers;
  loaders: MercuriusLoaders;
};

export type BuildAppOptions = {
  environment: Environment;
  prisma: PrismaClient;
  createGraphqlModules: (dependencies: ModuleDependencies) => GraphqlModule[];
};

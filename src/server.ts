import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { loadEnvironment } from "./config/env.ts";
import { createApplicationModules } from "./modules/application-modules.ts";
import { createPrismaClient } from "./shared/database/prisma-client.ts";
import { registerGracefulShutdown } from "./shared/http/graceful-shutdown.ts";

export async function startServer(): Promise<FastifyInstance> {
  const environment = loadEnvironment(process.env);
  const prisma = createPrismaClient(environment.databaseUrl);
  const app = await buildApp({
    environment,
    prisma,
    createGraphqlModules: createApplicationModules,
  });
  await app.listen({ port: environment.port, host: environment.host });
  registerGracefulShutdown({ app, prisma, processEvents: process });
  return app;
}

await startServer();

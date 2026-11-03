import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { createApplicationModules } from "../../src/modules/application-modules.ts";
import { testEnvironment } from "./test-environment.ts";

export function buildTestApp(prisma: PrismaClient): Promise<FastifyInstance> {
  return buildApp({
    environment: testEnvironment,
    prisma,
    createGraphqlModules: createApplicationModules,
  });
}

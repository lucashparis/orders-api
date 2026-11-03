import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.ts";
import type { Environment } from "../../src/config/env.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { createApplicationModules } from "../../src/modules/application-modules.ts";
import type { LogCapture } from "./log-capture.ts";
import { testEnvironment } from "./test-environment.ts";

export const loggingTestEnvironment: Environment = { ...testEnvironment, logLevel: "info" };

export function buildTestApp(prisma: PrismaClient): Promise<FastifyInstance> {
  return buildApp({
    environment: testEnvironment,
    prisma,
    createGraphqlModules: createApplicationModules,
  });
}

export function buildLoggingTestApp(
  prisma: PrismaClient,
  capture: LogCapture,
): Promise<FastifyInstance> {
  return buildApp({
    environment: loggingTestEnvironment,
    prisma,
    createGraphqlModules: createApplicationModules,
    logDestination: capture.destination,
  });
}

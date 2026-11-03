import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.ts";

async function isDatabaseReachable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function registerHealthRoute(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/health", async (_request, reply) => {
    if (await isDatabaseReachable(prisma)) {
      return { status: "ok" };
    }
    return reply.code(503).send({ status: "unavailable" });
  });
}

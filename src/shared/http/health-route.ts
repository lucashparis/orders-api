import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.ts";

type DatabaseProbe = { reachable: true } | { reachable: false; error: unknown };

async function probeDatabase(prisma: PrismaClient): Promise<DatabaseProbe> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { reachable: true };
  } catch (error) {
    return { reachable: false, error };
  }
}

export function registerHealthRoute(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/health", { logLevel: "silent" }, async (request, reply) => {
    const probe = await probeDatabase(prisma);
    if (probe.reachable) {
      return { status: "ok" };
    }
    app.log.warn(
      { event: "health.database_unreachable", reqId: request.id, err: probe.error },
      "Health check could not reach the database",
    );
    return reply.code(503).send({ status: "unavailable" });
  });
}

import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.ts";

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

export type GracefulShutdownDependencies = {
  app: { close: () => Promise<unknown>; log: Pick<FastifyInstance["log"], "info" | "error"> };
  prisma: Pick<PrismaClient, "$disconnect">;
  processEvents: Pick<NodeJS.EventEmitter, "once">;
};

async function closeResources({ app, prisma }: GracefulShutdownDependencies): Promise<void> {
  try {
    await app.close();
  } finally {
    await prisma.$disconnect();
  }
}

export function registerGracefulShutdown(dependencies: GracefulShutdownDependencies): void {
  const { app, processEvents } = dependencies;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "Shutdown signal received, closing the server");
    await closeResources(dependencies);
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    processEvents.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        app.log.error({ err: error }, "Graceful shutdown failed");
        process.exitCode = 1;
      });
    });
  }
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { testDatabaseUrl } from "./test-database-url.ts";

type QueryCountingClient = {
  prisma: PrismaClient;
  readQueryCount(): number;
  resetQueryCount(): void;
};

export function createQueryCountingPrismaClient(): QueryCountingClient {
  const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
  const prisma = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  let queryCount = 0;
  prisma.$on("query", () => {
    queryCount += 1;
  });
  return {
    prisma,
    readQueryCount: () => queryCount,
    resetQueryCount: () => {
      queryCount = 0;
    },
  };
}

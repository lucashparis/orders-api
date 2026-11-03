import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "../../generated/prisma/client.ts";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

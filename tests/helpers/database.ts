import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { testDatabaseUrl } from "./test-database-url.ts";

export function createTestPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
  return new PrismaClient({ adapter });
}

export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    "TRUNCATE order_items, orders, products, users RESTART IDENTITY CASCADE",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readDriverMessage(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error.meta)) {
    return undefined;
  }
  const driverError = error.meta.driverAdapterError;
  if (!isRecord(driverError) || !isRecord(driverError.cause)) {
    return undefined;
  }
  const message = readText(driverError.cause, "message");
  const detail = readText(driverError.cause, "detail");
  return [message, detail].filter((part) => part !== undefined).join("\n") || undefined;
}

export async function readConstraintViolation(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    const driverMessage = readDriverMessage(error);
    if (driverMessage !== undefined) {
      return driverMessage;
    }
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the operation to violate a database constraint");
}

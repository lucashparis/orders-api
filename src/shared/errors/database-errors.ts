import { Prisma } from "../../generated/prisma/client.ts";

const prismaUniqueViolationCode = "P2002";
const postgresUniqueViolationCode = "23505";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readDriverOriginalCode(meta: unknown): unknown {
  if (!isRecord(meta) || !isRecord(meta.driverAdapterError)) {
    return undefined;
  }
  const cause = meta.driverAdapterError.cause;
  return isRecord(cause) ? cause.originalCode : undefined;
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  return (
    error.code === prismaUniqueViolationCode ||
    readDriverOriginalCode(error.meta) === postgresUniqueViolationCode
  );
}

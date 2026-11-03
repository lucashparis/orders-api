import type { User } from "../../generated/prisma/client.ts";
import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import { isUniqueConstraintViolation } from "../../shared/errors/database-errors.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import type { CreateUserInput } from "./users.schemas.ts";
import type { UserRecord } from "./users.types.ts";

function toUserRecord(row: User): UserRecord {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.createdAt };
}

export async function insertUser(
  database: DatabaseClient,
  input: CreateUserInput,
): Promise<UserRecord | null> {
  try {
    const row = await database.user.create({ data: { name: input.name, email: input.email } });
    return toUserRecord(row);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return null;
    }
    throw error;
  }
}

export async function findUsersAfter(
  database: DatabaseClient,
  pageRequest: PageRequest,
): Promise<UserRecord[]> {
  const rows = await database.user.findMany({
    where: { id: { gt: pageRequest.afterId ?? 0 } },
    orderBy: { id: "asc" },
    take: pageRequest.pageSize + 1,
  });
  return rows.map(toUserRecord);
}

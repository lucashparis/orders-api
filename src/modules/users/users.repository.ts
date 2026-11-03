import type { DatabaseClient } from "../../shared/database/prisma-client.ts";
import { isUniqueConstraintViolation } from "../../shared/errors/database-errors.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import type { CreateUserInput } from "./users.schemas.ts";
import type { UserRecord } from "./users.types.ts";

export async function insertUser(
  database: DatabaseClient,
  input: CreateUserInput,
): Promise<UserRecord | null> {
  try {
    return await database.user.create({ data: { name: input.name, email: input.email } });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return null;
    }
    throw error;
  }
}

export function findUsersAfter(
  database: DatabaseClient,
  pageRequest: PageRequest,
): Promise<UserRecord[]> {
  return database.user.findMany({
    where: { id: { gt: pageRequest.afterId ?? 0 } },
    orderBy: { id: "asc" },
    take: pageRequest.pageSize + 1,
  });
}

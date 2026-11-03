import type { PrismaClient } from "../../generated/prisma/client.ts";
import { toValidationFailure } from "../../shared/errors/validation-failure.ts";
import { buildConnection } from "../../shared/pagination/connection.ts";
import type { PageRequest } from "../../shared/pagination/page-request.ts";
import { findUsersAfter, insertUser } from "./users.repository.ts";
import { createUserInputSchema } from "./users.schemas.ts";
import type { CreateUserOutcome, UserConnectionRecord } from "./users.types.ts";

export type UsersService = {
  createUser(input: unknown): Promise<CreateUserOutcome>;
  listUsers(pageRequest: PageRequest): Promise<UserConnectionRecord>;
};

export function createUsersService(dependencies: { prisma: PrismaClient }): UsersService {
  const { prisma } = dependencies;
  return {
    async createUser(input) {
      const parsed = createUserInputSchema.safeParse(input);
      if (!parsed.success) {
        return toValidationFailure(parsed.error);
      }
      const user = await insertUser(prisma, parsed.data);
      if (user === null) {
        return { kind: "EmailAlreadyInUseError", email: parsed.data.email };
      }
      return { kind: "UserCreated", user };
    },
    async listUsers(pageRequest) {
      const rows = await findUsersAfter(prisma, pageRequest);
      return buildConnection(rows, pageRequest.pageSize);
    },
  };
}

import type { EmailAlreadyInUse, ValidationFailure } from "../../shared/errors/domain-errors.ts";
import type { Connection, Edge } from "../../shared/pagination/connection.ts";

export type UserRecord = { id: number; name: string; email: string; createdAt: Date };

export type UserEdgeRecord = Edge<UserRecord>;

export type UserConnectionRecord = Connection<UserRecord>;

export type CreateUserOutcome =
  | { kind: "UserCreated"; user: UserRecord }
  | ValidationFailure
  | EmailAlreadyInUse;

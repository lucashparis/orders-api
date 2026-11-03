import { createBadUserInputError } from "../graphql/bad-user-input.ts";
import { decodeCursor } from "./cursor.ts";

export const defaultPageSize = 20;
export const maximumPageSize = 100;

export type PageRequest = { pageSize: number; afterId: number | null };

function parsePageSize(first: number | null | undefined): number {
  if (first === undefined || first === null) {
    return defaultPageSize;
  }
  if (!Number.isInteger(first) || first < 1 || first > maximumPageSize) {
    throw createBadUserInputError(`first must be between 1 and ${maximumPageSize}.`);
  }
  return first;
}

function parseAfterId(after: string | null | undefined): number | null {
  if (after === undefined || after === null) {
    return null;
  }
  const afterId = decodeCursor(after);
  if (afterId === null) {
    throw createBadUserInputError("after is not a valid cursor.");
  }
  return afterId;
}

export function parsePageRequest(connectionArguments: {
  first?: number | null;
  after?: string | null;
}): PageRequest {
  return {
    pageSize: parsePageSize(connectionArguments.first),
    afterId: parseAfterId(connectionArguments.after),
  };
}

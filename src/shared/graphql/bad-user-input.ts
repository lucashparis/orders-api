import { GraphQLError } from "graphql";

export function createBadUserInputError(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

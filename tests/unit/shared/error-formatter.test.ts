import { GraphQLError } from "graphql";
import { describe, expect, test, vi as vitest } from "vitest";
import { createBadUserInputError } from "../../../src/shared/graphql/bad-user-input.ts";
import { formatGraphqlErrors } from "../../../src/shared/graphql/error-formatter.ts";

const requestId = "req-format-1";
const syntaxMessage = "Syntax Error: Expected Name, found <EOF>.";

class RequestValidationError extends Error {
  readonly statusCode = 400;
  readonly errors: Error[];

  constructor(errors: Error[]) {
    super("Graphql validation error");
    this.errors = errors;
  }
}

function createContext() {
  const log = { error: vitest.fn() };
  return { log, context: { reply: { request: { id: requestId, log } } } };
}

function wrapRequestErrors(errors: Error[]): GraphQLError {
  return new GraphQLError("Graphql validation error", {
    originalError: new RequestValidationError(errors),
  });
}

describe("formatGraphqlErrors unexpected errors", () => {
  test("masks the error and logs it once at error level with the request id", () => {
    const original = new Error("connection refused");
    const located = new GraphQLError(original.message, {
      path: ["users"],
      originalError: original,
    });
    const { log, context } = createContext();
    const formatted = formatGraphqlErrors({ data: null, errors: [located] }, context);
    expect(formatted).toEqual({
      statusCode: 200,
      response: {
        data: null,
        errors: [
          {
            message: "Internal server error",
            extensions: { code: "INTERNAL_SERVER_ERROR", requestId },
          },
        ],
      },
    });
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledWith(
      { err: original, requestId, path: "users" },
      expect.any(String),
    );
  });
});

describe("formatGraphqlErrors bad user input", () => {
  test("keeps bad user input errors without logging them", () => {
    const rejection = createBadUserInputError("first must be between 1 and 100.");
    const located = new GraphQLError(rejection.message, {
      path: ["users"],
      originalError: rejection,
    });
    const { log, context } = createContext();
    const formatted = formatGraphqlErrors({ data: null, errors: [located] }, context);
    expect(formatted.response.errors).toEqual([
      { message: rejection.message, path: ["users"], extensions: { code: "BAD_USER_INPUT" } },
    ]);
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe("formatGraphqlErrors request errors", () => {
  test("flattens a parse failure and keeps its status code without logging it", () => {
    const { log, context } = createContext();
    const execution = { errors: [wrapRequestErrors([new GraphQLError(syntaxMessage)])] };
    expect(formatGraphqlErrors(execution, context)).toEqual({
      statusCode: 400,
      response: {
        data: null,
        errors: [{ message: syntaxMessage, extensions: { code: "GRAPHQL_PARSE_FAILED" } }],
      },
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  test("publishes every nested validation error", () => {
    const { log, context } = createContext();
    const nested = [new GraphQLError("Unknown field."), new Error("query depth exceeded")];
    const formatted = formatGraphqlErrors({ errors: [wrapRequestErrors(nested)] }, context);
    expect(formatted.response.errors).toEqual([
      { message: "Unknown field.", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } },
      { message: "query depth exceeded", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } },
    ]);
    expect(formatted.statusCode).toBe(200);
    expect(log.error).not.toHaveBeenCalled();
  });
});

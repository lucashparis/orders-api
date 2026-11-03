import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { type ExecutionResult, GraphQLError, type GraphQLFormattedError } from "graphql";

type FailedExecution = ExecutionResult & Required<Pick<ExecutionResult, "errors">>;

export type ErrorFormatterContext = {
  reply: { request: Pick<FastifyRequest, "id"> & { log: Pick<FastifyBaseLogger, "error"> } };
};

type FormattedResponse = {
  statusCode: number;
  response: { data: NonNullable<ExecutionResult["data"]> | null; errors: GraphQLFormattedError[] };
};

type PublicCode =
  | "GRAPHQL_PARSE_FAILED"
  | "GRAPHQL_VALIDATION_FAILED"
  | "BAD_USER_INPUT"
  | "INTERNAL_SERVER_ERROR";

const syntaxErrorPrefix = "Syntax Error";
const defaultStatusCode = 200;

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function readNestedErrors(error: GraphQLError): Error[] | null {
  const original = error.originalError;
  if (original === undefined || !("errors" in original) || !Array.isArray(original.errors)) {
    return null;
  }
  return original.errors.filter(isError);
}

function toGraphqlError(error: Error): GraphQLError {
  return error instanceof GraphQLError
    ? error
    : new GraphQLError(error.message, { originalError: error });
}

function flattenErrors(errors: readonly GraphQLError[]): GraphQLError[] {
  return errors.flatMap((error) => readNestedErrors(error)?.map(toGraphqlError) ?? [error]);
}

function readStatusCode(error: GraphQLError | undefined): number | undefined {
  const original = error?.originalError;
  if (original === undefined || !("statusCode" in original)) {
    return undefined;
  }
  return typeof original.statusCode === "number" ? original.statusCode : undefined;
}

function resolveStatusCode(execution: FailedExecution, publishedCount: number): number {
  const statusCode = readStatusCode(execution.errors[0]);
  if (execution.data || publishedCount !== 1 || statusCode === undefined) {
    return defaultStatusCode;
  }
  return statusCode;
}

function classifyError(error: GraphQLError): PublicCode {
  const isFieldError = error.path !== undefined;
  if (!isFieldError && error.message.startsWith(syntaxErrorPrefix)) {
    return "GRAPHQL_PARSE_FAILED";
  }
  if (error.extensions.code === "BAD_USER_INPUT") {
    return "BAD_USER_INPUT";
  }
  return isFieldError ? "INTERNAL_SERVER_ERROR" : "GRAPHQL_VALIDATION_FAILED";
}

function withCode(error: GraphQLFormattedError, code: PublicCode): GraphQLFormattedError {
  const locations = error.locations === undefined ? {} : { locations: error.locations };
  return { message: error.message, ...locations, extensions: { code } };
}

function maskError(requestId: string): GraphQLFormattedError {
  return {
    message: "Internal server error",
    extensions: { code: "INTERNAL_SERVER_ERROR", requestId },
  };
}

function logUnexpectedError(error: GraphQLError, context: ErrorFormatterContext): void {
  const { request } = context.reply;
  request.log.error(
    { err: error.originalError ?? error, requestId: request.id, path: error.path?.join(".") },
    "Unexpected error while executing a GraphQL operation",
  );
}

function publishError(error: GraphQLError, context: ErrorFormatterContext): GraphQLFormattedError {
  const code = classifyError(error);
  switch (code) {
    case "BAD_USER_INPUT":
      return error.toJSON();
    case "INTERNAL_SERVER_ERROR":
      logUnexpectedError(error, context);
      return maskError(context.reply.request.id);
    case "GRAPHQL_PARSE_FAILED":
    case "GRAPHQL_VALIDATION_FAILED":
      return withCode(error.toJSON(), code);
  }
}

export function formatGraphqlErrors(
  execution: FailedExecution,
  context: ErrorFormatterContext,
): FormattedResponse {
  const errors = flattenErrors(execution.errors);
  return {
    statusCode: resolveStatusCode(execution, errors.length),
    response: {
      data: execution.data ?? null,
      errors: errors.map((error) => publishError(error, context)),
    },
  };
}

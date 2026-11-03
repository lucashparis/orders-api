import type { ExecutionResult, GraphQLFormattedError } from "graphql";
import mercurius, { type MercuriusContext } from "mercurius";

type FailedExecution = ExecutionResult & Required<Pick<ExecutionResult, "errors">>;

type FormattedResponse = {
  statusCode: number;
  response: { data: NonNullable<ExecutionResult["data"]> | null; errors: GraphQLFormattedError[] };
};

const syntaxErrorPrefix = "Syntax Error";

function withCode(error: GraphQLFormattedError, code: string): GraphQLFormattedError {
  const locations = error.locations === undefined ? {} : { locations: error.locations };
  return { message: error.message, ...locations, extensions: { code } };
}

function maskError(requestId: string): GraphQLFormattedError {
  return {
    message: "Internal server error",
    extensions: { code: "INTERNAL_SERVER_ERROR", requestId },
  };
}

function publishError(error: GraphQLFormattedError, requestId: string): GraphQLFormattedError {
  if (error.message.startsWith(syntaxErrorPrefix)) {
    return withCode(error, "GRAPHQL_PARSE_FAILED");
  }
  if (error.extensions?.code === "BAD_USER_INPUT") {
    return error;
  }
  if (error.path === undefined) {
    return withCode(error, "GRAPHQL_VALIDATION_FAILED");
  }
  return maskError(requestId);
}

function isUnexpected(error: { extensions?: Record<string, unknown>; path?: unknown }): boolean {
  return error.path !== undefined && error.extensions?.code !== "BAD_USER_INPUT";
}

function logUnexpectedErrors(execution: FailedExecution, context: MercuriusContext): void {
  for (const error of execution.errors) {
    if (isUnexpected(error)) {
      context.reply.request.log.error({ err: error.originalError ?? error }, error.message);
    }
  }
}

export function formatGraphqlErrors(
  execution: FailedExecution,
  context: MercuriusContext,
): FormattedResponse {
  logUnexpectedErrors(execution, context);
  const formatted = mercurius.defaultErrorFormatter(execution, context);
  const requestId = context.reply.request.id;
  return {
    statusCode: formatted.statusCode,
    response: {
      data: formatted.response.data ?? null,
      errors: (formatted.response.errors ?? []).map((error) => publishError(error, requestId)),
    },
  };
}

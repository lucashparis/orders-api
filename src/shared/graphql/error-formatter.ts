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

type PublicCode =
  | "GRAPHQL_PARSE_FAILED"
  | "GRAPHQL_VALIDATION_FAILED"
  | "BAD_USER_INPUT"
  | "INTERNAL_SERVER_ERROR";

function classifyError(error: GraphQLFormattedError): PublicCode {
  const isFieldError = error.path !== undefined;
  if (!isFieldError && error.message.startsWith(syntaxErrorPrefix)) {
    return "GRAPHQL_PARSE_FAILED";
  }
  if (error.extensions?.code === "BAD_USER_INPUT") {
    return "BAD_USER_INPUT";
  }
  return isFieldError ? "INTERNAL_SERVER_ERROR" : "GRAPHQL_VALIDATION_FAILED";
}

function publishError(
  error: GraphQLFormattedError,
  code: PublicCode,
  requestId: string,
): GraphQLFormattedError {
  switch (code) {
    case "BAD_USER_INPUT":
      return error;
    case "INTERNAL_SERVER_ERROR":
      return maskError(requestId);
    case "GRAPHQL_PARSE_FAILED":
    case "GRAPHQL_VALIDATION_FAILED":
      return withCode(error, code);
  }
}

function findOriginal(execution: FailedExecution, error: GraphQLFormattedError): Error | undefined {
  const original = execution.errors.find(
    (candidate) =>
      candidate.message === error.message && String(candidate.path) === String(error.path),
  );
  return original?.originalError ?? original;
}

function processError(
  execution: FailedExecution,
  context: MercuriusContext,
  error: GraphQLFormattedError,
): GraphQLFormattedError {
  const code = classifyError(error);
  if (code === "INTERNAL_SERVER_ERROR") {
    const failure = findOriginal(execution, error) ?? error;
    context.reply.request.log.error({ err: failure }, error.message);
  }
  return publishError(error, code, context.reply.request.id);
}

export function formatGraphqlErrors(
  execution: FailedExecution,
  context: MercuriusContext,
): FormattedResponse {
  const formatted = mercurius.defaultErrorFormatter(execution, context);
  const errors = formatted.response.errors ?? [];
  return {
    statusCode: formatted.statusCode,
    response: {
      data: formatted.response.data ?? null,
      errors: errors.map((error) => processError(execution, context, error)),
    },
  };
}

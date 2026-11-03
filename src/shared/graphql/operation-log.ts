import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type DocumentNode, type ExecutionResult, getOperationAST } from "graphql";

export type OperationOutcome = "success" | "business_error" | "request_error" | "internal_error";

type OperationTrace = { operation: string; outcome: OperationOutcome | null };

type ReportedError = { extensions?: Readonly<Record<string, unknown>> };

const graphqlPath = "/graphql";
const anonymousOperation = "anonymous";
const businessErrorSuffix = "Error";
const traces = new WeakMap<FastifyRequest, OperationTrace>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequestedOperationName(request: FastifyRequest): string | undefined {
  const parameters: unknown = request.method === "GET" ? request.query : request.body;
  if (isRecord(parameters) && typeof parameters.operationName === "string") {
    return parameters.operationName;
  }
  return undefined;
}

function readOperationName(document: DocumentNode, request: FastifyRequest): string {
  const operation = getOperationAST(document, readRequestedOperationName(request));
  return operation?.name?.value ?? anonymousOperation;
}

function isBusinessError(result: unknown): boolean {
  return (
    isRecord(result) &&
    typeof result.__typename === "string" &&
    result.__typename.endsWith(businessErrorSuffix)
  );
}

function isInternalError(error: ReportedError): boolean {
  return error.extensions?.code === "INTERNAL_SERVER_ERROR";
}

export function classifyExecution(execution: ExecutionResult): OperationOutcome {
  const errors: readonly ReportedError[] = execution.errors ?? [];
  if (errors.some(isInternalError)) {
    return "internal_error";
  }
  if (errors.length > 0) {
    return "request_error";
  }
  return Object.values(execution.data ?? {}).some(isBusinessError) ? "business_error" : "success";
}

function logOperation(request: FastifyRequest, reply: FastifyReply): void {
  const trace = traces.get(request);
  request.log.info(
    {
      event: "graphql.operation",
      operation: trace?.operation ?? null,
      durationMs: Math.round(reply.elapsedTime),
      outcome: trace?.outcome ?? "request_error",
    },
    "GraphQL operation completed",
  );
}

export function registerOperationLog(app: FastifyInstance): void {
  app.graphql.addHook("preExecution", (_schema, document, context) => {
    const { request } = context.reply;
    traces.set(request, { operation: readOperationName(document, request), outcome: null });
  });
  app.graphql.addHook("onResolution", (execution, context) => {
    const trace = traces.get(context.reply.request);
    if (trace !== undefined) {
      trace.outcome = classifyExecution(execution);
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    if (request.routeOptions.url === graphqlPath) {
      logOperation(request, reply);
    }
  });
}

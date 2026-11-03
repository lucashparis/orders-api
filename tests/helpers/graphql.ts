import type { FastifyInstance } from "fastify";

type GraphqlError = { message: string; extensions?: Record<string, unknown> };

type GraphqlResult<ResponseData> = {
  statusCode: number;
  headers: Record<string, unknown>;
  data: ResponseData | null;
  errors: GraphqlError[];
};

type GraphqlBody<ResponseData> = {
  data?: ResponseData | null;
  errors?: GraphqlError[];
};

export async function executeGraphql<ResponseData>(
  app: FastifyInstance,
  document: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<GraphqlResult<ResponseData>> {
  const response = await app.inject({
    method: "POST",
    url: "/graphql",
    headers: headers ?? {},
    payload: { query: document, variables },
  });
  const body = response.json<GraphqlBody<ResponseData>>();
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    data: body.data ?? null,
    errors: body.errors ?? [],
  };
}

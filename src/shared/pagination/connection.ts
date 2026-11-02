import { encodeCursor } from "./cursor.ts";

export type Edge<NodeType> = { cursor: string; node: NodeType };

export type Connection<NodeType> = {
  edges: Edge<NodeType>[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export function buildConnection<NodeType extends { id: number }>(
  rowsWithLookahead: NodeType[],
  pageSize: number,
): Connection<NodeType> {
  const pageRows = rowsWithLookahead.slice(0, pageSize);
  const edges = pageRows.map((node) => ({ cursor: encodeCursor(node.id), node }));
  return {
    edges,
    pageInfo: {
      hasNextPage: rowsWithLookahead.length > pageSize,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  };
}

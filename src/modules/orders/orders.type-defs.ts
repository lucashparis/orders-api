import { readFileSync } from "node:fs";

export const ordersTypeDefs: string = readFileSync(
  new URL("./orders.graphql", import.meta.url),
  "utf8",
);

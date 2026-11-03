import { readFileSync } from "node:fs";

export const productsTypeDefs: string = readFileSync(
  new URL("./products.graphql", import.meta.url),
  "utf8",
);

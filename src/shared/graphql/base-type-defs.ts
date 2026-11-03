import { readFileSync } from "node:fs";

export const baseTypeDefs: string = readFileSync(
  new URL("./base.graphql", import.meta.url),
  "utf8",
);

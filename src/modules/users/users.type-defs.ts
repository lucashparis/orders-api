import { readFileSync } from "node:fs";

export const usersTypeDefs: string = readFileSync(
  new URL("./users.graphql", import.meta.url),
  "utf8",
);

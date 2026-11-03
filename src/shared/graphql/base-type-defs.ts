import { readFileSync } from "node:fs";
import { join } from "node:path";

export const baseTypeDefs: string = readFileSync(join(import.meta.dirname, "base.graphql"), "utf8");

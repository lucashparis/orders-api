import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { codegen } from "@graphql-codegen/core";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import * as typescriptResolversPlugin from "@graphql-codegen/typescript-resolvers";
import { buildSchema, parse, printSchema } from "graphql";
import { applicationTypeDefs } from "../src/modules/application-type-defs.ts";
import { baseTypeDefs } from "../src/shared/graphql/base-type-defs.ts";

const outputDirectory = new URL("../src/generated/", import.meta.url);
const outputFile = new URL("graphql.ts", outputDirectory);
const usersTypesPath = "../modules/users/users.types.ts";

const codegenConfig = {
  useTypeImports: true,
  enumsAsTypes: true,
  contextType: "mercurius#MercuriusContext",
  scalars: { ID: { input: "string", output: "string | number" } },
  mappers: {
    User: `${usersTypesPath}#UserRecord`,
    UserEdge: `${usersTypesPath}#UserEdgeRecord`,
    UserConnection: `${usersTypesPath}#UserConnectionRecord`,
  },
};

function generateTypes(): Promise<string> {
  const schema = buildSchema([baseTypeDefs, ...applicationTypeDefs].join("\n"));
  return codegen({
    filename: fileURLToPath(outputFile),
    schema: parse(printSchema(schema)),
    documents: [],
    config: codegenConfig,
    plugins: [{ typescript: {} }, { "typescript-resolvers": {} }],
    pluginMap: {
      typescript: typescriptPlugin,
      "typescript-resolvers": typescriptResolversPlugin,
    },
  });
}

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputFile, await generateTypes());

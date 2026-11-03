import { createBadUserInputError } from "../../src/shared/graphql/bad-user-input.ts";
import type { GraphqlModule } from "../../src/shared/graphql/graphql-module.ts";

export const unexpectedFailureMessage = "database password leaked";

export const probeModule: GraphqlModule = {
  typeDefs: `
    extend type Query { failUnexpectedly: String! rejectInput: String! fakeSyntaxError: String! root: ProbeNode! }
    extend type Mutation { probeMutation: Boolean }
    type ProbeNode { name: String! child: ProbeNode! }
  `,
  resolvers: {
    Query: {
      failUnexpectedly: () => {
        throw new Error(unexpectedFailureMessage);
      },
      fakeSyntaxError: () => {
        throw new Error("Syntax Error: fake");
      },
      rejectInput: () => {
        throw createBadUserInputError("first must be between 1 and 100.");
      },
      root: () => ({ name: "root" }),
    },
    Mutation: { probeMutation: () => true },
    ProbeNode: { child: () => ({ name: "child" }) },
  },
  loaders: {},
};

export const secondProbeModule: GraphqlModule = {
  typeDefs: "extend type Query { secondRoot: String! }",
  resolvers: { Query: { secondRoot: () => "second" } },
  loaders: {},
};

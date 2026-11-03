import { GraphQLScalarType } from "graphql";
import type { IResolvers, MercuriusLoaders } from "mercurius";
import type { GraphqlModule } from "./graphql-module.ts";

type ResolverEntry = IResolvers[string];

function isMergeable(entry: ResolverEntry): entry is Exclude<ResolverEntry, GraphQLScalarType> {
  return typeof entry === "object" && entry !== null && !(entry instanceof GraphQLScalarType);
}

function mergeEntry(existing: ResolverEntry, incoming: ResolverEntry): ResolverEntry {
  if (existing !== undefined && isMergeable(existing) && isMergeable(incoming)) {
    return { ...existing, ...incoming };
  }
  return incoming;
}

export function mergeResolvers(modules: GraphqlModule[]): IResolvers {
  const merged: IResolvers = {};
  for (const graphqlModule of modules) {
    for (const [typeName, entry] of Object.entries(graphqlModule.resolvers)) {
      merged[typeName] = mergeEntry(merged[typeName], entry);
    }
  }
  return merged;
}

export function mergeLoaders(modules: GraphqlModule[]): MercuriusLoaders {
  const merged: MercuriusLoaders = {};
  for (const graphqlModule of modules) {
    for (const [typeName, fields] of Object.entries(graphqlModule.loaders)) {
      merged[typeName] = { ...merged[typeName], ...fields };
    }
  }
  return merged;
}

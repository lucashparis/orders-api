import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { createTestPrismaClient, truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";

const createUserMutation = `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      __typename
      ... on User { id name email createdAt }
      ... on ValidationError { code message fields { field message } }
      ... on EmailAlreadyInUseError { code message email }
    }
  }
`;

const usersQuery = `
  query Users($first: Int, $after: String) {
    users(first: $first, after: $after) {
      edges { cursor node { id name } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type CreateUserResult = {
  __typename: string;
  id?: string;
  name?: string;
  email?: string;
  createdAt?: string;
  code?: string;
  message?: string;
  fields?: { field: string; message: string }[];
};

type CreateUserData = { createUser: CreateUserResult };

type UsersData = {
  users: {
    edges: { cursor: string; node: { id: string; name: string } }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

let prisma: PrismaClient;
let app: FastifyInstance;

beforeAll(async () => {
  prisma = createTestPrismaClient();
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
});

async function createUser(name: string, email: string): Promise<CreateUserResult | undefined> {
  const result = await executeGraphql<CreateUserData>(app, createUserMutation, {
    input: { name, email },
  });
  return result.data?.createUser;
}

describe("createUser", () => {
  test("trims the name and normalizes the email", async () => {
    const created = await createUser("  Ana Souza  ", " Ana@Example.com ");
    expect(created).toMatchObject({
      __typename: "User",
      name: "Ana Souza",
      email: "ana@example.com",
    });
    expect(created?.id).toBeTypeOf("string");
    expect(created?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("reports every invalid field", async () => {
    const created = await createUser("   ", "not-an-email");
    expect(created?.__typename).toBe("ValidationError");
    expect(created?.code).toBe("BAD_USER_INPUT");
    expect(created?.message).toBe("Invalid input.");
    expect(created?.fields?.map((entry) => entry.field).sort()).toEqual(["email", "name"]);
  });

  test("rejects a name longer than 100 characters", async () => {
    const created = await createUser("a".repeat(101), "long-name@example.com");
    expect(created?.__typename).toBe("ValidationError");
    expect(created?.fields?.map((entry) => entry.field)).toEqual(["name"]);
  });

  test("rejects an email longer than 254 characters", async () => {
    const created = await createUser("Ana", `${"a".repeat(243)}@example.com`);
    expect(created?.__typename).toBe("ValidationError");
    expect(created?.fields?.map((entry) => entry.field)).toEqual(["email"]);
  });
});

describe("createUser email uniqueness", () => {
  test("treats emails case-insensitively", async () => {
    await createUser("Ana", "Ana@Example.com");
    const duplicate = await executeGraphql<{
      createUser: { __typename: string; code: string; email: string };
    }>(app, createUserMutation, { input: { name: "Ana Two", email: "ANA@example.com" } });
    expect(duplicate.data?.createUser).toEqual({
      __typename: "EmailAlreadyInUseError",
      code: "EMAIL_ALREADY_IN_USE",
      message: "Email is already in use.",
      email: "ana@example.com",
    });
  });

  test("creates exactly one user when the same email races", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => createUser("Racer", "racer@example.com")),
    );
    const typenames = outcomes.map((outcome) => outcome?.__typename);
    expect(typenames.filter((name) => name === "User")).toHaveLength(1);
    expect(typenames.filter((name) => name === "EmailAlreadyInUseError")).toHaveLength(9);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("users", () => {
  test("paginates with cursors in ascending id order", async () => {
    await createUser("One", "one@example.com");
    await createUser("Two", "two@example.com");
    await createUser("Three", "three@example.com");
    const firstPage = await executeGraphql<UsersData>(app, usersQuery, { first: 2 });
    const ids = firstPage.data?.users.edges.map((edge) => Number(edge.node.id)) ?? [];
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeLessThan(ids[1] ?? 0);
    expect(firstPage.data?.users.pageInfo.hasNextPage).toBe(true);
    const secondPage = await executeGraphql<UsersData>(app, usersQuery, {
      first: 2,
      after: firstPage.data?.users.pageInfo.endCursor,
    });
    expect(secondPage.data?.users.edges).toHaveLength(1);
    expect(secondPage.data?.users.pageInfo.hasNextPage).toBe(false);
  });

  test("returns an empty page when there are no users", async () => {
    const result = await executeGraphql<UsersData>(app, usersQuery);
    expect(result.data?.users).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  test("rejects a page size above the maximum", async () => {
    const result = await executeGraphql(app, usersQuery, { first: 101 });
    expect(result.errors[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  test("rejects a malformed cursor", async () => {
    const result = await executeGraphql(app, usersQuery, { after: "garbage" });
    expect(result.errors[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { findProductsByIds } from "../../../src/modules/products/products.repository.ts";
import { buildTestApp } from "../../helpers/app.ts";
import { createTestPrismaClient, truncateAllTables } from "../../helpers/database.ts";
import { executeGraphql } from "../../helpers/graphql.ts";

const createProductMutation = `
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      __typename
      ... on Product { id name priceInCents stock createdAt }
      ... on ValidationError { code message fields { field message } }
    }
  }
`;

const productsQuery = `
  query Products($first: Int, $after: String) {
    products(first: $first, after: $after) {
      edges { cursor node { id name } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type CreateProductResult = {
  __typename: string;
  id?: string;
  name?: string;
  priceInCents?: number;
  stock?: number;
  createdAt?: string;
  code?: string;
  message?: string;
  fields?: { field: string; message: string }[];
};

type CreateProductData = { createProduct: CreateProductResult };

type ProductsData = {
  products: {
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

async function createProduct(
  name: string,
  priceInCents: number,
  stock: number,
): Promise<CreateProductResult | undefined> {
  const result = await executeGraphql<CreateProductData>(app, createProductMutation, {
    input: { name, priceInCents, stock },
  });
  return result.data?.createProduct;
}

function readIds(page: ProductsData | null): number[] {
  return page?.products.edges.map((edge) => Number(edge.node.id)) ?? [];
}

describe("createProduct", () => {
  test("trims the name and returns the stored values", async () => {
    const created = await createProduct("  Keyboard  ", 12990, 7);
    expect(created).toMatchObject({
      __typename: "Product",
      name: "Keyboard",
      priceInCents: 12990,
      stock: 7,
    });
    expect(created?.id).toBeTypeOf("string");
    expect(created?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("accepts a free product with no stock", async () => {
    const created = await createProduct("Sample", 0, 0);
    expect(created).toMatchObject({ __typename: "Product", priceInCents: 0, stock: 0 });
  });

  test("allows two products with the same name", async () => {
    const first = await createProduct("Mouse", 5000, 3);
    const second = await createProduct("Mouse", 5000, 3);
    expect(first?.__typename).toBe("Product");
    expect(second?.__typename).toBe("Product");
    expect(await prisma.product.count()).toBe(2);
  });
});

describe("createProduct validation", () => {
  test("reports every invalid field", async () => {
    const created = await createProduct("", -1, -5);
    expect(created?.__typename).toBe("ValidationError");
    expect(created?.code).toBe("BAD_USER_INPUT");
    expect(created?.message).toBe("Invalid input.");
    expect(created?.fields?.map((entry) => entry.field).sort()).toEqual([
      "name",
      "priceInCents",
      "stock",
    ]);
  });

  test("rejects a name longer than 100 characters", async () => {
    const created = await createProduct("a".repeat(101), 100, 1);
    expect(created?.__typename).toBe("ValidationError");
    expect(created?.fields?.map((entry) => entry.field)).toEqual(["name"]);
  });
});

describe("products", () => {
  test("returns an empty page when there are no products", async () => {
    const result = await executeGraphql<ProductsData>(app, productsQuery);
    expect(result.data?.products).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  test("keeps pages stable when a product is inserted between requests", async () => {
    await createProduct("One", 100, 1);
    await createProduct("Two", 200, 2);
    await createProduct("Three", 300, 3);
    const firstPage = await executeGraphql<ProductsData>(app, productsQuery, { first: 2 });
    expect(readIds(firstPage.data)).toEqual([1, 2]);
    await createProduct("Four", 400, 4);
    const secondPage = await executeGraphql<ProductsData>(app, productsQuery, {
      first: 2,
      after: firstPage.data?.products.pageInfo.endCursor,
    });
    expect(readIds(secondPage.data)).toEqual([3, 4]);
    expect(secondPage.data?.products.pageInfo.hasNextPage).toBe(false);
  });
});

describe("products pagination arguments", () => {
  test("rejects a page size of zero", async () => {
    const result = await executeGraphql(app, productsQuery, { first: 0 });
    expect(result.errors[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  test("rejects a malformed cursor", async () => {
    const result = await executeGraphql(app, productsQuery, { after: "garbage" });
    expect(result.errors[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("findProductsByIds", () => {
  test("returns only the products that exist", async () => {
    await createProduct("One", 100, 1);
    await createProduct("Two", 200, 2);
    await createProduct("Three", 300, 3);
    const found = await findProductsByIds(prisma, [1, 3, 999]);
    expect(found.map((product) => product.id).sort()).toEqual([1, 3]);
    expect(found[0]).toMatchObject({ priceInCents: expect.any(Number), stock: expect.any(Number) });
  });
});

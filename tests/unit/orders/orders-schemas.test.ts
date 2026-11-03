import { describe, expect, expectTypeOf, test } from "vitest";
import { createOrderInputSchema } from "../../../src/modules/orders/orders.schemas.ts";
import type { RequestedItem } from "../../../src/modules/orders/orders.types.ts";
import type { FieldViolation } from "../../../src/shared/errors/domain-errors.ts";
import { toValidationFailure } from "../../../src/shared/errors/validation-failure.ts";

const duplicateProductMessage = "Duplicate product in order.";

function orderWith(items: unknown[]): { userId: string; items: unknown[] } {
  return { userId: "7", items };
}

function distinctItems(count: number): { productId: string; quantity: number }[] {
  return Array.from({ length: count }, (_entry, index) => ({
    productId: String(index + 1),
    quantity: 1,
  }));
}

function rejectedViolations(input: unknown): FieldViolation[] {
  const result = createOrderInputSchema.safeParse(input);
  if (result.success) {
    return expect.unreachable("Expected the input to be rejected.");
  }
  return toValidationFailure(result.error).fields;
}

function rejectedFields(input: unknown): string[] {
  return rejectedViolations(input).map((violation) => violation.field);
}

describe("createOrderInputSchema conversion", () => {
  test("converts GraphQL IDs into numeric ids", () => {
    const parsed = createOrderInputSchema.parse(orderWith([{ productId: "3", quantity: 2 }]));
    expectTypeOf(parsed).toEqualTypeOf<{ userId: number; items: RequestedItem[] }>();
    expect(parsed).toEqual({ userId: 7, items: [{ productId: 3, quantity: 2 }] });
  });

  test("accepts the largest database id", () => {
    const parsed = createOrderInputSchema.parse({
      userId: "2147483647",
      items: [{ productId: "2147483647", quantity: 1 }],
    });
    expect(parsed).toEqual({ userId: 2147483647, items: [{ productId: 2147483647, quantity: 1 }] });
  });

  test("accepts one hundred distinct items", () => {
    expect(createOrderInputSchema.parse(orderWith(distinctItems(100))).items).toHaveLength(100);
  });
});

const invalidIds = ["abc", "0", "-1", "007", "1.5", " 7", "", "2147483648", "99999999999"];

describe("createOrderInputSchema ids", () => {
  test.each(invalidIds)("rejects the user id %j", (userId) => {
    const items = [{ productId: "3", quantity: 1 }];
    expect(rejectedFields({ userId, items })).toEqual(["userId"]);
  });

  test.each(invalidIds)("rejects the product id %j", (productId) => {
    expect(rejectedFields(orderWith([{ productId, quantity: 1 }]))).toEqual(["items.0.productId"]);
  });

  test("rejects an id far beyond the integer range with a single issue", () => {
    const productId = "9".repeat(400);
    expect(rejectedFields(orderWith([{ productId, quantity: 1 }]))).toEqual(["items.0.productId"]);
  });
});

describe("createOrderInputSchema item count and quantity", () => {
  test("rejects an order without items", () => {
    expect(rejectedFields(orderWith([]))).toEqual(["items"]);
  });

  test("rejects more than one hundred items", () => {
    expect(rejectedFields(orderWith(distinctItems(101)))).toEqual(["items"]);
  });

  test.each([0, -1, 1.5])("rejects the quantity %j", (quantity) => {
    expect(rejectedFields(orderWith([{ productId: "3", quantity }]))).toEqual(["items.0.quantity"]);
  });
});

describe("createOrderInputSchema duplicate products", () => {
  test("flags the later duplicate of a product", () => {
    const items = [
      { productId: "3", quantity: 1 },
      { productId: "3", quantity: 2 },
    ];
    expect(rejectedViolations(orderWith(items))).toEqual([
      { field: "items.1.productId", message: duplicateProductMessage },
    ]);
  });

  test("flags every repetition after the first occurrence", () => {
    const items = ["3", "4", "3", "3"].map((productId) => ({ productId, quantity: 1 }));
    expect(rejectedFields(orderWith(items))).toEqual(["items.2.productId", "items.3.productId"]);
  });

  test("reports a duplicate together with other item issues", () => {
    const items = [
      { productId: "3", quantity: 0 },
      { productId: "3", quantity: 1 },
    ];
    expect(rejectedFields(orderWith(items))).toEqual(["items.0.quantity", "items.1.productId"]);
  });
});

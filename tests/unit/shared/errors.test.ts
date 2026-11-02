import { describe, expect, test } from "vitest";
import { z as zod } from "zod";
import { Prisma } from "../../../src/generated/prisma/client.ts";
import { isUniqueConstraintViolation } from "../../../src/shared/errors/database-errors.ts";
import { type DomainError, domainErrorCodes } from "../../../src/shared/errors/domain-errors.ts";
import { toValidationFailure } from "../../../src/shared/errors/validation-failure.ts";
import { type ErrorPayload, toErrorPayload } from "../../../src/shared/graphql/error-payload.ts";

function knownRequestError(
  code: string,
  meta: Record<string, unknown> = {},
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("failure", {
    code,
    clientVersion: "7.10.1",
    meta,
  });
}

describe("toValidationFailure", () => {
  test("flattens Zod issue paths into dotted fields", () => {
    const result = zod
      .object({ items: zod.array(zod.object({ quantity: zod.number().int().min(1) })) })
      .safeParse({ items: [{ quantity: 0 }] });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(toValidationFailure(result.error).fields.map((violation) => violation.field)).toEqual([
      "items.0.quantity",
    ]);
  });

  test("keeps the Zod message and the issue order", () => {
    const result = zod
      .object({ name: zod.string(), age: zod.number() })
      .safeParse({ name: 1, age: "x" });
    if (result.success) {
      expect.unreachable();
    }
    const failure = toValidationFailure(result.error);
    expect(failure.kind).toBe("ValidationError");
    expect(failure.fields.map((violation) => violation.field)).toEqual(["name", "age"]);
    expect(failure.fields.map((violation) => violation.message)).toEqual(
      result.error.issues.map((issue) => issue.message),
    );
  });
});

describe("isUniqueConstraintViolation", () => {
  test("detects unique violations", () => {
    expect(isUniqueConstraintViolation(knownRequestError("P2002"))).toBe(true);
    expect(isUniqueConstraintViolation(knownRequestError("P2025"))).toBe(false);
    expect(isUniqueConstraintViolation(new Error("other"))).toBe(false);
  });

  test("detects the PostgreSQL unique violation code from the driver adapter", () => {
    const error = knownRequestError("P2010", {
      driverAdapterError: { cause: { originalCode: "23505" } },
    });
    expect(isUniqueConstraintViolation(error)).toBe(true);
  });

  test("ignores other driver adapter codes and non-error values", () => {
    const error = knownRequestError("P2010", {
      driverAdapterError: { cause: { originalCode: "23503" } },
    });
    expect(isUniqueConstraintViolation(error)).toBe(false);
    expect(isUniqueConstraintViolation(knownRequestError("P2010", { driverAdapterError: 1 }))).toBe(
      false,
    );
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation({ code: "P2002" })).toBe(false);
  });
});

describe("domainErrorCodes", () => {
  test("lists a code for every kind", () => {
    expect(domainErrorCodes).toEqual({
      ValidationError: "BAD_USER_INPUT",
      EmailAlreadyInUseError: "EMAIL_ALREADY_IN_USE",
      UserNotFoundError: "USER_NOT_FOUND",
      ProductNotFoundError: "PRODUCT_NOT_FOUND",
      InsufficientStockError: "INSUFFICIENT_STOCK",
      OrderTotalLimitExceededError: "ORDER_TOTAL_LIMIT_EXCEEDED",
    });
  });
});

const payloadCases: { name: string; error: DomainError; payload: ErrorPayload }[] = [
  {
    name: "a validation failure",
    error: { kind: "ValidationError", fields: [{ field: "email", message: "Invalid email" }] },
    payload: {
      __typename: "ValidationError",
      code: "BAD_USER_INPUT",
      message: "Invalid input.",
      fields: [{ field: "email", message: "Invalid email" }],
    },
  },
  {
    name: "an email already in use error",
    error: { kind: "EmailAlreadyInUseError", email: "ana@example.com" },
    payload: {
      __typename: "EmailAlreadyInUseError",
      code: "EMAIL_ALREADY_IN_USE",
      message: "Email is already in use.",
      email: "ana@example.com",
    },
  },
  {
    name: "a user not found error",
    error: { kind: "UserNotFoundError", userId: 9 },
    payload: {
      __typename: "UserNotFoundError",
      code: "USER_NOT_FOUND",
      message: "User not found.",
      userId: 9,
    },
  },
  {
    name: "a product not found error",
    error: { kind: "ProductNotFoundError", productIds: [3, 4] },
    payload: {
      __typename: "ProductNotFoundError",
      code: "PRODUCT_NOT_FOUND",
      message: "One or more products were not found.",
      productIds: [3, 4],
    },
  },
  {
    name: "an insufficient stock error",
    error: {
      kind: "InsufficientStockError",
      items: [{ productId: 7, requested: 5, available: 2 }],
    },
    payload: {
      __typename: "InsufficientStockError",
      code: "INSUFFICIENT_STOCK",
      message: "Insufficient stock for one or more items.",
      items: [{ productId: 7, requested: 5, available: 2 }],
    },
  },
  {
    name: "an order total limit exceeded error",
    error: { kind: "OrderTotalLimitExceededError", limitInCents: 2147483647 },
    payload: {
      __typename: "OrderTotalLimitExceededError",
      code: "ORDER_TOTAL_LIMIT_EXCEEDED",
      message: "Order total exceeds the maximum allowed amount.",
      limitInCents: 2147483647,
    },
  },
];

describe("toErrorPayload", () => {
  test.each(payloadCases)("maps $name", ({ error, payload }) => {
    expect(toErrorPayload(error)).toEqual(payload);
  });
});

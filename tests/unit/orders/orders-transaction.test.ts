import { describe, expect, test } from "vitest";
import { orderTransactionOptions } from "../../../src/modules/orders/orders.service.ts";

describe("orderTransactionOptions", () => {
  test("runs order placement in READ COMMITTED with the documented time limits", () => {
    expect(orderTransactionOptions).toEqual({
      isolationLevel: "ReadCommitted",
      maxWait: 5_000,
      timeout: 10_000,
    });
  });
});

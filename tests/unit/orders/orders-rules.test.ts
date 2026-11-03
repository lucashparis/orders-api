import { describe, expect, test } from "vitest";
import {
  calculateOrderTotal,
  findMissingProductIds,
  findStockShortages,
  maximumAmountInCents,
} from "../../../src/modules/orders/orders.rules.ts";
import type { LockedProduct, RequestedItem } from "../../../src/modules/orders/orders.types.ts";

const locked: LockedProduct[] = [
  { id: 1, priceInCents: 1990, stock: 2 },
  { id: 2, priceInCents: 500, stock: 9 },
];

const priciestProduct: LockedProduct = { id: 9, priceInCents: 2_147_483_647, stock: 2_147_483_647 };
const oneCentProduct: LockedProduct = { id: 8, priceInCents: 1, stock: 1 };

function requestOne(...productIds: number[]): RequestedItem[] {
  return productIds.map((productId) => ({ productId, quantity: 1 }));
}

describe("calculateOrderTotal", () => {
  test("sums the total in cents", () => {
    const items = [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ];
    expect(calculateOrderTotal(items, locked)).toBe(4480);
  });

  test("accepts free products", () => {
    const freeProduct = { id: 3, priceInCents: 0, stock: 4 };
    expect(calculateOrderTotal([{ productId: 3, quantity: 4 }], [freeProduct])).toBe(0);
  });

  test("caps amounts at the largest 32-bit integer", () => {
    expect(maximumAmountInCents).toBe(2_147_483_647);
  });

  test("throws when a requested product was not locked", () => {
    expect(() => calculateOrderTotal(requestOne(404), locked)).toThrow("404");
  });
});

describe("calculateOrderTotal at the limit", () => {
  test("accepts a total exactly at the limit", () => {
    expect(calculateOrderTotal(requestOne(9), [priciestProduct])).toBe(2_147_483_647);
  });

  test("rejects a total one cent above the limit", () => {
    expect(calculateOrderTotal(requestOne(9, 8), [priciestProduct, oneCentProduct])).toBeNull();
  });

  test("rejects huge products without precision loss", () => {
    const items = [{ productId: 9, quantity: 2_147_483_647 }];
    expect(calculateOrderTotal(items, [priciestProduct])).toBeNull();
  });

  test("stops summing as soon as the running total exceeds the limit", () => {
    const items = requestOne(9, 8, 404);
    expect(calculateOrderTotal(items, [priciestProduct, oneCentProduct])).toBeNull();
  });
});

describe("findMissingProductIds", () => {
  test("lists every missing product in ascending order", () => {
    const lockedProducts = [{ id: 1, priceInCents: 1, stock: 1 }];
    expect(findMissingProductIds(requestOne(3, 1, 2), lockedProducts)).toEqual([2, 3]);
  });

  test("returns no ids when every product was locked", () => {
    expect(findMissingProductIds(requestOne(2, 1), locked)).toEqual([]);
  });
});

describe("findStockShortages", () => {
  test("lists every stock shortage", () => {
    const items = [
      { productId: 1, quantity: 5 },
      { productId: 2, quantity: 1 },
    ];
    const shortage = { productId: 1, requested: 5, available: 2 };
    expect(findStockShortages(items, locked)).toEqual([shortage]);
  });

  test("lists shortages in ascending product id order", () => {
    const items = [
      { productId: 2, quantity: 10 },
      { productId: 1, quantity: 3 },
    ];
    expect(findStockShortages(items, locked)).toEqual([
      { productId: 1, requested: 3, available: 2 },
      { productId: 2, requested: 10, available: 9 },
    ]);
  });
});

describe("findStockShortages boundaries", () => {
  test("accepts a quantity equal to the available stock", () => {
    expect(findStockShortages([{ productId: 1, quantity: 2 }], locked)).toEqual([]);
  });

  test("ignores products that were not locked", () => {
    expect(findStockShortages([{ productId: 404, quantity: 1 }], locked)).toEqual([]);
  });
});

import type { StockShortage } from "../../shared/errors/domain-errors.ts";
import type { LockedProduct, RequestedItem } from "./orders.types.ts";

export const maximumAmountInCents = 2_147_483_647;

const maximumAmount = BigInt(maximumAmountInCents);

function indexProductsById(
  lockedProducts: readonly LockedProduct[],
): ReadonlyMap<number, LockedProduct> {
  return new Map(lockedProducts.map((product) => [product.id, product]));
}

function requireLockedProduct(
  productsById: ReadonlyMap<number, LockedProduct>,
  productId: number,
): LockedProduct {
  const product = productsById.get(productId);
  if (product === undefined) {
    throw new Error(`Product ${productId} must be locked before the order total is calculated.`);
  }
  return product;
}

export function findMissingProductIds(
  requestedItems: readonly RequestedItem[],
  lockedProducts: readonly LockedProduct[],
): number[] {
  const productsById = indexProductsById(lockedProducts);
  return requestedItems
    .map((item) => item.productId)
    .filter((productId) => !productsById.has(productId))
    .sort((left, right) => left - right);
}

export function findStockShortages(
  requestedItems: readonly RequestedItem[],
  lockedProducts: readonly LockedProduct[],
): StockShortage[] {
  const productsById = indexProductsById(lockedProducts);
  return requestedItems
    .toSorted((left, right) => left.productId - right.productId)
    .flatMap((item) => {
      const product = productsById.get(item.productId);
      if (product === undefined || item.quantity <= product.stock) {
        return [];
      }
      return [{ productId: item.productId, requested: item.quantity, available: product.stock }];
    });
}

export function calculateOrderTotal(
  requestedItems: readonly RequestedItem[],
  lockedProducts: readonly LockedProduct[],
): number | null {
  const productsById = indexProductsById(lockedProducts);
  let total = 0n;
  for (const item of requestedItems) {
    const product = requireLockedProduct(productsById, item.productId);
    total += BigInt(item.quantity) * BigInt(product.priceInCents);
    if (total > maximumAmount) {
      return null;
    }
  }
  return Number(total);
}

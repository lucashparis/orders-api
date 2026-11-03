import type {
  InsufficientStock,
  OrderTotalLimitExceeded,
  ProductNotFound,
  UserNotFound,
  ValidationFailure,
} from "../../shared/errors/domain-errors.ts";

export type RequestedItem = { productId: number; quantity: number };

export type LockedProduct = { id: number; priceInCents: number; stock: number };

export type OrderRecord = { id: number; userId: number; totalInCents: number; createdAt: Date };

export type OrderItemRecord = {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPriceInCents: number;
};

export type CreateOrderOutcome =
  | { kind: "OrderCreated"; order: OrderRecord }
  | ValidationFailure
  | UserNotFound
  | ProductNotFound
  | InsufficientStock
  | OrderTotalLimitExceeded;

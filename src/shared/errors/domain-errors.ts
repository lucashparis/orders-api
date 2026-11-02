export type FieldViolation = { field: string; message: string };
export type StockShortage = { productId: number; requested: number; available: number };

export type ValidationFailure = { kind: "ValidationError"; fields: FieldViolation[] };
export type EmailAlreadyInUse = { kind: "EmailAlreadyInUseError"; email: string };
export type UserNotFound = { kind: "UserNotFoundError"; userId: number };
export type ProductNotFound = { kind: "ProductNotFoundError"; productIds: number[] };
export type InsufficientStock = { kind: "InsufficientStockError"; items: StockShortage[] };
export type OrderTotalLimitExceeded = {
  kind: "OrderTotalLimitExceededError";
  limitInCents: number;
};

export type DomainError =
  | ValidationFailure
  | EmailAlreadyInUse
  | UserNotFound
  | ProductNotFound
  | InsufficientStock
  | OrderTotalLimitExceeded;

export const domainErrorCodes = {
  ValidationError: "BAD_USER_INPUT",
  EmailAlreadyInUseError: "EMAIL_ALREADY_IN_USE",
  UserNotFoundError: "USER_NOT_FOUND",
  ProductNotFoundError: "PRODUCT_NOT_FOUND",
  InsufficientStockError: "INSUFFICIENT_STOCK",
  OrderTotalLimitExceededError: "ORDER_TOTAL_LIMIT_EXCEEDED",
} as const satisfies Record<DomainError["kind"], string>;

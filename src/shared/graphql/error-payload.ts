import {
  type DomainError,
  domainErrorCodes,
  type EmailAlreadyInUse,
  type InsufficientStock,
  type OrderTotalLimitExceeded,
  type ProductNotFound,
  type UserNotFound,
  type ValidationFailure,
} from "../errors/domain-errors.ts";

type PayloadOf<Error extends DomainError> = Omit<Error, "kind"> & {
  __typename: Error["kind"];
  code: (typeof domainErrorCodes)[Error["kind"]];
  message: string;
};

export type ErrorPayload =
  | PayloadOf<ValidationFailure>
  | PayloadOf<EmailAlreadyInUse>
  | PayloadOf<UserNotFound>
  | PayloadOf<ProductNotFound>
  | PayloadOf<InsufficientStock>
  | PayloadOf<OrderTotalLimitExceeded>;

const domainErrorMessages = {
  ValidationError: "Invalid input.",
  EmailAlreadyInUseError: "Email is already in use.",
  UserNotFoundError: "User not found.",
  ProductNotFoundError: "One or more products were not found.",
  InsufficientStockError: "Insufficient stock for one or more items.",
  OrderTotalLimitExceededError: "Order total exceeds the maximum allowed amount.",
} as const satisfies Record<DomainError["kind"], string>;

function payloadHeader<Kind extends DomainError["kind"]>(kind: Kind) {
  return {
    __typename: kind,
    code: domainErrorCodes[kind],
    message: domainErrorMessages[kind],
  };
}

export function toErrorPayload(error: DomainError): ErrorPayload {
  switch (error.kind) {
    case "ValidationError":
      return { ...payloadHeader(error.kind), fields: error.fields };
    case "EmailAlreadyInUseError":
      return { ...payloadHeader(error.kind), email: error.email };
    case "UserNotFoundError":
      return { ...payloadHeader(error.kind), userId: error.userId };
    case "ProductNotFoundError":
      return { ...payloadHeader(error.kind), productIds: error.productIds };
    case "InsufficientStockError":
      return { ...payloadHeader(error.kind), items: error.items };
    case "OrderTotalLimitExceededError":
      return { ...payloadHeader(error.kind), limitInCents: error.limitInCents };
  }
}

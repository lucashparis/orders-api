import type { FastifyBaseLogger } from "fastify";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import {
  type DomainError,
  domainErrorCodes,
  type InsufficientStock,
  type OrderTotalLimitExceeded,
  type ProductNotFound,
} from "../../shared/errors/domain-errors.ts";
import { toValidationFailure } from "../../shared/errors/validation-failure.ts";
import {
  decrementStock,
  insertOrder,
  lockProducts,
  type NewOrder,
  userExists,
} from "./orders.repository.ts";
import {
  calculateOrderTotal,
  findMissingProductIds,
  findStockShortages,
  maximumAmountInCents,
} from "./orders.rules.ts";
import { type CreateOrderInput, createOrderInputSchema } from "./orders.schemas.ts";
import type { CreateOrderOutcome, LockedProduct, OrderRecord } from "./orders.types.ts";

export const orderTransactionOptions = { maxWait: 5_000, timeout: 10_000 };

export type OrdersService = {
  createOrder(input: unknown, logger?: FastifyBaseLogger): Promise<CreateOrderOutcome>;
};

type OrdersServiceDependencies = { prisma: PrismaClient; logger: FastifyBaseLogger };

type PricedOrder = { kind: "OrderPriced"; order: NewOrder };

type PricingOutcome = PricedOrder | ProductNotFound | InsufficientStock | OrderTotalLimitExceeded;

function sortProductIds(request: CreateOrderInput): number[] {
  return request.items.map((item) => item.productId).sort((left, right) => left - right);
}

function requireLockedPrice(pricesById: ReadonlyMap<number, number>, productId: number): number {
  const priceInCents = pricesById.get(productId);
  if (priceInCents === undefined) {
    throw new Error(`Product ${productId} must be locked before the order is written.`);
  }
  return priceInCents;
}

function buildNewOrder(
  request: CreateOrderInput,
  lockedProducts: readonly LockedProduct[],
  totalInCents: number,
): NewOrder {
  const pricesById = new Map(lockedProducts.map((product) => [product.id, product.priceInCents]));
  return {
    userId: request.userId,
    totalInCents,
    items: request.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceInCents: requireLockedPrice(pricesById, item.productId),
    })),
  };
}

function priceOrder(
  request: CreateOrderInput,
  lockedProducts: readonly LockedProduct[],
): PricingOutcome {
  const missingProductIds = findMissingProductIds(request.items, lockedProducts);
  if (missingProductIds.length > 0) {
    return { kind: "ProductNotFoundError", productIds: missingProductIds };
  }
  const shortages = findStockShortages(request.items, lockedProducts);
  if (shortages.length > 0) {
    return { kind: "InsufficientStockError", items: shortages };
  }
  const totalInCents = calculateOrderTotal(request.items, lockedProducts);
  if (totalInCents === null) {
    return { kind: "OrderTotalLimitExceededError", limitInCents: maximumAmountInCents };
  }
  return { kind: "OrderPriced", order: buildNewOrder(request, lockedProducts, totalInCents) };
}

async function placeOrder(
  transaction: Prisma.TransactionClient,
  request: CreateOrderInput,
): Promise<CreateOrderOutcome> {
  if (!(await userExists(transaction, request.userId))) {
    return { kind: "UserNotFoundError", userId: request.userId };
  }
  const lockedProducts = await lockProducts(transaction, sortProductIds(request));
  const pricing = priceOrder(request, lockedProducts);
  if (pricing.kind !== "OrderPriced") {
    return pricing;
  }
  await decrementStock(transaction, request.items);
  const order = await insertOrder(transaction, pricing.order);
  return { kind: "OrderCreated", order };
}

function logRejection(logger: FastifyBaseLogger, rejection: DomainError): void {
  logger.info({ event: "order.rejected", code: domainErrorCodes[rejection.kind] });
}

function logCreation(logger: FastifyBaseLogger, order: OrderRecord, itemsCount: number): void {
  logger.info({
    event: "order.created",
    orderId: order.id,
    userId: order.userId,
    itemsCount,
    totalInCents: order.totalInCents,
  });
}

export function createOrdersService(dependencies: OrdersServiceDependencies): OrdersService {
  const { prisma } = dependencies;
  return {
    async createOrder(input, logger = dependencies.logger) {
      const parsed = createOrderInputSchema.safeParse(input);
      if (!parsed.success) {
        const failure = toValidationFailure(parsed.error);
        logRejection(logger, failure);
        return failure;
      }
      const request = parsed.data;
      const outcome = await prisma.$transaction(
        (transaction) => placeOrder(transaction, request),
        orderTransactionOptions,
      );
      if (outcome.kind !== "OrderCreated") {
        logRejection(logger, outcome);
        return outcome;
      }
      logCreation(logger, outcome.order, request.items.length);
      return outcome;
    },
  };
}

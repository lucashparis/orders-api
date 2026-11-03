import { z as zod } from "zod";
import type { RequestedItem } from "./orders.types.ts";

const maximumDatabaseId = 2_147_483_647;
const maximumItemsPerOrder = 100;
const databaseIdPattern = /^[1-9]\d*$/;
const invalidIdMessage = `Must be a positive integer ID no greater than ${maximumDatabaseId}.`;
const duplicateProductMessage = "Duplicate product in order.";

function isDatabaseId(text: string): boolean {
  return databaseIdPattern.test(text) && Number(text) <= maximumDatabaseId;
}

const databaseIdSchema = zod
  .string()
  .refine(isDatabaseId, invalidIdMessage)
  .transform((text) => Number(text));

const orderItemSchema = zod.object({
  productId: databaseIdSchema,
  quantity: zod.number().int().min(1),
});

function reportDuplicateProducts(
  items: RequestedItem[],
  context: zod.RefinementCtx<RequestedItem[]>,
): void {
  const seenProductIds = new Set<number>();
  for (const [index, item] of items.entries()) {
    if (seenProductIds.has(item.productId)) {
      context.addIssue({
        code: "custom",
        message: duplicateProductMessage,
        path: [index, "productId"],
        input: item.productId,
      });
    }
    seenProductIds.add(item.productId);
  }
}

export const createOrderInputSchema = zod.object({
  userId: databaseIdSchema,
  items: zod
    .array(orderItemSchema)
    .min(1)
    .max(maximumItemsPerOrder)
    .superRefine(reportDuplicateProducts),
});

export type CreateOrderInput = zod.infer<typeof createOrderInputSchema>;

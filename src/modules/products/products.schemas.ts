import { z as zod } from "zod";

const maximumNameLength = 100;

export const createProductInputSchema = zod.object({
  name: zod.string().trim().min(1).max(maximumNameLength),
  priceInCents: zod.number().int().min(0),
  stock: zod.number().int().min(0),
});

export type CreateProductInput = zod.infer<typeof createProductInputSchema>;

import { z as zod } from "zod";

const maximumNameLength = 100;
const maximumEmailLength = 254;

export const createUserInputSchema = zod.object({
  name: zod.string().trim().min(1).max(maximumNameLength),
  email: zod.string().trim().toLowerCase().pipe(zod.email().max(maximumEmailLength)),
});

export type CreateUserInput = zod.infer<typeof createUserInputSchema>;

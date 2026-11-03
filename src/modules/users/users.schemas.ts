import { z as zod } from "zod";
import { hasNoNulCharacter, nulCharacterMessage } from "../../shared/validation/text.ts";

const maximumNameLength = 100;
const maximumEmailLength = 254;

export const createUserInputSchema = zod.object({
  name: zod
    .string()
    .trim()
    .min(1)
    .max(maximumNameLength)
    .refine(hasNoNulCharacter, nulCharacterMessage),
  email: zod
    .string()
    .trim()
    .toLowerCase()
    .refine(hasNoNulCharacter, nulCharacterMessage)
    .pipe(zod.email().max(maximumEmailLength)),
});

export type CreateUserInput = zod.infer<typeof createUserInputSchema>;

import type { z as zod } from "zod";
import type { ValidationFailure } from "./domain-errors.ts";

export function toValidationFailure(error: zod.ZodError): ValidationFailure {
  return {
    kind: "ValidationError",
    fields: error.issues.map((issue) => ({
      field: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

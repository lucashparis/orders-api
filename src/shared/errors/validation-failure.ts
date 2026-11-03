import type { z as zod } from "zod";
import type { ValidationFailure } from "./domain-errors.ts";

const sentenceEnd = ".";

function endSentence(message: string): string {
  return message.endsWith(sentenceEnd) ? message : `${message}${sentenceEnd}`;
}

export function toValidationFailure(error: zod.ZodError): ValidationFailure {
  return {
    kind: "ValidationError",
    fields: error.issues.map((issue) => ({
      field: issue.path.map(String).join("."),
      message: endSentence(issue.message),
    })),
  };
}

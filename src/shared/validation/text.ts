const nulCharacter = "\u0000";

export const nulCharacterMessage = "Must not contain NUL characters.";

export function hasNoNulCharacter(text: string): boolean {
  return !text.includes(nulCharacter);
}

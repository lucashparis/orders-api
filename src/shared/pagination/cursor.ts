const cursorPrefix = "v1:";
const cursorPattern = /^v1:[1-9]\d*$/;
const maximumCursorId = 2147483647;

export function encodeCursor(id: number): string {
  return Buffer.from(`${cursorPrefix}${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): number | null {
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  if (!cursorPattern.test(text)) {
    return null;
  }
  const id = Number(text.slice(cursorPrefix.length));
  if (id > maximumCursorId || encodeCursor(id) !== cursor) {
    return null;
  }
  return id;
}

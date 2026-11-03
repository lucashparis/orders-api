import { describe, expect, test } from "vitest";
import { buildConnection } from "../../../src/shared/pagination/connection.ts";
import { decodeCursor, encodeCursor } from "../../../src/shared/pagination/cursor.ts";
import { parsePageRequest } from "../../../src/shared/pagination/page-request.ts";

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

const badUserInput = expect.objectContaining({ extensions: { code: "BAD_USER_INPUT" } });

describe("cursor", () => {
  test("round-trips a cursor", () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });

  test("encodes the version and id as base64url", () => {
    expect(encodeCursor(42)).toBe(toBase64Url("v1:42"));
  });

  test("accepts the maximum id", () => {
    expect(decodeCursor(encodeCursor(2147483647))).toBe(2147483647);
  });

  test.each([
    "garbage",
    "",
    toBase64Url("v1:-5"),
    toBase64Url("v1:0"),
    toBase64Url("v1:abc"),
    toBase64Url("v1:7x"),
    toBase64Url("v1:007"),
    toBase64Url("v2:5"),
    toBase64Url("v1:2147483648"),
  ])("rejects the tampered cursor %s", (cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe("buildConnection", () => {
  test("reports a next page when the lookahead row exists", () => {
    const connection = buildConnection([{ id: 1 }, { id: 2 }, { id: 3 }], 2);
    expect(connection.edges.map((edge) => edge.node.id)).toEqual([1, 2]);
    expect(connection.pageInfo).toEqual({ hasNextPage: true, endCursor: encodeCursor(2) });
  });

  test("reports no next page when there is no lookahead row", () => {
    const connection = buildConnection([{ id: 1 }, { id: 2 }], 2);
    expect(connection.edges).toHaveLength(2);
    expect(connection.pageInfo).toEqual({ hasNextPage: false, endCursor: encodeCursor(2) });
  });

  test("returns a null end cursor for an empty page", () => {
    expect(buildConnection([], 20).pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });
});

describe("parsePageRequest", () => {
  test("defaults the page size", () => {
    expect(parsePageRequest({})).toEqual({ pageSize: 20, afterId: null });
  });

  test("treats null arguments as defaults", () => {
    expect(parsePageRequest({ first: null, after: null })).toEqual({ pageSize: 20, afterId: null });
  });

  test.each([0, -1, 101])("rejects first = %i", (first) => {
    expect(() => parsePageRequest({ first })).toThrow(badUserInput);
  });

  test("rejects a tampered after cursor", () => {
    expect(() => parsePageRequest({ after: "garbage" })).toThrow(badUserInput);
  });

  test("explains each rejection in a sentence", () => {
    expect(() => parsePageRequest({ first: 0 })).toThrow("first must be between 1 and 100.");
    expect(() => parsePageRequest({ after: "garbage" })).toThrow("after is not a valid cursor.");
  });

  test("decodes a valid after cursor", () => {
    expect(parsePageRequest({ first: 5, after: encodeCursor(7) })).toEqual({
      pageSize: 5,
      afterId: 7,
    });
  });
});

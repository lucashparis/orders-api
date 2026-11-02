import { describe, expect, test } from "vitest";
import {
  commentMarkerForFile,
  describeCommentViolations,
  findLineComments,
  findTypeScriptComments,
} from "../../../scripts/comment-detection.ts";

describe("TypeScript value comments", () => {
  test("returns line and block comments from TypeScript source", () => {
    expect(findTypeScriptComments("// first\nconst total: number = 1;\n/* second */")).toEqual([
      "first",
      "second",
    ]);
  });

  test("ignores comment-like text inside strings", () => {
    expect(findTypeScriptComments('const address: string = "http://example.com";')).toEqual([]);
  });

  test("ignores comment markers inside template literals", () => {
    expect(findTypeScriptComments("const text = `a // b /* c */`;")).toEqual([]);
  });

  test("distinguishes regex literals from comments", () => {
    const source = String.raw`const pattern = /\/\//; // real`;
    expect(findTypeScriptComments(source)).toEqual(["real"]);
  });
});

describe("TypeScript type comments", () => {
  test("finds comments hidden inside type syntax", () => {
    expect(findTypeScriptComments("const total: /* hidden */ number = 1;")).toEqual(["hidden"]);
    expect(findTypeScriptComments("interface Order {\n // hidden\n total: number }")).toEqual([
      "hidden",
    ]);
    expect(findTypeScriptComments("type Order = {\n /* hidden */ total: number };")).toEqual([
      "hidden",
    ]);
  });

  test("returns value and type comments in source order", () => {
    const source = "// one\ntype Order = { /* two */ total: number };\nconst value = 1; // three";
    expect(findTypeScriptComments(source)).toEqual(["one", "two", "three"]);
  });

  test("ignores comment markers inside string literal types", () => {
    expect(findTypeScriptComments('type Address = "http://example.com";')).toEqual([]);
  });
});

describe("line comments", () => {
  test("returns lines that start with the marker", () => {
    expect(findLineComments("SELECT 1;\n  -- note\nSELECT 2;", "--")).toEqual(["-- note"]);
  });

  test("does not treat SDL descriptions as comments", () => {
    expect(findLineComments('"""A customer."""\ntype User { id: ID! }', "#")).toEqual([]);
  });
});

describe("file handling", () => {
  test("maps files to comment markers", () => {
    expect(commentMarkerForFile("src/app.ts")).toBe("typescript");
    expect(commentMarkerForFile("src/modules/users/users.graphql")).toBe("#");
    expect(commentMarkerForFile("prisma/migrations/0001_init/migration.sql")).toBe("--");
    expect(commentMarkerForFile("prisma/schema.prisma")).toBe("//");
    expect(commentMarkerForFile("Dockerfile")).toBe("#");
    expect(commentMarkerForFile("docker-compose.yml")).toBe("#");
    expect(commentMarkerForFile("README.md")).toBeNull();
  });

  test("describes each comment with its file", () => {
    expect(describeCommentViolations("src/app.ts", "// note\nconst total = 1;")).toEqual([
      "src/app.ts: note",
    ]);
    expect(describeCommentViolations("README.md", "// note")).toEqual([]);
  });

  test("reports files that cannot be analyzed", () => {
    expect(describeCommentViolations("src/status.ts", "enum Status { Active }")).toEqual([
      "src/status.ts: unable to analyze — TypeScript enum is not supported in strip-only mode",
    ]);
  });
});

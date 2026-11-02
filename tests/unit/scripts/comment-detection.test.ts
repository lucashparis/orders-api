import { describe, expect, test } from "vitest";
import {
  commentMarkerForFile,
  findLineComments,
  findTypeScriptComments,
} from "../../../scripts/comment-detection.ts";

describe("comment detection", () => {
  test("returns line and block comments from TypeScript source", () => {
    expect(findTypeScriptComments("// first\nconst total: number = 1;\n/* second */")).toEqual([
      "first",
      "second",
    ]);
  });

  test("ignores comment-like text inside strings", () => {
    expect(findTypeScriptComments('const address: string = "http://example.com";')).toEqual([]);
  });

  test("returns lines that start with the marker", () => {
    expect(findLineComments("SELECT 1;\n  -- note\nSELECT 2;", "--")).toEqual(["-- note"]);
  });

  test("does not treat SDL descriptions as comments", () => {
    expect(findLineComments('"""A customer."""\ntype User { id: ID! }', "#")).toEqual([]);
  });

  test("maps files to comment markers", () => {
    expect(commentMarkerForFile("src/app.ts")).toBe("typescript");
    expect(commentMarkerForFile("src/modules/users/users.graphql")).toBe("#");
    expect(commentMarkerForFile("prisma/migrations/0001_init/migration.sql")).toBe("--");
    expect(commentMarkerForFile("prisma/schema.prisma")).toBe("//");
    expect(commentMarkerForFile("Dockerfile")).toBe("#");
    expect(commentMarkerForFile("docker-compose.yml")).toBe("#");
    expect(commentMarkerForFile("README.md")).toBeNull();
  });
});

import { stripTypeScriptTypes } from "node:module";
import { basename, extname } from "node:path";
import { parse } from "acorn";

export type CommentMarker = "#" | "--" | "//";
export type CommentStyle = "typescript" | CommentMarker;

const STYLE_BY_EXTENSION: Record<string, CommentStyle> = {
  ".ts": "typescript",
  ".graphql": "#",
  ".sql": "--",
  ".prisma": "//",
  ".yml": "#",
  ".yaml": "#",
};

export function findTypeScriptComments(source: string): string[] {
  const comments: string[] = [];
  parse(stripTypeScriptTypes(source), {
    ecmaVersion: "latest",
    sourceType: "module",
    onComment: (_isBlock, text) => {
      comments.push(text.trim());
    },
  });
  return comments;
}

export function findLineComments(source: string, marker: CommentMarker): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(marker));
}

export function commentMarkerForFile(filePath: string): CommentStyle | null {
  if (basename(filePath) === "Dockerfile") {
    return "#";
  }
  return STYLE_BY_EXTENSION[extname(filePath)] ?? null;
}

import { stripTypeScriptTypes } from "node:module";
import { basename, extname } from "node:path";
import { parse } from "acorn";

export type CommentMarker = "#" | "--" | "//";
export type CommentStyle = "typescript" | CommentMarker;

interface LocatedComment {
  start: number;
  text: string;
}

interface CommentSpan {
  end: number;
  text: string;
}

const STYLE_BY_EXTENSION: Record<string, CommentStyle> = {
  ".ts": "typescript",
  ".graphql": "#",
  ".sql": "--",
  ".prisma": "//",
  ".yml": "#",
  ".yaml": "#",
};

const QUOTES = new Set(["'", '"', "`"]);

function findValueComments(strippedSource: string): LocatedComment[] {
  const comments: LocatedComment[] = [];
  parse(strippedSource, {
    ecmaVersion: "latest",
    sourceType: "module",
    onComment: (_isBlock, text, start) => {
      comments.push({ start, text: text.trim() });
    },
  });
  return comments;
}

function buildTypeOnlyText(source: string, strippedSource: string): string {
  if (source.length !== strippedSource.length) {
    throw new Error("type stripping changed the source length");
  }
  return Array.from(source, (character, index) => {
    const keepsCharacter = character === "\n" || character === "\r";
    return keepsCharacter || character !== strippedSource.charAt(index) ? character : " ";
  }).join("");
}

function skipQuoted(text: string, start: number): number {
  const quote = text.charAt(start);
  let index = start + 1;
  while (index < text.length && text.charAt(index) !== quote) {
    index += text.charAt(index) === "\\" ? 2 : 1;
  }
  return index + 1;
}

function readCommentAt(text: string, start: number): CommentSpan | null {
  if (text.startsWith("//", start)) {
    const lineEnd = text.indexOf("\n", start);
    const end = lineEnd === -1 ? text.length : lineEnd;
    return { end, text: text.slice(start + 2, end).trim() };
  }
  if (text.startsWith("/*", start)) {
    const close = text.indexOf("*/", start + 2);
    const end = close === -1 ? text.length : close + 2;
    return { end, text: text.slice(start + 2, close === -1 ? end : close).trim() };
  }
  return null;
}

function findTypeComments(typeOnlyText: string): LocatedComment[] {
  const comments: LocatedComment[] = [];
  let index = 0;
  while (index < typeOnlyText.length) {
    if (QUOTES.has(typeOnlyText.charAt(index))) {
      index = skipQuoted(typeOnlyText, index);
      continue;
    }
    const comment = readCommentAt(typeOnlyText, index);
    if (comment === null) {
      index += 1;
      continue;
    }
    comments.push({ start: index, text: comment.text });
    index = comment.end;
  }
  return comments;
}

export function findTypeScriptComments(source: string): string[] {
  const strippedSource = stripTypeScriptTypes(source);
  const typeOnlyText = buildTypeOnlyText(source, strippedSource);
  return [...findValueComments(strippedSource), ...findTypeComments(typeOnlyText)]
    .sort((first, second) => first.start - second.start)
    .map((comment) => comment.text);
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

function findComments(filePath: string, source: string): string[] {
  const style = commentMarkerForFile(filePath);
  if (style === null) {
    return [];
  }
  return style === "typescript" ? findTypeScriptComments(source) : findLineComments(source, style);
}

export function describeCommentViolations(filePath: string, source: string): string[] {
  try {
    return findComments(filePath, source).map((comment) => `${filePath}: ${comment}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`${filePath}: unable to analyze — ${reason}`];
  }
}

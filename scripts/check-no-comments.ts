import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { commentMarkerForFile, describeCommentViolations } from "./comment-detection.ts";

const ROOTS = [
  "src",
  "tests",
  "scripts",
  "prisma",
  "lint-rules",
  "Dockerfile",
  "docker-compose.yml",
  "prisma.config.ts",
  "vitest.config.ts",
];
const IGNORED_DIRECTORIES = new Set(["node_modules", "generated"]);

async function collectFiles(path: string): Promise<string[]> {
  if (!existsSync(path)) {
    return [];
  }
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (entries === null) {
    return [path];
  }
  const nested = entries
    .filter((entry) => !IGNORED_DIRECTORIES.has(entry.name))
    .map((entry) => collectFiles(join(path, entry.name)));
  return (await Promise.all(nested)).flat();
}

async function main(): Promise<void> {
  const files = (await Promise.all(ROOTS.map(collectFiles))).flat().sort();
  for (const filePath of files.filter((file) => commentMarkerForFile(file) !== null)) {
    const source = await readFile(filePath, "utf8");
    for (const line of describeCommentViolations(filePath, source)) {
      console.log(line);
      process.exitCode = 1;
    }
  }
}

await main();

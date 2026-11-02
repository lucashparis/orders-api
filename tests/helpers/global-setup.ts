import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database-url.ts";

export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}

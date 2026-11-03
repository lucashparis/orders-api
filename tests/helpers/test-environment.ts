import type { Environment } from "../../src/config/env.ts";
import { testDatabaseUrl } from "./test-database-url.ts";

export const testEnvironment: Environment = {
  databaseUrl: testDatabaseUrl,
  logLevel: "silent",
  nodeEnv: "test",
  graphiqlEnabled: false,
  port: 0,
  host: "127.0.0.1",
};

import { z as zod } from "zod";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type NodeEnvironment = "development" | "production" | "test";

export type Environment = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: LogLevel;
  nodeEnv: NodeEnvironment;
  graphiqlEnabled: boolean;
};

const maximumPort = 65535;

const portSchema = zod
  .string()
  .regex(/^\d+$/, "must be an integer")
  .transform(Number)
  .refine((port) => port >= 1 && port <= maximumPort, "must be between 1 and 65535");

const booleanTextSchema = zod.enum(["true", "false"]).transform((value) => value === "true");

const environmentSchema = zod.object({
  DATABASE_URL: zod.string().min(1),
  PORT: portSchema.default(3000),
  HOST: zod.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: zod
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: zod.enum(["development", "production", "test"]).default("production"),
  GRAPHIQL_ENABLED: booleanTextSchema.default(false),
});

function describeIssues(issues: readonly zod.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function loadEnvironment(variables: NodeJS.ProcessEnv): Environment {
  const parsed = environmentSchema.safeParse(variables);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables - ${describeIssues(parsed.error.issues)}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    nodeEnv: parsed.data.NODE_ENV,
    graphiqlEnabled: parsed.data.GRAPHIQL_ENABLED,
  };
}

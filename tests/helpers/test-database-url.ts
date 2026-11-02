export const testDatabaseUrl: string =
  process.env.TEST_DATABASE_URL ?? "postgresql://orders:orders@localhost:5433/orders_test";

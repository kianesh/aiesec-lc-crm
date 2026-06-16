import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export * from "./schema";

// Cache the Postgres client + Drizzle instance on globalThis so warm serverless
// instances reuse a single connection pool instead of opening a fresh
// TCP+TLS connection on every request (the dominant TTFB cost cross-region).
type DbClient = ReturnType<typeof drizzle<typeof schema>>;
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
  __drizzle?: DbClient;
  __pgUrl?: string;
};

export function createDb(databaseUrl: string): DbClient {
  if (globalForDb.__drizzle && globalForDb.__pgUrl === databaseUrl) {
    return globalForDb.__drizzle;
  }

  const client = postgres(databaseUrl, {
    prepare: false, // required for Supabase's transaction-mode pooler (pgbouncer)
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10
  });
  const db = drizzle(client, { schema });

  globalForDb.__pgClient = client;
  globalForDb.__drizzle = db;
  globalForDb.__pgUrl = databaseUrl;
  return db;
}

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// Keep a single pool/browser across hot reloads and route handlers.
const globalForDb = globalThis as unknown as {
  __qgsPool?: Pool;
  __qgsDb?: Database;
};

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (globalForDb.__qgsPool) return globalForDb.__qgsPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  // RDS terminates TLS with a certificate signed by the RDS CA. `sslmode=require`
  // encrypts without verification, which is what the least-privilege app user
  // uses. Pin the RDS CA bundle via DATABASE_SSL_CA for stricter setups.
  const sslEnabled =
    process.env.DATABASE_SSL === "true" || /sslmode=require/.test(connectionString);

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  globalForDb.__qgsPool = pool;
  return pool;
}

export function getDb(): Database {
  if (globalForDb.__qgsDb) return globalForDb.__qgsDb;
  const db = drizzle(getPool(), { schema });
  globalForDb.__qgsDb = db;
  return db;
}

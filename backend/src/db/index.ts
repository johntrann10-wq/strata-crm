import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });

// Used by integration tests to avoid leaving open sockets behind.
export async function closeDb(): Promise<void> {
  await pool.end();
}

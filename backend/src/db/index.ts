import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });

type RequiredSchemaColumn = {
  table: string;
  column: string;
};

const requiredRuntimeSchemaColumns: RequiredSchemaColumn[] = [
  { table: "appointments", column: "job_start_time" },
  { table: "appointments", column: "expected_completion_time" },
  { table: "appointments", column: "pickup_ready_time" },
  { table: "appointments", column: "vehicle_on_site" },
  { table: "appointments", column: "job_phase" },
];

const appleAuthSchemaStatements = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_subject text",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_email text",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_email_is_private_relay boolean NOT NULL DEFAULT false",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_apple_subject_unique ON users (apple_subject)",
];

export async function ensureAppleAuthSchema(): Promise<void> {
  for (const statement of appleAuthSchemaStatements) {
    await pool.query(statement);
  }
}

export async function verifyRuntimeSchema(): Promise<void> {
  const tableNames = [...new Set(requiredRuntimeSchemaColumns.map((entry) => entry.table))];
  const result = await pool.query<{
    table_name: string;
    column_name: string;
  }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [tableNames]
  );

  const presentColumns = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredRuntimeSchemaColumns.filter(
    (entry) => !presentColumns.has(`${entry.table}.${entry.column}`)
  );

  if (missingColumns.length === 0) {
    return;
  }

  const missingSummary = missingColumns.map((entry) => `${entry.table}.${entry.column}`).join(", ");
  throw new Error(
    `Database schema is incompatible with this build. Missing columns: ${missingSummary}. Run the backend schema init/migration step before starting the API.`
  );
}

// Used by integration tests to avoid leaving open sockets behind.
export async function closeDb(): Promise<void> {
  await pool.end();
}

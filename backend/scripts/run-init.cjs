/**
 * Run init-schema.sql against DATABASE_URL. Use when drizzle-kit generate/migrate fails.
 * From repo root: cd backend && node scripts/run-init.cjs
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { Client } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in backend/.env (e.g. postgresql://postgres:postgres@localhost:5432/strata)");
  process.exit(1);
}

const sqlPath = path.join(__dirname, "init-schema.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

async function main() {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(sql);
    console.log("Schema initialized successfully.");
  } catch (err) {
    console.error("Init failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

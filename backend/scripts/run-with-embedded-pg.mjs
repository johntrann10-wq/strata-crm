/**
 * Start embedded Postgres, create DB, run init schema, then start the backend server.
 * Run from backend: node scripts/run-with-embedded-pg.mjs
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const dataDir = path.join(backendRoot, ".pgdata");
const sqlPath = path.join(__dirname, "init-schema.sql");

const DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/strata";

async function main() {
  console.log("Starting embedded Postgres...");
  const embedded = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: 5432,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error("[pg]", e),
  });

  await embedded.initialise();
  await embedded.start();
  await embedded.createDatabase("strata");

  console.log("Running schema init...");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Schema ready.");

  // Start backend server with this DB URL
  const server = spawn("yarn", ["dev"], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL },
  });

  const stop = async () => {
    server.kill();
    await embedded.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", (code) => {
    embedded.stop().then(() => process.exit(code ?? 0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * One-command local run: ensures backend/.env and DB, then starts backend and frontend.
 * Requires: Node, Docker (for Postgres). Run from repo root: node run-local.js
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendEnvPath = path.join(__dirname, "backend", ".env");
const backendEnvExample = path.join(__dirname, "backend", ".env.example");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const defaultEnv = `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/strata
JWT_SECRET=dev-jwt-secret-change-in-production
SESSION_SECRET=dev-secret-change-in-production
FRONTEND_URL=http://localhost:5173
PORT=3001
`;

function ensureBackendEnv() {
  if (!fs.existsSync(backendEnvPath) && fs.existsSync(backendEnvExample)) {
    fs.writeFileSync(backendEnvPath, defaultEnv);
    console.log("Created backend/.env with local Postgres defaults.");
  } else if (!fs.existsSync(backendEnvPath)) {
    fs.writeFileSync(backendEnvPath, defaultEnv);
    console.log("Created backend/.env with local Postgres defaults.");
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  console.log("Strata local run\n");
  ensureBackendEnv();
  const backendDir = path.join(__dirname, "backend");
  // Backend with embedded Postgres (no Docker needed)
  const backend = spawn(npmCmd, ["run", "dev:with-db"], { cwd: backendDir, stdio: "inherit", shell: true });
  await new Promise((r) => setTimeout(r, 5000));
  const frontend = spawn(npmCmd, ["run", "dev"], { cwd: __dirname, stdio: "inherit", shell: true });
  console.log("\nBackend: http://localhost:3001  Frontend: http://localhost:5173");
  console.log("Open http://localhost:5173 in your browser. Press Ctrl+C to stop.\n");
  await Promise.race([
    new Promise((_, rej) => backend.on("error", rej)),
    new Promise((_, rej) => frontend.on("error", rej)),
  ]).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

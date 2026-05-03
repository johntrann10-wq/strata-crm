import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);

function main() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/c", "npm.cmd", "--prefix", "backend", "run", "dev:with-db"]
      : ["--prefix", "backend", "run", "dev:with-db"];

  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      FRONTEND_URL: "http://127.0.0.1:4173",
      PORT: "3001",
      EMBEDDED_PG_EPHEMERAL: "1",
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main();

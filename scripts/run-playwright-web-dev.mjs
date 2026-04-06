import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);

async function prepareGeneratedTypes() {
  if (process.platform !== "win32") return;
  const generatedTypesDir = join(repoRoot, ".react-router", "types", "web");
  try {
    await rm(generatedTypesDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    console.warn("[playwright-web-dev] Could not clear generated types directory:", error);
  }
}

async function main() {
  await prepareGeneratedTypes();

  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/c", "npm.cmd", "run", "dev", "--", "--host", "127.0.0.1", "--port", "4173"]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4173"];
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

void main();

/**
 * Post-build check: fail if known stale / forbidden API host strings appear in the client bundle.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "build/client");
const configuredApiOrigin =
  process.env.VITE_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || "";
const configuredApiHost = configuredApiOrigin
  ? new URL(configuredApiOrigin).host.toLowerCase()
  : "";
const forbidden = [
  { re: /strata\.gadget\.app/i, msg: "strata.gadget.app (legacy Gadget host)" },
];

if (configuredApiHost && configuredApiHost !== "localhost" && configuredApiHost !== "127.0.0.1") {
  forbidden.push({
    re: /railway\.app/i,
    msg: `unexpected railway.app host (expected only ${configuredApiHost})`,
    allow: new RegExp(configuredApiHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  });
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      for (const { re, msg, allow } of forbidden) {
        if (re.test(c) && !(allow && allow.test(c))) {
          console.error(`[verify-client-bundle] Forbidden pattern (${msg}) in ${p}`);
          process.exit(1);
        }
      }
    }
  }
}

if (!fs.existsSync(root)) {
  console.warn("[verify-client-bundle] build/client missing — skip");
  process.exit(0);
}
walk(root);
console.log("[verify-client-bundle] OK (no forbidden API host strings)");

/**
 * Post-build check: fail if known stale / forbidden API host strings appear in the client bundle.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "build/client");
const forbidden = [
  { re: /railway\.app/i, msg: "railway.app (use env-driven API URL only)" },
  { re: /strata\.gadget\.app/i, msg: "strata.gadget.app (legacy Gadget host)" },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      for (const { re, msg } of forbidden) {
        if (re.test(c)) {
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

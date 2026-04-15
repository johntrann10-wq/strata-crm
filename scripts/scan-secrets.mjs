#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();

const textFilePattern = /\.(cjs|cts|env|example|js|json|md|mjs|mts|sh|toml|ts|tsx|txt|ya?ml)$/i;
const skippedPathPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)build\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)playwright-report\//,
  /(^|\/)blob-report\//,
  /(^|\/)test-results\//,
];

const placeholderPatterns = [
  /change[-_ ]?me/i,
  /replace[-_ ]?with/i,
  /placeholder/i,
  /dummy/i,
  /example/i,
  /your-/i,
  /not-for-production/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /postgres:postgres@localhost/i,
  /test@example\.com/i,
  /re_x+/i,
];

const rules = [
  { name: "Stripe secret key", regex: /\bsk_(live|test)_[A-Za-z0-9]+\b/g },
  { name: "Stripe restricted key", regex: /\brk_(live|test)_[A-Za-z0-9]+\b/g },
  { name: "Stripe webhook secret", regex: /\bwhsec_[A-Za-z0-9]+\b/g },
  { name: "Resend API key", regex: /\bre_[A-Za-z0-9]{8,}\b/g },
  { name: "GitHub personal access token", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]+\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  { name: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "Database connection string", regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/g },
];

function getTrackedFiles() {
  try {
    const raw = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return raw.split("\0").filter(Boolean);
  } catch {
    const discovered = [];
    const walk = (currentDir) => {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
        if (skippedPathPatterns.some((pattern) => pattern.test(relativePath))) continue;
        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }
        discovered.push(relativePath);
      }
    };
    walk(repoRoot);
    return discovered;
  }
}

function shouldScanFile(relativePath) {
  if (skippedPathPatterns.some((pattern) => pattern.test(relativePath))) return false;
  return textFilePattern.test(relativePath);
}

function maskMatch(value) {
  if (value.startsWith("-----BEGIN")) return "-----BEGIN [MASKED PRIVATE KEY]-----";
  if (value.includes("://")) {
    try {
      const parsed = new URL(value);
      const username = parsed.username ? `${parsed.username.slice(0, 1)}***` : "";
      const password = parsed.password ? ":***" : "";
      const auth = username || password ? `${username}${password}@` : "";
      return `${parsed.protocol}//${auth}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
    } catch {
      return "[MASKED CONNECTION STRING]";
    }
  }
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

function isAllowedMatch(value, line) {
  return placeholderPatterns.some((pattern) => pattern.test(value) || pattern.test(line));
}

const findings = [];

for (const relativePath of getTrackedFiles()) {
  if (!shouldScanFile(relativePath)) continue;

  const absolutePath = path.join(repoRoot, relativePath);
  let contents = "";
  try {
    contents = fs.readFileSync(absolutePath, "utf8");
  } catch {
    continue;
  }

  if (contents.includes("\0")) continue;

  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of rules) {
      const matches = Array.from(line.matchAll(rule.regex));
      for (const match of matches) {
        const value = match[0];
        if (!value || isAllowedMatch(value, line)) continue;
        findings.push({
          file: relativePath,
          line: index + 1,
          rule: rule.name,
          match: maskMatch(value),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("[scan-secrets] Potential secrets detected in tracked files:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}: ${finding.match}`);
  }
  process.exit(1);
}

console.log("[scan-secrets] OK (no non-placeholder secrets detected in tracked files)");

#!/usr/bin/env node
/**
 * Guards against the mistake that started all of this: a real Supabase key
 * being committed to a public repo.
 *
 *   npm run check:secrets        # scan tracked files
 *   npm run check:secrets -- --all   # also scan the whole history (slow)
 *
 * Fails (exit 1) when it finds:
 *   - a JWT-shaped Supabase anon/service key in a tracked file
 *   - a `sb_secret_` / `service_role` key
 *   - a tracked .env (it must stay ignored)
 *   - a .env.example containing a real-looking key instead of a placeholder
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const SECRET_KEY = /\bsb_secret_[A-Za-z0-9_-]{10,}/;
const SERVICE_ROLE = /"role"\s*:\s*"service_role"/;
const PLACEHOLDER = /your-|example|placeholder|xxxx|mock|test-|dummy|\.\.\./i;

const args = process.argv.slice(2);
const scanHistory = args.includes("--all");

const git = (command) => execSync(command, { encoding: "utf8" }).trim();

const failures = [];
const notes = [];

// ── 1. .env must never be tracked ───────────────────────────────────────────
const tracked = git("git ls-files").split("\n").filter(Boolean);
const trackedEnv = tracked.filter((file) => /(^|\/)\.env$/.test(file));

if (trackedEnv.length > 0) {
  failures.push(
    `${trackedEnv.join(", ")} is tracked by git — run: git rm --cached ${trackedEnv.join(" ")}`,
  );
}

// ── 2. scan tracked text files for real-looking credentials ─────────────────
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz|br|lock)$/i;

for (const file of tracked) {
  if (BINARY.test(file) || file === "package-lock.json") continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // Placeholders in the example files are fine.
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (line.length > 4000) return;

    const isPlaceholder = PLACEHOLDER.test(line);
    if (JWT.test(line) && !isPlaceholder) {
      const isServiceRole = SERVICE_ROLE.test(
        Buffer.from(line.match(JWT)[0].split(".")[1] ?? "", "base64").toString("utf8"),
      );
      failures.push(
        `${file}:${index + 1} contains a ${isServiceRole ? "service_role" : "Supabase"} key`,
      );
    }
    if (SECRET_KEY.test(line) && !isPlaceholder) {
      failures.push(`${file}:${index + 1} contains a Supabase secret key (sb_secret_…)`);
    }
  });
}

// ── 3. .env.example should only contain placeholders ───────────────────────
try {
  const example = readFileSync(".env.example", "utf8");
  for (const [index, line] of example.split("\n").entries()) {
    if (line.trim().startsWith("#") || !line.includes("=")) continue;
    if (/VITE_SUPABASE_/.test(line) && !PLACEHOLDER.test(line)) {
      notes.push(`.env.example:${index + 1} does not look like a placeholder`);
    }
  }
} catch {
  notes.push(".env.example is missing");
}

// ── 4. optional: history scan ───────────────────────────────────────────────
if (scanHistory) {
  try {
    const hits = git(
      "git log --all --oneline -S'VITE_SUPABASE_PUBLISHABLE_KEY' -- .env",
    );
    if (hits) {
      notes.push(
        `history still contains .env commits (rotation is the only remedy):\n${hits
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}`,
      );
    }
  } catch {
    // shallow clone: history is not available
  }
}

if (failures.length > 0) {
  console.error("Secret check failed:\n");
  for (const failure of failures) console.error(`  ✖ ${failure}`);
  console.error(
    "\nRotate the key in the Supabase dashboard, remove it from the file, and use a placeholder in .env.example.",
  );
  process.exit(1);
}

console.log(`✔ no committed credentials found (${tracked.length} tracked files scanned)`);
for (const note of notes) console.log(`! ${note}`);

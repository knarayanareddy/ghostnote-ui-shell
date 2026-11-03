#!/usr/bin/env node
/**
 * Kindling preflight — answers "is this project actually ready?" in one command.
 *
 *   npm run preflight              # check the project in .env
 *   npm run preflight -- --json    # machine-readable
 *   npm run preflight -- --url https://xyz.supabase.co --key <publishable key>
 *
 * It verifies the three go-live steps from docs/GO-LIVE.md:
 *   1. migrations applied  (safe RPCs exist, notes are no longer client-readable)
 *   2. credentials         (env present, key not committed, project reachable)
 *   3. anonymous sign-ins  (enabled — the app cannot create a session without it)
 *
 * It is non-destructive by default: it never inserts, updates or deletes a row.
 * The only possible side effect is one anonymous auth user, created by the
 * sign-in probe exactly as a visitor would (skip it with --no-auth-probe).
 *
 * Exit code 0 = ready, 1 = something must be fixed.
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ──────────────────────────────── helpers ───────────────────────────────────
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

/** Minimal .env reader (no dependency on dotenv). */
export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

/**
 * PostgREST answers "function missing" with 404 / PGRST202, and "you may not
 * call it" with 401/403 once the function exists but is not exposed to `anon`.
 */
export function classifyRpcProbe(status, body) {
  const code = body?.code;
  if (status === 404 || code === "PGRST202") return "missing";
  if (status === 401 || status === 403 || code === "42501") return "present";
  if (status === 200) return "present";
  return "unknown";
}

/**
 * After the hardening migration, `anon` has no SELECT privilege on notes, so
 * PostgREST returns 401/42501. Before it, RLS simply filters every row and the
 * response is `200 []` — indistinguishable from "no notes" to a client.
 */
export function classifyNotesProbe(status, body) {
  if (status === 401 || status === 403) return "hardened";
  if (status === 200 && Array.isArray(body)) return "readable";
  if (body?.code === "42501") return "hardened";
  return "unknown";
}

const trimBody = (text, max = 300) =>
  text === undefined || text === null ? "" : String(text).slice(0, max);

// ──────────────────────────────── checks ────────────────────────────────────
async function request(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    let body = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error.message };
  }
}

export async function runPreflight({
  url,
  key,
  authProbe = true,
  repoRoot = ROOT,
} = {}) {
  const checks = [];
  const add = (id, title, status, detail, fix) =>
    checks.push({ id, title, status, detail, fix });

  // 1 ── configuration
  if (!url || !key) {
    const missing = [!url && "VITE_SUPABASE_URL", !key && "VITE_SUPABASE_PUBLISHABLE_KEY"]
      .filter(Boolean)
      .join(", ");
    add(
      "env",
      "Environment variables",
      "fail",
      `missing ${missing}`,
      "cp .env.example .env and fill in your Supabase project URL + publishable key",
    );
    return { checks, url, key, session: null };
  }

  add("env", "Environment variables", "pass", `${url}`);

  // 2 ── key hygiene (never fail on this; it is advisory)
  try {
    const tracked = execSync("git ls-files --error-unmatch .env", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (tracked) {
      add(
        "key-hygiene",
        "Key hygiene",
        "fail",
        ".env is tracked by git",
        "git rm --cached .env && ensure .gitignore lists .env (already done in this repo)",
      );
    }
  } catch {
    add("key-hygiene", "Key hygiene", "pass", ".env is not tracked by git");
  }

  // 3 ── reachability (this endpoint needs no auth)
  const settings = await request(`${url}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (settings.status === 0) {
    add(
      "reachability",
      "Project reachable",
      "fail",
      settings.error ?? "network error",
      "check VITE_SUPABASE_URL, your network, and that the project is not paused",
    );
    return { checks, url, key, session: null };
  }

  add("reachability", "Project reachable", "pass", `HTTP ${settings.status}`);

  // 4 ── anonymous sign-ins
  let session = null;
  const settingsBody = typeof settings.body === "object" ? settings.body : {};
  const anonymousFlag =
    settingsBody.anonymous_users_enabled ??
    settingsBody.anonymous_sign_ins ??
    settingsBody.external_anonymous;

  if (typeof anonymousFlag === "boolean") {
    add(
      "anonymous",
      "Anonymous sign-ins",
      anonymousFlag ? "pass" : "fail",
      anonymousFlag ? "enabled (from /auth/v1/settings)" : "disabled",
      "Authentication → Providers → Anonymous → Enable (or: supabase config push)",
    );
  } else if (!authProbe) {
    add(
      "anonymous",
      "Anonymous sign-ins",
      "unknown",
      "not reported by /auth/v1/settings, probe skipped (--no-auth-probe)",
      "Authentication → Providers → Anonymous → Enable",
    );
  } else {
    const signUp = await request(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
    });

    const message = trimBody(signUp.body?.msg ?? signUp.body?.message ?? "");
    if (signUp.ok && signUp.body?.access_token) {
      session = signUp.body;
      add(
        "anonymous",
        "Anonymous sign-ins",
        "pass",
        "enabled (verified with a live anonymous sign-in)",
      );
    } else if (/anonymous/i.test(message) || signUp.body?.error_code === "anonymous_provider_disabled") {
      add(
        "anonymous",
        "Anonymous sign-ins",
        "fail",
        message || "disabled",
        "Authentication → Providers → Anonymous → Enable (or: supabase config push)",
      );
    } else if (signUp.status === 401 || signUp.status === 403) {
      add(
        "anonymous",
        "Anonymous sign-ins",
        "fail",
        `the publishable key was rejected (HTTP ${signUp.status})`,
        "the key may have been rotated — copy the current publishable key into .env",
      );
    } else {
      add(
        "anonymous",
        "Anonymous sign-ins",
        "unknown",
        `inconclusive (HTTP ${signUp.status}${message ? `: ${message}` : ""})`,
        "Authentication → Providers → Anonymous → Enable",
      );
    }
  }

  // 5 ── migrations: safe RPCs must exist
  const rpcResults = {};
  for (const fn of ["get_my_journal", "get_my_stats"]) {
    const probe = await request(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    rpcResults[fn] = classifyRpcProbe(probe.status, probe.body);
  }

  const missingRpcs = Object.entries(rpcResults)
    .filter(([, result]) => result !== "present")
    .map(([fn]) => fn);

  add(
    "migrations-rpc",
    "Migrations: safe read RPCs",
    missingRpcs.length === 0 ? "pass" : "fail",
    missingRpcs.length === 0
      ? "get_my_journal(), get_my_stats() present"
      : `${missingRpcs.join(", ")} not found`,
    "npm run db:push  (applies supabase/migrations/)",
  );

  // 6 ── migrations: notes must no longer be client-readable
  const notesProbe = await request(
    `${url}/rest/v1/notes?select=id&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const notesState = classifyNotesProbe(notesProbe.status, notesProbe.body);

  add(
    "migrations-anonymity",
    "Migrations: notes not client-readable",
    notesState === "hardened" ? "pass" : notesState === "readable" ? "fail" : "unknown",
    notesState === "hardened"
      ? "anon has no SELECT on notes"
      : notesState === "readable"
        ? "the notes table is still readable — author_id/recipient_id are exposed"
        : `inconclusive (HTTP ${notesProbe.status})`,
    "npm run db:push  (applies supabase/migrations/)",
  );

  // 7 ── trigger enforcement (opt-in: only with a session, and it is a probe)
  if (session?.access_token) {
    add(
      "migrations-trigger",
      "Migrations: insert trigger",
      "unknown",
      "not probed (would need a write attempt)",
      "verify with: npm run db:test",
    );
  }

  return { checks, url, key, session };
}

// ──────────────────────────────── rendering ─────────────────────────────────
const SYMBOL = { pass: `${GREEN}✔${RESET}`, fail: `${RED}✖${RESET}`, unknown: `${YELLOW}!${RESET}` };

export function renderReport({ checks }) {
  const width = Math.max(...checks.map((check) => check.title.length), 20);
  const lines = [];

  for (const check of checks) {
    lines.push(
      `${SYMBOL[check.status] ?? "?"} ${check.title.padEnd(width)}  ${check.detail}`,
    );
  }

  const failed = checks.filter((check) => check.status === "fail");
  const unknown = checks.filter((check) => check.status === "unknown");
  const passed = checks.filter((check) => check.status === "pass");

  lines.push("");
  lines.push(
    `${passed.length} passed · ${failed.length} failed · ${unknown.length} unknown`,
  );

  if (failed.length > 0) {
    lines.push("");
    lines.push("Fix these, in this order:");
    const seen = new Set();
    for (const check of failed) {
      if (!check.fix || seen.has(check.fix)) continue;
      seen.add(check.fix);
      lines.push(`  ${RED}→${RESET} ${check.fix}`);
    }
    lines.push("");
    lines.push(`${DIM}Then re-run: npm run preflight${RESET}`);
  } else if (unknown.length > 0) {
    lines.push("");
    lines.push("Everything checked out; the unknown items need a manual look:");
    for (const check of unknown) {
      lines.push(`  ${YELLOW}→${RESET} ${check.title}: ${check.fix}`);
    }
  } else {
    lines.push("");
    lines.push(`${GREEN}Ready.${RESET} The app can create sessions and read its own notes.`);
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { json: false, authProbe: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--no-auth-probe") args.authProbe = false;
    else if (arg === "--url") args.url = argv[++index];
    else if (arg === "--key") args.key = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      [
        "Usage: npm run preflight -- [--json] [--url <url>] [--key <key>] [--no-auth-probe]",
        "",
        "Checks the three go-live steps: migrations, credentials, anonymous sign-ins.",
        "See docs/GO-LIVE.md.",
      ].join("\n"),
    );
    return 0;
  }

  const env = parseEnvFile(join(ROOT, ".env"));
  const result = await runPreflight({
    url: args.url ?? env.VITE_SUPABASE_URL,
    key: args.key ?? env.VITE_SUPABASE_PUBLISHABLE_KEY,
    authProbe: args.authProbe,
  });

  if (args.json) {
    console.log(JSON.stringify(result.checks, null, 2));
  } else {
    console.log(renderReport(result));
  }

  return result.checks.some((check) => check.status === "fail") ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

/**
 * @vitest-environment node
 */
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyNotesProbe,
  classifyRpcProbe,
  parseEnvFile,
  renderReport,
  runPreflight,
} from "./preflight.mjs";

const KEY = "test-publishable-key-000000000000";

/** Start e2e/mock-supabase.mjs in either the healthy or the pre-migration shape. */
function startMock({ legacy = false } = {}) {
  const port = 54400 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["e2e/mock-supabase.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MOCK_SUPABASE_PORT: String(port),
      MOCK_SUPABASE_LEGACY: legacy ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("mock did not start")), 10_000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    ready,
    stop: () => child.kill("SIGKILL"),
  };
}

let running = null;
afterEach(() => {
  running?.stop();
  running = null;
});

describe("probe classifiers", () => {
  it("treats 404/PGRST202 as a missing function", () => {
    expect(classifyRpcProbe(404, { code: "PGRST202" })).toBe("missing");
    expect(classifyRpcProbe(404, null)).toBe("missing");
  });

  it("treats a permission error as an existing function", () => {
    expect(classifyRpcProbe(401, null)).toBe("present");
    expect(classifyRpcProbe(403, { code: "42501" })).toBe("present");
  });

  it("distinguishes hardened notes from a readable table", () => {
    expect(classifyNotesProbe(401, null)).toBe("hardened");
    expect(classifyNotesProbe(200, [])).toBe("readable");
    expect(classifyNotesProbe(200, [{ id: "x" }])).toBe("readable");
    expect(classifyNotesProbe(500, null)).toBe("unknown");
  });

  it("parses .env files without a dependency", () => {
    expect(parseEnvFile("e2e/no-such-file.env")).toEqual({});
  });
});

describe("preflight against a migrated project", () => {
  it("reports ready", async () => {
    running = startMock();
    await running.ready;

    const result = await runPreflight({ url: running.url, key: KEY });
    const failures = result.checks.filter((check) => check.status === "fail");

    expect(failures).toEqual([]);
    expect(result.checks.find((check) => check.id === "anonymous")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "migrations-rpc")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "migrations-anonymity")?.status).toBe(
      "pass",
    );
  });
});

describe("preflight against a project that still needs the three steps", () => {
  it("names all three problems and how to fix them", async () => {
    running = startMock({ legacy: true });
    await running.ready;

    const result = await runPreflight({ url: running.url, key: KEY });
    const failedIds = result.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.id);

    expect(failedIds).toEqual(
      expect.arrayContaining(["anonymous", "migrations-rpc", "migrations-anonymity"]),
    );

    const report = renderReport(result);
    expect(report).toContain("npm run db:push");
    expect(report).toContain("Authentication → Providers → Anonymous → Enable");
  });

  it("reports a missing env configuration instead of crashing", async () => {
    const result = await runPreflight({ url: undefined, key: undefined });
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ id: "env", status: "fail" });
    expect(result.checks[0].fix).toContain(".env.example");
  });

  it("reports an unreachable project", async () => {
    const result = await runPreflight({ url: "http://127.0.0.1:1", key: KEY });
    const reachability = result.checks.find((check) => check.id === "reachability");
    expect(reachability?.status).toBe("fail");
  });
});

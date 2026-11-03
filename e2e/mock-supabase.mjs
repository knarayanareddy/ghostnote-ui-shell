/**
 * Hermetic stand-in for Supabase, used by the Playwright suite.
 *
 * `npm run e2e` starts this on :54399 and points the Vite dev server at it
 * (.env.e2e), so browser tests never touch a real project, never create real
 * notes, and work offline.
 *
 * It implements only what the app actually calls:
 *   POST /auth/v1/signup            anonymous sign-in (GoTrue)
 *   POST /auth/v1/token             refresh grant
 *   GET  /auth/v1/user              current user
 *   POST /auth/v1/logout
 *   POST /rest/v1/rpc/<fn>          claim_ghost_note, get_my_journal,
 *                                   get_my_stats, mark_note_opened, report_note
 *   POST /rest/v1/notes             insert a note
 *
 * State is in memory and resets whenever the process restarts.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
/** Emulate a project pushed before the queue cap + filter migration (S-1/S-2). */
const STALE_SCHEMA = process.env.MOCK_SUPABASE_STALE_SCHEMA === "1";

/** Emulate the pre-migration schema (no safe RPCs, notes table readable). */
const LEGACY = process.env.MOCK_SUPABASE_LEGACY === "1";
const HOST = process.env.MOCK_SUPABASE_HOST ?? "0.0.0.0";

/** @type {{ id: string, authorId: string, body: string, tag: string | null, status: string, deliveredAt: string | null, recipientId: string | null }[]} */
const notes = [];
const sessions = new Map(); // access_token -> user id

const seed = () => {
  notes.length = 0;
  notes.push(
    {
      id: randomUUID(),
      authorId: "00000000-0000-4000-8000-000000000001",
      body: "You are doing better than you think. Keep going, stranger.",
      tag: "Encouragement",
      status: "queued",
      deliveredAt: null,
      recipientId: null,
    },
    {
      id: randomUUID(),
      authorId: "00000000-0000-4000-8000-000000000002",
      body: "Thank you for existing. The world is a little brighter because you are in it.",
      tag: "Gratitude",
      status: "queued",
      deliveredAt: null,
      recipientId: null,
    },
  );
};
seed();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-max-age": "86400",
};

const json = (res, status, body) => {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const userFrom = (req) => {
  const auth = req.headers["authorization"] ?? "";
  const token = String(auth).replace(/^Bearer\s+/i, "");
  return sessions.get(token) ?? null;
};

const makeSession = (userId) => {
  const accessToken = `mock-access-${randomUUID()}`;
  sessions.set(accessToken, userId);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `mock-refresh-${randomUUID()}`,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: true,
      app_metadata: { provider: "anonymous", providers: ["anonymous"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ── GoTrue ──────────────────────────────────────────────────────────────
  if (path === "/auth/v1/settings" && req.method === "GET") {
    json(res, 200, {
      disable_signup: false,
      mailer_autoconfirm: true,
      external: {},
      // Pre-migration projects in these tests also model a project with
      // anonymous sign-ins switched off.
      anonymous_users_enabled: !LEGACY,
    });
    return;
  }

  if (path === "/auth/v1/signup" && req.method === "POST") {
    const session = makeSession(randomUUID());
    json(res, 200, session);
    return;
  }

  if (path === "/auth/v1/token" && req.method === "POST") {
    json(res, 200, makeSession(randomUUID()));
    return;
  }

  if (path === "/auth/v1/user" && req.method === "GET") {
    const userId = userFrom(req);
    // schema_state() is granted to anon on purpose — preflight has no session.
    if (fn === "schema_state") {
      json(res, 200, {
        latest_expected: "20261103120000_schema_state_and_page_journal",
        migrations: {
          "20260401163617_initial_schema": true,
          "20261103090000_security_hardening": true,
          "20261103101500_claim_cap_and_filter_fold": !STALE_SCHEMA,
          "20261103120000_schema_state_and_page_journal": !STALE_SCHEMA,
        },
      });
      return;
    }

    if (!userId) {
      json(res, 401, { message: "no session" });
      return;
    }
    json(res, 200, { id: userId, role: "authenticated", is_anonymous: true });
    return;
  }

  if (path === "/auth/v1/logout" && req.method === "POST") {
    json(res, 204);
    return;
  }

  // ── PostgREST ───────────────────────────────────────────────────────────
  // Post-migration the client has no SELECT privilege on notes. The legacy
  // (pre-migration) schema returned an empty 200 array instead. `npm run
  // preflight` uses this distinction to tell whether migrations were applied.
  if (path === "/rest/v1/notes" && req.method === "GET") {
    if (LEGACY) {
      json(res, 200, []);
      return;
    }
    json(res, 401, { code: "42501", message: "permission denied for table notes" });
    return;
  }

  if (path === "/rest/v1/notes" && req.method === "POST") {
    const body = await readBody(req);
    const authorId = userFrom(req) ?? randomUUID();
    const rows = Array.isArray(body) ? body : [body];

    if (!LEGACY) {
      // Mirrors enforce_note_insert: short bodies and banned words are refused.
      for (const row of rows) {
        const text = String(row.body ?? "").trim();
        if (text.length < 15 || text.length > 500) {
          json(res, 400, {
            code: "23514",
            message: "note body must be between 15 and 500 characters",
          });
          return;
        }
        // Simplified mirror of public.find_banned_content (the authoritative
        // implementation lives in supabase/migrations). Enough to keep the
        // hermetic specs honest about staging and inflections.
        const folded = text
          .normalize("NFKC")
          .replace(/[\u200B-\u200F\u2060\uFEFF\u00AD\u180E]/g, "")
          .replace(/[\u0430\u0435\u043E\u0440\u0441\u0443\u0445\u0456]/g, (c) =>
            ({ "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u0456": "i" })[c],
          )
          .toLowerCase();
        if (/\b(fuck|shit|bastard|bitch)(s|es|ed|er|ers|ing|ings|y|ty)?\b/.test(folded)) {
          json(res, 400, { code: "23514", message: "note contains blocked content" });
          return;
        }
      }
    }

    for (const row of rows) {
      notes.push({
        id: randomUUID(),
        authorId,
        body: row.body ?? "",
        tag: row.tag ?? null,
        status: "queued",
        deliveredAt: null,
        recipientId: null,
      });
    }

    json(res, 201);
    return;
  }

  if (path.startsWith("/rest/v1/rpc/") && req.method === "POST") {
    const fn = path.slice("/rest/v1/rpc/".length);
    const body = await readBody(req);
    const userId = userFrom(req);

    if (LEGACY) {
      json(res, 404, {
        code: "PGRST202",
        message: `Could not find the function public.${fn} in the schema cache`,
      });
      return;
    }

    // schema_state() is granted to anon on purpose — preflight has no session.
    if (fn === "schema_state") {
      json(res, 200, {
        latest_expected: "20261103120000_schema_state_and_page_journal",
        migrations: {
          "20260401163617_initial_schema": true,
          "20261103090000_security_hardening": true,
          "20261103101500_claim_cap_and_filter_fold": !STALE_SCHEMA,
          "20261103120000_schema_state_and_page_journal": !STALE_SCHEMA,
        },
      });
      return;
    }

    if (!userId) {
      json(res, 401, { message: "no session" });
      return;
    }

    switch (fn) {
      case "get_my_stats": {
        json(res, 200, [
          {
            sent: notes.filter((note) => note.authorId === userId).length,
            received: notes.filter(
              (note) => note.recipientId === userId && note.status === "delivered",
            ).length,
          },
        ]);
        return;
      }

      case "get_my_journal": {
        const limit = Number(body.p_limit ?? 50);
        const offset = Number(body.p_offset ?? 0);
        json(
          res,
          200,
          notes
            .filter((note) => note.recipientId === userId && note.status === "delivered")
            .map((note) => ({
              id: note.id,
              body: note.body,
              tag: note.tag,
              delivered_at: note.deliveredAt,
              opened_at: null,
            }))
            .slice(Math.max(offset, 0), Math.max(offset, 0) + Math.min(Math.max(limit, 1), 100)),
        );
        return;
      }

      case "claim_ghost_note": {
        // Mirrors the S-1 cap in claim_ghost_note(): 5 an hour per identity.
        const already = notes.filter((note) => note.recipientId === userId).length;
        if (already >= 5) {
          json(res, 400, {
            code: "53400",
            message: "rate limit: at most 5 notes per hour",
          });
          return;
        }

        const next = notes.find((note) => note.status === "queued" && note.authorId !== userId);
        if (!next) {
          json(res, 200, []);
          return;
        }
        next.status = "delivered";
        next.recipientId = userId;
        next.deliveredAt = new Date().toISOString();
        json(res, 200, [
          {
            id: next.id,
            body: next.body,
            tag: next.tag,
            delivered_at: next.deliveredAt,
            opened_at: null,
          },
        ]);
        return;
      }

      case "mark_note_opened": {
        const target = notes.find((note) => note.id === body.p_note_id);
        if (!target || target.recipientId !== userId) {
          json(res, 403, { message: "not your note" });
          return;
        }
        json(res, 204);
        return;
      }

      case "report_note": {
        const target = notes.find((note) => note.id === body.p_note_id);
        if (!target || target.recipientId !== userId) {
          json(res, 403, { message: "not your note" });
          return;
        }
        target.status = "reported";
        json(res, 204);
        return;
      }

      default:
        json(res, 404, { message: `unknown rpc ${fn}` });
        return;
    }
  }

  // Readiness probe for Playwright's webServer (it issues a GET).
  if (path === "/__mock/health") {
    json(res, 200, { ok: true });
    return;
  }

  // Test-only admin endpoint so a spec can reset the queue between runs.
  if (path === "/__mock/reset" && req.method === "POST") {
    seed();
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { message: `unhandled ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(
    `mock supabase listening on http://${HOST}:${PORT}${LEGACY ? " (legacy schema)" : ""}`,
  );
});

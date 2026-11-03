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
  if (path === "/rest/v1/notes" && req.method === "POST") {
    const body = await readBody(req);
    const authorId = userFrom(req) ?? randomUUID();
    const rows = Array.isArray(body) ? body : [body];

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
            })),
        );
        return;
      }

      case "claim_ghost_note": {
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

  // Test-only admin endpoint so a spec can reset the queue between runs.
  if (path === "/__mock/reset" && req.method === "POST") {
    seed();
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { message: `unhandled ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(`mock supabase listening on http://${HOST}:${PORT}`);
});

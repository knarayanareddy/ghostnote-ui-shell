# Kindling

Anonymous kindness. Leave a kind note for a stranger. Receive one when you need it.

No profiles. No replies. No likes. Just kindness, drifting.

- **Write** — anyone can send a note into the queue (15–500 characters, one optional tag).
- **Inbox** — summon a queued note from another stranger, seal or open it.
- **Ghost Journal** — the notes you have received, visible only to you.

---

## Stack

| Layer    | Choice                                                            |
| -------- | ----------------------------------------------------------------- |
| UI       | React 18 + TypeScript, Vite 5, Tailwind + shadcn/ui, sonner toasts |
| Routing  | react-router-dom (routes are lazy-loaded)                          |
| Data     | Supabase (Postgres + RLS + RPC), `@tanstack/react-query`           |
| Identity | Supabase **anonymous** sign-in — no accounts, one session per browser |
| Tests    | Vitest + Testing Library (unit + app integration, jsdom), Playwright (browser smoke, hermetic via a mock Supabase), pgTAP (RLS/RPCs) |

## Prerequisites

- Node.js 20+ (see `engines` in `package.json`)
- A Supabase project — [supabase.com](https://supabase.com) or a local stack via the [Supabase CLI](https://supabase.com/docs/guides/cli)

## Setup

```bash
npm install
cp .env.example .env        # then fill in your project URL + publishable key

# 1. Apply the schema (pick one)
supabase link --project-ref <your-project-ref>
supabase db push            # remote
# or: supabase start && supabase db reset   (local, also loads supabase/seed.sql)

# 2. Enable anonymous sign-ins — the app cannot work without this
#    Dashboard → Authentication → Providers → Anonymous → Enable
#    (local: already set in supabase/config.toml under [auth.anonymous])

npm run dev                 # http://localhost:8080
```

If anonymous sign-ins are disabled, the app shows a "Can't reach the ghosts" screen with a retry button and a console message explaining exactly that.

### Environment variables

| Variable                         | Where                    | Notes                                                        |
| -------------------------------- | ------------------------ | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`              | `.env` (never committed) | Project URL.                                                |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | `.env` (never committed) | Publishable/anon key. Public by design — RLS is the boundary. |

Both are validated at boot in [`src/lib/env.ts`](src/lib/env.ts), so a missing or misspelt variable produces one actionable error instead of a blank page.

## Scripts

| Script              | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Vite dev server on port 8080                            |
| `npm run build`     | `tsc -b` (strict typecheck) then a production build      |
| `npm run preview`   | Serve the production build                              |
| `npm run lint`      | ESLint (fails on errors)                                |
| `npm run typecheck` | TypeScript project build, no emit                       |
| `npm test`          | Vitest unit tests                                       |
| `npm run test:watch`| Vitest in watch mode                                    |
| `npm run dev:e2e`   | Dev server pointed at the mock Supabase (`.env.e2e`)     |
| `npm run e2e`       | Playwright smoke tests — hermetic, no project needed     |
| `npm run db:push`   | Apply `supabase/migrations` to the linked project        |
| `npm run db:types`  | Regenerate `src/integrations/supabase/types.ts`          |
| `npm run db:test`   | pgTAP suite in `supabase/tests`                          |
| `npm run preflight` | Check a real project against the three go-live steps     |
| `npm run check:secrets` | Fail if a real key or a tracked `.env` reaches the repo |

## Architecture

```
src/
  pages/            Index, Write, Inbox, Journal, NotFound (lazy routes)
  components/       AppLayout (chrome + auth gate), AuthProvider, NoteCard,
                    Envelope, ReportDialog, ReportButton, TagChips, EmptyState
  hooks/            useJournal / useStats — react-query wrappers around RPCs
  lib/              env validation, auth context, banned-content filter
  integrations/     supabase client + generated database types
supabase/
  migrations/       schema + RPCs (source of truth)
  tests/            pgTAP suite
  seed.sql          local demo notes
```

### Data flow

Clients never read the `notes` table directly. Everything goes through
`SECURITY DEFINER` functions that return non-identifying columns:

| RPC                        | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `claim_ghost_note(p_tag)`  | Atomically claim the oldest queued note (skips your own).        |
| `get_my_journal()`         | Your received notes: `id, body, tag, delivered_at, opened_at`.   |
| `get_my_stats()`           | `sent` / `received` counts for the header.                       |
| `mark_note_opened(id)`     | Stamps `opened_at` once, for the note's recipient only.          |
| `report_note(id, reason)`  | Reports a note **you received**, once, rate limited.             |

Writes to `notes` go through the table's INSERT policy plus an
`enforce_note_insert` trigger, which forces `status='queued'`, clears
`recipient_id`/`delivered_at`/`opened_at`, enforces 15–500 characters, applies
the content filter and rate limits to 10 notes per hour per author.

Receiving is capped too: `claim_ghost_note` refuses past **5 notes an hour per
identity**, and `public.reclaim_stale_notes()` returns notes that were claimed but
never opened to the pool after 24 hours (hourly via `pg_cron` when available).

## Security model

- **Anonymity is enforced in the database.** `notes.author_id` and
  `recipient_id` are never exposed to clients: `authenticated` has no `SELECT`
  on `notes`, and the RPCs above return only safe columns. The previous policy
  (`auth.uid() = author_id OR auth.uid() = recipient_id`) let either side read
  the other's id — see `supabase/migrations/20261103090000_security_hardening.sql`.
- **No forged deliveries.** The insert policy and trigger reject or neutralise
  any client-supplied `status`, `recipient_id` or `delivered_at`, so nobody can
  inject a note into another user's journal.
- **Reports are scoped and idempotent.** `report_note` refuses notes you did not
  receive, de-duplicates per reporter, caps the reason at 300 characters and
  rate limits to 20 per day.
- **Content filtering has two layers.** `src/lib/bannedFilter.ts` gives instant
  client feedback; `public.find_banned_content` is the authoritative check in
  the insert trigger. It folds input first (NFKC, zero-width characters, Cyrillic
  and Greek homoglyphs), then matches leet digits (`sh1t`), punctuation
  substitution (`f*ck`, `f.u.c.k`), inflections (`fucking`, `shitty`,
  `retarded`), vowel-dropped forms (`fck`), punctuation-joined phrases
  (`kill-yourself`) and letter-spaced text (`f u c k`). Both layers are covered
  by tests (`src/lib/bannedFilter*.test.ts`, `supabase/tests/rls.test.sql`) and
  must stay in sync — a 36-case corpus is checked against both.
- **Moderation** has a read path: `public.moderation_queue` (service role only) —
  see [docs/MODERATION.md](docs/MODERATION.md).

### Known limitations

> A red-team pass against OWASP Top 10 is in
> [`docs/SECURITY-REDTEAM.md`](docs/SECURITY-REDTEAM.md). It lists open issues
> that matter more than anything below — notably that a single visitor can claim
> and read the whole note queue (S-1), and that the content filter only matches
> base words (S-2). Read it before inviting strangers.

- The content filter is heuristic. It now catches letter-spaced text, but novel
  spellings and obfuscations that share no letters with the banned word still
  slip through. Move to an Edge Function + real classifier when volume justifies
  it.
- Rate limits are per identity: 10 notes an hour sent, 5 an hour received, 20
  reports a day — not per IP. Identities are free until a CAPTCHA is enabled
  (`VITE_TURNSTILE_SITE_KEY` + Attack Protection in the dashboard), so a scripted
  attacker can rotate identities to get a fresh allowance.
- Anonymous sessions are per browser: clearing storage means a new identity and
  an empty journal. There is no recovery by design.

## Testing

```bash
npm test          # unit + app tests: filter rules, Inbox state machine, full-app jsdom flows
npm run db:test   # pgTAP (43 assertions): RLS, anonymity, forged inserts, report abuse,
                  #   the receive cap, reclaim, and the filter corpus
npm run e2e       # Playwright browser smoke tests (hermetic)
```

**Playwright is hermetic by default.** `npm run e2e` starts
`e2e/mock-supabase.mjs` (a small GoTrue/PostgREST stand-in on :54399) plus the
dev server in `e2e` mode (`.env.e2e`), so browser tests need no Supabase
project, no credentials, no network, and never create real notes. First run
still needs a browser: `npx playwright install chromium`.

To exercise a deployed instance instead:
`E2E_BASE_URL=https://your-app npm run e2e`.

The jsdom suite (`src/App.test.tsx`) mirrors the Playwright assertions one for
one, so CI catches selector drift even on machines without a browser.

### Database tests

`supabase test db` needs Docker. The suite is a plain SQL file, so it can also
be run against any Postgres that has pgTAP installed:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
```

## Deployment

[`docs/GO-LIVE.md`](docs/GO-LIVE.md) is the full runbook. In short:

1. Enable anonymous sign-ins in the dashboard.
2. `supabase db push` against the production project (migrations are the only
   source of truth — there is no `supabase_setup.sql` any more).
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your host.
4. `npm run build` → deploy `dist/`. The app is a static SPA, so configure a
   rewrite of all paths to `index.html`.
5. `npm run preflight` against the deployed project — it exits `0` and prints
   `Ready.` only when all three steps actually took effect.

### `supabase/config.toml` and CLI versions

The local config targets Supabase CLI v2.30+/v3 (`[auth] enable_anonymous_sign_ins`).
CLI 1.x used a different key (`[auth.anonymous] enabled`), and unknown keys are
ignored silently — so on an old CLI anonymous sign-ins stay off and the app
cannot start a session. If local dev fails with "Anonymous sign-ins are
disabled", run `supabase init --force` in a scratch directory and diff the keys
with `supabase/config.toml`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please do not open issues containing
real notes or user identifiers.

## License

MIT — see [LICENSE](LICENSE).

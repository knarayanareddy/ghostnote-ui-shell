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
| Tests    | Vitest + Testing Library, Playwright (smoke), pgTAP (RLS/RPCs)     |

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
| `npm run e2e`       | Playwright smoke tests (needs `npx playwright install`)  |
| `npm run db:push`   | Apply `supabase/migrations` to the linked project        |
| `npm run db:types`  | Regenerate `src/integrations/supabase/types.ts`          |
| `npm run db:test`   | pgTAP suite in `supabase/tests`                          |

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
  the insert trigger. It handles leet digits (`sh1t`), punctuation substitution
  (`f*ck`, `f.u.c.k`) and punctuation-joined phrases (`kill-yourself`).
- **Moderation** has a read path: `public.moderation_queue` (service role only) —
  see [docs/MODERATION.md](docs/MODERATION.md).

### Known limitations

- The content filter is heuristic; fully letter-spaced text (`f u c k`) and
  novel spellings slip through. Move to an Edge Function + real classifier when
  volume justifies it.
- Rate limits are per author per hour (10) and per reporter per day (20), not
  per IP.
- Anonymous sessions are per browser: clearing storage means a new identity and
  an empty journal. There is no recovery by design.

## Testing

```bash
npm test          # unit: banned filter (client rules mirrored in SQL)
npm run db:test   # pgTAP: RLS, anonymous reads, forged inserts, report abuse
npm run e2e       # Playwright smoke tests against a running dev server
```

The Playwright suite creates real anonymous sessions and notes, so point it at a
scratch project (`E2E_BASE_URL` to test an already-running server).

## Deployment

1. `supabase db push` against the production project (migrations are the only
   source of truth — there is no `supabase_setup.sql` any more).
2. Enable anonymous sign-ins in the dashboard.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your host.
4. `npm run build` → deploy `dist/`. The app is a static SPA, so configure a
   rewrite of all paths to `index.html`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please do not open issues containing
real notes or user identifiers.

## License

MIT — see [LICENSE](LICENSE).

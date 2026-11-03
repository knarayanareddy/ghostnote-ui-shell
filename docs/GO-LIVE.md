# Go-live

Three things have to happen against the **real** Supabase project before this app
is safe to share. None of them can be done from the repository — they need your
dashboard credentials (and, for the push, a network path to Supabase).

Do them in this order. Each one is checked by `npm run preflight`, so you can see
where you are at any point.

```bash
npm run preflight            # human-readable report, exit 1 if anything is missing
npm run preflight -- --json  # same data, machine-readable
```

> Hardening beyond launch-day ("one visitor can drain the queue", "the filter
> misses `fucking`") lives in
> [`SECURITY-REDTEAM.md`](SECURITY-REDTEAM.md#outstanding-work--do-these-first-important).
> The three steps below are prerequisites for any of it to mean anything.

`preflight` is read-only: it sends a handful of HEAD/POST probes with the public
key and never deletes or writes note content. Its one side effect is an optional
anonymous sign-in (one throwaway user is created). Skip it with
`--no-auth-probe`.

---

## 1. Enable anonymous sign-ins

**Why:** every visitor gets a throwaway session so the app never asks for an
email. With the setting off, `signInAnonymously()` fails and the app cannot start
a session at all.

**Where:** Supabase dashboard → **Authentication → Providers → Anonymous** →
toggle **Enable** → save.

**Or, declaratively** (keeps it in `supabase/config.toml` and pushes it):

```ini
[auth]
enable_anonymous_sign_ins = true
```

```bash
supabase config push
```

**Preflight check:** `Anonymous sign-ins` — it reads
`GET /auth/v1/settings` and reports `anonymous_users_enabled`.

**If it is still off**, the app shows a dedicated screen: *"Anonymous sign-ins are
disabled for this project"* with the dashboard path, instead of a raw
`Anonymous sign-ins are disabled` string.

---

## 2. Push the security migration

**Why:** the migration in `supabase/migrations/` is what actually protects the
notes. Until it is applied:

- the `get_my_journal` / `send_note` RPCs do not exist, so every screen errors,
- `notes` is still readable with the public key, so anyone who opens devtools can
  read other people's notes.

**What it applies:** the schema, the security hardening, and (since
`20261103101500`) the receive cap and the filter rewrite — so this step is also
what makes S-1 and S-2 in the red-team review real. A project that was pushed
before that migration needs another `npm run db:push`.

**Steps:**

```bash
supabase login                 # once per machine
supabase link --project-ref <your-project-ref>
npm run db:push                # applies every pending migration
npm run db:test                # pgTAP suite, 21 assertions (needs a local stack)
npm run db:types               # regenerate src/integrations/supabase/types.ts
```

**Preflight check:** `Safe read RPCs` and `Notes not client-readable`.

- RPC returns `404` / `PGRST202` → migration not applied.
- RPC returns `401/403` / `42501` → function exists, permission model is right.
- `GET /rest/v1/notes` returns `401/403` → hardened.
- `GET /rest/v1/notes` returns `200 []` → **not hardened**. An empty list still
  means the table is client-readable; RLS is filtering the rows, not blocking the
  request. This is the one case that looks fine and is not.

**If you skip it**, the Journal screen now says *"The database hasn't been
migrated yet"* and prints `npm run db:push` as the fix, rather than
`Could not find the function public.get_my_journal in the schema cache`.

---

## 3. Rotate the publishable key

**Why:** the key was committed to this public repository (`.env` at commit
`7df36bd`). It is a publishable/anon key, so it is not a secret in the usual
sense — but it is a *write* credential against your database, and the copy in
git history is permanent. Treat it as compromised and replace it.

**Steps:**

1. Dashboard → **Project Settings → API Keys** → create a new publishable key.
2. Update **every** place the old value lives:
   - local `.env` → `VITE_SUPABASE_PUBLISHABLE_KEY=...`
   - your host (Vercel / Netlify / Fly / Cloudflare env vars) — this is the one
     people forget; the deployed bundle keeps the old key until you redeploy.
3. Redeploy so the new key is baked into the client bundle.
4. Revoke the old key in the dashboard.
5. Verify:

```bash
npm run check:secrets    # fails if a real key is committed anywhere
npm run preflight        # fails with "publishable key rejected" if the key is stale
```

**Note:** rotating does *not* require changing `supabase/migrations/` or the RLS
policies — they key off `auth.uid()`, not off the key itself.

---

## 4. Turn on the CAPTCHA (optional, but recommended)

**Why:** anonymous identities are free, so every per-identity limit — 10 notes
an hour, 5 notes received an hour — resets by signing up again. A CAPTCHA is what
makes those limits mean something (S-4 in
[`SECURITY-REDTEAM.md`](SECURITY-REDTEAM.md)).

**Steps:**

1. Create a Turnstile widget at <https://dash.cloudflare.com/?to=/:account/turnstile>
   for your domain; copy the **site key**.
2. Add it to `.env` and to your host's env: `VITE_TURNSTILE_SITE_KEY=0x4AAA…`,
   then redeploy.
3. Supabase dashboard → **Authentication → Attack Protection** → enable
   **CAPTCHA protection**, choose Turnstile, paste the **secret key**.

Both halves are needed. With only the dashboard switch on, sign-ins fail with
"The anti-spam check didn't finish"; with only the site key set, the token is sent
but not verified. If you also ship a CSP, it must allow
`https://challenges.cloudflare.com` in `script-src`, `connect-src` and `frame-src`.

## 5. Keep the queue alive

**Why:** a note that was claimed but never opened would otherwise sit assigned to
an identity forever. `public.reclaim_stale_notes()` returns unopened notes to the
pool after 24 hours.

If the project has `pg_cron`, the migration already scheduled it hourly. If not:

```sql
-- once
create extension if not exists pg_cron;
select cron.schedule('reclaim-stale-notes', '17 * * * *',
                     $$select public.reclaim_stale_notes()$$);
```

Or call it from any scheduler you already run (a daily Edge Function is enough).
It is revoked from clients on purpose — do not grant it to `authenticated`.

## Final verification

```bash
npm run lint
npm run typecheck
npm run test          # unit + preflight suites
npm run e2e           # Playwright, uses e2e/mock-supabase.mjs — no network needed
npm run check:secrets
npm run preflight     # against the real project
```

`preflight` exits `0` and prints `Ready.` only when all six checks pass: env
present, key hygiene, project reachable, anonymous sign-ins on, RPCs deployed,
notes not client-readable.

`preflight` cannot see the receive cap or the filter rewrite — they are inside
function bodies. To confirm the new migration actually landed, check in the SQL
editor:

```sql
select proname from pg_proc
where proname in ('reclaim_stale_notes', 'fold_for_filter');   -- expect 2 rows
select public.find_banned_content('you are a fucking idiot');  -- expect 'fuck', not null
```

If it fails, it prints the fixes in dependency order — enabling anonymous
sign-ins and pushing the migration first, because the other failures are usually
consequences of those two.

---

## What is *not* covered here

- **Rate limiting / abuse.** Anonymous sign-in means anyone can mint identities.
  Supabase applies its own limits; if you need per-IP throttling, it belongs at
  your host or in a Postgres function with a counter table. Not implemented.
- **Key rotation automation.** No CI job rotates keys; it is a manual,
  credential-holding step by design.
- **Backups / PITR.** Depends on your Supabase plan; configure in the dashboard.

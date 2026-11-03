# Red-team review — OWASP Top 10 (2021)

**Target:** Kindling (`ghostnote-ui-shell`), commit `83fa2b5`
**Scope:** the React SPA, the Postgres schema + RLS + RPCs, the build pipeline,
and how the app is meant to be deployed. Out of scope: Supabase's own control
plane (auth service, PostgREST, dashboard), and the physical/cloud layer.
**Method:** source review against OWASP Top 10 2021 + exploitation attempts
against the filter and the queue, `npm audit`, bundle inspection, and running the
project's own hermetic mocks.

> **Read this first:** the app is *not* currently safe to share with strangers.
> S-1 (below) lets any anonymous visitor read every note sitting in the queue and
> empty it in seconds, and S-3 means the API credential is public. Both are open.

---

## Outstanding work — do these first (IMPORTANT)

**The three go-live steps are still yours to run.** They need dashboard
credentials and a network path to Supabase, so they cannot be done from a
sandbox or by CI. In this order:

- [ ] **1. Enable anonymous sign-ins** — Dashboard → Authentication → Providers
      → Anonymous → Enable (or `[auth] enable_anonymous_sign_ins = true` +
      `supabase config push`). Without it the app cannot start a session at all:
      every visitor sees "Can't reach the ghosts".
- [ ] **2. `npm run db:push`** — applies
      `supabase/migrations/20261103090000_security_hardening.sql`. Until this
      runs, `notes` is readable with the public key by anyone who opens devtools,
      and every screen errors because the RPCs do not exist.
- [ ] **3. Rotate the publishable key** — it is in public git history
      (`.env` at `91a8dbd`, touched by `149b975`). Create a new key in Project
      Settings → API Keys, update **`.env` and your host's env vars**, redeploy,
      then revoke the old one.

Then `npm run preflight` should print **`Ready.`** (step-by-step detail:
[`GO-LIVE.md`](GO-LIVE.md)).

**Then, from this review, before accepting real users:**

- [x] **S-1** Claim cap + reclaim path — `20261103101500_claim_cap_and_filter_fold.sql`.
      Applied by `npm run db:push`; **step 2 above now also applies this fix.**
      Schedule `public.reclaim_stale_notes()` if `pg_cron` is not enabled
      (see [GO-LIVE](GO-LIVE.md#5-keep-the-queue-alive)).
- [x] **S-2** Filter is suffix-aware and folds homoglyphs — in both copies,
      locked together by 43 pgTAP assertions and the TS suite.
- [ ] **S-4** CAPTCHA is wired in code but **must be switched on**: set
      `VITE_TURNSTILE_SITE_KEY` and turn on Attack Protection in the dashboard.
      Until then identities are still free.
- [ ] **S-5** Ship security headers (the CSP in S-5 is ready to paste). Note the
      CSP must allow `https://challenges.cloudflare.com` once S-4 is on.
- [ ] **S-12 (remainder)** No abuse monitoring: nothing alerts on a spike of
      rate-limit or claim errors. The queries are in S-12; wiring them to a cron
      is a hosting decision.
- [ ] **S-3** Rotate the key — still the single highest-value five minutes here.

S-6 is now closed (0 critical/high, 12 dev-only moderates); S-9..S-12 are lower priority.

---

## Findings

| ID | Severity | OWASP | Finding | Status |
|----|----------|-------|---------|--------|
| S-1 | **Critical** | A01 / A04 | One identity can claim (and read) the entire note queue | **Fixed** — `20261103101500` |
| S-2 | **High** | A04 / A08 | Content filter matches base words only — `fucking`, `asshole`, `shitty` pass | **Fixed** — SQL + TS, 43 pgTAP assertions |
| S-3 | **High** | A02 / A05 | Publishable key committed to public history, not yet rotated | Open (runbook) |
| S-4 | **High** | A07 / A04 | Anonymous identities are free and unlimited — every rate limit resets | **Plumbed** — enable in dashboard |
| S-5 | **Medium** | A05 | No CSP, no security headers, no `frame-ancestors` | Open (config supplied) |
| S-6 | **Medium** | A06 | Outdated toolchain; 24 advisories incl. 2 critical | **Fixed** — 0 critical/high |
| S-7 | **Medium** | A07 | Session never expires or ends; one browser = one permanent identity | **Fixed** — "Forget this device" |
| S-8 | **Low** | A05 / A09 | Raw Postgres error strings rendered in the UI | **Fixed** |
| S-9 | **Low** | A05 | `allowedHosts: true` on a `::`-bound dev server | Open (dev only) |
| S-10 | **Low** | A06 | CI actions pinned to mutable tags; third-party build plugin | Open |
| S-11 | **Low** | A04 | No retention policy: anonymous users and notes accumulate forever | Open |
| S-12 | **Info** | A01 / A09 | Definer-rights view, leftover grants, no abuse monitoring | **Partly fixed** |

### Threat model in one paragraph

Assets, in order: (a) the *content* of notes nobody has received yet, (b) the
*anonymity* of authors and recipients, (c) the availability of the queue itself —
if it empties, the product has nothing to give anyone. Adversaries: a drive-by
visitor with devtools (free, scriptable, unlimited), a hostile recipient of a
note, and a spammer who never uses the UI. There is no server of your own: the
trust boundary is the browser → PostgREST edge, and every authorisation decision
must therefore live in Postgres (it mostly does). Moderators are trusted staff
using the service role.

---

## S-1 · Critical · One identity can claim, read and drain the entire queue

**OWASP:** A01 Broken Access Control / A04 Insecure Design
**Where:** `supabase/migrations/20261103090000_security_hardening.sql`, `claim_ghost_note`

`claim_ghost_note` takes the oldest undelivered note, assigns it to the caller
and **returns its body**. It has no per-user cap and no cooldown:

```sql
IF v_note_id IS NULL THEN
  SELECT n.id INTO v_note_id FROM public.notes n
  WHERE n.status = 'queued' AND n.recipient_id IS NULL
    AND n.author_id <> auth.uid()
  ORDER BY n.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
END IF;
...
RETURN QUERY UPDATE public.notes SET recipient_id = auth.uid(), ... RETURNING ...;
```

There is a 10-notes/hour cap on *sending* and a 20/day cap on *reporting*, but
nothing on receiving. Each call permanently takes one note out of the pool.

**Exploitation.** Open the app, copy the access token out of localStorage, loop:

```bash
while true; do
  curl -s -X POST "$URL/rest/v1/rpc/claim_ghost_note" \
    -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{}'
done
```

Every note ever queued comes back to the attacker in plaintext, and no other
visitor ever receives one. Measured against the project's mock (which mirrors the
SQL exactly — one loop, one identity, 17 ms):

```
seeded 12 queued notes from 12 distinct authors
ONE identity claimed 14 notes in 17ms — no cap, no delay, no tag needed
next honest user receives: 0 note(s)
```

*Not measured against the real database:* this environment has no network path to
Supabase and no Docker, so the run is against `e2e/mock-supabase.mjs`. The SQL
above is what makes it transfer — the absence of a cap is in the function body.

**Impact.** Confidentiality of every queued note (people write personal things to
"a stranger"; that stranger is a script), and availability of the core feature.
Anonymity itself holds — the attacker learns no author ids — but content leaks,
which is the part users actually care about.

**Fix (in order of value):**

1. **Cap claims per identity**, same pattern as the send limit:

   ```sql
   CREATE OR REPLACE FUNCTION public.claim_ghost_note(p_tag TEXT DEFAULT NULL)
   RETURNS TABLE (id UUID, body TEXT, tag TEXT, delivered_at TIMESTAMPTZ, opened_at TIMESTAMPTZ)
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   DECLARE
     v_note_id UUID;
     v_recent  INTEGER;
     v_max_per_hour CONSTANT INTEGER := 5;   -- receiving is rarer than sending
   BEGIN
     IF auth.uid() IS NULL THEN
       RAISE EXCEPTION 'claim_ghost_note requires an authenticated session' USING ERRCODE = '42501';
     END IF;

     SELECT count(*) INTO v_recent FROM public.notes n
     WHERE n.recipient_id = auth.uid() AND n.delivered_at > now() - interval '1 hour';

     IF v_recent >= v_max_per_hour THEN
       RAISE EXCEPTION 'rate limit: at most % notes per hour', v_max_per_hour USING ERRCODE = '53400';
     END IF;
     ... -- body unchanged
   END; $$;
   ```

2. **Reclaim what was never opened.** A note claimed by a bot is invisible forever
   even if it is never read. Put it back in the pool after a day:

   ```sql
   UPDATE public.notes
   SET recipient_id = NULL, delivered_at = NULL, status = 'queued'
   WHERE status = 'delivered' AND opened_at IS NULL
     AND delivered_at < now() - interval '24 hours';
   ```

   Run it from `pg_cron` (hourly) or a scheduled Edge Function.

3. **Raise the cost of an identity** — see S-4. A per-identity cap alone is a
   speed bump for anyone willing to sign up in a loop.

**Shipped** in `20261103101500_claim_cap_and_filter_fold.sql`:

- `claim_ghost_note` refuses with SQLSTATE `53400` once the caller has received
  **5 notes in the last hour** — the identity cap, matching the send limit's
  shape.
- `public.reclaim_stale_notes(interval)` returns notes that were delivered but
  never opened to the pool (default grace: 24 hours). Revoked from `anon` and
  `authenticated`; scheduled hourly when `pg_cron` is installed, otherwise call it
  from your own scheduler.
- Verified on a real Postgres 16: the same attack now receives 5 notes, leaves 7
  in the pool, and the next visitor still gets one.

**Still open, by design:** a determined attacker can create another identity (S-4)
and take five more. That is why S-4 matters — the cap bounds one identity, the
CAPTCHA bounds identities.

---

## S-2 · High · The content filter matches base words only

**OWASP:** A04 Insecure Design / A08 Software & Data Integrity
**Where:** `src/lib/bannedFilter.ts` and `public.find_banned_content` (identical
rules, deliberately), enforced by `enforce_note_insert`

The README promises the filter handles leet digits, punctuation substitution,
letter-spacing and vowel-dropping. It does — **for the bare word**. It matches
`\yfuck\y`, `\yfck\y` and friends, so anything with a suffix or a prefix sails
through. Probed 19 variants; **12 were missed**, including:

```
MISSED fucking     MISSED fucked      MISSED fucker     MISSED motherfucker
MISSED shitty      MISSED bullshit    MISSED bitches    MISSED asshole
MISSED dumbass     MISSED retarded    MISSED sh1tty     MISSED d*ckhead
```

Homoglyphs and fullwidth text also pass, because nothing normalises them:

| Input | Result |
| --- | --- |
| `you f\u200Buck` (zero-width space) | caught — accidental, boundary regex |
| `you fuсk` (Cyrillic `с`) | **missed** |
| `you ｆｕｃｋ` (fullwidth) | **missed** |
| `you fu\u0301ck` (combining accent) | caught |
| `you f*cking` | **missed** |

**Impact.** The one abuse control the product has is bypassed by typing `ing`. The
first message a harasser sends survives: "you are a fucking idiot" is 25
characters, passes the client check, passes the trigger, lands in a stranger's
journal. This is not a theoretical filter-evasion contest — it is the ordinary
case.

**Why the layered story does not save it.** The client and the server share the
same rules on purpose, so the gap is authoritative, not cosmetic.

**Fix.** Three changes, mirrored in TS and SQL, in this order:

1. **Fold before matching.** NFKC + strip invisibles + map the common confusables:

   ```ts
   const fold = (s: string) =>
     s.normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, "")   // zero-width, BOM, soft hyphen
      .replace(/[\u0430\u0435\u043E\u0440\u0441\u0443\u0445]/g, (c) =>   // Cyrillic
        (({ "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x" }) as Record<string, string>)[c])
      .toLowerCase();
   ```

2. **Allow suffixes** instead of requiring a trailing boundary:

   ```
   \y(fuck|shit|bitch|bastard|dick|cunt)(s|ed|er|ers|ing|y|ies)?\y
   ```
   Word boundaries at both ends keep "classic", "assassin" and "Scunthorpe" safe;
   `ass` stays excluded from the stem rule because it collides with ordinary text.

3. **Keep both copies honest.** `src/lib/bannedFilter.gaps.test.ts` now encodes
   the misses above as `it.fails` cases. Fix the filter and those tests turn red —
   that is the reminder to delete the marker, not a regression.

**Shipped.** `20261103101500_claim_cap_and_filter_fold.sql` adds
`public.fold_for_filter` (NFKC, invisible characters, Cyrillic/Greek
confusables) and rebuilds `find_banned_content` around stems + suffixes;
`src/lib/bannedFilter.ts` mirrors it. Verified:

- 50/50 pgTAP assertions pass on Postgres 16 (29 of them new).
- 36/36 corpus cases return the *same* canonical match in TypeScript and SQL.
- The nine ordinary-English guards still pass: `classic`, `assess`, `assume`,
  `assassin`, `damning`, `cocktail`, `prickly`, `grade a b student`, …
- The previously-failing `it.fails` markers are gone, replaced by real assertions
  in `src/lib/bannedFilter.hardening.test.ts`.

Still heuristic. The honest framing for users and the README remains "cheap first
pass, not a moderation system"; a classifier belongs in an Edge Function once
volume justifies the spend.

---

## S-3 · High · The publishable key is public, and still live

**OWASP:** A02 Cryptographic Failures / A05 Security Misconfiguration

`.env` is in the public history — `91a8dbd` (2026-04-01) and again in `149b975` —
containing `VITE_SUPABASE_PUBLISHABLE_KEY`. It was removed from the working tree
in PR #1, but **removing a file does not revoke a key**. Anyone who cloned during
that window has a credential that can call the API as `anon`: sign up in a loop,
send spam, and (with S-1) drain the queue.

It is a *publishable* key, so this is not "your database is open" — RLS is what
protects data, and after S-1 is fixed the blast radius drops further. It is still
a write credential to your project and it is out of your control.

**Fix:** rotate (GO-LIVE step 3). Revoke the old key — otherwise "rotated" means
"a second valid key exists". `npm run check:secrets` now fails CI if a real key
re-enters the tree; it cannot detect a key that is already in history, by design.

**Bundle check (clean):** the production bundle contains no JWT and no
`service_role` key — the only match for `sb_secret_` is the Supabase SDK's own
key-prefix detection code.

---

## S-4 · High · Identities are free, so every rate limit resets

**OWASP:** A07 Identification & Authentication Failures / A04

Every visitor gets an identity from `signInAnonymously()` — no email, no
captcha, no attestation. All the app's abuse controls are per-identity: 10 notes
an hour, 20 reports a day, (after S-1) N claims an hour. Signing up again costs
one request.

`supabase/config.toml` sets `anonymous_users = 30` per hour per IP, which is a
real speed bump — but it is *local* config. The dashboard value is what applies in
production, and it is not visible from here. Confirm it, and note that it is
per-IP, so a proxy pool defeats it.

**Shipped (opt-in):** `src/lib/captcha.ts` loads Cloudflare Turnstile only when
`VITE_TURNSTILE_SITE_KEY` is set, solves an invisible challenge, and passes the
token to `signInAnonymously({ options: { captchaToken } })`. With no key the app
behaves exactly as before. **You still have to switch it on** — see
[GO-LIVE step 4](GO-LIVE.md#4-turn-on-the-captcha-optional-but-recommended).
Failure modes are mapped to plain copy, and a failed challenge refuses to sign in
rather than silently retrying without a token.

**Fix, in order of effectiveness:**

1. **CAPTCHA on anonymous sign-in** — Supabase supports hCaptcha/Turnstile:
   dashboard → Authentication → Attack Protection, then pass the token:
   `supabase.auth.signInAnonymously({ options: { captchaToken } })`. Free tier
   Cloudflare Turnstile is invisible for most users.
2. **IP rate limits at the host/CDN** (Cloudflare rules, Vercel WAF) on
   `/rest/v1/rpc/claim_ghost_note` and `/auth/v1/signup`.
3. Keep the per-identity limits — they bound a *single* actor's damage.

---

## S-5 · Medium · No security headers, no CSP

**OWASP:** A05 Security Misconfiguration

`index.html` declares no CSP, and nothing in the repo sets response headers.
Missing: `Content-Security-Policy` (and `frame-ancestors`), `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.

There is no XSS sink to speak of today (S-positive #1), so this is
defence-in-depth — but "no CSP" also means no clickjacking defence: the compose
form can be framed, and a framed page can be nudged into sending a note. Low
impact, trivially fixed.

Netlify/Cloudflare Pages (`public/_headers` becomes `/ _headers` in `dist/`) and
Vercel (`vercel.json`) both take this; verify in a browser before enforcing, or
start with `Content-Security-Policy-Report-Only`:

```csp
default-src 'self';
script-src 'self' https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://YOUR-PROJECT.supabase.co wss://YOUR-PROJECT.supabase.co
            https://challenges.cloudflare.com;
frame-src https://challenges.cloudflare.com;

frame-ancestors 'none';
base-uri 'none';
form-action 'self';
object-src 'none'
```

`style-src 'unsafe-inline'` is needed by the current styling setup (inline styles
from Radix/Tailwind); tightening it is a separate job.

Two related notes: the fonts are loaded from Google (third-party request from
every visitor — self-host them if the privacy promise is meant to cover
metadata), and there is no `SRI` to add value on a hashed asset.

---

## S-6 · Medium · Vulnerable and outdated components — **fixed**

**OWASP:** A06

Starting point at `83fa2b5`: **24 advisories — 2 critical, 16 high, 6 moderate**;
production-only: **4 high**.

Then, in two passes: `npm audit fix` (semver-compatible only), and a deliberate
toolchain upgrade — React 19, React Router 7, Vite 8, Vitest 5, jsdom 30, Zod 4,
plugin-react-swc 4.

| | Start | After audit fix | **Now** |
| --- | --- | --- | --- |
| total | 24 | 22 | **12** |
| critical | 2 | 2 | **0** |
| high | 16 | 2 | **0** |
| moderate | 6 | 18 | 12 |
| production deps | 4 high | 1 high, 2 moderate | **0** |

The remaining twelve are all the ESLint toolchain (`minimatch`/`@typescript-eslint`
chain) — dev-only, no runtime exposure. Clearing those needs ESLint 10, which is
not worth the churn on its own; Dependabot will surface it when the plugins catch
up.

**Deliberately not upgraded**, with the reasoning:

| Package | Why it waits |
| --- | --- |
| `tailwindcss` 3 → 4 | CSS-first config, renamed utilities. It is a visual change, and this environment has no browser to check the result. Needs a human on a preview. |
| `typescript` 5.8 → 7 | The native (Go) compiler; `tsc -b` with project references is its least-settled path. Pilot separately. |
| `eslint` 9 → 10 | Config and plugin compatibility churn for a dev-only advisory. |
| `date-fns` 4, `sonner` 2, `lucide-react` 1.x, `tailwind-merge` 3, `@types/node`, `eslint-plugin-react-hooks` 7 | Majors with no security driver; do them when the file next needs touching. |

Two things this upgrade changed that are worth knowing:

- **Node floor moved.** Vite 8 needs `^20.19 || >=22.12`, Vitest 5 and jsdom 30
  need `^22.22.2 || ^24.15 || >=26`, so `engines` and the README now say
  `^22.22.2 || ^24.15.0 || >=26`. Node 20 can no longer run the suite.
- **Chunking API moved.** Vite 8 is Rolldown-based; the `manualChunks` record no
  longer works (it silently put `react-dom` in the radix chunk), so the config
  uses `advancedChunks.groups`.

**Still recommended:** add Dependabot (this drift is why the review was needed),
SHA-pin the CI actions (S-10), and fail CI on new *production* advisories with
`npm audit --omit=dev --audit-level=high`.

---

## S-7 · Medium · The session never ends

**OWASP:** A07

`ensureAnonymousSession()` signs in and never signs out — there is no `signOut`
call anywhere in `src/`. The refresh token sits in `localStorage` and the session
is renewed forever.

On a shared or resold device, the next person opens the app and reads the
previous person's entire journal — which for this product is "the private things
strangers sent you". There is also no way for a user to start fresh short of
clearing site data by hand (which the README tells them to do).

**Shipped:** `src/lib/session.ts` signs out and removes only the `sb-*-auth*`
keys (never unrelated storage), and the footer now carries a **Forget this
device** action behind a confirmation dialog. The dialog says plainly that notes
already sent or received are not deleted — the identity goes, the rows do not —
and a fresh anonymous session is created on the next load.

---

## S-8 · Low · Raw database errors in the UI

**OWASP:** A05 / A09

`src/pages/Write.tsx` does `setErrorMsg(error.message)` on insert failure, so a
user sees Postgres text: `new row violates check constraint
"notes_body_length"`, `rate limit: at most 10 notes per hour`, or the filter's
`note contains blocked content: fuck`. The Journal and session gate already map
errors through `describeError()` (`src/lib/errors.ts`); this path was missed.

It is not a serious leak — the messages describe the user's own action — but they
expose internal constraint names and give a clean oracle for probing filter
rules.

**Shipped:** `Write.tsx` routes through `describeError()` and keeps the raw text
in `console.error`. Two new branches cover the cases that reach this path:
"that wording isn't allowed here" (filter) and "that note is the wrong length" —
neither repeats the blocked word back to the sender.

---

## S-9 · Low · Dev server accepts any Host header

**OWASP:** A05

`vite.config.ts` sets `server.host: "::"` (all interfaces) with
`allowedHosts: true` (any `Host`). That is what makes tunnel/Codespaces previews
work, and it is only the dev server — but it also means a malicious page can
reach it via DNS rebinding and read whatever it serves, which is the same class as
the `esbuild` advisory in S-6. Fine for a laptop; not fine on a shared network or
a long-lived preview URL.

**Fix:** restrict `allowedHosts` to the preview domains you actually use, set
`server.fs.strict: true`, and never run `vite --host` on an untrusted network.

---

## S-10 · Low · Supply chain in CI

**OWASP:** A06

`.github/workflows/ci.yml` pins actions to mutable major tags (`actions/checkout@v4`,
`actions/setup-node@v4`, `actions/upload-artifact@v4`). A retagged action runs
arbitrary code with the workflow's token. Impact is small (the token is
`contents: read`), but SHA pinning is free. `lovable-tagger`, a third-party build
plugin, is a dev dependency and is gated to non-production builds — keep it there.

---

## S-11 · Low · Nothing is ever deleted

**OWASP:** A04

No retention anywhere: anonymous users accumulate one per browser (or per
attacker loop), notes persist after delivery, reports persist after resolution.
Costs grow, and "we keep everything forever" is hard to defend for an app whose
whole pitch is that strangers can be candid.

**Fix:** a weekly job — delete anonymous users with no notes and no activity older
than N days (cascades are not configured, so delete deliberately), and define a
retention window for `deleted`/`reported` notes. Document it in the privacy
statement, whatever you choose.

---

## S-12 · Info · Small hardening items

- `public.moderation_queue` is a **definer-rights view**, so it bypasses RLS. It is
  correctly revoked from `anon`/`authenticated` and there is a pgTAP assertion
  guarding that (`clients cannot read the moderation queue`) — keep that test.
  Anyone who ever grants it to `authenticated` exposes `author_id` for every
  reported note.
- ~~`notes` carries the default `UPDATE`/`DELETE` grants for `authenticated`.~~
  **Fixed** in `20261103120000`: `REVOKE UPDATE, DELETE, TRUNCATE` on `notes` and
  `reports`, asserted by pgTAP.
- ~~`get_my_journal()` has no `LIMIT`.~~ **Fixed**: `get_my_journal(p_limit,
  p_offset)` defaults to 50, clamps at 100, and the journal has a "Show older
  notes" button.
- `report_note` sets `status='reported'`, and `get_my_journal` only returns
  `status='delivered'` — so reporting a note makes it vanish from the reporter's
  own journal. Probably not what a user expects from "report"; worth a decision.
- **No abuse monitoring (A09).** Nothing alerts on a spike in `53400`
  (rate-limit) errors, `42501` (permission) errors, or claim volume. A daily query
  over `notes` grouped by `recipient_id` would have caught S-1 in production, and
  a per-identity count of `signInAnonymously` would catch S-4.

---

## What held up

Worth stating plainly, because most of the design is sound:

1. **No XSS sink.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no
   `new Function` anywhere in `src/`. Note bodies, tags and report reasons are
   rendered as JSX text nodes, so React escapes them. (This is also why S-5 is
   rated Medium rather than High.)
2. **Anonymity is genuinely enforced in the database.** `authenticated` has no
   `SELECT` on `notes`; every read path (`get_my_journal`, `claim_ghost_note`,
   `get_my_stats`) returns a projection without `author_id`. The old policy that
   leaked the counterpart's id is gone. This is the hardest property to get right
   in this product and it is right.
3. **Forged deliveries fail closed.** The INSERT policy re-checks
   `status='queued' AND recipient_id IS NULL`, and the trigger overwrites those
   columns anyway — two independent layers. Covered by pgTAP ("a forged
   recipient is discarded").
4. **No SQL injection.** Every RPC is parameterised; the only dynamic SQL is the
   filter's regex, built from a constant word list, not from user input.
5. **No secret in the bundle.** No JWT, no service key; the publishable key is the
   only credential shipped, which is correct by design.
6. **Enumerated-tag and length constraints are server-side**, not just in the UI,
   and `tags` are whitelisted by a `CHECK`.
7. **Reporting cannot be used as an existence oracle** — `report_note` refuses any
   note not delivered to the caller, so a probe leaks nothing, and duplicates are
   a no-op rather than an error.

---

## Appendix — what was executed

| Check | Command | Result |
| --- | --- | --- |
| Advisories | `npm audit`, `npm audit --omit=dev` | 24 → **12** (0 critical/high); prod 4 high → **0** |
| Install reproducibility | `npm ci` after lock change | 426 packages, clean |
| Typecheck / tests / lint / build | `tsc -b`, `vitest run`, `eslint`, `vite build` | clean, 61 pass, 0 errors |
| Filter bypass corpus | 19 variants through `findBannedContent` | **12 missed** |
| Homoglyph / invisible-char probe | 14 payloads | 4 missed (fullwidth, Cyrillic ×2, `f*cking`) |
| Queue drain | loop over mock `claim_ghost_note` | 14 notes / 17 ms / one identity |
| Bundle secret scan | grep `dist/` for JWTs, `service_role`, `sb_secret_` | clean (SDK code only) |
| History exposure | `gh api …/commits?path=.env` | `91a8dbd`, `149b975` |
| XSS sinks | grep for `innerHTML`, `dangerouslySetInnerHTML`, `eval` | none |
| S-1 fix | attack replay on Postgres 16 | 5 claims, 7 notes left, next user served |
| S-2 fix | pgTAP + TS/SQL parity | 50/50 assertions, 36/36 corpus cases agree |
| S-7/S-8/S-12 | session, error copy, grants, paging | unit tests + 7 pgTAP assertions |
| preflight | healthy / legacy / stale-schema mocks | 7/7 · 3+4 fail · fails on missing migration |

**How the SQL was verified without Supabase:** a real PostgreSQL 16 server (not
the mock) with a small shim for `auth.uid()`, the `anon`/`authenticated`/
`service_role` roles and Supabase's default grants. Both migrations applied
cleanly, the pgTAP suite ran against it through a compatibility shim, and the
S-1 attack was replayed before and after the fix.

**Not executed, and why:** still no network path to your Supabase project — so
the key rotation, the anonymous-sign-in toggle, the CAPTCHA dashboard switch and
any probing of the deployed project remain yours (see the block at the top).

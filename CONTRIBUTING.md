# Contributing

Thanks for helping keep Kindling kind.

## Before you start

- Read the "Security model" and "Known limitations" sections of the README.
- Anything that touches `supabase/migrations/**` or RLS needs a database test
  (`supabase/tests/rls.test.sql`) in the same change. Run it with
  `npm run db:test` (Docker) or `psql -f supabase/tests/rls.test.sql`.
- If you change the content filter, update **both** layers
  (`src/lib/bannedFilter.ts` and `public.find_banned_content`) and both test
  suites. pgTAP's `throws_ok(sql, description)` treats the second argument as
  the expected message — always pass four arguments.
- No new dependency without a reason: the app deliberately ships a small subset
  of shadcn/ui components. Add one with `npx shadcn@latest add <component>` when
  you actually need it.

## Local checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run db:test    # if you touched supabase/**
npm run e2e        # if you touched UI flows (needs: npx playwright install chromium)
```

CI (`.github/workflows/ci.yml`) runs the same four commands on every pull
request, so a green local run means a green PR.

## Privacy rules for issues and PRs

- Never paste real note bodies, report reasons, user ids or service keys into an
  issue, PR, screenshot or commit message.
- Do not add analytics, fingerprints, tracking pixels or third-party scripts.
  "No tracking" is a product promise.
- Do not log note bodies, `author_id` or `recipient_id` in client code.

## Writing a migration

1. `supabase migration new <name>`
2. Never edit an applied migration — add a new one.
3. `supabase db reset` locally and run `npm run db:test`.
4. Regenerate types with `npm run db:types` and commit the result.

## Commit style

Short imperative subject (`fix: guard double-claim in Inbox`), a body when the
*why* isn't obvious, and tests in the same commit as the fix.

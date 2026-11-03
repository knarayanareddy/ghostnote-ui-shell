-- ============================================================================
-- S-7, S-8, S-12 follow-ups from docs/SECURITY-REDTEAM.md
--
--   1. public.schema_state() — a catalog probe the deployment tooling can read,
--      so `npm run preflight` can tell "migrations applied" from "partly
--      applied". Before this, a project that ran only the first two migrations
--      reported Ready while the queue cap and the filter rewrite were missing.
--   2. Grants: `authenticated` still held UPDATE/DELETE on notes and reports.
--      RLS denied them (no policy), but there is no reason to keep the bit set.
--   3. get_my_journal() gained a limit/offset so a heavy recipient cannot pull
--      an unbounded result set.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Machine-readable schema state
-- ---------------------------------------------------------------------------
-- Probes the catalog rather than a version table: a table can claim a migration
-- ran when it half ran, and a probe cannot. Returns booleans only — nothing here
-- is sensitive, which is why `anon` may call it (preflight has no session).
CREATE OR REPLACE FUNCTION public.schema_state()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'latest_expected', '20261103120000_schema_state_and_page_journal',
    'migrations', jsonb_build_object(
      '20260401163617_initial_schema',
        to_regclass('public.notes') IS NOT NULL,
      '20261103090000_security_hardening',
        to_regprocedure('public.enforce_note_insert()') IS NOT NULL,
      '20261103101500_claim_cap_and_filter_fold',
        to_regprocedure('public.fold_for_filter(text)') IS NOT NULL
          AND to_regprocedure('public.reclaim_stale_notes(interval)') IS NOT NULL,
      '20261103120000_schema_state_and_page_journal',
        to_regprocedure('public.schema_state()') IS NOT NULL
          AND to_regprocedure('public.get_my_journal(integer,integer)') IS NOT NULL
    )
  );
$$;

COMMENT ON FUNCTION public.schema_state() IS
  'Which migrations this project actually carries. Read by npm run preflight.';

REVOKE ALL ON FUNCTION public.schema_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schema_state() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Grant hygiene: clients never need UPDATE or DELETE on these tables
-- ---------------------------------------------------------------------------
-- Every write path is a SECURITY DEFINER function (claim, open, report) or the
-- INSERT path, which RLS and the trigger already police.
REVOKE UPDATE, DELETE, TRUNCATE ON public.notes FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.reports FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Page the journal
-- ---------------------------------------------------------------------------
-- `p_limit` is capped at 100 so a client cannot ask for everything; the default
-- matches what the UI shows before "Show older notes".
DROP FUNCTION IF EXISTS public.get_my_journal();

CREATE FUNCTION public.get_my_journal(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  body TEXT,
  tag TEXT,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.body, n.tag, n.delivered_at, n.opened_at
  FROM public.notes n
  WHERE n.recipient_id = auth.uid()
    AND n.status = 'delivered'
  ORDER BY n.delivered_at DESC NULLS LAST, n.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.get_my_journal(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_journal(INTEGER, INTEGER) TO authenticated;

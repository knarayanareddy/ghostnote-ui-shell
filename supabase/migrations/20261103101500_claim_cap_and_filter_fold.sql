-- ============================================================================
-- S-1 + S-2 from docs/SECURITY-REDTEAM.md
--
-- S-1  claim_ghost_note had no per-identity cap, so one anonymous session could
--      loop the RPC, receive the entire queue and read every note body in it.
--      Reproduced on Postgres 16: 12 notes claimed, 12 bodies returned, next
--      visitor got nothing. Fixed with a receiving rate limit plus a reclaim
--      path for notes that were claimed but never opened.
--
-- S-2  find_banned_content matched whole base words only, so "fucking",
--      "shitty", "asshole", "retarded" — and any fullwidth/Cyrillic homoglyph —
--      walked straight through, in this SQL copy and in src/lib/bannedFilter.ts.
--      Fixed by folding input (NFKC, invisible characters, common confusables)
--      and matching inflected forms.
--
-- Both halves of the filter must stay in sync with src/lib/bannedFilter.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Fold text before matching
-- ---------------------------------------------------------------------------
-- normalize(..., NFKC) turns fullwidth "ｆｕｃｋ" into "fuck"; the first
-- translate() deletes zero-width and other invisible joiners; the second maps
-- the Cyrillic/Greek letters that are visually identical to Latin ones.
CREATE OR REPLACE FUNCTION public.fold_for_filter(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
           translate(
             translate(
               normalize(coalesce(p_text, ''), NFKC),
               -- zero-width space/joiner/non-joiner, LRM/RLM, word joiner, BOM,
               -- soft hyphen, Mongolian vowel separator
               E'\u200B\u200C\u200D\u200E\u200F\u2060\uFEFF\u00AD\u180E',
               ''
             ),
             -- Cyrillic а е о р с у х і + Greek ο α ε ι (same length below)
             'аеорсухіοαει',
             'aeopcyxiaei'
           )
         );
$$;

COMMENT ON FUNCTION public.fold_for_filter(TEXT) IS
  'Lowercase, NFKC, invisible characters removed, Cyrillic/Greek confusables mapped to Latin.';

-- ---------------------------------------------------------------------------
-- 1) Inflection-aware banned-content matching
-- ---------------------------------------------------------------------------
-- A stem of 4+ letters is also matched with the suffixes below, which is what
-- catches "fucking", "shitty", "retarded", "bitches". Shorter stems ("ass") get
-- explicit forms instead, so "assess", "assist" and "classic" stay safe.
CREATE OR REPLACE FUNCTION public.find_banned_content(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_folded TEXT := public.fold_for_filter(p_text);
  v_norm   TEXT := public.normalize_for_filter(v_folded);
  v_spaced TEXT := public.collapse_letter_runs(v_norm);
  v_cond   TEXT := public.no_vowels(public.condense_for_filter(v_folded));

  v_stems TEXT[] := ARRAY[
    'fuck', 'shit', 'bitch', 'bastard', 'dick', 'cunt',
    'nigger', 'nigga', 'faggot', 'retard',
    'bullshit', 'horseshit', 'dipshit',
    'asshole', 'dumbass', 'jackass', 'asshat',
    'motherfuck', 'retardation'
  ];
  -- 'damn' stays whole-word: "damning with faint praise" is ordinary English.
  v_exact TEXT[] := ARRAY['ass', 'damn'];
  v_suffixes TEXT[] := ARRAY['', 's', 'es', 'ed', 'd', 'er', 'ers', 'ing', 'ings', 'y', 'ies', 'ty'];

  v_phrases TEXT[] := ARRAY['kill yourself', 'kys'];

  v_stem     TEXT;
  v_suffix   TEXT;
  v_form     TEXT;
  v_cond_form TEXT;
  v_phrase   TEXT;
BEGIN
  IF coalesce(p_text, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Phrases first: they may contain words that are also in the word list.
  FOREACH v_phrase IN ARRAY v_phrases LOOP
    IF v_norm ~ ('\y' || replace(v_phrase, ' ', '\s+') || '\y') THEN
      RETURN v_phrase;
    END IF;
    -- Letter-spaced phrasing: "k i l l y o u r s e l f" -> "killyourself"
    IF v_spaced ~ ('\y' || replace(v_phrase, ' ', '') || '\y') THEN
      RETURN v_phrase;
    END IF;
    IF v_cond ~ ('\y' || public.no_vowels(replace(v_phrase, ' ', '')) || '\y') THEN
      RETURN v_phrase;
    END IF;
  END LOOP;

  -- Whole forms, including the short stems that must not be expanded.
  FOREACH v_form IN ARRAY v_exact LOOP
    IF v_norm ~ ('\y' || v_form || '\y') OR v_spaced ~ ('\y' || v_form || '\y') THEN
      RETURN v_form;
    END IF;
  END LOOP;

  FOREACH v_stem IN ARRAY v_stems LOOP
    FOREACH v_suffix IN ARRAY v_suffixes LOOP
      v_form := v_stem || v_suffix;

      IF v_norm ~ ('\y' || v_form || '\y') OR v_spaced ~ ('\y' || v_form || '\y') THEN
        RETURN v_stem;
      END IF;

      -- Vowel-collapsed pass: "f*cking" -> "fckng" matches "fucking".
      v_cond_form := public.no_vowels(v_form);
      IF char_length(v_cond_form) >= 3
         AND v_cond ~ ('\y' || v_cond_form || '\y') THEN
        RETURN v_stem;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) claim_ghost_note — cap what one identity can receive per hour
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_ghost_note(p_tag TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  body TEXT,
  tag TEXT,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id UUID;
  v_recent  INTEGER;
  v_max_per_hour CONSTANT INTEGER := 5;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'claim_ghost_note requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  -- Receiving is rarer than sending: five notes an hour is plenty for a person
  -- and stops one session from walking off with the queue.
  SELECT count(*) INTO v_recent
  FROM public.notes n
  WHERE n.recipient_id = auth.uid()
    AND n.delivered_at > now() - interval '1 hour';

  IF v_recent >= v_max_per_hour THEN
    RAISE EXCEPTION 'rate limit: at most % notes per hour', v_max_per_hour
      USING ERRCODE = '53400';
  END IF;

  -- Tag-matched first, when a tag was requested.
  IF p_tag IS NOT NULL THEN
    SELECT n.id INTO v_note_id
    FROM public.notes n
    WHERE n.status = 'queued'
      AND n.recipient_id IS NULL
      AND n.author_id <> auth.uid()
      AND n.tag = p_tag
    ORDER BY n.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  -- Fall back to any queued note.
  IF v_note_id IS NULL THEN
    SELECT n.id INTO v_note_id
    FROM public.notes n
    WHERE n.status = 'queued'
      AND n.recipient_id IS NULL
      AND n.author_id <> auth.uid()
    ORDER BY n.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF v_note_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.notes n
  SET recipient_id = auth.uid(),
      delivered_at = now(),
      status = 'delivered'
  WHERE n.id = v_note_id
  RETURNING n.id, n.body, n.tag, n.delivered_at, n.opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ghost_note(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ghost_note(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Reclaim notes that were claimed but never opened
-- ---------------------------------------------------------------------------
-- Without this, a note taken by a script is invisible to everyone forever — the
-- cap alone limits the damage, it does not undo it.
CREATE OR REPLACE FUNCTION public.reclaim_stale_notes(
  p_unopened_after INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH reclaimed AS (
    UPDATE public.notes
    SET recipient_id = NULL,
        delivered_at = NULL,
        opened_at = NULL,
        status = 'queued'
    WHERE status = 'delivered'
      AND opened_at IS NULL
      AND delivered_at < now() - p_unopened_after
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reclaimed;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stale_notes(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_notes(INTERVAL) TO service_role;

CREATE INDEX IF NOT EXISTS idx_notes_unopened_delivered
  ON public.notes (delivered_at)
  WHERE status = 'delivered' AND opened_at IS NULL;

-- Schedule it when pg_cron is available; otherwise call it from your own
-- scheduler (see docs/GO-LIVE.md). Silent no-op on projects without the
-- extension — `db:push` must not fail because of it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reclaim-stale-notes',
      '17 * * * *',
      $cron$SELECT public.reclaim_stale_notes()$cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available; schedule public.reclaim_stale_notes() yourself';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Grants for the new helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fold_for_filter(TEXT) FROM PUBLIC, anon, authenticated;

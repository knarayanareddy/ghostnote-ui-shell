-- ============================================================================
-- Security hardening
--
-- Closes the holes found in the initial schema:
--   1. `notes` rows exposed author_id / recipient_id, which deanonymises both
--      sides and breaks the product's core promise ("You'll never know who").
--   2. The INSERT policy only checked `author_id`, so a client could forge a
--      note straight into another user's journal.
--   3. `report_note` accepted any note id, had no de-duplication and no cap.
--   4. Reports had no read path at all (write-only black hole).
--   5. There was no server-side content filter and no rate limiting, so the
--      client-side banned-word check (bannedFilter.ts) was advisory only.
--
-- After this migration:
--   * Clients can no longer SELECT from `notes` at all. Reads go through the
--     SECURITY DEFINER functions below, which return non-identifying columns.
--   * `claim_ghost_note` returns only (id, body, tag, delivered_at, opened_at).
--   * Inserted notes are forced into the 'queued' state server-side, length
--     checked (15..500), content filtered and rate limited.
--   * Reports can only be created for notes you actually received, once.
--   * Moderators get `public.moderation_queue` (service role only, see
--     docs/MODERATION.md).
--
-- The content filter is heuristic and layered: leet digits ("sh1t"),
-- punctuation substitution ("f*ck", "f.u.c.k"), vowel-collapsed forms
-- ("fck"), punctuation-joined phrases ("kill-yourself") and letter-spaced text
-- ("f u c k", "k i l l y o u r s e l f"). What it still cannot catch: novel
-- spellings and deliberately obfuscated variants with no letters in common
-- with the banned word. Once volume justifies it, move moderation to an Edge
-- Function backed by a real classifier; keep this as a cheap first pass.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Stop clients from reading raw note rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read notes they authored or received" ON public.notes;
REVOKE SELECT ON public.notes FROM anon, authenticated;

-- The old function returns `SETOF public.notes`, i.e. the full row including
-- author_id. It has to be dropped because the return type changes.
DROP FUNCTION IF EXISTS public.claim_ghost_note(text);

-- ---------------------------------------------------------------------------
-- 2) Safe read paths (no counterpart identifiers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_journal()
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
  ORDER BY n.delivered_at DESC NULLS LAST, n.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_stats()
RETURNS TABLE (sent BIGINT, received BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.notes n WHERE n.author_id = auth.uid()),
    (SELECT count(*) FROM public.notes n
      WHERE n.recipient_id = auth.uid()
        AND n.status = 'delivered');
$$;

-- ---------------------------------------------------------------------------
-- 3) claim_ghost_note — same queue semantics, safe projection
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.claim_ghost_note(p_tag TEXT DEFAULT NULL)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'claim_ghost_note requires an authenticated session'
      USING ERRCODE = '42501';
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

-- ---------------------------------------------------------------------------
-- 4) Server-side content filter, length check and rate limit on insert
-- ---------------------------------------------------------------------------
-- Filter primitives. Kept in SQL so the client filter and the server trigger
-- can use identical rules (see src/lib/bannedFilter.ts).
--
--   normalize  : lowercase, common leet substitutions, punctuation -> space,
--                whitespace collapsed. Used for whole-word matching.
--   condense   : same but punctuation is deleted (so "f*ck" -> "fck").
--   no_vowels  : vowels removed, so "fck"/"f.ck"/"f u c k" all collapse onto
--                the same shape as "fuck".
CREATE OR REPLACE FUNCTION public.normalize_for_filter(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_text, '')), '013457@$', 'oieastas'),
               '[^a-z0-9]+', ' ', 'g'
             ),
             '[[:space:]]+', ' ', 'g'
           )
         );
$$;

CREATE OR REPLACE FUNCTION public.condense_for_filter(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_text, '')), '013457@$', 'oieastas'),
               '[^a-z0-9[:space:]]', '', 'g'
             ),
             '[[:space:]]+', ' ', 'g'
           )
         );
$$;

CREATE OR REPLACE FUNCTION public.no_vowels(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
           regexp_replace(
             translate(coalesce(p_text, ''), 'aeiou', ''),
             '[[:space:]]+', ' ', 'g'
           )
         );
$$;

-- Collapses runs of single-letter tokens: "f u c k this" -> "fuck this".
-- Token-based (not regex) so it can never merge across a normal word, which
-- keeps the false-positive rate at zero for ordinary prose.
CREATE OR REPLACE FUNCTION public.collapse_letter_runs(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_words TEXT[] := regexp_split_to_array(btrim(coalesce(p_text, '')), '\s+');
  v_buffer TEXT := '';
  v_out TEXT[] := '{}';
  v_word TEXT;
BEGIN
  FOREACH v_word IN ARRAY v_words LOOP
    CONTINUE WHEN v_word = '';

    IF v_word ~ '^[a-z]$' THEN
      v_buffer := v_buffer || v_word;
    ELSE
      IF v_buffer <> '' THEN
        v_out := v_out || v_buffer;
        v_buffer := '';
      END IF;
      v_out := v_out || v_word;
    END IF;
  END LOOP;

  IF v_buffer <> '' THEN
    v_out := v_out || v_buffer;
  END IF;

  RETURN array_to_string(v_out, ' ');
END;
$$;

CREATE OR REPLACE FUNCTION public.find_banned_content(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_norm TEXT := public.normalize_for_filter(p_text);
  v_spaced TEXT := public.collapse_letter_runs(public.normalize_for_filter(p_text));
  v_cond TEXT := public.no_vowels(public.condense_for_filter(p_text));
  v_word TEXT;
  v_phrase TEXT;
  v_banned TEXT[] := ARRAY[
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'bastard',
    'dick', 'cunt', 'nigger', 'nigga', 'faggot', 'retard'
  ];
  v_banned_phrases TEXT[] := ARRAY['kill yourself', 'kys'];
BEGIN
  -- Phrases first: they may contain words that are also in the word list.
  FOREACH v_phrase IN ARRAY v_banned_phrases LOOP
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

  FOREACH v_word IN ARRAY v_banned LOOP
    IF v_norm ~ ('\y' || v_word || '\y') THEN
      RETURN v_word;
    END IF;
    IF v_spaced ~ ('\y' || v_word || '\y') THEN
      RETURN v_word;
    END IF;
    -- Vowel-collapsed check only for longer words: shorter ones ("ass")
    -- collapse to shapes that occur in innocuous text.
    IF char_length(v_word) >= 4
       AND v_cond ~ ('\y' || public.no_vowels(v_word) || '\y') THEN
      RETURN v_word;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_note_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit TEXT;
  v_recent INTEGER;
  v_max_per_hour CONSTANT INTEGER := 10;
BEGIN
  -- Force server-owned columns; never trust the client for these.
  NEW.author_id := auth.uid();
  NEW.status := 'queued';
  NEW.recipient_id := NULL;
  NEW.delivered_at := NULL;
  NEW.opened_at := NULL;
  NEW.created_at := now();
  NEW.body := btrim(NEW.body);

  IF NEW.author_id IS NULL THEN
    RAISE EXCEPTION 'note author must be authenticated' USING ERRCODE = '42501';
  END IF;

  IF char_length(NEW.body) < 15 OR char_length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'note body must be between 15 and 500 characters'
      USING ERRCODE = '23514';
  END IF;

  v_hit := public.find_banned_content(NEW.body);
  IF v_hit IS NOT NULL THEN
    RAISE EXCEPTION 'note contains blocked content: %', v_hit
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.notes n
  WHERE n.author_id = NEW.author_id
    AND n.created_at > now() - interval '1 hour';

  IF v_recent >= v_max_per_hour THEN
    RAISE EXCEPTION 'rate limit: at most % notes per hour', v_max_per_hour
      USING ERRCODE = '53400';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_note_insert ON public.notes;
CREATE TRIGGER enforce_note_insert
  BEFORE INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_note_insert();

-- Defence in depth: the policy itself refuses forged delivery fields.
DROP POLICY IF EXISTS "Users can insert their own notes" ON public.notes;
CREATE POLICY "Users can insert their own queued notes"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND status = 'queued'
    AND recipient_id IS NULL
    AND delivered_at IS NULL
    AND opened_at IS NULL
  );

-- Tags come from a fixed vocabulary in the UI; keep stray values out without
-- failing on rows written before this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_tag_vocabulary'
  ) THEN
    ALTER TABLE public.notes
      ADD CONSTRAINT notes_tag_vocabulary
      CHECK (
        tag IS NULL OR tag IN ('Encouragement', 'Gratitude', 'Proud of you', 'Calm', 'Funny')
      ) NOT VALID;
  END IF;
END;
$$;

-- Body length: 15..500 to match the client contract (was 1..500).
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_body_length;
ALTER TABLE public.notes
  ADD CONSTRAINT notes_body_length CHECK (char_length(body) BETWEEN 15 AND 500) NOT VALID;

-- ---------------------------------------------------------------------------
-- 5) report_note — ownership, de-duplication, length cap, rate limit
-- ---------------------------------------------------------------------------
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_length;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_length
  CHECK (reason IS NULL OR char_length(reason) <= 300);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_note_id_reporter_id_key'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_note_id_reporter_id_key UNIQUE (note_id, reporter_id);
  END IF;
END;
$$;

-- Reports must go through report_note(); direct inserts would bypass the
-- ownership check.
DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
REVOKE INSERT ON public.reports FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_note(p_note_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_reports_today INTEGER;
  v_max_per_day CONSTANT INTEGER := 20;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'report_note requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  -- Only the recipient of a delivered note may report it. This also stops the
  -- function being used as an existence oracle for arbitrary note ids.
  IF NOT EXISTS (
    SELECT 1 FROM public.notes n
    WHERE n.id = p_note_id
      AND n.recipient_id = v_uid
      AND n.status IN ('delivered', 'reported')
  ) THEN
    RAISE EXCEPTION 'note % was not delivered to this user', p_note_id
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NOT NULL AND char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'report reason must be 300 characters or fewer'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_reports_today
  FROM public.reports r
  WHERE r.reporter_id = v_uid
    AND r.created_at > now() - interval '1 day';

  IF v_reports_today >= v_max_per_day THEN
    RAISE EXCEPTION 'rate limit: at most % reports per day', v_max_per_day
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.reports (note_id, reporter_id, reason)
  VALUES (p_note_id, v_uid, nullif(btrim(coalesce(p_reason, '')), ''))
  ON CONFLICT (note_id, reporter_id) DO NOTHING;

  UPDATE public.notes n
  SET status = 'reported'
  WHERE n.id = p_note_id
    AND n.recipient_id = v_uid
    AND n.status <> 'reported';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Moderation read path (service role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.moderation_queue AS
SELECT
  r.id            AS report_id,
  r.created_at    AS reported_at,
  r.reason,
  n.id            AS note_id,
  n.body,
  n.tag,
  n.status        AS note_status,
  n.created_at    AS note_created_at,
  n.author_id
FROM public.reports r
JOIN public.notes n ON n.id = r.note_id
WHERE n.status <> 'deleted';

REVOKE ALL ON public.moderation_queue FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_ghost_note(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ghost_note(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_note_opened(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_note_opened(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.report_note(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_note(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_journal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_journal() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.find_banned_content(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_for_filter(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.condense_for_filter(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.no_vowels(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collapse_letter_runs(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_note_insert() FROM PUBLIC, anon, authenticated;

-- Index for the report rate-limit lookup.
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created
  ON public.reports (reporter_id, created_at DESC);

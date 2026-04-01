-- ===== A) NOTES TABLE =====
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id UUID NOT NULL,
  recipient_id UUID,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  body TEXT NOT NULL,
  tag TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  CONSTRAINT notes_status_check CHECK (status IN ('queued','delivered','reported','deleted')),
  CONSTRAINT notes_body_length CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE INDEX idx_notes_status_created ON public.notes (status, created_at);
CREATE INDEX idx_notes_recipient_delivered ON public.notes (recipient_id, delivered_at DESC);

-- ===== B) REPORTS TABLE =====
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL,
  reason TEXT
);

-- ===== C) RLS =====
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Notes policies
CREATE POLICY "Users can insert their own notes"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can read notes they authored or received"
  ON public.notes FOR SELECT TO authenticated
  USING (auth.uid() = author_id OR auth.uid() = recipient_id);

-- Reports policies
CREATE POLICY "Users can insert their own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read their own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

-- ===== D) RPC FUNCTIONS =====

-- 1) claim_ghost_note
CREATE OR REPLACE FUNCTION public.claim_ghost_note(p_tag TEXT DEFAULT NULL)
RETURNS SETOF public.notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id UUID;
BEGIN
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
  UPDATE public.notes
  SET recipient_id = auth.uid(),
      delivered_at = now(),
      status = 'delivered'
  WHERE id = v_note_id
  RETURNING *;
END;
$$;

-- 2) mark_note_opened
CREATE OR REPLACE FUNCTION public.mark_note_opened(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notes
  SET opened_at = now()
  WHERE id = p_note_id
    AND recipient_id = auth.uid()
    AND opened_at IS NULL;
END;
$$;

-- 3) report_note
CREATE OR REPLACE FUNCTION public.report_note(p_note_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reports (note_id, reporter_id, reason)
  VALUES (p_note_id, auth.uid(), p_reason);

  UPDATE public.notes
  SET status = 'reported'
  WHERE id = p_note_id
    AND recipient_id = auth.uid();
END;
$$;

-- ===== E) PERMISSIONS =====
REVOKE ALL ON FUNCTION public.claim_ghost_note(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ghost_note(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_note_opened(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_note_opened(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.report_note(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_note(UUID, TEXT) TO authenticated;

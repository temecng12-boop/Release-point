-- 027: atomic coach-notes save as an RPC (QA follow-up to #21).
--
-- save_clip_notes(p_clip_id, p_expected_md5, p_new_notes) compares
-- md5(coalesce(notes, '')) with the md5 the app sends and updates in one
-- statement, so a note changed elsewhere is never overwritten and the old
-- note never travels in a request URL (long/accented notes used to get a 400).
--
-- SECURITY INVOKER: the caller's RLS decides (clips_coach_all: the player's
-- direct coach or a coach on their team). The 022 trigger that keeps
-- clips.notes out of direct browser writes now also lets this function
-- through, via a transaction-local flag that only this function sets.
--
-- Needs 022. Safe to re-run (CREATE OR REPLACE). One transaction.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.clips_notes_server_only()') IS NULL THEN
    RAISE EXCEPTION 'Migration 027 needs migration 022 (clips_notes_server_only) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- 022's guard, plus: allowed inside save_clip_notes.
CREATE OR REPLACE FUNCTION public.clips_notes_server_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND coalesce(current_setting('rp.clip_notes_rpc', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' AND NEW.notes IS NOT NULL THEN
      RAISE EXCEPTION 'clips.notes can only be set through the app''s save action'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'clips.notes can only be changed through the app''s save action'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- saved:         true if the update applied.
-- clip_found:    false if the caller can't see the clip (missing or RLS).
-- current_notes: the notes now stored (after the save, or the newer value
--                that caused a conflict).
CREATE OR REPLACE FUNCTION public.save_clip_notes(p_clip_id uuid, p_expected_md5 text, p_new_notes text)
RETURNS TABLE (saved boolean, clip_found boolean, current_notes text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new   text := CASE WHEN p_new_notes IS NULL OR p_new_notes ~ '^\s*$' THEN NULL ELSE p_new_notes END;
  v_notes text;
  v_hit   boolean;
BEGIN
  IF p_expected_md5 IS NULL OR p_expected_md5 !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'save_clip_notes: p_expected_md5 must be an md5 hex digest' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_new) > 20000 THEN
    RAISE EXCEPTION 'save_clip_notes: notes are too long (max 20000 characters)' USING ERRCODE = '22001';
  END IF;

  PERFORM set_config('rp.clip_notes_rpc', 'on', true);
  UPDATE public.clips AS c
     SET notes = v_new
   WHERE c.id = p_clip_id
     AND md5(coalesce(c.notes, '')) = p_expected_md5
  RETURNING c.notes INTO v_notes;
  v_hit := FOUND;
  PERFORM set_config('rp.clip_notes_rpc', 'off', true);

  IF v_hit THEN
    RETURN QUERY SELECT true, true, v_notes;
    RETURN;
  END IF;
  -- No row updated: changed since the app read it, not visible, or missing.
  RETURN QUERY
    SELECT false, (c.id IS NOT NULL), c.notes
      FROM (SELECT 1) AS one
      LEFT JOIN public.clips AS c ON c.id = p_clip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_clip_notes(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_clip_notes(uuid, text, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

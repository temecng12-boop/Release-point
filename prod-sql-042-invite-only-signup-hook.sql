-- ============================================================================
-- PROD PASTE for ReleasePoint (Supabase project ref: zebjtcamfpqtitkdiiig)
-- Invite-only signup hotfix (migration 042). Paste-ready for the Supabase
-- SQL editor. This file is migration 042 verbatim (same statements, same
-- order, idempotent): the Before User Created hook, its grants,
-- handle_new_user, the helper indexes, the email-normalization triggers,
-- and the backfills. Safe to re-run.
--
-- After running this, enable the hook in the dashboard:
--   Authentication > Hooks > Before User Created > Postgres function
--   > public.before_user_created_invite_check
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'coach_invites') THEN
    RAISE EXCEPTION 'Migration 042 needs migration 041 (coach_invites) first. Nothing was changed.'
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. Before User Created hook ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.before_user_created_invite_check(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
BEGIN
  IF v_email <> '' AND (
    EXISTS (SELECT 1 FROM public.players
             WHERE user_id IS NULL AND lower(btrim(email)) = v_email)
    OR EXISTS (SELECT 1 FROM public.coach_invites
                WHERE accepted_at IS NULL AND lower(btrim(email)) = v_email)
  ) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Signup is invite-only. Ask your coach for an invite, or join the waitlist.'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.before_user_created_invite_check(jsonb) IS
  'Auth "Before User Created" hook: only an invited email (unlinked players row or pending coach_invites row, matched case-insensitively) may create an account. Enable at Authentication > Hooks > Before User Created.';

-- Hook docs grants: supabase_auth_admin executes; nobody else can.
-- The role lookup is conditional so this file also applies on databases
-- without the Supabase auth roles (local PGlite tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.before_user_created_invite_check(jsonb) TO supabase_auth_admin;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.before_user_created_invite_check(jsonb) FROM PUBLIC, anon, authenticated;

-- Expression indexes for the hook's lookups (small tables; keeps it cheap).
CREATE INDEX IF NOT EXISTS players_invite_email_idx
  ON public.players (lower(btrim(email))) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS coach_invites_pending_email_idx
  ON public.coach_invites (lower(btrim(email))) WHERE accepted_at IS NULL;

-- ── 2. handle_new_user(): never trust the signup role ────────────────────────
-- raw_user_meta_data is fully client-controlled (anyone can call auth.signUp
-- with data {role:'coach'}), so every new profile starts as 'player'. The
-- coach-invite accept path upgrades invited coaches afterwards.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    'player'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 3. Normalize invite emails on write ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_invite_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_normalize_email ON public.players;
CREATE TRIGGER players_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.normalize_invite_email();

DROP TRIGGER IF EXISTS coach_invites_normalize_email ON public.coach_invites;
CREATE TRIGGER coach_invites_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.coach_invites
  FOR EACH ROW EXECUTE FUNCTION public.normalize_invite_email();

-- Backfill rows written before the trigger (no-op for already-clean emails).
-- players.email has no unique constraint, so every row is safe to rewrite.
UPDATE public.players
   SET email = lower(btrim(email))
 WHERE email IS NOT NULL AND email <> lower(btrim(email));
-- coach_invites has a UNIQUE index on lower(email): two rows that differ
-- only by whitespace ('coach@x' vs ' coach@x ') coexist today but would
-- collide after normalization, aborting the migration. Rows whose normalized
-- email collides with another row's are SKIPPED (left for manual cleanup and
-- counted in the report below). Skipped rows still match the hook, which
-- compares lower(btrim(email)) at query time.
UPDATE public.coach_invites ci
   SET email = lower(btrim(ci.email))
 WHERE ci.email IS NOT NULL
   AND ci.email <> lower(btrim(ci.email))
   AND NOT EXISTS (
     SELECT 1 FROM public.coach_invites other
     WHERE other.id <> ci.id
       AND lower(btrim(other.email)) = lower(btrim(ci.email))
   );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Read-only report (changes nothing; safe to run any time) ─────────────────
SELECT 'hook allows (unlinked player emails)' AS item, count(*) AS n
  FROM public.players WHERE user_id IS NULL AND email IS NOT NULL
UNION ALL
SELECT 'hook allows (pending coach invites)', count(*) FROM public.coach_invites WHERE accepted_at IS NULL
UNION ALL
SELECT 'non-player profiles from signup metadata (expect 0 recent)', count(*) FROM public.profiles WHERE role <> 'player' AND id IN (SELECT id FROM auth.users WHERE created_at > now() - interval '7 days')
UNION ALL
SELECT 'players emails still non-normalized (expect 0)', count(*) FROM public.players WHERE email IS NOT NULL AND email <> lower(btrim(email))
UNION ALL
SELECT 'coach_invites emails still non-normalized (whitespace duplicates; clean up by hand)', count(*) FROM public.coach_invites WHERE email IS NOT NULL AND email <> lower(btrim(email))
UNION ALL
SELECT 'invite hook function in place (expect 1)', count(*) FROM pg_proc WHERE proname = 'before_user_created_invite_check';

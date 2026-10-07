-- ============================================================================
-- Migration 042: invite-only signup enforcement (reliability freeze hotfix)
-- ============================================================================
-- Signup is invite-only: players are invited by coaches (players.email +
-- admin generateLink type 'invite'), coaches through coach_invites, everyone
-- else goes to /waitlist. This migration closes the creation-time holes:
--
-- 1. public.before_user_created_invite_check(event jsonb): the Supabase
--    "Before User Created" auth hook. It runs inside GoTrue's signupNewUser,
--    so it fires for every creation path: public signUp, OAuth (Google/Apple),
--    OTP/magic-link with user creation, and admin generateLink/invite (both
--    invite flows insert their row BEFORE calling generateLink, so invited
--    emails pass). It returns '{}' when the pending auth user's email matches
--    (case-insensitively, trimmed) an unlinked players.email row (no auth
--    user linked yet) or a pending coach_invites.email row (accepted_at IS
--    NULL); otherwise it returns {"error": {"http_code": 403, ...}} and the
--    user is never created. Existing users and sign-ins are unaffected: the
--    hook only runs when a NEW user would be created.
--    Enable it in the dashboard: Authentication > Hooks > Before User Created
--    > Postgres function > public.before_user_created_invite_check.
--    Grants follow the hook docs: execute for supabase_auth_admin only
--    (conditional here so PGlite, which has no such role, still applies).
-- 2. handle_new_user(): always writes role 'player', ignoring any role in
--    signup metadata (raw_user_meta_data is client-controlled). The
--    coach-invite accept path (acceptCoachInvite in auth/callback) upgrades
--    invited coaches player -> coach afterwards.
-- 3. players.email and coach_invites.email are normalized (lower + trim) by
--    a BEFORE trigger on insert/update, plus a backfill, so invite matching
--    can't miss on case or whitespace (e.g. lukeruba27@icloud.com).
--
-- Idempotent. One transaction.
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
UPDATE public.players
   SET email = lower(btrim(email))
 WHERE email IS NOT NULL AND email <> lower(btrim(email));
UPDATE public.coach_invites
   SET email = lower(btrim(email))
 WHERE email IS NOT NULL AND email <> lower(btrim(email));

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
SELECT 'invite hook function in place (expect 1)', count(*) FROM pg_proc WHERE proname = 'before_user_created_invite_check';

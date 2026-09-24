-- Catch-up migration: applies all columns that were missing from prior migrations.
-- Safe to re-run (all use IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Must be run via a direct DB connection (not PgBouncer) so NOTIFY reaches PostgREST.

-- migration 005: player profile fields
ALTER TABLE players ADD COLUMN IF NOT EXISTS height           text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS weight           text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS high_school      text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS travel_team      text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS graduation_year  integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS throws           text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bats             text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_interests text[] DEFAULT ARRAY[]::text[];
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_offers   text[] DEFAULT ARRAY[]::text[];

-- migration 006: timestamp_notes body column + fix old text column default
ALTER TABLE timestamp_notes ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE timestamp_notes ALTER COLUMN text SET DEFAULT '';

-- migration 007: coach profile fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio             text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college         text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS playing_career  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_since  integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications  text[] DEFAULT ARRAY[]::text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location        text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_twitter  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_linkedin  text;

-- migration 008: avatar_url + profiles storage bucket
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profiles', 'profiles', true)
ON CONFLICT (id) DO NOTHING;

-- migration 009: phase_checklist on clips
ALTER TABLE clips ADD COLUMN IF NOT EXISTS phase_checklist jsonb;

-- migration 010: bullpen_sessions table
CREATE TABLE IF NOT EXISTS bullpen_sessions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  coach_id     uuid not null,
  created_at   timestamptz not null default now(),
  session_date date,
  status       text not null default 'planned',
  pitches      jsonb not null default '[]',
  notes        text
);
CREATE INDEX IF NOT EXISTS bullpen_sessions_player_id_idx ON bullpen_sessions(player_id);
CREATE INDEX IF NOT EXISTS bullpen_sessions_coach_id_idx  ON bullpen_sessions(coach_id);

-- migration 011: player_teams junction table
CREATE TABLE IF NOT EXISTS player_teams (
  player_id uuid not null references players(id) on delete cascade,
  team_id   uuid not null references teams(id)   on delete cascade,
  primary key (player_id, team_id)
);

NOTIFY pgrst, 'reload schema';

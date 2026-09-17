-- ── Profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Role drives what they can see.
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name  text,
  role       text NOT NULL DEFAULT 'player' CHECK (role IN ('coach', 'player', 'guardian')),
  team_name  text,
  created_at timestamptz DEFAULT now()
);

-- ── Guardians ────────────────────────────────────────────────────────────────
-- Parent/guardian account. Created by coach invite before player row exists.
-- user_id is null until guardian clicks the consent link and signs in.
CREATE TABLE IF NOT EXISTS guardians (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users UNIQUE,
  email      text NOT NULL,
  full_name  text,
  created_at timestamptz DEFAULT now()
);

-- ── Teams ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid REFERENCES auth.users NOT NULL,
  name       text NOT NULL,
  age_group  text,
  created_at timestamptz DEFAULT now()
);

-- ── Players ──────────────────────────────────────────────────────────────────
-- Created by coach invite. user_id null until player accepts.
-- guardian_id links to the parent who consented.
-- consent_given_at must be set before clips can be uploaded.
CREATE TABLE IF NOT EXISTS players (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid REFERENCES auth.users NOT NULL,
  user_id          uuid REFERENCES auth.users,
  guardian_id      uuid REFERENCES guardians(id),
  team_id          uuid REFERENCES teams(id),
  full_name        text NOT NULL,
  email            text,
  age_group        text,
  position         text CHECK (position IN ('pitcher', 'hitter')),
  consent_given_at timestamptz,
  invited_at       timestamptz DEFAULT now(),
  accepted_at      timestamptz
);

-- ── Clips ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  uploaded_by  uuid REFERENCES auth.users NOT NULL,
  storage_path text NOT NULL,
  voice_path   text,
  title        text NOT NULL,
  notes        text,
  session_date date,
  created_at   timestamptz DEFAULT now()
);

-- ── Annotations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id     uuid REFERENCES clips(id) ON DELETE CASCADE NOT NULL,
  created_by  uuid REFERENCES auth.users NOT NULL,
  type        text NOT NULL CHECK (type IN ('freehand', 'line', 'rect', 'circle')),
  color       text,
  points      jsonb,
  start_pt    jsonb,
  end_pt      jsonb,
  origin_time numeric NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ── Timestamp Notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timestamp_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id      uuid REFERENCES clips(id) ON DELETE CASCADE NOT NULL,
  created_by   uuid REFERENCES auth.users NOT NULL,
  time_seconds numeric NOT NULL,
  text         text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── Pitch Metrics ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pitch_metrics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id           uuid REFERENCES clips(id) ON DELETE CASCADE NOT NULL,
  created_by        uuid REFERENCES auth.users NOT NULL,
  raw_data          jsonb,
  pitch_type        text,
  velocity          numeric,
  spin_rate         integer,
  spin_axis         integer,
  horizontal_break  numeric,
  vertical_break    numeric,
  release_height    numeric,
  release_extension numeric,
  created_at        timestamptz DEFAULT now()
);

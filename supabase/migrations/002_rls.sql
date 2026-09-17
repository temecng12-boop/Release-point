-- ── Enable RLS ───────────────────────────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE timestamp_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_metrics   ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Users read/update their own profile row
CREATE POLICY "profiles_own" ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Coaches can read profiles of their players
CREATE POLICY "profiles_coach_read_players" ON profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT user_id FROM players
      WHERE coach_id = auth.uid() AND user_id IS NOT NULL
    )
  );

-- ── guardians ────────────────────────────────────────────────────────────────
-- Guardians read/update their own row (after user_id is set)
CREATE POLICY "guardians_own" ON guardians
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Guardians read their row by email before user_id is set (during consent)
CREATE POLICY "guardians_read_by_email" ON guardians
  FOR SELECT TO authenticated
  USING (email = auth.email());

-- Guardians claim their row by updating user_id (email match)
CREATE POLICY "guardians_claim_by_email" ON guardians
  FOR UPDATE TO authenticated
  USING (email = auth.email())
  WITH CHECK (email = auth.email());

-- Coaches read guardians linked to their players
CREATE POLICY "guardians_coach_select" ON guardians
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT guardian_id FROM players
      WHERE coach_id = auth.uid() AND guardian_id IS NOT NULL
    )
  );

-- Coaches insert guardian records when sending invites
CREATE POLICY "guardians_coach_insert" ON guardians
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── teams ─────────────────────────────────────────────────────────────────────
-- Coaches manage their own teams
CREATE POLICY "teams_coach_all" ON teams
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Players read the team they belong to
CREATE POLICY "teams_player_select" ON teams
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT team_id FROM players
      WHERE user_id = auth.uid() AND team_id IS NOT NULL
    )
  );

-- ── players ───────────────────────────────────────────────────────────────────
-- Coaches manage their own roster
CREATE POLICY "players_coach_all" ON players
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Players read their own row
CREATE POLICY "players_own_select" ON players
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Guardians read their player's row (after user_id is set)
CREATE POLICY "players_guardian_select" ON players
  FOR SELECT TO authenticated
  USING (
    guardian_id IN (
      SELECT id FROM guardians WHERE user_id = auth.uid()
    )
  );

-- Guardians read their player's row by email (before user_id is set — during consent)
CREATE POLICY "players_guardian_read_by_email" ON players
  FOR SELECT TO authenticated
  USING (
    guardian_id IN (SELECT id FROM guardians WHERE email = auth.email())
  );

-- Guardians update consent_given_at on their player's row
CREATE POLICY "players_guardian_consent_update" ON players
  FOR UPDATE TO authenticated
  USING (
    guardian_id IN (SELECT id FROM guardians WHERE email = auth.email())
  )
  WITH CHECK (
    guardian_id IN (SELECT id FROM guardians WHERE email = auth.email())
  );

-- ── clips ─────────────────────────────────────────────────────────────────────
-- Coaches manage clips for their roster
CREATE POLICY "clips_coach_all" ON clips
  FOR ALL TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE coach_id = auth.uid())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM players WHERE coach_id = auth.uid())
  );

-- Players read their own clips
CREATE POLICY "clips_player_select" ON clips
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- Guardians read their player's clips
CREATE POLICY "clips_guardian_select" ON clips
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM players p
      JOIN guardians g ON g.id = p.guardian_id
      WHERE g.user_id = auth.uid()
    )
  );

-- ── annotations ───────────────────────────────────────────────────────────────
-- Coaches manage annotations on their players' clips
CREATE POLICY "annotations_coach_all" ON annotations
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  );

-- Players read annotations on their own clips
CREATE POLICY "annotations_player_select" ON annotations
  FOR SELECT TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── timestamp_notes ───────────────────────────────────────────────────────────
CREATE POLICY "timestamp_notes_coach_all" ON timestamp_notes
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  );

CREATE POLICY "timestamp_notes_player_select" ON timestamp_notes
  FOR SELECT TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── pitch_metrics ─────────────────────────────────────────────────────────────
CREATE POLICY "pitch_metrics_coach_all" ON pitch_metrics
  FOR ALL TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.coach_id = auth.uid()
    )
  );

CREATE POLICY "pitch_metrics_player_select" ON pitch_metrics
  FOR SELECT TO authenticated
  USING (
    clip_id IN (
      SELECT c.id FROM clips c
      JOIN players p ON p.id = c.player_id
      WHERE p.user_id = auth.uid()
    )
  );

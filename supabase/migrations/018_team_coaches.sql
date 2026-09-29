-- ── Team Coaches ──────────────────────────────────────────────────────────────
-- Allows multiple coaches per team. The original teams.coach_id remains as the
-- "organizer" (owner). This table tracks all coaches including the organizer.

CREATE TABLE IF NOT EXISTS team_coaches (
  team_id   uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  coach_id  uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role      text NOT NULL DEFAULT 'assistant' CHECK (role IN ('organizer', 'assistant')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (team_id, coach_id)
);

-- Backfill existing team owners as organizers
INSERT INTO team_coaches (team_id, coach_id, role)
SELECT id, coach_id, 'organizer'
FROM teams
ON CONFLICT DO NOTHING;

ALTER TABLE team_coaches ENABLE ROW LEVEL SECURITY;

-- Any coach on a team can see who else is on that team
CREATE POLICY "team_coaches_select" ON team_coaches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_coaches tc
      WHERE tc.team_id = team_coaches.team_id
        AND tc.coach_id = auth.uid()
    )
  );

-- Only organizers can add or remove coaches
CREATE POLICY "team_coaches_insert" ON team_coaches
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_coaches tc
      WHERE tc.team_id = team_coaches.team_id
        AND tc.coach_id = auth.uid()
        AND tc.role = 'organizer'
    )
  );

CREATE POLICY "team_coaches_delete" ON team_coaches
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_coaches tc
      WHERE tc.team_id = team_coaches.team_id
        AND tc.coach_id = auth.uid()
        AND tc.role = 'organizer'
    )
  );

-- ── Update teams RLS to include assistant coaches ─────────────────────────────
DROP POLICY IF EXISTS "teams_coach_all" ON teams;

CREATE POLICY "teams_coach_all" ON teams
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM team_coaches
      WHERE team_coaches.team_id = teams.id
        AND team_coaches.coach_id = auth.uid()
    )
  )
  WITH CHECK (coach_id = auth.uid());

-- ── Update players RLS to include assistant coaches ───────────────────────────
DROP POLICY IF EXISTS "players_coach_all" ON players;

CREATE POLICY "players_coach_all" ON players
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid() OR
    (
      team_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM team_coaches
        WHERE team_coaches.team_id = players.team_id
          AND team_coaches.coach_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    coach_id = auth.uid() OR
    (
      team_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM team_coaches
        WHERE team_coaches.team_id = players.team_id
          AND team_coaches.coach_id = auth.uid()
      )
    )
  );

-- ── Update clips RLS to include assistant coaches ─────────────────────────────
DROP POLICY IF EXISTS "clips_coach_all" ON clips;

CREATE POLICY "clips_coach_all" ON clips
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM players p
      WHERE p.coach_id = auth.uid()
        OR (
          p.team_id IS NOT NULL AND
          EXISTS (
            SELECT 1 FROM team_coaches tc
            WHERE tc.team_id = p.team_id
              AND tc.coach_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM players p
      WHERE p.coach_id = auth.uid()
        OR (
          p.team_id IS NOT NULL AND
          EXISTS (
            SELECT 1 FROM team_coaches tc
            WHERE tc.team_id = p.team_id
              AND tc.coach_id = auth.uid()
          )
        )
    )
  );

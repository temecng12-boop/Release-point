-- Allow a player to claim their own invited row by matching email.
-- Needed when the client-side code needs to set user_id after accepting an invite.
CREATE POLICY "players_claim_by_email" ON players
  FOR UPDATE TO authenticated
  USING  (email = auth.email() AND user_id IS NULL)
  WITH CHECK (email = auth.email());

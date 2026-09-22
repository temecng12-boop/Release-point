-- Allow players to sign up directly without a coach invite.
-- coach_id is now nullable; NULL means the player self-registered.
ALTER TABLE players ALTER COLUMN coach_id DROP NOT NULL;

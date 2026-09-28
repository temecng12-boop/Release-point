-- Add hitting metrics JSONB column to clips for session-level hitting data
-- (exit velocity, launch angle, barrel rate, hard hit %, sweet spot %, attack angle, bat speed)
ALTER TABLE clips ADD COLUMN IF NOT EXISTS hitting_metrics JSONB;

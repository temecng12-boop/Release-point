-- Ensure body column exists on timestamp_notes
-- Safe to re-run; fixes PostgREST schema cache errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timestamp_notes' AND column_name = 'body'
  ) THEN
    ALTER TABLE timestamp_notes ADD COLUMN body text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

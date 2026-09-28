ALTER TABLE timestamp_notes ADD COLUMN IF NOT EXISTS drawing_data jsonb;
NOTIFY pgrst, 'reload schema';

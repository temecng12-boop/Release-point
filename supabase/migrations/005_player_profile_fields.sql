-- Run this in your Supabase SQL Editor
ALTER TABLE players ADD COLUMN IF NOT EXISTS height text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS weight text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS high_school text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS travel_team text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS graduation_year integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS throws text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bats text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_interests text[] DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_offers text[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';

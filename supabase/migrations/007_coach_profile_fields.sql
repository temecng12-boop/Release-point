-- Coach profile / resume fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS playing_career text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_since integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_twitter text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_linkedin text;

NOTIFY pgrst, 'reload schema';

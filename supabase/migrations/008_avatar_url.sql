-- Avatar URL on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create a public storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('profiles', 'profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
CREATE POLICY IF NOT EXISTS "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profiles' AND name = 'avatars/' || auth.uid() || '.' || (storage.extension(name)));

-- Allow public read access
CREATE POLICY IF NOT EXISTS "Public read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profiles');

-- Allow users to update/replace their own avatar
CREATE POLICY IF NOT EXISTS "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profiles' AND name = 'avatars/' || auth.uid() || '.' || (storage.extension(name)));

NOTIFY pgrst, 'reload schema';

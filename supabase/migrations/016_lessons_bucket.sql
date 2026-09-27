-- Create dedicated bucket for coach lesson recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lessons',
  'lessons',
  false,
  524288000,  -- 500 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
ON CONFLICT (id) DO NOTHING;

-- Coaches can upload lesson recordings
CREATE POLICY "lessons_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lessons' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Coaches can read all lesson recordings (needed to generate signed URLs via RPC)
CREATE POLICY "lessons_coach_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lessons' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Coaches can delete their own lesson recordings
CREATE POLICY "lessons_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lessons' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Players can read lesson recordings attached to their clips
CREATE POLICY "lessons_player_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lessons' AND
    EXISTS (
      SELECT 1 FROM players p
      WHERE p.user_id = auth.uid()
        AND (storage.objects.name LIKE p.id || '/%')
    )
  );

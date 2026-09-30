-- 026_lessons_audio: let the lessons bucket accept the timeline recorder's audio files.
-- Adds audio types to allowed_mime_types; keeps existing types and the size limit.
-- Supabase Storage compares the base type (parameters such as ;codecs= are ignored in
-- current versions); the codecs variants are listed too for older exact-match versions.
-- NULL allowed_mime_types means "any type" and is left as is. Safe to re-run.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'lessons') THEN
    RAISE EXCEPTION '026_lessons_audio: bucket "lessons" missing; run migration 016_lessons_bucket first';
  END IF;
END $$;
UPDATE storage.buckets b
SET allowed_mime_types = b.allowed_mime_types || ARRAY(
      SELECT t FROM unnest(ARRAY['audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm', 'audio/ogg',
                                 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus']) WITH ORDINALITY AS a(t, n)
      WHERE t <> ALL (b.allowed_mime_types) ORDER BY n)
WHERE b.id = 'lessons' AND b.allowed_mime_types IS NOT NULL;
COMMIT;
-- Check: expect audio_ok = true, video_kept = true, size_limit unchanged.
SELECT allowed_mime_types, file_size_limit,
       allowed_mime_types IS NULL OR allowed_mime_types @> ARRAY['audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg'] AS audio_ok,
       allowed_mime_types IS NULL OR allowed_mime_types @> ARRAY['video/mp4', 'video/webm'] AS video_kept
FROM storage.buckets WHERE id = 'lessons';

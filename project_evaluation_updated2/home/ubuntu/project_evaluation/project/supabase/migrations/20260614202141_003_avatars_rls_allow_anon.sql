
-- The app uses Firebase Auth, not Supabase Auth, so auth.uid() is always null
-- on the client. Replace write policies with anon-friendly ones that allow
-- uploads to the avatars bucket without requiring a Supabase session.

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;

-- Anyone can read avatars (public URLs)
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Allow anon and authenticated clients to upload/replace files in the avatars bucket
CREATE POLICY "avatars_insert_anon"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_update_anon"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_delete_anon"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'avatars');

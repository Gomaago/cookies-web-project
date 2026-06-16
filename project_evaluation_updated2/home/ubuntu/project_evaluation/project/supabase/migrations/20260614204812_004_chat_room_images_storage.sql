-- Create public buckets for chat and room image messages.
-- App uses Firebase Auth (no Supabase session), so policies use public role.

INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('chat-images', 'chat-images', true),
    ('room-images', 'room-images', true)
  ON CONFLICT DO NOTHING;

-- chat-images policies
CREATE POLICY "chat_images_select"  ON storage.objects FOR SELECT TO public USING (bucket_id = 'chat-images');
CREATE POLICY "chat_images_insert"  ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'chat-images');
CREATE POLICY "chat_images_update"  ON storage.objects FOR UPDATE TO public USING (bucket_id = 'chat-images');
CREATE POLICY "chat_images_delete"  ON storage.objects FOR DELETE TO public USING (bucket_id = 'chat-images');

-- room-images policies
CREATE POLICY "room_images_select"  ON storage.objects FOR SELECT TO public USING (bucket_id = 'room-images');
CREATE POLICY "room_images_insert"  ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'room-images');
CREATE POLICY "room_images_update"  ON storage.objects FOR UPDATE TO public USING (bucket_id = 'room-images');
CREATE POLICY "room_images_delete"  ON storage.objects FOR DELETE TO public USING (bucket_id = 'room-images');

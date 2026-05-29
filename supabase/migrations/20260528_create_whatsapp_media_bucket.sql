-- Bucket público para anexos enviados via Chat WhatsApp (image/audio/video/document).
-- A Meta busca o arquivo pela URL pública dentro de poucos segundos após o POST /messages,
-- então o bucket precisa ser public=true (ou usar signed URL com TTL adequado).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  104857600, -- 100MB por arquivo (limite da Meta para documento)
  ARRAY[
    -- imagens
    'image/jpeg', 'image/png', 'image/webp',
    -- áudio
    'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus',
    -- vídeo
    'video/mp4', 'video/3gp',
    -- documento
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can upload whatsapp media" ON storage.objects;
CREATE POLICY "Authenticated users can upload whatsapp media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can view whatsapp media" ON storage.objects;
CREATE POLICY "Public can view whatsapp media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

DROP POLICY IF EXISTS "Authenticated users can update whatsapp media" ON storage.objects;
CREATE POLICY "Authenticated users can update whatsapp media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete whatsapp media" ON storage.objects;
CREATE POLICY "Authenticated users can delete whatsapp media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

-- Migration: Bucket de Storage para fotos de Condomínios
-- Data: 2026-05-21
-- Descrição: As fotos de condomínios vão para Storage (não data URL em JSONB),
--            removendo o limite de ~40MB por requisição que estourava o
--            statement_timeout do Postgres com muitas imagens base64.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'condominios-fotos',
  'condominios-fotos',
  true,
  52428800, -- 50MB por arquivo (fotos individuais não passam disso)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload condominios fotos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'condominios-fotos' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view condominios fotos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'condominios-fotos');

CREATE POLICY "Authenticated users can update condominios fotos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'condominios-fotos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete condominios fotos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'condominios-fotos' AND auth.role() = 'authenticated');

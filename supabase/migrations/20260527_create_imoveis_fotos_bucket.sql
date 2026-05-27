-- Migration: Bucket de Storage para fotos de Imóveis
-- Data: 2026-05-27
-- Descrição: As fotos de imóveis (imoveis_locais.fotos) precisam ficar em Storage com URL
--            pública pra alimentar feeds externos (ZAP/OLX VRSync, Kenlo, etc.). Antes ficavam
--            como data URLs base64 dentro da coluna JSONB, o que (a) inflava a tabela e (b)
--            era descartado pelo feed (que só aceita https?://).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imoveis-fotos',
  'imoveis-fotos',
  true,
  52428800, -- 50MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload imoveis fotos" ON storage.objects;
CREATE POLICY "Authenticated users can upload imoveis fotos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'imoveis-fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can view imoveis fotos" ON storage.objects;
CREATE POLICY "Public can view imoveis fotos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'imoveis-fotos');

DROP POLICY IF EXISTS "Authenticated users can update imoveis fotos" ON storage.objects;
CREATE POLICY "Authenticated users can update imoveis fotos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'imoveis-fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete imoveis fotos" ON storage.objects;
CREATE POLICY "Authenticated users can delete imoveis fotos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'imoveis-fotos' AND auth.role() = 'authenticated');

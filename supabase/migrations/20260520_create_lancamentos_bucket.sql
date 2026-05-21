-- Migration: Bucket de Storage para arquivos de Lançamentos
-- Data: 2026-05-20
-- Descrição: PDF do book e imagens dos lançamentos vão para Storage (não TEXT/JSONB),
--            evitando UPDATEs gigantes que estouram o statement_timeout do Postgres.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lancamentos-arquivos',
  'lancamentos-arquivos',
  true,
  209715200, -- 200MB (suporta PDFs grandes do book)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload lancamentos arquivos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lancamentos-arquivos' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view lancamentos arquivos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lancamentos-arquivos');

CREATE POLICY "Authenticated users can update lancamentos arquivos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'lancamentos-arquivos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete lancamentos arquivos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lancamentos-arquivos' AND auth.role() = 'authenticated');

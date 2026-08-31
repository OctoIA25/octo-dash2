-- Documentação do lead a partir da etapa de Propostas (modal de edição do Kanban):
-- CPF vira coluna nas DUAS tabelas-fonte (o modal escreve na tabela de origem do
-- lead — leads OU kenlo_leads) + bucket PRIVADO para upload de documentos.
--
-- ⚠️ Aplicar ANTES do deploy do front: sem as colunas, o UPDATE do modal com cpf
-- falha com 42703 para leads em etapa de proposta.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.kenlo_leads ADD COLUMN IF NOT EXISTS cpf text;

-- Bucket privado (public=false): documentos pessoais do lead saem só por signed URL,
-- nunca por URL pública — diferente do whatsapp-media, que a Meta precisa baixar.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-documentos',
  'lead-documentos',
  false,
  20971520, -- 20MB por arquivo
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies com recorte de TENANT pelo path (tenant/lead/arquivo): 'authenticated'
-- puro deixaria qualquer usuário logado de OUTRA imobiliária listar/baixar/apagar
-- CPFs e documentos alheios (BOLA cross-tenant). O 1º segmento do path é o
-- tenant_id; comparação como TEXT (sem ::uuid) para um path fora do formato
-- nunca derrubar a query. Owner da plataforma passa por is_platform_owner()
-- (helper da 20260528).

DROP POLICY IF EXISTS "Authenticated users can upload lead documentos" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead documentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lead-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view lead documentos" ON storage.objects;
CREATE POLICY "Authenticated users can view lead documentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lead-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update lead documentos" ON storage.objects;
CREATE POLICY "Authenticated users can update lead documentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lead-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'lead-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete lead documentos" ON storage.objects;
CREATE POLICY "Authenticated users can delete lead documentos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lead-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

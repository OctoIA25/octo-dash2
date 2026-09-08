-- =============================================================================
-- Dados cadastrais do corretor (RG, CPF, nascimento, endereço, CNPJ, recebimento)
-- + bucket privado para o Termo de Associação.
--
-- ⚠️ ORDEM DE DEPLOY: rodar ANTES do deploy do front. Sem a tabela, a seção
-- "Dados cadastrais" do modal de Gestão de Equipe falha com 42P01.
--
-- POR QUE TABELA SEPARADA, e não colunas em tenant_memberships (como o creci):
-- tenant_memberships é legível com a ANON KEY (verificado: GET /rest/v1/
-- tenant_memberships responde 200 sem JWT). A anon key vai no bundle do front,
-- ou seja: qualquer pessoa com a URL do app leria CPF, RG, endereço e conta
-- bancária de todos os corretores. PII fica em tabela própria, com RLS que só
-- libera para o próprio corretor e para admin/owner do mesmo tenant.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_member_dados (
  tenant_id       uuid NOT NULL,
  user_id         uuid NOT NULL,
  rg              text,
  cpf             text,
  data_nascimento date,
  endereco        text,
  cnpj            text,
  -- Dados de recebimento: mesmo formato que o Termo de Comissão já pede na mão
  -- (TermoComissaoDialog), para poder prefilar o termo depois.
  pix_chave       text,
  banco           text,
  agencia         text,
  conta           text,
  titular         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  -- Chave por (tenant, usuário) e não por membership.id: o id da membership
  -- muda se o membro for removido e readicionado; o vínculo pessoa↔tenant não.
  PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.tenant_member_dados IS
  'PII do corretor (RG/CPF/endereço/dados bancários). Fora de tenant_memberships porque aquela tabela é legível pela anon key.';

ALTER TABLE public.tenant_member_dados ENABLE ROW LEVEL SECURITY;

-- Cinto e suspensório: mesmo sem policy para anon, nega o acesso no nível do GRANT.
REVOKE ALL ON public.tenant_member_dados FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_member_dados TO authenticated;

-- Quem enxerga: o próprio corretor, admin/owner do mesmo tenant, owner da plataforma.
DROP POLICY IF EXISTS "member dados: self or tenant admin" ON public.tenant_member_dados;
CREATE POLICY "member dados: self or tenant admin"
  ON public.tenant_member_dados FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
       WHERE tm.user_id = auth.uid()
         AND tm.tenant_id = tenant_member_dados.tenant_id
         AND tm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
       WHERE tm.user_id = auth.uid()
         AND tm.tenant_id = tenant_member_dados.tenant_id
         AND tm.role IN ('admin', 'owner')
    )
  );

-- =============================================================================
-- Bucket do Termo de Associação — privado, path `tenant_id/user_id/arquivo`.
-- Mesmo desenho do bucket lead-documentos (20260824), com um recorte a mais:
-- lá qualquer membro do tenant lê; aqui é contrato pessoal, então só o próprio
-- corretor (2º segmento do path = auth.uid()) e admin/owner do tenant.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'corretor-documentos',
  'corretor-documentos',
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

DROP POLICY IF EXISTS "corretor docs upload" ON storage.objects;
CREATE POLICY "corretor docs upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'corretor-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'owner')
      )
    )
  );

DROP POLICY IF EXISTS "corretor docs select" ON storage.objects;
CREATE POLICY "corretor docs select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'corretor-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'owner')
      )
    )
  );

DROP POLICY IF EXISTS "corretor docs update" ON storage.objects;
CREATE POLICY "corretor docs update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'corretor-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'owner')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'corretor-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'owner')
      )
    )
  );

DROP POLICY IF EXISTS "corretor docs delete" ON storage.objects;
CREATE POLICY "corretor docs delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'corretor-documentos' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'owner')
      )
    )
  );

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.tenant_member_dados;
--   DROP POLICY IF EXISTS "corretor docs upload" ON storage.objects;  (idem select/update/delete)
--   DELETE FROM storage.buckets WHERE id = 'corretor-documentos';  -- só com o bucket vazio

-- Tabela de importacoes GENERICAS de planilhas (qualquer topico, schema-less).
--
-- Diferente de excel_imports (modelada para corretor/meses), aqui a planilha e
-- guardada como representacao generica em JSONB: columns + rows + metadata. Isso
-- permite importar planilhas de qualquer dominio sem alterar schema.
--
-- Seguranca: mesmo isolamento por tenant de excel_imports (dado pode ser sensivel).
-- Acesso restrito a admin/team_leader/owner do tenant OU owner da plataforma —
-- coerente com a permissao 'excel' que governa a feature de importacao.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.generic_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  nome_arquivo  TEXT,
  sheet_name    TEXT,
  -- Estrutura descoberta: [{ name, label, index }, ...]
  columns       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Linhas: [{ <colName>: <value>, ... }, ...]
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Metadados por coluna: [{ name, type, numeric, ... }, ...]
  metadata      JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  truncated     BOOLEAN NOT NULL DEFAULT false,
  criado_por    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generic_imports_tenant_idx
  ON public.generic_imports (tenant_id, created_at DESC);

-- GIN para consultas futuras sobre o conteudo JSONB (ex.: filtrar por coluna).
CREATE INDEX IF NOT EXISTS generic_imports_metadata_gin
  ON public.generic_imports USING gin (metadata);

-- ── RLS (espelha o padrao seguro de excel_imports_tenant_isolation) ──────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generic_imports'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.generic_imports', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.generic_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generic_imports_tenant_isolation" ON public.generic_imports;
CREATE POLICY "generic_imports_tenant_isolation"
  ON public.generic_imports
  FOR ALL
  TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = generic_imports.tenant_id::text
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    )
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = generic_imports.tenant_id::text
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    )
  );

COMMENT ON POLICY "generic_imports_tenant_isolation" ON public.generic_imports IS
  'Isolamento por tenant (tenant_memberships, cast tenant_id::text) ou owner da plataforma. Mesmo nivel de acesso de excel_imports.';

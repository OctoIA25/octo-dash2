-- Migration: Criar tabela para Lançamentos (empreendimentos novos)
-- Data: 2026-05-20
-- Descrição: Armazena lançamentos imobiliários: nome, book em PDF, fotos e texto descritivo.

CREATE TABLE IF NOT EXISTS lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  nome TEXT NOT NULL,
  descricao TEXT,

  -- PDF do book (armazenado como data URL base64)
  book_pdf TEXT,
  book_pdf_filename TEXT,

  -- Fotos no mesmo formato usado em imoveis_locais/condominios
  -- [{ url: string, legenda?: string, isCapa?: boolean }, ...]
  fotos JSONB DEFAULT '[]'::jsonb,

  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant ON lancamentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_criado_por ON lancamentos(criado_por);

ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver lançamentos do tenant" ON lancamentos
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Membros podem criar lançamentos" ON lancamentos
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Membros podem atualizar lançamentos do tenant" ON lancamentos
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Membros podem deletar lançamentos do tenant" ON lancamentos
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

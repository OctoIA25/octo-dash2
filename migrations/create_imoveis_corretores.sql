-- Migration: Criar tabela imoveis_corretores
-- Esta tabela mapeia códigos de imóveis para seus corretores responsáveis
-- Usada pela API para atribuição automática de corretor ao criar leads

CREATE TABLE IF NOT EXISTS imoveis_corretores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  codigo_imovel TEXT NOT NULL,
  corretor_nome TEXT,
  corretor_email TEXT,
  corretor_telefone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint para garantir unicidade por tenant + código do imóvel
  CONSTRAINT imoveis_corretores_tenant_codigo_unique UNIQUE (tenant_id, codigo_imovel)
);

-- Índices para melhorar performance de busca
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_tenant_id ON imoveis_corretores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_codigo ON imoveis_corretores(codigo_imovel);

-- RLS (Row Level Security)
ALTER TABLE imoveis_corretores ENABLE ROW LEVEL SECURITY;

-- Policy para permitir todas as operações (ajustar conforme necessidade)
CREATE POLICY "Enable all access for authenticated users" ON imoveis_corretores
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comentário na tabela
COMMENT ON TABLE imoveis_corretores IS 'Mapeamento de imóveis para corretores responsáveis - usado para atribuição automática de leads';

-- Migration: Criar tabela para imóveis criados localmente
-- Data: 2026-03-04
-- Descrição: Armazena imóveis criados diretamente no sistema (não vindos do XML)

CREATE TABLE IF NOT EXISTS imoveis_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  codigo_imovel TEXT NOT NULL,
  
  -- Dados básicos
  titulo TEXT,
  tipo TEXT,
  tipo_simplificado TEXT DEFAULT 'outro',
  finalidade TEXT DEFAULT 'venda',
  
  -- Localização
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT DEFAULT 'SP',
  cep TEXT,
  
  -- Características
  area_total NUMERIC DEFAULT 0,
  area_util NUMERIC DEFAULT 0,
  quartos INTEGER DEFAULT 0,
  suites INTEGER DEFAULT 0,
  banheiros INTEGER DEFAULT 0,
  vagas INTEGER DEFAULT 0,
  salas INTEGER DEFAULT 0,
  
  -- Valores
  valor_venda NUMERIC DEFAULT 0,
  valor_locacao NUMERIC DEFAULT 0,
  valor_condominio NUMERIC DEFAULT 0,
  valor_iptu NUMERIC DEFAULT 0,
  
  -- Descrição e mídia
  descricao TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  
  -- Proprietário
  proprietario_nome TEXT,
  proprietario_telefone TEXT,
  proprietario_email TEXT,
  
  -- Metadados
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, codigo_imovel)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_tenant ON imoveis_locais(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_codigo ON imoveis_locais(codigo_imovel);
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_criado_por ON imoveis_locais(criado_por);

-- RLS
ALTER TABLE imoveis_locais ENABLE ROW LEVEL SECURITY;

-- Política para membros do tenant verem imóveis do tenant
CREATE POLICY "Membros podem ver imóveis do tenant" ON imoveis_locais
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- Política para membros inserirem imóveis
CREATE POLICY "Membros podem criar imóveis" ON imoveis_locais
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- Política para membros atualizarem imóveis do tenant
CREATE POLICY "Membros podem atualizar imóveis do tenant" ON imoveis_locais
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- Política para membros deletarem imóveis do tenant
CREATE POLICY "Membros podem deletar imóveis do tenant" ON imoveis_locais
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

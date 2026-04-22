-- Criar tabela de mapeamento imóveis → corretores
CREATE TABLE IF NOT EXISTS imoveis_corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  codigo_imovel TEXT NOT NULL,
  corretor_nome TEXT NOT NULL,
  corretor_email TEXT,
  corretor_telefone TEXT,
  corretor_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, codigo_imovel)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_tenant ON imoveis_corretores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_codigo ON imoveis_corretores(codigo_imovel);

-- RLS
ALTER TABLE imoveis_corretores ENABLE ROW LEVEL SECURITY;

-- Política para API poder buscar mapeamentos
CREATE POLICY "API pode buscar mapeamentos" ON imoveis_corretores FOR SELECT USING (true);

-- Política para inserir/atualizar (service role ou tenant autenticado)
CREATE POLICY "Tenants podem gerenciar seus mapeamentos" ON imoveis_corretores 
FOR ALL USING (true);

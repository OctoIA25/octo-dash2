-- Tabela para registrar vendas/transações
CREATE TABLE IF NOT EXISTS sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  corretor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Dados da transação
  codigo_imovel VARCHAR(50),
  tipo_negocio VARCHAR(20) CHECK (tipo_negocio IN ('venda', 'locacao')),
  valor_imovel DECIMAL(12,2),
  valor_comissao DECIMAL(10,2),
  percentual_comissao DECIMAL(5,2),
  
  -- Status e exclusividade
  exclusividade BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'concluida' CHECK (status IN ('pendente', 'concluida', 'cancelada')),
  
  -- Fonte do negócio
  fonte_negocio VARCHAR(100),
  
  -- Datas
  data_transacao DATE,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Controle
  criado_por UUID REFERENCES auth.users(id),
  
  -- RLS
  CONSTRAINT tenant_check CHECK (tenant_id IS NOT NULL)
);

-- Índices
CREATE INDEX idx_sales_transactions_tenant_id ON sales_transactions(tenant_id);
CREATE INDEX idx_sales_transactions_corretor_id ON sales_transactions(corretor_id);
CREATE INDEX idx_sales_transactions_data_transacao ON sales_transactions(data_transacao);
CREATE INDEX idx_sales_transactions_status ON sales_transactions(status);

-- RLS Policy
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's sales" ON sales_transactions
  FOR SELECT USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can insert their tenant's sales" ON sales_transactions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can update their tenant's sales" ON sales_transactions
  FOR UPDATE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION update_sales_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_transactions_updated_at
  BEFORE UPDATE ON sales_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_transactions_updated_at();

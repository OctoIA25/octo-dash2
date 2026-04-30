-- Tabela para métricas e performance de corretores
CREATE TABLE IF NOT EXISTS corretor_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  corretor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Período de referência
  ano INTEGER,
  mes INTEGER,
  
  -- Métricas de vendas
  vendas_criadas INTEGER DEFAULT 0,
  vendas_assinadas INTEGER DEFAULT 0,
  valor_total_vendas DECIMAL(12,2) DEFAULT 0,
  
  -- Métricas de leads
  total_leads_recebidos INTEGER DEFAULT 0,
  total_leads_interagidos INTEGER DEFAULT 0,
  taxa_interacao DECIMAL(5,2) DEFAULT 0,
  tempo_medio_resposta INTEGER DEFAULT 0, -- em minutos
  
  -- Métricas de conversão
  visitas_realizadas INTEGER DEFAULT 0,
  taxa_conversao_visitas DECIMAL(5,2) DEFAULT 0,
  taxa_conversao_vendas DECIMAL(5,2) DEFAULT 0,
  
  -- Portfolio
  imoveis_ativos INTEGER DEFAULT 0,
  imoveis_exclusivos INTEGER DEFAULT 0,
  imoveis_ficha INTEGER DEFAULT 0,
  
  -- Gestão
  gestao_ativa INTEGER DEFAULT 0,
  participacao_treinamentos INTEGER DEFAULT 0,
  
  -- Metas
  meta_vendas DECIMAL(10,2),
  meta_comissao DECIMAL(10,2),
  percentual_atingimento_meta DECIMAL(5,2) DEFAULT 0,
  
  -- Datas
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Controle
  criado_por UUID REFERENCES auth.users(id),
  
  -- RLS e unicidade
  CONSTRAINT tenant_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT corretor_periodo_unique UNIQUE (tenant_id, corretor_id, ano, mes)
);

-- Índices
CREATE INDEX idx_corretor_metrics_tenant_id ON corretor_metrics(tenant_id);
CREATE INDEX idx_corretor_metrics_corretor_id ON corretor_metrics(corretor_id);
CREATE INDEX idx_corretor_metrics_periodo ON corretor_metrics(ano, mes);
CREATE INDEX idx_corretor_metrics_performance ON corretor_metrics(vendas_assinadas DESC, valor_total_vendas DESC);

-- RLS Policy
ALTER TABLE corretor_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's metrics" ON corretor_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can insert their tenant's metrics" ON corretor_metrics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can update their tenant's metrics" ON corretor_metrics
  FOR UPDATE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION update_corretor_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corretor_metrics_updated_at
  BEFORE UPDATE ON corretor_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_corretor_metrics_updated_at();

-- Função para calcular métricas automaticamente
CREATE OR REPLACE FUNCTION calcular_corretor_metrics(
  p_tenant_id UUID,
  p_corretor_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_vendas_criadas INTEGER;
  v_vendas_assinadas INTEGER;
  v_valor_total_vendas DECIMAL;
  v_total_leads INTEGER;
  v_leads_interagidos INTEGER;
  v_visitas_realizadas INTEGER;
  v_imoveis_ativos INTEGER;
  v_imoveis_exclusivos INTEGER;
  v_imoveis_ficha INTEGER;
BEGIN
  -- Contar vendas do período
  SELECT COUNT(*), COALESCE(SUM(valor_imovel), 0)
  INTO v_vendas_assinadas, v_valor_total_vendas
  FROM sales_transactions
  WHERE tenant_id = p_tenant_id
    AND corretor_id = p_corretor_id
    AND EXTRACT(YEAR FROM data_transacao) = p_ano
    AND EXTRACT(MONTH FROM data_transacao) = p_mes
    AND status = 'concluida';
  
  -- Contar leads do período
  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE tenant_id = p_tenant_id
    AND attended_by_id = p_corretor_id
    AND EXTRACT(YEAR FROM created_at) = p_ano
    AND EXTRACT(MONTH FROM created_at) = p_mes;
  
  -- Contar leads interagidos
  SELECT COUNT(*)
  INTO v_leads_interagidos
  FROM leads
  WHERE tenant_id = p_tenant_id
    AND attended_by_id = p_corretor_id
    AND first_interaction_at IS NOT NULL
    AND EXTRACT(YEAR FROM first_interaction_at) = p_ano
    AND EXTRACT(MONTH FROM first_interaction_at) = p_mes;
  
  -- Contar imóveis ativos
  SELECT COUNT(*)
  INTO v_imoveis_ativos
  FROM imoveis
  WHERE tenant_id = p_tenant_id
    AND corretor_id = p_corretor_id
    AND status = 'ativo';
  
  -- Contar imóveis exclusivos
  SELECT COUNT(*)
  INTO v_imoveis_exclusivos
  FROM imoveis
  WHERE tenant_id = p_tenant_id
    AND corretor_id = p_corretor_id
    AND status = 'ativo'
    AND exclusividade = true;
  
  -- Inserir ou atualizar métricas
  INSERT INTO corretor_metrics (
    tenant_id, corretor_id, ano, mes,
    vendas_assinadas, valor_total_vendas,
    total_leads_recebidos, total_leads_interagidos,
    imoveis_ativos, imoveis_exclusivos
  ) VALUES (
    p_tenant_id, p_corretor_id, p_ano, p_mes,
    v_vendas_assinadas, v_valor_total_vendas,
    v_total_leads, v_leads_interagidos,
    v_imoveis_ativos, v_imoveis_exclusivos
  )
  ON CONFLICT (tenant_id, corretor_id, ano, mes)
  DO UPDATE SET
    vendas_assinadas = EXCLUDED.vendas_assinadas,
    valor_total_vendas = EXCLUDED.valor_total_vendas,
    total_leads_recebidos = EXCLUDED.total_leads_recebidos,
    total_leads_interagidos = EXCLUDED.total_leads_interagidos,
    imoveis_ativos = EXCLUDED.imoveis_ativos,
    imoveis_exclusivos = EXCLUDED.imoveis_exclusivos,
    data_atualizacao = NOW();
END;
$$ LANGUAGE plpgsql;

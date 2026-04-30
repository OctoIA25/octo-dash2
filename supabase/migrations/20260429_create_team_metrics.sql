-- Tabela para métricas agregadas por equipe
CREATE TABLE IF NOT EXISTS team_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Identificação da equipe (baseado no tenant_memberships)
  equipe_id UUID, -- ID da equipe (UUID)
  nome_equipe VARCHAR(100),
  
  -- Período de referência
  ano INTEGER,
  mes INTEGER,
  
  -- Métricas agregadas
  total_corretores INTEGER DEFAULT 0,
  vendas_criadas INTEGER DEFAULT 0,
  vendas_assinadas INTEGER DEFAULT 0,
  valor_total_vendas DECIMAL(12,2) DEFAULT 0,
  
  -- Métricas de leads
  total_leads_recebidos INTEGER DEFAULT 0,
  total_leads_interagidos INTEGER DEFAULT 0,
  taxa_interacao_geral DECIMAL(5,2) DEFAULT 0,
  tempo_medio_resposta_equipe INTEGER DEFAULT 0,
  
  -- Portfolio
  imoveis_ativos INTEGER DEFAULT 0,
  imoveis_exclusivos INTEGER DEFAULT 0,
  
  -- Performance
  taxa_conversao_visitas DECIMAL(5,2) DEFAULT 0,
  taxa_conversao_vendas DECIMAL(5,2) DEFAULT 0,
  
  -- Ativações
  imoveis_ativados_mes INTEGER DEFAULT 0,
  
  -- Datas
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Controle
  criado_por UUID REFERENCES auth.users(id),
  
  -- RLS e unicidade
  CONSTRAINT tenant_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT equipe_periodo_unique UNIQUE (tenant_id, equipe_id, ano, mes)
);

-- Índices
CREATE INDEX idx_team_metrics_tenant_id ON team_metrics(tenant_id);
CREATE INDEX idx_team_metrics_equipe_id ON team_metrics(equipe_id);
CREATE INDEX idx_team_metrics_periodo ON team_metrics(ano, mes);
CREATE INDEX idx_team_metrics_performance ON team_metrics(vendas_assinadas DESC, valor_total_vendas DESC);

-- RLS Policy
ALTER TABLE team_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's team metrics" ON team_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can insert their tenant's team metrics" ON team_metrics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can update their tenant's team metrics" ON team_metrics
  FOR UPDATE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION update_team_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_metrics_updated_at
  BEFORE UPDATE ON team_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_team_metrics_updated_at();

-- Função para calcular métricas da equipe automaticamente
CREATE OR REPLACE FUNCTION calcular_team_metrics(
  p_tenant_id UUID,
  p_equipe_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_total_corretores INTEGER;
  v_vendas_criadas INTEGER;
  v_vendas_assinadas INTEGER;
  v_valor_total_vendas DECIMAL;
  v_total_leads INTEGER;
  v_leads_interagidos INTEGER;
  v_tempo_medio_resposta INTEGER;
  v_imoveis_ativos INTEGER;
  v_imoveis_exclusivos INTEGER;
  v_imoveis_ativados INTEGER;
BEGIN
  -- Contar corretores da equipe
  SELECT COUNT(*)
  INTO v_total_corretores
  FROM tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND team_id = p_equipe_id
    AND role IN ('corretor', 'admin')
    AND status = 'active';
  
  -- Agregar vendas da equipe
  SELECT COUNT(*), COALESCE(SUM(valor_imovel), 0)
  INTO v_vendas_assinadas, v_valor_total_vendas
  FROM sales_transactions st
  JOIN tenant_memberships tm ON st.corretor_id = tm.user_id
  WHERE st.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND EXTRACT(YEAR FROM st.data_transacao) = p_ano
    AND EXTRACT(MONTH FROM st.data_transacao) = p_mes
    AND st.status = 'concluida';
  
  -- Agregar leads da equipe
  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads l
  JOIN tenant_memberships tm ON l.attended_by_id = tm.user_id
  WHERE l.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND EXTRACT(YEAR FROM l.created_at) = p_ano
    AND EXTRACT(MONTH FROM l.created_at) = p_mes;
  
  -- Agregar leads interagidos
  SELECT COUNT(*)
  INTO v_leads_interagidos
  FROM leads l
  JOIN tenant_memberships tm ON l.attended_by_id = tm.user_id
  WHERE l.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND l.first_interaction_at IS NOT NULL
    AND EXTRACT(YEAR FROM l.first_interaction_at) = p_ano
    AND EXTRACT(MONTH FROM l.first_interaction_at) = p_mes;
  
  -- Calcular tempo médio de resposta
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (first_interaction_at - created_at)) / 60
  ), 0)::INTEGER
  INTO v_tempo_medio_resposta
  FROM leads l
  JOIN tenant_memberships tm ON l.attended_by_id = tm.user_id
  WHERE l.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND l.first_interaction_at IS NOT NULL
    AND EXTRACT(YEAR FROM l.created_at) = p_ano
    AND EXTRACT(MONTH FROM l.created_at) = p_mes;
  
  -- Contar imóveis ativos da equipe
  SELECT COUNT(*)
  INTO v_imoveis_ativos
  FROM imoveis i
  JOIN tenant_memberships tm ON i.corretor_id = tm.user_id
  WHERE i.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND i.status = 'ativo';
  
  -- Contar imóveis exclusivos da equipe
  SELECT COUNT(*)
  INTO v_imoveis_exclusivos
  FROM imoveis i
  JOIN tenant_memberships tm ON i.corretor_id = tm.user_id
  WHERE i.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND i.status = 'ativo'
    AND i.exclusividade = true;
  
  -- Contar imóveis ativados no mês
  SELECT COUNT(*)
  INTO v_imoveis_ativados
  FROM imoveis i
  JOIN tenant_memberships tm ON i.corretor_id = tm.user_id
  WHERE i.tenant_id = p_tenant_id
    AND tm.team_id = p_equipe_id
    AND i.status = 'ativo'
    AND EXTRACT(YEAR FROM i.created_at) = p_ano
    AND EXTRACT(MONTH FROM i.created_at) = p_mes;
  
  -- Inserir ou atualizar métricas
  INSERT INTO team_metrics (
    tenant_id, equipe_id, nome_equipe, ano, mes,
    total_corretores, vendas_assinadas, valor_total_vendas,
    total_leads_recebidos, total_leads_interagidos,
    tempo_medio_resposta_equipe, imoveis_ativos, imoveis_exclusivos,
    imoveis_ativados_mes
  ) VALUES (
    p_tenant_id, p_equipe_id, 
    p_equipe_id,
    p_ano, p_mes,
    v_total_corretores, v_vendas_assinadas, v_valor_total_vendas,
    v_total_leads, v_leads_interagidos,
    v_tempo_medio_resposta, v_imoveis_ativos, v_imoveis_exclusivos,
    v_imoveis_ativados
  )
  ON CONFLICT (tenant_id, equipe_id, ano, mes)
  DO UPDATE SET
    total_corretores = EXCLUDED.total_corretores,
    vendas_assinadas = EXCLUDED.vendas_assinadas,
    valor_total_vendas = EXCLUDED.valor_total_vendas,
    total_leads_recebidos = EXCLUDED.total_leads_recebidos,
    total_leads_interagidos = EXCLUDED.total_leads_interagidos,
    tempo_medio_resposta_equipe = EXCLUDED.tempo_medio_resposta_equipe,
    imoveis_ativos = EXCLUDED.imoveis_ativos,
    imoveis_exclusivos = EXCLUDED.imoveis_exclusivos,
    imoveis_ativados_mes = EXCLUDED.imoveis_ativados_mes,
    data_atualizacao = NOW();
END;
$$ LANGUAGE plpgsql;

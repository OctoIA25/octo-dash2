-- Criar tabela recruitment_candidates
CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Informações Básicas
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  cargo TEXT NOT NULL DEFAULT 'Corretor Júnior',
  experiencia TEXT,
  linkedin TEXT,
  curriculo TEXT,
  observacoes TEXT,
  
  -- Status do Recrutamento
  status TEXT NOT NULL DEFAULT 'Lead' CHECK (status IN ('Lead', 'Interação', 'Reunião', 'Onboard', 'Aprovado', 'Rejeitado')),
  data_inscricao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Busca e filtros
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(nome, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(email, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(cargo, '')), 'C') ||
    setweight(to_tsvector('portuguese', coalesce(experiencia, '')), 'D')
  ) STORED
);

-- Criar tabela recruitment_stages para rastrear jornada do candidato
CREATE TABLE IF NOT EXISTS recruitment_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES recruitment_candidates(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  etapa TEXT NOT NULL,
  data TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responsavel TEXT,
  notas TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_tenant_id ON recruitment_candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_status ON recruitment_candidates(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_cargo ON recruitment_candidates(cargo);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_data_inscricao ON recruitment_candidates(data_inscricao);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_search_vector ON recruitment_candidates USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_recruitment_stages_candidate_id ON recruitment_stages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_stages_tenant_id ON recruitment_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_stages_etapa ON recruitment_stages(etapa);

-- Habilitar Row Level Security
ALTER TABLE recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_stages ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para recruitment_candidates
DROP POLICY IF EXISTS "Tenants can view their candidates" ON recruitment_candidates;
CREATE POLICY "Tenants can view their candidates" ON recruitment_candidates
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can insert their candidates" ON recruitment_candidates;
CREATE POLICY "Tenants can insert their candidates" ON recruitment_candidates
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can update their candidates" ON recruitment_candidates;
CREATE POLICY "Tenants can update their candidates" ON recruitment_candidates
  FOR UPDATE USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can delete their candidates" ON recruitment_candidates;
CREATE POLICY "Tenants can delete their candidates" ON recruitment_candidates
  FOR DELETE USING (tenant_id = auth.uid());

-- Políticas RLS para recruitment_stages
DROP POLICY IF EXISTS "Tenants can view their candidate stages" ON recruitment_stages;
CREATE POLICY "Tenants can view their candidate stages" ON recruitment_stages
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can insert their candidate stages" ON recruitment_stages;
CREATE POLICY "Tenants can insert their candidate stages" ON recruitment_stages
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can update their candidate stages" ON recruitment_stages;
CREATE POLICY "Tenants can update their candidate stages" ON recruitment_stages
  FOR UPDATE USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Tenants can delete their candidate stages" ON recruitment_stages;
CREATE POLICY "Tenants can delete their candidate stages" ON recruitment_stages
  FOR DELETE USING (tenant_id = auth.uid());

-- Função para atualizar timestamp updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at (CORRIGIDO - Sem IF NOT EXISTS)
DROP TRIGGER IF EXISTS update_recruitment_candidates_updated_at ON recruitment_candidates;
CREATE TRIGGER update_recruitment_candidates_updated_at 
  BEFORE UPDATE ON recruitment_candidates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recruitment_stages_updated_at ON recruitment_stages;
CREATE TRIGGER update_recruitment_stages_updated_at 
  BEFORE UPDATE ON recruitment_stages 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para criar etapa inicial automaticamente quando candidato é criado
CREATE OR REPLACE FUNCTION create_initial_candidate_stage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO recruitment_stages (candidate_id, tenant_id, etapa, data, responsavel, notas, created_by)
  VALUES (
    NEW.id,
    NEW.tenant_id,
    'Lead',
    NEW.data_inscricao,
    'Sistema',
    'Cadastro via sistema',
    NEW.created_by
  );
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para criar etapa inicial (CORRIGIDO - Sem IF NOT EXISTS)
DROP TRIGGER IF EXISTS create_initial_stage_trigger ON recruitment_candidates;
CREATE TRIGGER create_initial_stage_trigger
  AFTER INSERT ON recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION create_initial_candidate_stage();

-- Função auxiliar para buscar candidatos
CREATE OR REPLACE FUNCTION search_candidates(
  p_tenant_id UUID,
  p_search_query TEXT DEFAULT '',
  p_status TEXT DEFAULT NULL,
  p_cargo TEXT DEFAULT NULL,
  p_experiencia TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  status TEXT,
  data_inscricao TIMESTAMP WITH TIME ZONE,
  experiencia TEXT,
  linkedin TEXT,
  curriculo TEXT,
  observacoes TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.email,
    c.telefone,
    c.cargo,
    c.status,
    c.data_inscricao,
    c.experiencia,
    c.linkedin,
    c.curriculo,
    c.observacoes,
    ts_rank(c.search_vector, plainto_tsquery('portuguese', p_search_query)) as rank
  FROM recruitment_candidates c
  WHERE c.tenant_id = p_tenant_id
    AND (p_search_query = '' OR c.search_vector @@ plainto_tsquery('portuguese', p_search_query))
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_cargo IS NULL OR c.cargo = p_cargo)
    AND (p_experiencia IS NULL OR c.experiencia = p_experiencia)
  ORDER BY 
    CASE WHEN p_search_query != '' THEN ts_rank(c.search_vector, plainto_tsquery('portuguese', p_search_query)) END DESC NULLS LAST,
    c.data_inscricao DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter métricas de recrutamento
CREATE OR REPLACE FUNCTION get_recruitment_metrics(p_tenant_id UUID)
RETURNS TABLE (
  total_candidates BIGINT,
  lead_count BIGINT,
  interaction_count BIGINT,
  meeting_count BIGINT,
  onboard_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  conversion_rate DECIMAL,
  avg_process_days DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH candidate_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'Lead') as leads,
      COUNT(*) FILTER (WHERE status = 'Interação') as interactions,
      COUNT(*) FILTER (WHERE status = 'Reunião') as meetings,
      COUNT(*) FILTER (WHERE status = 'Onboard') as onboard,
      COUNT(*) FILTER (WHERE status = 'Aprovado') as approved,
      COUNT(*) FILTER (WHERE status = 'Rejeitado') as rejected,
      AVG(EXTRACT(DAY FROM (updated_at - created_at))) FILTER (WHERE status IN ('Aprovado', 'Rejeitado')) as avg_days
    FROM recruitment_candidates 
    WHERE tenant_id = p_tenant_id
  )
  SELECT 
    total,
    leads,
    interactions,
    meetings,
    onboard,
    approved,
    rejected,
    CASE WHEN total > 0 THEN ROUND((approved::DECIMAL / total) * 100, 2) ELSE 0 END as conversion_rate,
    COALESCE(avg_days, 0) as avg_process_days
  FROM candidate_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
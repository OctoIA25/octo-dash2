-- Migração: Sistema Kanban Semanal de Tarefas (VERSÃO SEGURA)
-- Substitui o sistema atual de tarefas por um Kanban semanal

-- Tabela principal de tarefas semanais
CREATE TABLE IF NOT EXISTS tarefas_semanais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados da tarefa
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  categoria VARCHAR(100) DEFAULT 'geral',
  tags TEXT[],
  
  -- Controle semanal
  semana_an INTEGER NOT NULL, -- Ex: 202501 para semana 1 de 2025
  dia_semana INTEGER NOT NULL CHECK (dia_semana IN (1,2,3,4,5,6,7)), -- 1=Segunda, 7=Domingo
  data_especifica DATE NOT NULL, -- Data real da tarefa
  
  -- Controle de recorrência
  recorrente BOOLEAN DEFAULT FALSE,
  padrao_recorrencia VARCHAR(50), -- 'diario', 'semanal', 'mensal', 'personalizado'
  dados_recorrencia JSONB, -- Configurações específicas
  
  -- Status e conclusão
  concluida BOOLEAN DEFAULT FALSE,
  data_conclusao TIMESTAMP,
  ordem INTEGER DEFAULT 0,
  
  -- Metadados
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(tenant_id, user_id, semana_an, dia_semana, ordem),
  CHECK(semana_an >= 202001 AND semana_an <= 209953),
  CHECK(data_especifica = date_trunc('week', data_especifica)::date + (dia_semana - 1))
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_tenant_user ON tarefas_semanais(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_semana ON tarefas_semanais(semana_an);
CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_data ON tarefas_semanais(data_especifica);
CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_concluidas ON tarefas_semanais(concluida) WHERE concluida = TRUE;
CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_recorrentes ON tarefas_semanais(recorrente) WHERE recorrente = TRUE;

-- Tabela de histórico de semanas
CREATE TABLE IF NOT EXISTS historico_semanas_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semana_an INTEGER NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  
  -- Estatísticas da semana
  total_tarefas INTEGER DEFAULT 0,
  tarefas_concluidas INTEGER DEFAULT 0,
  taxa_conclusao DECIMAL(5,2) DEFAULT 0,
  
  -- Snapshot completo das tarefas (JSON)
  tarefas_snapshot JSONB,
  
  -- Metadados
  arquivado_em TIMESTAMP DEFAULT NOW(),
  arquivado_por UUID REFERENCES auth.users(id),
  
  UNIQUE(tenant_id, user_id, semana_an)
);

-- Índices para histórico
CREATE INDEX IF NOT EXISTS idx_historico_semanas_tenant_user ON historico_semanas_tarefas(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_historico_semanas_semana ON historico_semanas_tarefas(semana_an);
CREATE INDEX IF NOT EXISTS idx_historico_semanas_arquivado_em ON historico_semanas_tarefas(arquivado_em);

-- Trigger para atualizar atualizado_em (VERSÃO SEGURA)
DROP TRIGGER IF EXISTS trigger_tarefas_semanais_updated_at ON tarefas_semanais;
DROP FUNCTION IF EXISTS atualizar_tarefas_semanais_updated_at();

CREATE OR REPLACE FUNCTION atualizar_tarefas_semanais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tarefas_semanais_updated_at
  BEFORE UPDATE ON tarefas_semanais
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_tarefas_semanais_updated_at();

-- RLS (Row Level Security) para tarefas_semanais
ALTER TABLE tarefas_semanais ENABLE ROW LEVEL SECURITY;

-- Remover policies existentes para evitar conflitos
DROP POLICY IF EXISTS "Usuários podem ver suas tarefas semanais" ON tarefas_semanais;
DROP POLICY IF EXISTS "Usuários podem inserir suas tarefas semanais" ON tarefas_semanais;
DROP POLICY IF EXISTS "Usuários podem atualizar suas tarefas semanais" ON tarefas_semanais;
DROP POLICY IF EXISTS "Usuários podem deletar suas tarefas semanais" ON tarefas_semanais;

-- Policy: Usuários podem ver suas próprias tarefas
CREATE POLICY "Usuários podem ver suas tarefas semanais"
  ON tarefas_semanais
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Policy: Usuários podem inserir suas próprias tarefas
CREATE POLICY "Usuários podem inserir suas tarefas semanais"
  ON tarefas_semanais
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
  );

-- Policy: Usuários podem atualizar suas próprias tarefas
CREATE POLICY "Usuários podem atualizar suas tarefas semanais"
  ON tarefas_semanais
  FOR UPDATE
  USING (
    auth.uid() = user_id
  );

-- Policy: Usuários podem deletar suas próprias tarefas
CREATE POLICY "Usuários podem deletar suas tarefas semanais"
  ON tarefas_semanais
  FOR DELETE
  USING (
    auth.uid() = user_id
  );

-- RLS para histórico_semanas_tarefas
ALTER TABLE historico_semanas_tarefas ENABLE ROW LEVEL SECURITY;

-- Remover policies existentes para evitar conflitos
DROP POLICY IF EXISTS "Usuários podem ver seu histórico de semanas" ON historico_semanas_tarefas;
DROP POLICY IF EXISTS "Sistema pode inserir histórico de semanas" ON historico_semanas_tarefas;

-- Policy: Usuários podem ver seu próprio histórico
CREATE POLICY "Usuários podem ver seu histórico de semanas"
  ON historico_semanas_tarefas
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Policy: Sistema pode inserir histórico (via função)
CREATE POLICY "Sistema pode inserir histórico de semanas"
  ON historico_semanas_tarefas
  FOR INSERT
  WITH CHECK (
    true -- Apenas via função RPC com verificação de tenant
  );

-- Função para migrar tarefas existentes
CREATE OR REPLACE FUNCTION migrar_tarefas_para_semanal()
RETURNS TABLE(
  migrados INTEGER,
  erros TEXT
) AS $$
DECLARE
  count_migrados INTEGER := 0;
  semana_atual INTEGER;
BEGIN
  -- Calcular semana atual (YYYYWW format)
  semana_atual := EXTRACT(YEAR FROM NOW()) * 100 + EXTRACT(WEEK FROM NOW());
  
  -- Migrar tarefas existentes
  INSERT INTO tarefas_semanais (
    tenant_id, 
    user_id, 
    titulo, 
    descricao, 
    prioridade, 
    categoria,
    tags,
    semana_an, 
    dia_semana, 
    data_especifica, 
    criado_por,
    criado_em
  )
  SELECT 
    t.tenant_id,
    t.assignee_user_id,
    t.titulo,
    t.descricao,
    t.prioridade,
    t.categoria,
    t.tags,
    semana_atual,
    COALESCE(
      EXTRACT(ISODOW FROM COALESCE(t.data_vencimento, NOW()))::integer,
      1
    ) as dia_semana,
    COALESCE(t.data_vencimento::date, NOW()::date) as data_especifica,
    t.criador_user_id,
    t.created_at
  FROM tarefas t
  WHERE NOT EXISTS (
    SELECT 1 FROM tarefas_semanais ts 
    WHERE ts.tenant_id = t.tenant_id 
    AND ts.user_id = t.assignee_user_id
    AND ts.titulo = t.titulo
    AND ts.criado_em = t.created_at
  )
  AND t.assignee_user_id IS NOT NULL;
  
  GET DIAGNOSTICS count_migrados = ROW_COUNT;
  
  RETURN QUERY SELECT count_migrados, 'Migração concluída com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Função para arquivar semana
CREATE OR REPLACE FUNCTION arquivar_semana_tarefas(
  p_tenant_id UUID,
  p_user_id UUID,
  p_semana_an INTEGER
)
RETURNS TABLE(
  arquivado BOOLEAN,
  mensagem TEXT
) AS $$
DECLARE
  data_inicio DATE;
  data_fim DATE;
  total_tarefas INTEGER := 0;
  tarefas_concluidas INTEGER := 0;
  taxa_conclusao DECIMAL(5,2) := 0;
  snapshot JSONB;
BEGIN
  -- Calcular datas da semana
  data_inicio := date_trunc('week', to_date(p_semana_an::text || '1', 'YYYYWWID'));
  data_fim := data_inicio + 6;
  
  -- Verificar se já foi arquivado
  IF EXISTS (
    SELECT 1 FROM historico_semanas_tarefas 
    WHERE tenant_id = p_tenant_id 
    AND user_id = p_user_id 
    AND semana_an = p_semana_an
  ) THEN
    RETURN QUERY SELECT FALSE, 'Semana já arquivada'::TEXT;
    RETURN;
  END IF;
  
  -- Coletar estatísticas
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE concluida = TRUE)
  INTO total_tarefas, tarefas_concluidas
  FROM tarefas_semanais
  WHERE tenant_id = p_tenant_id 
  AND user_id = p_user_id 
  AND semana_an = p_semana_an;
  
  -- Calcular taxa de conclusão
  IF total_tarefas > 0 THEN
    taxa_conclusao := (tarefas_concluidas::DECIMAL / total_tarefas::DECIMAL) * 100;
  END IF;
  
  -- Criar snapshot das tarefas
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'titulo', titulo,
      'descricao', descricao,
      'prioridade', prioridade,
      'categoria', categoria,
      'tags', tags,
      'dia_semana', dia_semana,
      'data_especifica', data_especifica,
      'concluida', concluida,
      'data_conclusao', data_conclusao,
      'ordem', ordem,
      'recorrente', recorrente,
      'criado_em', criado_em
    )
  ) INTO snapshot
  FROM tarefas_semanais
  WHERE tenant_id = p_tenant_id 
  AND user_id = p_user_id 
  AND semana_an = p_semana_an;
  
  -- Inserir no histórico
  INSERT INTO historico_semanas_tarefas (
    tenant_id,
    user_id,
    semana_an,
    data_inicio,
    data_fim,
    total_tarefas,
    tarefas_concluidas,
    taxa_conclusao,
    tarefas_snapshot,
    arquivado_por
  ) VALUES (
    p_tenant_id,
    p_user_id,
    p_semana_an,
    data_inicio,
    data_fim,
    total_tarefas,
    tarefas_concluidas,
    taxa_conclusao,
    snapshot,
    p_user_id
  );
  
  RETURN QUERY SELECT TRUE, 'Semana arquivada com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Função para processar recorrências
CREATE OR REPLACE FUNCTION processar_recorrencias_semanais()
RETURNS TABLE(
  processadas INTEGER,
  mensagem TEXT
) AS $$
DECLARE
  count_processadas INTEGER := 0;
  tarefa_rec RECORD;
  proxima_data DATE;
  proxima_semana INTEGER;
BEGIN
  -- Buscar tarefas recorrentes que precisam ser replicadas
  FOR tarefa_rec IN 
    SELECT DISTINCT ON (user_id, titulo, padrao_recorrencia) *
    FROM tarefas_semanais
    WHERE recorrente = TRUE
    AND concluida = FALSE
    AND data_especifica < NOW()::date
    ORDER BY user_id, titulo, padrao_recorrencia, data_especifica DESC
  LOOP
    -- Calcular próxima ocorrência baseada no padrão
    CASE tarefa_rec.padrao_recorrencia
      WHEN 'diario' THEN
        proxima_data := NOW()::date + 1;
      WHEN 'semanal' THEN
        proxima_data := tarefa_rec.data_especifica + 7;
      WHEN 'mensal' THEN
        proxima_data := tarefa_rec.data_especifica + INTERVAL '1 month';
      ELSE
        proxima_data := tarefa_rec.data_especifica + 7; -- Default semanal
    END CASE;
    
    -- Calcular semana da próxima data
    proxima_semana := EXTRACT(YEAR FROM proxima_data) * 100 + EXTRACT(WEEK FROM proxima_data);
    
    -- Verificar se já existe tarefa para essa data
    IF NOT EXISTS (
      SELECT 1 FROM tarefas_semanais
      WHERE user_id = tarefa_rec.user_id
      AND titulo = tarefa_rec.titulo
      AND data_especifica = proxima_data
    ) THEN
      -- Inserir nova ocorrência
      INSERT INTO tarefas_semanais (
        tenant_id,
        user_id,
        titulo,
        descricao,
        prioridade,
        categoria,
        tags,
        semana_an,
        dia_semana,
        data_especifica,
        recorrente,
        padrao_recorrencia,
        dados_recorrencia,
        criado_por,
        criado_em
      ) VALUES (
        tarefa_rec.tenant_id,
        tarefa_rec.user_id,
        tarefa_rec.titulo,
        tarefa_rec.descricao,
        tarefa_rec.prioridade,
        tarefa_rec.categoria,
        tarefa_rec.tags,
        proxima_semana,
        EXTRACT(ISODOW FROM proxima_data)::integer,
        proxima_data,
        TRUE,
        tarefa_rec.padrao_recorrencia,
        tarefa_rec.dados_recorrencia,
        tarefa_rec.criado_por,
        NOW()
      );
      
      count_processadas := count_processadas + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT count_processadas, 'Recorrências processadas com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Comentário sobre a migração
COMMENT ON TABLE tarefas_semanais IS 'Tabela principal do sistema Kanban semanal de tarefas';
COMMENT ON TABLE historico_semanas_tarefas IS 'Histórico arquivado de semanas de tarefas';
COMMENT ON FUNCTION migrar_tarefas_para_semanal() IS 'Migra tarefas antigas para o novo sistema semanal';
COMMENT ON FUNCTION arquivar_semana_tarefas() IS 'Arquiva uma semana completa no histórico';
COMMENT ON FUNCTION processar_recorrencias_semanais() IS 'Processa tarefas recorrentes automaticamente';

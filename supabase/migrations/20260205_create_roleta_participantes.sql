-- 🎰 MIGRATION: Criar tabela de participantes da roleta (Multi-tenant)
-- Esta tabela controla quais corretores participam da roleta de distribuição de leads
-- Apenas corretores ativos nesta tabela receberão leads via roleta

-- Criar tabela de participantes da roleta
CREATE TABLE IF NOT EXISTS roleta_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  broker_id TEXT NOT NULL,
  broker_name TEXT NOT NULL,
  broker_email TEXT,
  broker_phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índice único para evitar duplicatas por tenant/corretor
  UNIQUE(tenant_id, broker_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_roleta_participantes_tenant ON roleta_participantes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roleta_participantes_active ON roleta_participantes(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_roleta_participantes_broker ON roleta_participantes(broker_id);

-- RLS (Row Level Security)
ALTER TABLE roleta_participantes ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver participantes do seu tenant
CREATE POLICY "Users can view roleta participants of their tenant"
  ON roleta_participantes
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Policy: Admins e Team Leaders podem inserir participantes no seu tenant
CREATE POLICY "Admins and Team Leaders can insert roleta participants"
  ON roleta_participantes
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'team_leader', 'owner')
    )
  );

-- Policy: Admins e Team Leaders podem atualizar participantes do seu tenant
CREATE POLICY "Admins and Team Leaders can update roleta participants"
  ON roleta_participantes
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'team_leader', 'owner')
    )
  );

-- Policy: Admins podem deletar participantes do seu tenant
CREATE POLICY "Admins can delete roleta participants"
  ON roleta_participantes
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_roleta_participantes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_roleta_participantes_updated_at ON roleta_participantes;
CREATE TRIGGER trigger_update_roleta_participantes_updated_at
  BEFORE UPDATE ON roleta_participantes
  FOR EACH ROW
  EXECUTE FUNCTION update_roleta_participantes_updated_at();

-- Comentários para documentação
COMMENT ON TABLE roleta_participantes IS 'Controla quais corretores participam da roleta de distribuição de leads por tenant';
COMMENT ON COLUMN roleta_participantes.tenant_id IS 'ID do tenant (imobiliária)';
COMMENT ON COLUMN roleta_participantes.broker_id IS 'ID do corretor (pode ser auth_user_id ou tenant_broker_id)';
COMMENT ON COLUMN roleta_participantes.broker_name IS 'Nome do corretor para exibição';
COMMENT ON COLUMN roleta_participantes.is_active IS 'Se o corretor está ativo na roleta';

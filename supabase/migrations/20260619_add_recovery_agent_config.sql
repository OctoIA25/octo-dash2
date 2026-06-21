-- ============================================================
-- MIGRATION: Configuração do Agente de Recuperação (por tenant)
--
-- Reaproveita a tabela tenant_recommendation_config (mesma infra de envio de
-- recomendações) em vez de criar uma tabela paralela de configuração. Assim a
-- RLS por tenant já vigente cobre estes campos sem novas políticas.
--
-- O Agente de Recuperação envia, automaticamente, uma mensagem + uma lista FIXA
-- de imóveis (oportunidades) quando um lead do CRM é arquivado.
--   - recovery_agent_enabled : liga/desliga o agente para o tenant.
--   - recovery_message       : texto configurável da mensagem (vira o parâmetro
--                              do template de WhatsApp / corpo do conteúdo).
--   - recovery_properties    : SNAPSHOT da lista fixa de imóveis escolhida pelo
--                              usuário, no MESMO shape de sanitizeProperties()
--                              (referencia, titulo, localizacao?, preco?, score?).
-- ============================================================

ALTER TABLE public.tenant_recommendation_config
  ADD COLUMN IF NOT EXISTS recovery_agent_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_message TEXT,
  ADD COLUMN IF NOT EXISTS recovery_properties JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tenant_recommendation_config.recovery_agent_enabled
  IS 'Liga o Agente de Recuperação: dispara automaticamente ao arquivar um lead do CRM.';
COMMENT ON COLUMN public.tenant_recommendation_config.recovery_message
  IS 'Mensagem configurável enviada ao cliente recuperado (parâmetro do template de WhatsApp).';
COMMENT ON COLUMN public.tenant_recommendation_config.recovery_properties
  IS 'Snapshot da lista FIXA de imóveis (oportunidades) usada pelo agente. Shape de sanitizeProperties().';

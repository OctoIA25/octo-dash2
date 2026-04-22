-- Migration: Adicionar campo allowed_features na tabela tenants
-- Data: 2026-02-20
-- Descrição: Permite configurar quais módulos do CRM cada tenant pode acessar

-- Adicionar coluna allowed_features como JSONB (array de strings)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS allowed_features JSONB DEFAULT '["leads", "notificacoes", "metricas", "estudo-mercado", "imoveis", "octo-chat"]'::jsonb;

-- Comentário para documentação
COMMENT ON COLUMN tenants.allowed_features IS 'Array de módulos do CRM que o tenant pode acessar. Admins têm acesso a todos os módulos selecionados.';

-- Criar índice para consultas futuras (opcional)
CREATE INDEX IF NOT EXISTS idx_tenants_allowed_features ON tenants USING gin(allowed_features);

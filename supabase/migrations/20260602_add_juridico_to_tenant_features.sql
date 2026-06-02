-- Migration: Adicionar 'juridico' ao allowed_features padrão dos tenants
-- Data: 2026-06-02
-- Descrição: Jurídico passa a ser uma feature disponível por padrão em todos os tenants.
--            O default anterior (20260220) não incluía 'juridico', então a aba ficava
--            bloqueada pelo gate de tenant (interseção em DashboardLayout/NovaSidebar)
--            mesmo quando a permissão era concedida ao usuário.

-- 1) Atualizar o DEFAULT da coluna para incluir 'juridico'
ALTER TABLE tenants
  ALTER COLUMN allowed_features
  SET DEFAULT '["leads", "notificacoes", "metricas", "juridico", "estudo-mercado", "imoveis", "octo-chat"]'::jsonb;

-- 2) Backfill: garantir 'juridico' nos tenants existentes que ainda não têm
UPDATE tenants
SET allowed_features = COALESCE(allowed_features, '[]'::jsonb) || '["juridico"]'::jsonb
WHERE allowed_features IS NULL
   OR NOT (allowed_features @> '["juridico"]'::jsonb);

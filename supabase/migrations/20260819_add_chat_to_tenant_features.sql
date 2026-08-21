-- Migration: liberar a feature 'chat' (WhatsApp) nos tenants
-- Data: 2026-08-19
-- Descrição: nenhum tenant tinha 'chat' em allowed_features, então o gate de tenant
--            (interseção em DashboardLayout/NovaSidebar) escondia a aba de WhatsApp de
--            todo mundo que não é owner — inclusive dos corretores. A causa era o
--            catálogo do OwnerDashboard, que não tinha o toggle de 'chat' (corrigido
--            no mesmo commit). Mesmo padrão de 20260602 (juridico) e 20260615 (metas).
--
-- O gate por usuário (permissions.sidebar_permissions) é curado em código:
-- comPermissoesNaoEditaveis devolve 'chat' na leitura, sem UPDATE em massa aqui.

ALTER TABLE public.tenants
  ALTER COLUMN allowed_features
  SET DEFAULT '["leads", "notificacoes", "metricas", "juridico", "estudo-mercado", "imoveis", "octo-chat", "metas", "chat"]'::jsonb;

-- NULL fica NULL: o gate do front (DashboardLayout) só restringe quando a
-- coluna é array — NULL significa "sem restrição", que já inclui 'chat'.
-- Reescrever NULL como '["chat"]' restringiria o tenant a UMA aba.
UPDATE public.tenants
SET allowed_features = allowed_features || '["chat"]'::jsonb
WHERE allowed_features IS NOT NULL
  AND NOT (allowed_features @> '["chat"]'::jsonb);

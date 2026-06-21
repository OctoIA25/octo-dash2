-- ============================================================
-- MIGRATION: Cadência ("prazo") de recomendações configurável por tenant
--
-- Antes, a cadência era fixa em 'weekly' (7 dias) no código. Agora o tenant
-- define, na tela de Configurações → Recomendações:
--   - recommendation_interval_days: de quantos em quantos dias reenviar.
--   - interest_window_days: por quantos dias após o interesse continuar enviando.
--
-- O agendamento (recommendation_schedules) guarda um SNAPSHOT do intervalo no
-- momento da criação (interval_days), mantendo o worker determinístico mesmo se
-- o tenant alterar o padrão depois. Roda DEPOIS de criar as duas tabelas.
-- ============================================================

-- 1) Padrões de cadência por tenant
ALTER TABLE public.tenant_recommendation_config
  ADD COLUMN IF NOT EXISTS recommendation_interval_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS interest_window_days INTEGER NOT NULL DEFAULT 7;

COMMENT ON COLUMN public.tenant_recommendation_config.recommendation_interval_days
  IS 'Intervalo padrão (em dias) entre reenvios das recomendações deste tenant.';
COMMENT ON COLUMN public.tenant_recommendation_config.interest_window_days
  IS 'Janela padrão (em dias) após o interesse durante a qual o tenant continua reenviando.';

-- 2) Snapshot da cadência no agendamento (determinismo do worker)
ALTER TABLE public.recommendation_schedules
  ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 7;

COMMENT ON COLUMN public.recommendation_schedules.interval_days
  IS 'Intervalo (em dias) entre reenvios; snapshot do padrão do tenant na criação.';

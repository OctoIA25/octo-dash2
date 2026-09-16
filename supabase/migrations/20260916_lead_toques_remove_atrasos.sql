-- ============================================================
-- Remove o bloqueio por cadência (regra errada)
--
-- CONTEXTO
-- A primeira versão de 20260916_lead_toques_aviso_e_atraso.sql, aplicada em
-- 16/set/2026, criou a view `lead_toques_atrasados` e a coluna
-- `lead_toques.atraso_cobrado_em` para a LIA bloquear o corretor que não
-- registrasse o toque 1h depois do horário marcado. A gestão corrigiu no mesmo
-- dia: cadência NÃO bloqueia. A regra de bloqueio real (24h para agendar
-- atividade com lead novo, na Central de Leads) fica para a reunião de 21/09.
--
-- Nada lia esses objetos: o prompt da LIA com a regra nunca foi publicado.
-- O arquivo da migration anterior já foi corrigido; esta aqui só limpa o que
-- ficou no banco onde a versão antiga rodou. Em ambiente novo é no-op.
-- ============================================================

SET lock_timeout = '10s';

-- A view depende da coluna: cai primeiro.
DROP VIEW IF EXISTS public.lead_toques_atrasados;

ALTER TABLE public.lead_toques DROP COLUMN IF EXISTS atraso_cobrado_em;

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'lead_toques_atrasados'),
         'view de atrasos ainda existe';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'lead_toques' AND column_name = 'atraso_cobrado_em'),
         'coluna atraso_cobrado_em ainda existe';
  RAISE NOTICE 'OK — bloqueio por cadência removido';
END $$;

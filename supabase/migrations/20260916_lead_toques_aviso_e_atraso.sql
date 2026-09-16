-- ============================================================
-- Cadência do corretor — aviso na hora do próximo toque
--
-- CONTEXTO
-- 20260916_lead_toques.sql criou os toques. Regra da gestão: o corretor é
-- avisado NA HORA que marcou para o próximo toque.
--
-- QUEM É AVISADO
-- Quem registrou o toque que marcou o próximo (decisão da gestão, 16/set/2026),
-- não o dono atual do lead.
--
-- SEM BLOQUEIO. Cadência não bloqueia ninguém. (Uma versão de 16/09 expunha
-- atrasos para a LIA bloquear; a regra estava errada e foi removida em
-- 20260916_lead_toques_remove_atrasos.sql.)
--
-- APLICAR NO SUPABASE ANTES DO DEPLOY (o front novo manda horário no próximo
-- toque, mas funciona sem esta migration — só não avisa).
-- ============================================================

SET lock_timeout = '10s';

-- ------------------------------------------------------------
-- BLOCO 1 — coluna de controle
-- ------------------------------------------------------------
-- Preenchida pelo cron quando a notificação sai. Idempotência do aviso.
ALTER TABLE public.lead_toques
  ADD COLUMN IF NOT EXISTS proximo_avisado_em timestamptz;

COMMENT ON COLUMN public.lead_toques.proximo_avisado_em IS
  'Quando a notificação "Hora do próximo toque" saiu (cron avisar_proximos_toques). NULL = ainda não avisou.';

-- O cron varre só o que falta avisar; sem isso seria seq scan por minuto.
CREATE INDEX IF NOT EXISTS idx_lead_toques_proximo_pendente
  ON public.lead_toques (proximo_toque_em)
  WHERE proximo_avisado_em IS NULL AND proximo_toque_em IS NOT NULL;

-- ------------------------------------------------------------
-- BLOCO 2 — aviso na hora do próximo toque
--
-- Roda a cada minuto (mesmo padrão de bolsao-expire-every-minute): o aviso sai
-- com no máximo ~1 min de atraso em relação à hora marcada.
-- Janela de 1 dia para trás: se o cron ficar parado, não despeja avisos velhos
-- de uma vez quando voltar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avisar_proximos_toques()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT lt.id, lt.tenant_id, lt.lead_id, lt.executado_por, lt.proximo_toque_em,
           COALESCE(l.name, k.client_name) AS lead_nome
    FROM public.lead_toques lt
    -- Quem saiu da imobiliária não recebe aviso dela.
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = lt.tenant_id AND tm.user_id = lt.executado_por
    -- lead_id é sempre um uuid validado pela rota; o cast usa a PK.
    LEFT JOIN public.leads l
      ON lt.lead_source = 'leads' AND l.id = lt.lead_id::uuid AND l.tenant_id = lt.tenant_id
    LEFT JOIN public.kenlo_leads k
      ON lt.lead_source = 'kenlo_leads' AND k.id = lt.lead_id::uuid AND k.tenant_id = lt.tenant_id
    WHERE lt.proximo_avisado_em IS NULL
      AND lt.proximo_toque_em <= now()
      AND lt.proximo_toque_em > now() - interval '1 day'
      AND (l.id IS NOT NULL OR k.id IS NOT NULL)
      AND COALESCE(l.archived_at, k.archived_at) IS NULL
      -- Só o próximo do ÚLTIMO toque vale: toque novo substitui o compromisso.
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_toques n
         WHERE n.tenant_id = lt.tenant_id AND n.lead_id = lt.lead_id
           AND n.executado_em > lt.executado_em
      )
    FOR UPDATE OF lt SKIP LOCKED
  LOOP
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.executado_por,
      'Hora do próximo toque',
      'Está na hora do próximo toque com ' || COALESCE(NULLIF(r.lead_nome, ''), 'o lead') ||
        '. Depois do contato, registre o toque na cadência do lead.',
      'cadencia_toque', 'lead', r.lead_id,
      jsonb_build_object('toque_id', r.id, 'proximo_toque_em', r.proximo_toque_em)
    );

    UPDATE public.lead_toques SET proximo_avisado_em = now() WHERE id = r.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.avisar_proximos_toques() IS
  'Notifica quem registrou o toque quando chega a hora do próximo toque. Roda a cada minuto via pg_cron.';

REVOKE ALL ON FUNCTION public.avisar_proximos_toques() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('lead-toques-aviso-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-toques-aviso-every-minute');

SELECT cron.schedule(
  'lead-toques-aviso-every-minute',
  '* * * * *',
  $$ SELECT public.avisar_proximos_toques(); $$
);

-- ------------------------------------------------------------
-- BLOCO 4 — prova
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-toques-aviso-every-minute' AND active),
         'cron do aviso não agendado';
  ASSERT NOT has_function_privilege('authenticated', 'public.avisar_proximos_toques()', 'EXECUTE'),
         'authenticated executa o cron';
  PERFORM public.avisar_proximos_toques();
  RAISE NOTICE 'OK — aviso na hora do próximo toque agendado';
END $$;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- SELECT cron.unschedule('lead-toques-aviso-every-minute');
-- DROP FUNCTION IF EXISTS public.avisar_proximos_toques();
-- DROP INDEX IF EXISTS public.idx_lead_toques_proximo_pendente;
-- ALTER TABLE public.lead_toques DROP COLUMN IF EXISTS proximo_avisado_em;

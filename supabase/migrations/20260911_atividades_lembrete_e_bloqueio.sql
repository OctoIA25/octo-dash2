-- =============================================================================
-- Liga o motor de atividades: lembrete antes do prazo, cobrança no vencimento,
-- bloqueio 24h depois.
--
-- POR QUE
-- A regra "atrasou → notifica → 24h sem concluir → bloqueia do bolsão" já estava
-- escrita em `src/features/corretores/services/activityBlockingService.ts`, mas
-- `processPendingBlockingForTenant` nunca foi chamado por ninguém. Era código
-- morto: ninguém nunca foi notificado nem bloqueado.
--
-- Deixar isso no cliente não resolve — dependeria de alguém com a aba aberta na
-- hora certa, e o corretor que some é justamente quem precisa ser cobrado. Vai
-- pra pg_cron, mesmo padrão de `expire_bolsao_leads` (20260428).
--
-- O QUE MUDA DE COMPORTAMENTO
--   • NOVO: lembrete 1h antes do prazo (qualquer tipo de atividade).
--   • Cobrança no vencimento e bloqueio 24h depois: a regra já existia no TS;
--     aqui ela passa a de fato acontecer. O recorte de quem bloqueia continua
--     idêntico — só 'retornar_cliente' e 'visita_agendada'.
--
-- Depende de: 20260428_enable_pg_cron_and_bolsao_master_switch.sql (pg_cron)
-- =============================================================================

-- Idempotência das notificações: sem isso o cron reenviaria o mesmo aviso a cada
-- hora. `pending_notified_at` já era lido pelo TS mas nunca foi declarado em
-- migration (criado à mão em produção) — declarado aqui pra ambiente novo subir.
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS pending_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_soon_notified_at timestamptz;

-- O cron varre só o que está em aberto e perto do prazo; sem isso ele faria
-- seq scan na agenda inteira de todos os tenants a cada hora.
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_pendentes_por_data
  ON public.agenda_eventos (data)
  WHERE status IN ('pendente', 'confirmado');

-- Prazo da atividade: o horário marcado, ou o fim do dia quando não há horário.
-- Mesma regra do front (`prazoAtividade`) — se divergir, o corretor vê "hoje" na
-- tela enquanto o cron já o considera atrasado.
--
-- `data` e `horario` são hora de parede de quem marcou, não UTC. Sem o AT TIME
-- ZONE explícito, `date + time` sai como timestamp sem fuso e o cron (que roda
-- em UTC) trataria uma visita das 10h como vencida às 7h da manhã de Brasília.
-- ponytail: fuso fixo em America/Sao_Paulo; vira coluna no tenant se um dia
-- entrar imobiliária fora desse fuso.
CREATE OR REPLACE FUNCTION public.prazo_atividade(p_data date, p_horario text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE
    WHEN p_horario ~ '^\d{2}:\d{2}' THEN p_data + substring(p_horario from 1 for 5)::time
    ELSE p_data + time '23:59:59'
  END) AT TIME ZONE 'America/Sao_Paulo';
$$;

COMMENT ON FUNCTION public.prazo_atividade(date, text) IS
  'Instante em que uma atividade da agenda vence. Espelha prazoAtividade() em src/features/leads/utils/atividades.ts.';

CREATE OR REPLACE FUNCTION public.processar_atividades_pendentes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloqueantes text[] := ARRAY['retornar_cliente', 'visita_agendada'];
  v_abertas text[] := ARRAY['pendente', 'confirmado'];
  r record;
BEGIN
  -- 1) LEMBRETE: vence na próxima hora e ainda não foi avisado.
  --    Vale pra qualquer tipo — avisar é barato, bloquear não.
  FOR r IN
    SELECT ae.id, ae.tenant_id, ae.titulo, ae.lead_nome, u.id AS user_id
    FROM public.agenda_eventos ae
    JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
    WHERE ae.status = ANY(v_abertas)
      AND ae.due_soon_notified_at IS NULL
      AND public.prazo_atividade(ae.data, ae.horario)
            BETWEEN now() AND now() + interval '1 hour'
  LOOP
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.user_id,
      'Atividade em 1 hora',
      '"' || r.titulo || '"' ||
        COALESCE(' — ' || NULLIF(r.lead_nome, ''), '') ||
        ' vence na próxima hora.',
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'lembrete')
    );

    UPDATE public.agenda_eventos
    SET due_soon_notified_at = now(), updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- 2) COBRANÇA: passou do prazo, segue em aberto, é tipo bloqueante e ainda
  --    não recebeu o aviso de 24h.
  FOR r IN
    SELECT ae.id, ae.tenant_id, ae.titulo, ae.tipo, u.id AS user_id
    FROM public.agenda_eventos ae
    JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
    WHERE ae.status = ANY(v_abertas)
      AND ae.tipo = ANY(v_bloqueantes)
      AND ae.pending_notified_at IS NULL
      AND public.prazo_atividade(ae.data, ae.horario) < now()
  LOOP
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.user_id,
      'Atividade pendente',
      '"' || r.titulo || '" (' ||
        CASE WHEN r.tipo = 'visita_agendada' THEN 'Visita' ELSE 'Retorno ao lead' END ||
        ') passou do prazo. Realize em até 24h para não ser bloqueado do recebimento de leads.',
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'vencida')
    );

    UPDATE public.agenda_eventos
    SET pending_notified_at = now(), updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- 3) BLOQUEIO: 24h desde a cobrança e a atividade continua em aberto.
  --    Grava no mesmo lugar que a tela de permissões lê e que unblockCorretor()
  --    limpa quando o corretor conclui.
  FOR r IN
    SELECT DISTINCT ON (tm.id) tm.id AS membership_id, ae.id AS evento_id,
           ae.tenant_id, u.id AS user_id
    FROM public.agenda_eventos ae
    JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
    WHERE ae.status = ANY(v_abertas)
      AND ae.tipo = ANY(v_bloqueantes)
      AND ae.pending_notified_at IS NOT NULL
      AND ae.pending_notified_at < now() - interval '24 hours'
      AND COALESCE((tm.permissions->>'bolsao_blocked_enabled')::boolean, false) = false
  LOOP
    UPDATE public.tenant_memberships
    SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
          'bolsao_blocked_enabled', true,
          'bolsao_blocked_until', NULL,
          'bolsao_blocked_reason', 'atividade_pendente',
          'bolsao_blocked_duration', 'indefinido'
        )
    WHERE id = r.membership_id;

    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.user_id,
      'Você foi bloqueado do recebimento de leads',
      'Por não realizar a atividade pendente em 24h, você está temporariamente bloqueado. Conclua a atividade para ser desbloqueado.',
      'blocked', 'agenda_event', r.evento_id::text,
      jsonb_build_object('motivo', 'atividade_pendente')
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.processar_atividades_pendentes() IS
  'Lembrete 1h antes, cobrança no vencimento e bloqueio do bolsão 24h depois. Roda de hora em hora via pg_cron.';

REVOKE ALL ON FUNCTION public.processar_atividades_pendentes() FROM PUBLIC, anon, authenticated;

-- De hora em hora. A granularidade fina do lembrete é 1h, então rodar mais que
-- isso só gastaria banco.
-- ponytail: janela de 1h no lembrete; se pedirem "avise 15min antes", é baixar o
-- intervalo do cron e o interval da consulta juntos.
SELECT cron.unschedule('atividades-pendentes-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atividades-pendentes-hourly');

SELECT cron.schedule(
  'atividades-pendentes-hourly',
  '0 * * * *',
  $$ SELECT public.processar_atividades_pendentes(); $$
);

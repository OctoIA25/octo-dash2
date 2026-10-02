-- ============================================================
-- Bloqueio por atividade vencida: PAUSADO
--
-- Pedido do Erick em 01/10: "não colocar o bloqueio ... vamos ter certeza que
-- está tudo funcionando certinho antes". O bloqueio estava no ar desde 21/09:
-- atividade de retorno/visita vencida e não concluída em 24h tirava o corretor
-- do Bolsão. Em 02/10 o Fábio (4 retornos da cadência vencidos) seria
-- bloqueado às 17h.
--
-- Só o BLOQUEIO para. Os avisos continuam: "vence em 1 hora" e "passou do
-- prazo" (ao corretor e ao gestor) — sem a ameaça de bloqueio no texto.
-- Ninguém está bloqueado por atividade na Lotus hoje; o desbloqueio ao
-- concluir (tr_agenda_libera_bloqueio) segue igual.
--
-- RELIGAR: trocar `v_inicio_bloqueio` por uma data (ex.: '2026-10-20 00:00:00-03')
-- e BLOQUEIO_POR_ATIVIDADE_ATIVO = true em src/features/leads/utils/atividades.ts.
-- Os textos dos avisos voltam sozinhos.
--
-- Texto de produção (pg_get_functiondef em 02/10) com essas três trocas.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.processar_atividades_pendentes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueantes text[] := ARRAY['retornar_cliente', 'visita_agendada'];
  v_abertas text[] := ARRAY['pendente', 'confirmado'];
  -- 20260917: o bloqueio só começa na segunda; avisar antes, punir depois.
  -- 20261020: NULL = bloqueio pausado (pedido do Erick, 01/10). Religar = pôr a data.
  v_inicio_bloqueio constant timestamptz := NULL;
  v_bloqueia constant boolean := v_inicio_bloqueio IS NOT NULL;
  r record;
  v_nome text;
BEGIN
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
        ') passou do prazo. ' ||
        CASE WHEN v_bloqueia
          THEN 'Realize em até 24h para não ser bloqueado do recebimento de leads.'
          ELSE 'Conclua assim que puder.'
        END,
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'vencida')
    );

    v_nome := public.nome_de_exibicao(r.user_id);
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    SELECT
      r.tenant_id, g.user_id,
      'Atividade pendente · ' || v_nome,
      '"' || r.titulo || '" (' ||
        CASE WHEN r.tipo = 'visita_agendada' THEN 'Visita' ELSE 'Retorno ao lead' END ||
        ') de ' || v_nome || ' passou do prazo.' ||
        CASE WHEN v_bloqueia
          THEN ' Sem conclusão em 24h, ' || v_nome || ' sai da distribuição.'
          ELSE ''
        END,
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'vencida', 'copia_gestor', true,
                         'sobre', v_nome, 'sobre_user_id', r.user_id)
    FROM public.responsaveis_pelo_membro(r.tenant_id, r.user_id) AS g(user_id);

    UPDATE public.agenda_eventos
    SET pending_notified_at = now(), updated_at = now()
    WHERE id = r.id;
  END LOOP;

  IF v_bloqueia AND now() >= v_inicio_bloqueio THEN
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

      v_nome := public.nome_de_exibicao(r.user_id);
      INSERT INTO public.notifications
        (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
      SELECT
        r.tenant_id, g.user_id,
        'Corretor bloqueado · ' || v_nome,
        v_nome || ' foi bloqueado do recebimento de leads por atividade pendente há mais de 24h.',
        'blocked', 'agenda_event', r.evento_id::text,
        jsonb_build_object('motivo', 'atividade_pendente', 'copia_gestor', true,
                           'sobre', v_nome, 'sobre_user_id', r.user_id)
      FROM public.responsaveis_pelo_membro(r.tenant_id, r.user_id) AS g(user_id);
    END LOOP;
  END IF;
END;
$function$;

COMMIT;

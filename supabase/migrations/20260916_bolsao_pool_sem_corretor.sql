-- =============================================================================
-- Lead no pool do Bolsão é lead sem corretor — na `bolsao` E na fonte.
--
-- POR QUE
-- O Bolsão lista `status = 'bolsao' AND corretor_responsavel IS NULL` da
-- `bolsao`, mas o corretor de verdade mora na fonte (`leads.assigned_agent_*`,
-- `kenlo_leads.attended_by_*`). Em 16/09 havia 103 leads da Lotus e 274 Kenlo
-- da Japi no pool com corretor na fonte, por dois caminhos:
--
--   1. `expire_bolsao_leads()` jogava o lead no pool limpando só a `bolsao`; a
--      fonte seguia com o último corretor da roleta — o lead ficava no pool E
--      no kanban do corretor, e quem clicasse "Assumir" tomava o lead dele.
--   2. O espelho fonte -> `bolsao` só roda no INSERT. Quem atribui direto na
--      fonte (Lia/n8n, atribuição em lote, sync Kenlo) não tirava o lead do
--      pool. Só o "Assumir" e a transferência do modal gravavam as duas.
--
-- O QUE MUDA
--   1. Ao cair no pool, a fonte também fica sem corretor.
--   2. Corretor gravado na fonte vai para `bolsao.corretor_responsavel`, como a
--      transferência do modal (CriarLeadQuickModal) já fazia pelo front. O
--      status não muda: lead do pool sai do pool, e a expiração — que só olha
--      status 'novo' — não o pega de volta. Limpar o corretor da fonte não
--      mexe na `bolsao`.
--   3. Limpeza dos que já estavam assim: vale o que aconteceu por último
--      (atribuição na fonte x queda no pool). O antes fica em
--      `bolsao_pool_limpeza_20260916` para desfazer.
--
-- Testes: supabase/tests/bolsao_pool_sem_corretor.test.sql
-- =============================================================================

-- 1. Expiração -----------------------------------------------------------------
-- Corpo idêntico ao de produção (pg_get_functiondef em 16/09, = 20260914),
-- exceto a limpeza da fonte no fallback do pool.
CREATE OR REPLACE FUNCTION public.expire_bolsao_leads()
 RETURNS TABLE(bolsao_id bigint, tenant_id uuid, acao text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_limite_min int;
  v_minutos_decorridos int;
  v_default_exclusivo int := 60;
  v_default_nao_exclusivo int := 60;
  v_base_ts timestamptz;
  v_pick RECORD;
  v_team_pick RECORD;
  v_now_local timestamp;
  v_day_name text;
  v_day_cfg jsonb;
  v_inicio time;
  v_termino time;
  v_now_time time;
BEGIN
  v_now_local := now() AT TIME ZONE 'America/Sao_Paulo';
  v_day_name := CASE EXTRACT(DOW FROM v_now_local)::int
    WHEN 0 THEN 'domingo'
    WHEN 1 THEN 'segunda'
    WHEN 2 THEN 'terca'
    WHEN 3 THEN 'quarta'
    WHEN 4 THEN 'quinta'
    WHEN 5 THEN 'sexta'
    WHEN 6 THEN 'sabado'
  END;
  v_now_time := v_now_local::time;

  FOR v_lead IN
    SELECT b.id, b.tenant_id, b.created_at AS bolsao_created_at, b.exclusivo,
           b.source_lead_id, b.source_kenlo_id,
           b.corretor_responsavel,
           b.queue_attempt,
           c.tempo_expiracao_exclusivo, c.tempo_expiracao_nao_exclusivo,
           c.bolsao_enabled,
           c.team_queue_enabled,
           c.horario_funcionamento,
           l.assigned_at AS lead_assigned_at,
           l.status AS lead_status
    FROM public.bolsao b
    LEFT JOIN public.tenant_bolsao_config c ON c.tenant_id = b.tenant_id
    LEFT JOIN public.leads l ON l.id = b.source_lead_id
    WHERE b.status = 'novo'
      AND b.atendido = false
      AND b.tenant_id IS NOT NULL
      AND COALESCE(c.bolsao_enabled, true) = true
      -- 20260914: distribuicao externa (Lia) -> o Octo nao repassa nem joga no pool.
      AND COALESCE(c.auto_distribution_enabled, true) = true
  LOOP
    -- Horario de funcionamento: pula leads cujo tenant esta fora do expediente
    v_day_cfg := v_lead.horario_funcionamento -> v_day_name;
    IF v_day_cfg IS NOT NULL THEN
      IF COALESCE((v_day_cfg->>'ativo')::boolean, true) = false THEN
        bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_fora_horario';
        RETURN NEXT;
        CONTINUE;
      END IF;
      BEGIN
        v_inicio := (v_day_cfg->>'inicio')::time;
        v_termino := (v_day_cfg->>'termino')::time;
        IF v_now_time < v_inicio OR v_now_time > v_termino THEN
          bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_fora_horario';
          RETURN NEXT;
          CONTINUE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- horario invalido no JSON -> nao bloqueia (libera passagem)
        NULL;
      END;
    END IF;

    -- Pular estagios avancados (Visita Agendada+)
    IF v_lead.lead_status IN ('Visita Agendada','Visita Realizada','Negociação','Proposta Criada','Proposta Enviada','Proposta Assinada') THEN
      bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_visita';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_limite_min := COALESCE(
      CASE WHEN v_lead.exclusivo THEN v_lead.tempo_expiracao_exclusivo ELSE v_lead.tempo_expiracao_nao_exclusivo END,
      CASE WHEN v_lead.exclusivo THEN v_default_exclusivo ELSE v_default_nao_exclusivo END
    );
    v_base_ts := COALESCE(v_lead.lead_assigned_at, v_lead.bolsao_created_at);
    v_minutos_decorridos := FLOOR(EXTRACT(EPOCH FROM (now() - v_base_ts)) / 60);

    IF v_minutos_decorridos < v_limite_min THEN
      bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_dentro_do_tempo';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Modo team_queue
    IF v_lead.team_queue_enabled = true THEN
      SELECT t.user_id, t.broker_name, t.broker_email, t.broker_phone
        INTO v_team_pick
      FROM public.pick_team_queue_member(v_lead.tenant_id, v_lead.corretor_responsavel) t;

      IF v_team_pick.broker_name IS NOT NULL THEN
        UPDATE public.bolsao
           SET corretor_responsavel = v_team_pick.broker_name,
               numero_corretor_responsavel = v_team_pick.broker_phone,
               data_atribuicao = now(),
               queue_attempt = COALESCE(queue_attempt, 0) + 1,
               status = 'novo', atendido = false, data_atendimento = NULL
         WHERE id = v_lead.id;
        IF v_lead.source_lead_id IS NOT NULL THEN
          UPDATE public.leads
             SET assigned_agent_id = v_team_pick.user_id::text,
                 assigned_agent_name = v_team_pick.broker_name
           WHERE id = v_lead.source_lead_id;
        END IF;
        IF v_lead.source_kenlo_id IS NOT NULL THEN
          UPDATE public.kenlo_leads SET attended_by_name = v_team_pick.broker_name WHERE id = v_lead.source_kenlo_id;
        END IF;
        INSERT INTO public.lead_queue_history (
          tenant_id, bolsao_lead_id,
          original_corretor_name, original_corretor_user_id,
          redistributed_to_name, redistributed_to_user_id,
          reason, attempt_number, success
        ) VALUES (
          v_lead.tenant_id, v_lead.id,
          v_lead.corretor_responsavel, NULL,
          v_team_pick.broker_name, v_team_pick.user_id,
          'expired_no_response_team_queue',
          COALESCE(v_lead.queue_attempt, 0) + 1, true
        );
        bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'redistribuido_team_queue';
        RETURN NEXT;
        CONTINUE;
      END IF;
    ELSE
      -- Roleta aleatoria (default)
      SELECT p.broker_id, p.broker_name, p.broker_email, p.broker_phone
        INTO v_pick
      FROM public.pick_roleta_broker_excluding(v_lead.tenant_id, v_lead.corretor_responsavel) p;

      IF v_pick.broker_name IS NOT NULL THEN
        UPDATE public.bolsao
           SET corretor_responsavel = v_pick.broker_name,
               numero_corretor_responsavel = v_pick.broker_phone,
               data_atribuicao = now(),
               queue_attempt = COALESCE(queue_attempt, 0) + 1,
               status = 'novo', atendido = false, data_atendimento = NULL
         WHERE id = v_lead.id;
        IF v_lead.source_lead_id IS NOT NULL THEN
          UPDATE public.leads
             SET assigned_agent_id = v_pick.broker_id,
                 assigned_agent_name = v_pick.broker_name
           WHERE id = v_lead.source_lead_id;
        END IF;
        IF v_lead.source_kenlo_id IS NOT NULL THEN
          UPDATE public.kenlo_leads SET attended_by_name = v_pick.broker_name WHERE id = v_lead.source_kenlo_id;
        END IF;
        INSERT INTO public.lead_queue_history (
          tenant_id, bolsao_lead_id,
          original_corretor_name, original_corretor_user_id,
          redistributed_to_name, redistributed_to_user_id,
          reason, attempt_number, success
        ) VALUES (
          v_lead.tenant_id, v_lead.id,
          v_lead.corretor_responsavel, NULL,
          v_pick.broker_name, NULL,
          'expired_no_response_roleta',
          COALESCE(v_lead.queue_attempt, 0) + 1, true
        );
        bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'redistribuido_roleta';
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- Fallback pool geral
    UPDATE public.bolsao
       SET status = 'bolsao', atendido = false,
           corretor_responsavel = NULL, numero_corretor_responsavel = NULL,
           data_atendimento = NULL, data_expiracao = now()
     WHERE id = v_lead.id;
    -- 20260916: no pool o lead nao tem dono -> sai do kanban do corretor tambem.
    IF v_lead.source_lead_id IS NOT NULL THEN
      UPDATE public.leads
         SET assigned_agent_id = NULL, assigned_agent_name = NULL
       WHERE id = v_lead.source_lead_id
         AND (assigned_agent_id IS NOT NULL OR assigned_agent_name IS NOT NULL);
    END IF;
    IF v_lead.source_kenlo_id IS NOT NULL THEN
      UPDATE public.kenlo_leads
         SET attended_by_id = NULL, attended_by_name = NULL
       WHERE id = v_lead.source_kenlo_id
         AND (attended_by_id IS NOT NULL OR attended_by_name IS NOT NULL);
    END IF;
    bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'movido_para_pool';
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 2. Corretor da fonte -> bolsao ------------------------------------------------
-- Quem grava a `bolsao` antes da fonte (Assumir, redistribuição da expiração)
-- chega aqui com o mesmo nome e não perde o telefone. O telefone do corretor
-- anterior é apagado: a fonte não tem o do novo (o modal grava logo depois).
CREATE OR REPLACE FUNCTION public.tg_fonte_corretor_to_bolsao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- to_jsonb: NEW.<coluna> da outra tabela quebra mesmo num ramo não executado.
  v_corretor text := COALESCE(to_jsonb(NEW) ->> 'assigned_agent_name', to_jsonb(NEW) ->> 'attended_by_name');
BEGIN
  IF TG_TABLE_NAME = 'leads' THEN
    UPDATE public.bolsao
       SET corretor_responsavel = v_corretor, numero_corretor_responsavel = NULL, data_atribuicao = now()
     WHERE source_lead_id = NEW.id
       AND corretor_responsavel IS DISTINCT FROM v_corretor;
  ELSE
    UPDATE public.bolsao
       SET corretor_responsavel = v_corretor, numero_corretor_responsavel = NULL, data_atribuicao = now()
     WHERE source_kenlo_id = NEW.id
       AND corretor_responsavel IS DISTINCT FROM v_corretor;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_leads_corretor_to_bolsao ON public.leads;
CREATE TRIGGER tr_leads_corretor_to_bolsao
  AFTER UPDATE OF assigned_agent_id, assigned_agent_name ON public.leads
  FOR EACH ROW
  WHEN (NEW.assigned_agent_name IS NOT NULL AND NEW.assigned_agent_name IS DISTINCT FROM OLD.assigned_agent_name)
  EXECUTE FUNCTION public.tg_fonte_corretor_to_bolsao();

DROP TRIGGER IF EXISTS tr_kenlo_leads_corretor_to_bolsao ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_corretor_to_bolsao
  AFTER UPDATE OF attended_by_name ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.attended_by_name IS NOT NULL AND NEW.attended_by_name IS DISTINCT FROM OLD.attended_by_name)
  EXECUTE FUNCTION public.tg_fonte_corretor_to_bolsao();

-- 3. Limpeza --------------------------------------------------------------------
-- Kenlo não tem assigned_at: a data da atribuição é o último lead.assigned.
CREATE TABLE public.bolsao_pool_limpeza_20260916 AS
SELECT b.id AS bolsao_id, b.tenant_id, b.source_lead_id, b.source_kenlo_id, b.data_expiracao,
       l.assigned_agent_id, l.assigned_agent_name,
       k.attended_by_id, k.attended_by_name,
       ult.atribuido_em,
       CASE WHEN ult.atribuido_em > b.data_expiracao
             AND COALESCE(l.assigned_agent_name, k.attended_by_name) IS NOT NULL
            THEN 'sai_do_pool' ELSE 'fica_sem_corretor' END AS acao,
       now() AS feito_em
FROM public.bolsao b
LEFT JOIN public.leads l ON l.id = b.source_lead_id
LEFT JOIN public.kenlo_leads k ON k.id = b.source_kenlo_id
CROSS JOIN LATERAL (
  SELECT COALESCE(l.assigned_at,
                  (SELECT max(e.created_at) FROM public.lead_events e
                    WHERE e.tenant_id = b.tenant_id AND e.lead_id = k.id::text
                      AND e.event_type = 'lead.assigned')) AS atribuido_em
) ult
WHERE b.status = 'bolsao'
  AND b.atendido IS NOT TRUE
  AND b.corretor_responsavel IS NULL
  AND (l.assigned_agent_id IS NOT NULL OR l.assigned_agent_name IS NOT NULL
       OR k.attended_by_id IS NOT NULL OR k.attended_by_name IS NOT NULL);

-- Sem policy: só service_role lê (mesmo esquema de lead_events).
ALTER TABLE public.bolsao_pool_limpeza_20260916 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bolsao_pool_limpeza_20260916 IS
  'Antes da limpeza de 20260916_bolsao_pool_sem_corretor.sql (lead no pool com corretor na fonte). Só para desfazer; pode ser apagada.';

UPDATE public.bolsao b
   SET corretor_responsavel = COALESCE(x.assigned_agent_name, x.attended_by_name),
       numero_corretor_responsavel = NULL,
       data_atribuicao = x.atribuido_em
  FROM public.bolsao_pool_limpeza_20260916 x
 WHERE x.acao = 'sai_do_pool' AND b.id = x.bolsao_id;

UPDATE public.leads l
   SET assigned_agent_id = NULL, assigned_agent_name = NULL
  FROM public.bolsao_pool_limpeza_20260916 x
 WHERE x.acao = 'fica_sem_corretor' AND l.id = x.source_lead_id;

UPDATE public.kenlo_leads k
   SET attended_by_id = NULL, attended_by_name = NULL
  FROM public.bolsao_pool_limpeza_20260916 x
 WHERE x.acao = 'fica_sem_corretor' AND k.id = x.source_kenlo_id;

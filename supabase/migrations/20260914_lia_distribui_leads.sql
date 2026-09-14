-- =============================================================================
-- Tenant que distribui lead por fora (a Lia) desliga a distribuição do Octo.
--
-- POR QUE
-- Na Lotus Brokers a Lia passa a escolher o corretor de todo lead. O Octo
-- distribuía por três portas, e qualquer uma delas atropelaria a escolha dela:
--
--   1. o trigger BEFORE INSERT `tr_leads_assign_roleta` (lead sem corretor —
--      Meta, Santa Ângela e a própria Lia);
--   2. `expire_bolsao_leads()` — pg_cron de minuto em minuto e o front
--      (MeusLeadsAtribuidosSection) — que repassa o lead quando o tempo estoura
--      ou o joga no pool sem dono;
--   3. o `resolveBrokerForLead` do Node (webhooks ZAP/OLX/Imovelweb) — trava
--      no server/leadAssignment.js, lendo esta mesma coluna.
--
-- POR QUE UMA COLUNA NOVA
-- `roleta_enabled` é o seletor de MODO (roleta x fila por equipe) da tela de
-- Bolsão: com ele false a fila por equipe continua redistribuindo e o modo
-- roleta cai no pool. `bolsao_enabled` false para também o espelho em
-- `bolsao`, de onde o kanban do corretor lê os leads. Nenhum dos dois diz
-- "o Octo não distribui".
--
-- O lead segue entrando no `bolsao` e disparando o webhook `lead.created`
-- (é por ele que a Lia fica sabendo do lead). Religar: UPDATE ... SET
-- auto_distribution_enabled = true.
-- =============================================================================

ALTER TABLE public.tenant_bolsao_config
  ADD COLUMN IF NOT EXISTS auto_distribution_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_bolsao_config.auto_distribution_enabled IS
  'false = o Octo não atribui nem redistribui lead (trigger de roleta, expire_bolsao_leads, resolveBrokerForLead). Quem distribui é externo (Lia).';

-- 1. Trigger de INSERT ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_assign_roleta_to_leads()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_broker_id text;
  v_broker_name text;
  v_broker_email text;
  v_broker_phone text;
BEGIN
  -- Ja tem corretor? Nao mexe.
  IF NEW.assigned_agent_name IS NOT NULL OR NEW.assigned_agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 20260914: distribuicao externa (Lia) -> lead entra sem corretor.
  IF EXISTS (
    SELECT 1 FROM public.tenant_bolsao_config
    WHERE tenant_id = NEW.tenant_id AND auto_distribution_enabled = false
  ) THEN
    RETURN NEW;
  END IF;

  -- Tenta roleta
  SELECT p.broker_id, p.broker_name, p.broker_email, p.broker_phone
    INTO v_broker_id, v_broker_name, v_broker_email, v_broker_phone
  FROM public.pick_roleta_broker(NEW.tenant_id) p;

  IF v_broker_name IS NOT NULL THEN
    NEW.assigned_agent_name := v_broker_name;
    NEW.assigned_agent_id := v_broker_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Expiração / redistribuição do bolsão --------------------------------------
-- Corpo idêntico ao de produção (pg_get_functiondef em 14/09), exceto o filtro
-- de auto_distribution_enabled no WHERE do loop.
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
    bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'movido_para_pool';
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 3. Lotus Brokers: a Lia distribui ---------------------------------------------
-- A Lotus não tinha linha de config. `horario_funcionamento = '{}'` mantém o que
-- valia sem linha (expiração sem restrição de horário) se um dia religarem.
INSERT INTO public.tenant_bolsao_config (tenant_id, auto_distribution_enabled, horario_funcionamento)
VALUES ('65c69875-dc83-4062-90f6-6f6adc30df26', false, '{}'::jsonb)
ON CONFLICT (tenant_id) DO UPDATE SET auto_distribution_enabled = false;

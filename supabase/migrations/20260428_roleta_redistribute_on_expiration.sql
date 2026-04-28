-- =============================================================================
-- Quando o lead expira sem resposta, redistribui via roleta para o PROXIMO
-- corretor (excluindo o atual). O lead permanece exclusivo desse corretor —
-- nao vai pro pool geral. Se a roleta nao tiver ninguem alem do atual,
-- entao cai no pool geral como fallback.
--
-- Aplicada em producao em 2026-04-28 via supabase MCP.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

UPDATE public.leads SET assigned_at = created_at WHERE assigned_at IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN assigned_at SET NOT NULL,
  ALTER COLUMN assigned_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.tg_update_leads_assigned_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id)
     OR (NEW.assigned_agent_name IS DISTINCT FROM OLD.assigned_agent_name) THEN
    NEW.assigned_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_assigned_at ON public.leads;
CREATE TRIGGER tr_leads_assigned_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_update_leads_assigned_at();

CREATE OR REPLACE FUNCTION public.pick_roleta_broker_excluding(
  p_tenant_id uuid,
  p_exclude_name text
)
RETURNS TABLE (
  broker_id text,
  broker_name text,
  broker_email text,
  broker_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_picked_id uuid;
BEGIN
  SELECT roleta_enabled INTO v_enabled
  FROM public.tenant_bolsao_config
  WHERE tenant_id = p_tenant_id;

  IF v_enabled = false THEN
    RETURN;
  END IF;

  SELECT id INTO v_picked_id
  FROM public.roleta_participantes
  WHERE tenant_id = p_tenant_id
    AND is_active = true
    AND (p_exclude_name IS NULL OR broker_name IS DISTINCT FROM p_exclude_name)
  ORDER BY last_assigned_at NULLS FIRST, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_picked_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.roleta_participantes
  SET last_assigned_at = now(),
      updated_at = now()
  WHERE id = v_picked_id
  RETURNING
    public.roleta_participantes.broker_id,
    public.roleta_participantes.broker_name,
    public.roleta_participantes.broker_email,
    public.roleta_participantes.broker_phone
  INTO broker_id, broker_name, broker_email, broker_phone;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_bolsao_leads()
RETURNS TABLE (bolsao_id bigint, tenant_id uuid, acao text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_limite_min int;
  v_minutos_decorridos int;
  v_default_exclusivo int := 60;
  v_default_nao_exclusivo int := 60;
  v_base_ts timestamptz;
  v_pick RECORD;
BEGIN
  FOR v_lead IN
    SELECT b.id, b.tenant_id, b.created_at AS bolsao_created_at, b.exclusivo,
           b.source_lead_id, b.source_kenlo_id,
           b.corretor_responsavel,
           b.queue_attempt,
           c.tempo_expiracao_exclusivo, c.tempo_expiracao_nao_exclusivo,
           l.assigned_at AS lead_assigned_at,
           l.status AS lead_status
    FROM public.bolsao b
    LEFT JOIN public.tenant_bolsao_config c ON c.tenant_id = b.tenant_id
    LEFT JOIN public.leads l ON l.id = b.source_lead_id
    WHERE b.status = 'novo'
      AND b.atendido = false
      AND b.tenant_id IS NOT NULL
  LOOP
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

    SELECT p.broker_id, p.broker_name, p.broker_email, p.broker_phone
      INTO v_pick
    FROM public.pick_roleta_broker_excluding(v_lead.tenant_id, v_lead.corretor_responsavel) p;

    IF v_pick.broker_name IS NOT NULL THEN
      UPDATE public.bolsao
         SET corretor_responsavel = v_pick.broker_name,
             numero_corretor_responsavel = v_pick.broker_phone,
             data_atribuicao = now(),
             queue_attempt = COALESCE(queue_attempt, 0) + 1,
             status = 'novo',
             atendido = false,
             data_atendimento = NULL
       WHERE id = v_lead.id;

      IF v_lead.source_lead_id IS NOT NULL THEN
        UPDATE public.leads
           SET assigned_agent_id = v_pick.broker_id,
               assigned_agent_name = v_pick.broker_name
         WHERE id = v_lead.source_lead_id;
      END IF;

      IF v_lead.source_kenlo_id IS NOT NULL THEN
        UPDATE public.kenlo_leads
           SET attended_by_name = v_pick.broker_name
         WHERE id = v_lead.source_kenlo_id;
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
        COALESCE(v_lead.queue_attempt, 0) + 1,
        true
      );

      bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'redistribuido_roleta';
      RETURN NEXT;
      CONTINUE;
    END IF;

    UPDATE public.bolsao
       SET status = 'bolsao',
           atendido = false,
           corretor_responsavel = NULL,
           numero_corretor_responsavel = NULL,
           data_atendimento = NULL,
           data_expiracao = now()
     WHERE id = v_lead.id;

    bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'movido_para_pool';
    RETURN NEXT;
  END LOOP;
END;
$$;

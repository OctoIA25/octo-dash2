-- =============================================================================
-- 1) Corrige triggers: trata 'Novos Leads' E 'Novos Proprietarios' como nao-atendido
-- 2) Adiciona desfazer atendido quando lead volta pra status inicial
-- 3) Cria funcao Postgres `expire_bolsao_leads()` que pode ser chamada via cron
--    para mover leads expirados sem depender do frontend.
-- 4) Backfill: corrige dados afetados pelos bugs anteriores
--
-- Aplicada em producao em 2026-04-28 via supabase MCP.
-- =============================================================================

-- ---------- 1) Trigger de INSERT mais correto ----------
CREATE OR REPLACE FUNCTION public.tg_mirror_leads_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_initial boolean;
BEGIN
  IF NEW.participa_bolsao = false THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.bolsao WHERE source_lead_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_is_initial := NEW.status IS NULL OR NEW.status IN ('Novos Leads', 'Novos Proprietários');

  INSERT INTO public.bolsao (
    tenant_id, created_at, codigo, corretor, lead, numerocorretor,
    status, corretor_responsavel, numero_corretor_responsavel,
    data_atribuicao, atendido, nomedolead, foto, portal,
    exclusivo, original_corretor_user_id, queue_attempt, source_lead_id
  ) VALUES (
    NEW.tenant_id, NEW.created_at, NEW.property_code, NEW.assigned_agent_name,
    NEW.phone, NULL, 'novo', NEW.assigned_agent_name, NULL,
    CASE WHEN NEW.assigned_agent_name IS NOT NULL THEN NEW.created_at ELSE NULL END,
    NOT v_is_initial,
    NEW.name, NULL, COALESCE(NEW.source, 'Manual'),
    NEW.is_exclusive, NULL, 0, NEW.id
  );
  RETURN NEW;
END;
$$;

-- ---------- 2) Trigger de UPDATE: ativa E desativa atendido ----------
CREATE OR REPLACE FUNCTION public.tg_leads_status_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_initial boolean;
  v_is_initial boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_was_initial := OLD.status IN ('Novos Leads', 'Novos Proprietários');
  v_is_initial  := NEW.status IN ('Novos Leads', 'Novos Proprietários');

  IF v_was_initial AND NOT v_is_initial THEN
    UPDATE public.bolsao
       SET atendido = true,
           data_atendimento = COALESCE(data_atendimento, now()),
           status = CASE
                      WHEN NEW.status = 'Arquivado' THEN 'finalizado'
                      WHEN status = 'bolsao' THEN status
                      ELSE 'atendido'
                    END
     WHERE source_lead_id = NEW.id;
  END IF;

  IF NOT v_was_initial AND v_is_initial THEN
    UPDATE public.bolsao
       SET atendido = false,
           data_atendimento = NULL,
           status = CASE WHEN status = 'bolsao' THEN status ELSE 'novo' END
     WHERE source_lead_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- 3) Funcao server-side de expiracao ----------
CREATE OR REPLACE FUNCTION public.expire_bolsao_leads()
RETURNS TABLE (
  bolsao_id bigint,
  tenant_id uuid,
  acao text
)
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
BEGIN
  FOR v_lead IN
    SELECT b.id, b.tenant_id, b.created_at, b.exclusivo, b.source_lead_id, b.source_kenlo_id,
           c.tempo_expiracao_exclusivo, c.tempo_expiracao_nao_exclusivo
    FROM public.bolsao b
    LEFT JOIN public.tenant_bolsao_config c ON c.tenant_id = b.tenant_id
    WHERE b.status = 'novo'
      AND b.atendido = false
      AND b.tenant_id IS NOT NULL
  LOOP
    IF v_lead.source_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = v_lead.source_lead_id
        AND l.status IN ('Visita Agendada','Visita Realizada','Negociação','Proposta Criada','Proposta Enviada','Proposta Assinada')
    ) THEN
      bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_visita';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_limite_min := COALESCE(
      CASE WHEN v_lead.exclusivo
           THEN v_lead.tempo_expiracao_exclusivo
           ELSE v_lead.tempo_expiracao_nao_exclusivo
      END,
      CASE WHEN v_lead.exclusivo THEN v_default_exclusivo ELSE v_default_nao_exclusivo END
    );

    v_minutos_decorridos := FLOOR(EXTRACT(EPOCH FROM (now() - v_lead.created_at)) / 60);

    IF v_minutos_decorridos < v_limite_min THEN
      bolsao_id := v_lead.id; tenant_id := v_lead.tenant_id; acao := 'pulado_dentro_do_tempo';
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

-- ---------- 4) Backfill correcao retroativa ----------
UPDATE public.bolsao b
   SET atendido = false,
       data_atendimento = NULL,
       status = CASE WHEN b.status = 'bolsao' THEN b.status ELSE 'novo' END
  FROM public.leads l
 WHERE b.source_lead_id = l.id
   AND l.status IN ('Novos Leads', 'Novos Proprietários')
   AND b.atendido = true
   AND b.data_expiracao IS NULL;

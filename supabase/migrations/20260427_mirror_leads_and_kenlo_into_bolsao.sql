-- =============================================================================
-- Espelhamento automatico de leads/kenlo_leads para bolsao
--
-- Objetivo: todo lead que entra em `leads` ou `kenlo_leads` ganha uma row-espelho
-- em `bolsao` com o mesmo created_at, alimentando a logica existente de
-- expiracao/fila/roleta sem mudar nada no codigo TS.
--
-- Quando o corretor mexer no card no kanban (status sai de 'Novos Leads'),
-- o espelho na bolsao e marcado como atendido (`atendido=true`) e nao expira
-- mais.
--
-- Aplicada em producao em 2026-04-27 via supabase MCP.
-- =============================================================================

-- 1. Colunas de rastreio da fonte (nullable, com unique parcial)
ALTER TABLE public.bolsao
  ADD COLUMN IF NOT EXISTS source_lead_id uuid,
  ADD COLUMN IF NOT EXISTS source_kenlo_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS bolsao_source_lead_id_uniq
  ON public.bolsao (source_lead_id) WHERE source_lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bolsao_source_kenlo_id_uniq
  ON public.bolsao (source_kenlo_id) WHERE source_kenlo_id IS NOT NULL;

-- 2. Trigger function: espelhar INSERT em leads -> bolsao
CREATE OR REPLACE FUNCTION public.tg_mirror_leads_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bolsao WHERE source_lead_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.bolsao (
    tenant_id, created_at, codigo, corretor, lead, numerocorretor,
    status, corretor_responsavel, numero_corretor_responsavel,
    data_atribuicao, atendido, nomedolead, foto, portal,
    exclusivo, original_corretor_user_id, queue_attempt, source_lead_id
  ) VALUES (
    NEW.tenant_id,
    NEW.created_at,
    NEW.property_code,
    NEW.assigned_agent_name,
    NEW.phone,
    NULL,
    'novo',
    NEW.assigned_agent_name,
    NULL,
    CASE WHEN NEW.assigned_agent_name IS NOT NULL THEN NEW.created_at ELSE NULL END,
    CASE WHEN NEW.status IS NOT NULL AND NEW.status != 'Novos Leads' THEN true ELSE false END,
    NEW.name,
    NULL,
    COALESCE(NEW.source, 'Manual'),
    NEW.is_exclusive,
    NULL, -- leads.assigned_agent_id e text, nao uuid
    0,
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_mirror_to_bolsao ON public.leads;
CREATE TRIGGER tr_leads_mirror_to_bolsao
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_mirror_leads_to_bolsao();

-- 3. Trigger function: espelhar INSERT em kenlo_leads -> bolsao
CREATE OR REPLACE FUNCTION public.tg_mirror_kenlo_leads_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bolsao WHERE source_kenlo_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.bolsao (
    tenant_id, created_at, codigo, corretor, lead, numerocorretor,
    status, corretor_responsavel, numero_corretor_responsavel,
    data_atribuicao, atendido, nomedolead, foto, portal,
    exclusivo, original_corretor_user_id, queue_attempt, source_kenlo_id
  ) VALUES (
    NEW.tenant_id,
    COALESCE(NEW.created_at, now()),
    NEW.interest_reference,
    NEW.attended_by_name,
    NEW.client_phone,
    NULL,
    'novo',
    NEW.attended_by_name,
    NULL,
    CASE WHEN NEW.attended_by_name IS NOT NULL THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    CASE WHEN NEW.stage IS NOT NULL AND NEW.stage NOT IN ('new', 'novo') THEN true ELSE false END,
    NEW.client_name,
    NULL,
    COALESCE(NEW.portal, 'Kenlo'),
    NEW.is_exclusive,
    NULL,
    0,
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_kenlo_leads_mirror_to_bolsao ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_mirror_to_bolsao
  AFTER INSERT ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_mirror_kenlo_leads_to_bolsao();

-- 4. Trigger function: UPDATE em leads.status -> marca atendido no espelho
CREATE OR REPLACE FUNCTION public.tg_leads_status_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status)
     AND OLD.status = 'Novos Leads'
     AND NEW.status != 'Novos Leads' THEN
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_status_to_bolsao ON public.leads;
CREATE TRIGGER tr_leads_status_to_bolsao
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_leads_status_to_bolsao();

-- 5. Trigger function: UPDATE em kenlo_leads.stage -> marca atendido no espelho
CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_stage_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.stage IS DISTINCT FROM OLD.stage)
     AND OLD.stage IN ('new', 'novo')
     AND NEW.stage NOT IN ('new', 'novo') THEN
    UPDATE public.bolsao
       SET atendido = true,
           data_atendimento = COALESCE(data_atendimento, now()),
           status = CASE WHEN status = 'bolsao' THEN status ELSE 'atendido' END
     WHERE source_kenlo_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_kenlo_leads_stage_to_bolsao ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_stage_to_bolsao
  AFTER UPDATE OF stage ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_kenlo_leads_stage_to_bolsao();

-- 6. Backfill: trazer leads existentes em leads/kenlo_leads para bolsao
INSERT INTO public.bolsao (
  tenant_id, created_at, codigo, corretor, lead, numerocorretor,
  status, corretor_responsavel, numero_corretor_responsavel,
  data_atribuicao, atendido, nomedolead, foto, portal,
  exclusivo, original_corretor_user_id, queue_attempt, source_lead_id
)
SELECT
  l.tenant_id, l.created_at, l.property_code, l.assigned_agent_name, l.phone, NULL,
  CASE WHEN l.status IS NOT NULL AND l.status != 'Novos Leads' THEN 'atendido' ELSE 'novo' END,
  l.assigned_agent_name, NULL,
  CASE WHEN l.assigned_agent_name IS NOT NULL THEN l.created_at ELSE NULL END,
  CASE WHEN l.status IS NOT NULL AND l.status != 'Novos Leads' THEN true ELSE false END,
  l.name, NULL, COALESCE(l.source, 'Manual'), l.is_exclusive, NULL, 0, l.id
FROM public.leads l
WHERE NOT EXISTS (SELECT 1 FROM public.bolsao b WHERE b.source_lead_id = l.id);

INSERT INTO public.bolsao (
  tenant_id, created_at, codigo, corretor, lead, numerocorretor,
  status, corretor_responsavel, numero_corretor_responsavel,
  data_atribuicao, atendido, nomedolead, foto, portal,
  exclusivo, original_corretor_user_id, queue_attempt, source_kenlo_id
)
SELECT
  k.tenant_id, COALESCE(k.created_at, now()), k.interest_reference, k.attended_by_name,
  k.client_phone, NULL,
  CASE WHEN k.stage IS NOT NULL AND k.stage NOT IN ('new', 'novo') THEN 'atendido' ELSE 'novo' END,
  k.attended_by_name, NULL,
  CASE WHEN k.attended_by_name IS NOT NULL THEN COALESCE(k.created_at, now()) ELSE NULL END,
  CASE WHEN k.stage IS NOT NULL AND k.stage NOT IN ('new', 'novo') THEN true ELSE false END,
  k.client_name, NULL, COALESCE(k.portal, 'Kenlo'), k.is_exclusive, NULL, 0, k.id
FROM public.kenlo_leads k
WHERE NOT EXISTS (SELECT 1 FROM public.bolsao b WHERE b.source_kenlo_id = k.id);

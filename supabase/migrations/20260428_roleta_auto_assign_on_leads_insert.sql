-- =============================================================================
-- Roleta funciona em qualquer caminho de criacao de lead (modal, API, etc.)
--
-- Antes: a roleta so rodava em POST /api/v1/leads no servidor Express, com
-- estado em RAM (perdia no restart). Modal/Supabase-direto pulavam a roleta.
--
-- Agora: trigger BEFORE INSERT em leads chama uma funcao Postgres que escolhe
-- o proximo participante por round-robin justo (mais antigo last_assigned_at).
-- Estado persistido em roleta_participantes.last_assigned_at.
--
-- Aplicada em producao em 2026-04-28 via supabase MCP.
-- =============================================================================

ALTER TABLE public.roleta_participantes
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

CREATE OR REPLACE FUNCTION public.pick_roleta_broker(p_tenant_id uuid)
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

CREATE OR REPLACE FUNCTION public.tg_assign_roleta_to_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_id text;
  v_broker_name text;
  v_broker_email text;
  v_broker_phone text;
BEGIN
  IF NEW.assigned_agent_name IS NOT NULL OR NEW.assigned_agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.broker_id, p.broker_name, p.broker_email, p.broker_phone
    INTO v_broker_id, v_broker_name, v_broker_email, v_broker_phone
  FROM public.pick_roleta_broker(NEW.tenant_id) p;

  IF v_broker_name IS NOT NULL THEN
    NEW.assigned_agent_name := v_broker_name;
    NEW.assigned_agent_id := v_broker_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_assign_roleta ON public.leads;
CREATE TRIGGER tr_leads_assign_roleta
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_assign_roleta_to_leads();

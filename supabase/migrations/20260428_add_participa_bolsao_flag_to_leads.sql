-- Adiciona flag `participa_bolsao` em leads.
-- Default true preserva comportamento: todo lead novo entra no bolsao.
-- Quando false, o trigger de espelhamento nao cria row em bolsao para esse lead.
--
-- Aplicada em producao em 2026-04-28 via supabase MCP.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS participa_bolsao boolean NOT NULL DEFAULT true;

-- Atualiza trigger pra respeitar a flag: se false, pula espelhamento
CREATE OR REPLACE FUNCTION public.tg_mirror_leads_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.participa_bolsao = false THEN
    RETURN NEW;
  END IF;

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
    NULL,
    0,
    NEW.id
  );
  RETURN NEW;
END;
$$;

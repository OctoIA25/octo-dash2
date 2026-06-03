-- =============================================================================
-- Espelhamento automatico de leads -> proposals (tenant-wide)
--
-- Problema: o Juridico > Visao Geral e a pagina de Propostas montavam a lista a
-- partir de DUAS fontes:
--   1. proposals (RLS por tenant -> igual para todos do tenant)  ✅
--   2. leads convertidos em "stub" via useLeadsMetrics(), que para CORRETOR
--      traz apenas os proprios leads (assigned_agent_id = user.id).  ❌
-- Resultado: contas diferentes do MESMO tenant viam pessoas/negocios diferentes
-- (cada corretor so via os negocios derivados dos proprios leads).
--
-- Solucao: materializar no banco. Todo lead que chega a um estagio de negocio
-- ganha uma proposta-espelho em `proposals` (tenant-wide). Assim a lista passa
-- a sair so de `proposals` e fica identica para todos os usuarios do tenant,
-- independente de quem esta logado. Mesmo padrao do mirror de bolsao
-- (20260427_mirror_leads_and_kenlo_into_bolsao.sql).
--
-- O mapeamento status -> stage replica EXATAMENTE getStageFromStatus do front
-- (src/features/juridico/utils/crmLeadToSavedProposal.ts). A unicidade por
-- (tenant_id, lead_id) ja e garantida pelo indice uq_proposals_tenant_lead
-- (20260601_proposals_unique_lead.sql), reaproveitado aqui no ON CONFLICT.
--
-- Seguranca: o espelhamento e secundario. Em proposta JA existente apenas
-- sincroniza a etapa (stage_id/status), preservando partes/valores/transaction_form
-- editados manualmente no painel. E nunca bloqueia o INSERT/UPDATE do lead
-- (qualquer falha cai no EXCEPTION e retorna NEW).
--
-- Aplicar em producao via supabase MCP / SQL editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mapeia o status do lead para o stage_id da proposta.
--    Espelha getStageFromStatus(status, final_sale_value) do front, na mesma
--    ordem de prioridade. Retorna NULL para leads que ainda nao sao negocio.
--    Os substrings usados sao todos ASCII e aparecem dentro das palavras PT-BR
--    correspondentes (negociacao -> 'negoci', etc.), entao lower() basta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposals_stage_from_lead(
  p_status text,
  p_final_sale_value numeric DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF COALESCE(p_final_sale_value, 0) > 0 THEN
    RETURN 'proposta-assinada';
  END IF;

  v := btrim(lower(COALESCE(p_status, '')));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  IF position('arquivad' IN v) > 0 THEN RETURN 'arquivado'; END IF;
  IF position('assinad' IN v) > 0
     OR position('fechamento' IN v) > 0
     OR position('vendid' IN v) > 0 THEN
    RETURN 'proposta-assinada';
  END IF;
  IF position('feitura' IN v) > 0 OR position('contrato' IN v) > 0 THEN
    RETURN 'feitura-contrato';
  END IF;
  IF position('respondid' IN v) > 0 THEN RETURN 'propostas-respondidas'; END IF;
  IF v = 'proposta' THEN RETURN 'propostas-respondidas'; END IF;
  IF position('enviad' IN v) > 0 THEN RETURN 'proposta-enviada'; END IF;
  IF position('criad' IN v) > 0 THEN RETURN 'proposta-criada'; END IF;
  IF position('negoci' IN v) > 0 THEN RETURN 'negociacao'; END IF;

  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger: espelha o lead em proposals quando ele esta (ou entra) em estagio
--    de negocio. Cria 1 comprador inicial a partir do lead.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_mirror_lead_to_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage       text;
  v_proposal_id uuid;
  v_agent_uuid  uuid;
BEGIN
  v_stage := public.proposals_stage_from_lead(NEW.status, NEW.final_sale_value);

  SELECT id INTO v_proposal_id
  FROM public.proposals
  WHERE tenant_id = NEW.tenant_id AND lead_id = NEW.id
  LIMIT 1;

  -- Proposta-espelho ja existe: NUNCA recria nem mexe em partes/valores. So
  -- ajusta a etapa, e somente em propostas geradas pelo lead (source='crm'),
  -- preservando propostas autorais (draft/manual).
  IF v_proposal_id IS NOT NULL THEN
    IF NEW.archived_at IS NOT NULL THEN
      -- Lead arquivado: tira do board ativo (igual ao front, que filtra o lead).
      UPDATE public.proposals
         SET stage_id = 'arquivado'
       WHERE id = v_proposal_id
         AND source = 'crm'
         AND stage_id IS DISTINCT FROM 'arquivado';
    ELSIF v_stage IS NOT NULL THEN
      UPDATE public.proposals
         SET stage_id = v_stage,
             status   = COALESCE(NULLIF(NEW.status, ''), status)
       WHERE id = v_proposal_id
         AND source = 'crm'
         AND stage_id IS DISTINCT FROM v_stage;
    END IF;
    RETURN NEW;
  END IF;

  -- Nao existe proposta ainda: so cria para lead ATIVO que ja e negocio.
  IF v_stage IS NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- leads.assigned_agent_id e TEXT; so vira agent_user_id se for um uuid real
  -- de auth.users (senao o FK quebraria a operacao no lead).
  v_agent_uuid := NULL;
  IF NEW.assigned_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.assigned_agent_id::uuid) THEN
    v_agent_uuid := NEW.assigned_agent_id::uuid;
  END IF;

  INSERT INTO public.proposals (
    tenant_id, lead_id, source, property_origin, property_reference,
    agent_user_id, agent_name, lead_type, origin, temperature, status,
    stage_id, value, created_at, updated_at
  ) VALUES (
    NEW.tenant_id, NEW.id, 'crm', 'interno', COALESCE(NEW.property_code, ''),
    v_agent_uuid, COALESCE(NEW.assigned_agent_name, ''),
    CASE WHEN NEW.lead_type = 2 THEN 'Proprietário' ELSE 'Interessado' END,
    COALESCE(NEW.source, 'Manual'), COALESCE(NEW.temperature, 'Morno'),
    COALESCE(NULLIF(NEW.status, ''), 'Proposta Criada'),
    v_stage, COALESCE(NEW.final_sale_value, NEW.property_value, 0),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, NEW.created_at, now())
  )
  ON CONFLICT (tenant_id, lead_id) WHERE lead_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_proposal_id;

  -- Corrida: outra transacao criou a proposta no mesmo instante.
  IF v_proposal_id IS NULL THEN
    SELECT id INTO v_proposal_id
    FROM public.proposals
    WHERE tenant_id = NEW.tenant_id AND lead_id = NEW.id
    LIMIT 1;
  END IF;

  -- Comprador inicial a partir do lead (so se ainda nao houver partes).
  IF v_proposal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proposal_parties WHERE proposal_id = v_proposal_id
  ) THEN
    INSERT INTO public.proposal_parties (
      proposal_id, tenant_id, party_type, full_name, phone, email,
      signature_channel, signature_status
    ) VALUES (
      v_proposal_id, NEW.tenant_id, 'comprador',
      COALESCE(NEW.name, ''), COALESCE(NEW.phone, ''), COALESCE(NEW.email, ''),
      'whatsapp', 'pendente'
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Espelhamento e secundario: nunca pode bloquear o CRUD de leads.
    RAISE WARNING 'tg_mirror_lead_to_proposal falhou para lead %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_mirror_to_proposals ON public.leads;
CREATE TRIGGER tr_leads_mirror_to_proposals
  AFTER INSERT OR UPDATE OF status, final_sale_value, archived_at ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_mirror_lead_to_proposal();

-- -----------------------------------------------------------------------------
-- 3. Backfill: materializa os leads existentes que ja sao negocio e ainda nao
--    possuem proposta espelhada.
-- -----------------------------------------------------------------------------
INSERT INTO public.proposals (
  tenant_id, lead_id, source, property_origin, property_reference,
  agent_user_id, agent_name, lead_type, origin, temperature, status,
  stage_id, value, created_at, updated_at
)
SELECT
  l.tenant_id, l.id, 'crm', 'interno', COALESCE(l.property_code, ''),
  CASE
    WHEN l.assigned_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.assigned_agent_id::uuid)
    THEN l.assigned_agent_id::uuid
    ELSE NULL
  END,
  COALESCE(l.assigned_agent_name, ''),
  CASE WHEN l.lead_type = 2 THEN 'Proprietário' ELSE 'Interessado' END,
  COALESCE(l.source, 'Manual'), COALESCE(l.temperature, 'Morno'),
  COALESCE(NULLIF(l.status, ''), 'Proposta Criada'),
  public.proposals_stage_from_lead(l.status, l.final_sale_value),
  COALESCE(l.final_sale_value, l.property_value, 0),
  COALESCE(l.created_at, now()), COALESCE(l.updated_at, l.created_at, now())
FROM public.leads l
WHERE l.archived_at IS NULL
  AND public.proposals_stage_from_lead(l.status, l.final_sale_value) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.tenant_id = l.tenant_id AND p.lead_id = l.id
  )
ON CONFLICT (tenant_id, lead_id) WHERE lead_id IS NOT NULL DO NOTHING;

-- 3b. Comprador inicial para as propostas-espelho recem-criadas (source='crm'
--     vinculadas a um lead e ainda sem nenhuma parte cadastrada).
INSERT INTO public.proposal_parties (
  proposal_id, tenant_id, party_type, full_name, phone, email,
  signature_channel, signature_status
)
SELECT
  p.id, p.tenant_id, 'comprador',
  COALESCE(l.name, ''), COALESCE(l.phone, ''), COALESCE(l.email, ''),
  'whatsapp', 'pendente'
FROM public.proposals p
JOIN public.leads l ON l.id = p.lead_id AND l.tenant_id = p.tenant_id
WHERE p.source = 'crm'
  AND NOT EXISTS (
    SELECT 1 FROM public.proposal_parties pp WHERE pp.proposal_id = p.id
  );

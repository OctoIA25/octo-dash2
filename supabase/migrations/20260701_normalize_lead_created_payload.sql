-- =============================================================================
-- Webhook lead.created — payload normalizado (origem-agnóstico)
--
-- Contexto: a função enqueue_lead_created_webhook (migração
-- 20260625_enqueue_lead_created_kenlo_leads.sql) enfileirava to_jsonb(NEW) cru.
-- Problema: as tabelas leads e kenlo_leads têm nomes de coluna DIFERENTES
--   - leads:       name / phone / email / source
--   - kenlo_leads: client_name / client_phone / client_email / portal
-- Logo o consumidor (Lia) recebia formatos distintos conforme a origem do lead.
--
-- Esta migração troca APENAS o corpo da função para montar um payload estável,
-- cobrindo as duas tabelas via COALESCE. Os triggers em leads e kenlo_leads
-- (criados na 20260625) continuam válidos — só o corpo da função muda.
--
-- Compatibilidade com a Lia (n8n): o disparo antigo (fireLia no Kenlo) enviava
-- { nome, numero, portal, codigo }. O payload abaixo MANTÉM essas 4 chaves
-- (numero = telefone; portal preservado) e ADICIONA campos úteis. Campos extras
-- são ignorados pelo n8n atual; nada quebra.
--
-- Usamos to_jsonb(NEW)->>'coluna' em vez de NEW.coluna porque a MESMA função
-- roda sobre duas tabelas com colunas diferentes; referenciar NEW.client_phone
-- em public.leads (que não tem essa coluna) seria erro de compilação plpgsql.
-- Via to_jsonb, coluna ausente resolve como NULL em runtime.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_lead_created_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_telefone text;
  v_portal text;
BEGIN
  -- leads usa phone; kenlo_leads usa client_phone.
  v_telefone := COALESCE(v_row->>'phone', v_row->>'client_phone');
  -- leads usa source; kenlo_leads usa portal. "portal" é o nome que a Lia já lê.
  v_portal   := COALESCE(v_row->>'portal', v_row->>'source');

  INSERT INTO public.webhook_events (tenant_id, event_type, source_table, source_id, payload)
  VALUES (
    NEW.tenant_id,
    'lead.created',
    TG_TABLE_NAME,          -- 'leads' ou 'kenlo_leads'
    NEW.id::text,
    jsonb_build_object(
      -- Compat com o payload antigo da Lia ({ nome, numero, portal, codigo }):
      'nome',      COALESCE(v_row->>'name',               v_row->>'client_name'),
      'numero',    v_telefone,
      'portal',    v_portal,
      'codigo',    COALESCE(v_row->>'interest_reference', v_row->>'property_code'),
      -- Campos adicionais (normalizados):
      'id',        NEW.id::text,
      'telefone',  v_telefone,
      'email',     COALESCE(v_row->>'email',              v_row->>'client_email'),
      'origem',    v_portal,
      'corretor',  COALESCE(v_row->>'assigned_agent_name', v_row->>'attended_by_name'),
      'tenant_id', NEW.tenant_id::text,
      'tags',      COALESCE(v_row->'tags', '[]'::jsonb),
      'created_at', v_row->>'created_at'
    )
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

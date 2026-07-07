-- =============================================================================
-- Webhook lead.created — inclui a observação (comments/message) no payload
--
-- Contexto: a 20260702_ensure_whatsapp_conversation_on_lead_created anexa o
-- link da conversa ("📱 Conversa WhatsApp: <url>") ao FINAL da observação do
-- lead (leads.comments / kenlo_leads.message) via trigger BEFORE INSERT.
-- Porém o payload normalizado do lead.created (20260701) não enviava esse
-- campo — o lead chegava no portal de destino sem a observação e, portanto,
-- sem o link da conversa para o corretor que for atendê-lo.
--
-- Esta migração troca APENAS o corpo da função para adicionar a chave
-- 'observacao' (COALESCE de comments/message, cobrindo as duas tabelas).
-- Ordem dos triggers garante o link no payload: BEFORE INSERT (anexa o link
-- em NEW) roda antes do AFTER INSERT (enfileira to_jsonb(NEW) já com o link).
-- Campos extras são ignorados pelo n8n atual; nada quebra.
--
-- Pré-requisito do link (20260702): ALTER DATABASE postgres
--   SET app.dash_base_url = 'https://<host-da-dash>';
-- Sem essa configuração a observação segue no payload, mas sem a linha do link.
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
  -- kenlo_leads usa portal (tentado 1º); leads usa source. "portal" é o nome que a Lia já lê.
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
      -- leads usa comments; kenlo_leads usa message. Inclui a linha
      -- "📱 Conversa WhatsApp: <url>" anexada pelo trigger BEFORE INSERT.
      'observacao', COALESCE(v_row->>'comments',          v_row->>'message'),
      'tenant_id', NEW.tenant_id::text,
      'tags',      COALESCE(v_row->'tags', '[]'::jsonb),
      'created_at', v_row->>'created_at'
    )
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

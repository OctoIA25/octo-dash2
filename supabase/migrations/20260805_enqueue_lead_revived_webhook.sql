-- =============================================================================
-- lead.created também para lead REVIVIDO (cliente que volta pelo mesmo telefone)
--
-- Contexto: quando chega um lead cujo telefone já existe no tenant (constraint
-- unique_phone_per_tenant), o servidor NÃO insere — ele atualiza o lead
-- existente e o traz para o topo da lista (insertOrReviveLead,
-- server/proxy-production.js). Como o trigger de lead.created era AFTER INSERT,
-- todo cliente que voltava entrava no CRM sem acionar a Lia, em silêncio.
-- Diagnosticado em 05/08/2026: um lead de teste vindo do ZAP às 13:56 reviveu
-- um lead de 26/06 e nenhum evento foi enfileirado em webhook_events.
--
-- Duas mudanças:
--
-- 1) TRIGGER AFTER UPDATE em public.leads com WHEN (created_at mudou).
--    Reescrever created_at é a assinatura EXCLUSIVA do revive — é o único
--    UPDATE do código que toca essa coluna. UPDATEs comuns (mudar etapa,
--    atribuir corretor, editar dados) não disparam. O segundo termo do WHEN é
--    um freio contra escrita em massa: uma migração futura que RESTAURE o
--    created_at original (corrigindo a data que o revive sobrescreve) não vira
--    disparo retroativo de Lia para a base inteira.
--
-- 2) source_id do evento passa a variar por revive. O índice único do outbox é
--    (event_type, source_table, source_id): mantendo source_id = id do lead, o
--    ON CONFLICT DO NOTHING engoliria TODO revive, porque aquele lead já teve
--    um lead.created na criação original. No INSERT o source_id continua sendo
--    o id puro (idempotência histórica preservada); no revive vira
--    '<id>:<epoch_ms>', que dedupa re-execução do MESMO revive e libera
--    revives distintos. A chave 'id' do payload continua sendo o id do lead —
--    para a Lia nada muda.
--
-- Também instala tr_ensure_whatsapp_conversation (20260702) em BEFORE UPDATE
-- com o mesmo WHEN, senão o payload do revive sairia sem a linha
-- "📱 Conversa WhatsApp: <url>" que todo lead novo carrega. A função é segura
-- em UPDATE: reusa a conversa existente, só preenche campos vazios e anexa o
-- link de forma idempotente. Ordem preservada: BEFORE (escreve o link em NEW)
-- roda antes do AFTER (enfileira to_jsonb(NEW) já com o link).
--
-- Fora de escopo, proposital: kenlo_leads não tem caminho de revive — o engine
-- de sync nunca escreve created_at.
--
-- Idempotente: pode reaplicar.
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
  v_source_id text;
BEGIN
  -- leads usa phone; kenlo_leads usa client_phone.
  v_telefone := COALESCE(v_row->>'phone', v_row->>'client_phone');
  -- kenlo_leads usa portal (tentado 1º); leads usa source. "portal" é o nome que a Lia já lê.
  v_portal   := COALESCE(v_row->>'portal', v_row->>'source');

  -- INSERT: id puro (dedup histórico intacto). UPDATE = revive: id + instante do
  -- revive, senão o índice único engoliria o evento por causa do lead.created
  -- emitido na criação original do mesmo lead.
  v_source_id := CASE
    WHEN TG_OP = 'UPDATE'
      THEN NEW.id::text || ':' || (EXTRACT(EPOCH FROM NEW.created_at) * 1000)::bigint::text
    ELSE NEW.id::text
  END;

  INSERT INTO public.webhook_events (tenant_id, event_type, source_table, source_id, payload)
  VALUES (
    NEW.tenant_id,
    'lead.created',
    TG_TABLE_NAME,          -- 'leads' ou 'kenlo_leads'
    v_source_id,
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
      -- "📱 Conversa WhatsApp: <url>" anexada pelo trigger BEFORE.
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

-- Revive: o lead volta ao topo com created_at reescrito. Só em public.leads —
-- é onde insertOrReviveLead atua.
DROP TRIGGER IF EXISTS tr_enqueue_lead_revived_webhook ON public.leads;
CREATE TRIGGER tr_enqueue_lead_revived_webhook
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (NEW.created_at IS DISTINCT FROM OLD.created_at
        AND NEW.created_at >= now() - interval '5 minutes')
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();

-- Mesmo gatilho para o link da conversa, senão o revive iria sem ele.
DROP TRIGGER IF EXISTS tr_ensure_whatsapp_conversation_revived ON public.leads;
CREATE TRIGGER tr_ensure_whatsapp_conversation_revived
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (NEW.created_at IS DISTINCT FROM OLD.created_at
        AND NEW.created_at >= now() - interval '5 minutes')
  EXECUTE FUNCTION public.ensure_whatsapp_conversation_for_lead();

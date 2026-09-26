-- ============================================================
-- As seis colunas `meta_*` no payload do `lead.created` — 26/09
--
-- A LIA vinha fazendo um GET por lead para lê-las, porque o emissor não as
-- carregava. Combinado que resolveríamos; é isto.
--
-- POR QUE `->` E NÃO `->>`
--
-- `meta_captado` e `meta_lia_atende` são BOOLEANOS DE TRÊS ESTADOS, e a LIA
-- combinou não agir com nulo:
--
--     true  = o formulário está ligado
--     false = alguém desligou
--     null  = ninguém cadastrou esse formulário — não sabemos
--
-- `->>` devolveria a STRING "false", e `"false"` é verdadeiro em JavaScript.
-- A trava que a LIA construiu para não abordar lead de formulário desligado
-- falharia exatamente nos leads que ela existe para proteger. `->` preserva o
-- booleano e o nulo do jsonb.
--
-- POR QUE FUNCIONA PARA AS DUAS TABELAS
--
-- O gatilho serve `leads` e `kenlo_leads`, e só `leads` tem estas colunas.
-- Em `kenlo_leads` a chave não existe e `->` devolve nulo — que é a resposta
-- certa: lead que não veio da Meta não tem o que dizer sobre formulário.
--
-- ORDEM DOS GATILHOS, CONFERIDA
--
-- `leads_promove_meta` é BEFORE e este é AFTER, então as colunas já estão
-- preenchidas quando o payload é montado. Se um dia alguém mover este para
-- BEFORE, as seis voltam a sair nulas — e em silêncio.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_lead_created_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'created_at', v_row->>'created_at',
      -- As seis da Meta. `->` e não `->>`: ver o cabeçalho da migration.
      'meta_captado',     v_row->'meta_captado',
      'meta_lia_atende',  v_row->'meta_lia_atende',
      'meta_form_id',     v_row->'meta_form_id',
      'meta_ad_id',       v_row->'meta_ad_id',
      'meta_adset_id',    v_row->'meta_adset_id',
      'meta_campaign_id', v_row->'meta_campaign_id'
    )
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enqueue_lead_created_webhook() IS
  'Enfileira lead.created para a LIA. Desde 26/09 leva as seis colunas meta_*, com `->` para preservar o booleano de tres estados (null = formulario nao cadastrado, e a LIA nao age com nulo).';

COMMIT;

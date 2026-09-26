-- ============================================================
-- As seis `meta_*` no payload do `lead.created` — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/meta_no_payload_do_lead_created.test.sql
--
-- O caso 2 é o que sustenta o arquivo: `false` tem de chegar como BOOLEANO.
-- Com `->>` ele viraria a string "false", que é verdadeira em JavaScript — e
-- a trava da LIA para não abordar lead de formulário desligado falharia
-- exatamente nos leads que ela existe para proteger.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := 'deda0000-0000-4000-a000-00000000000d';
  l_id uuid;
  p    jsonb;

  payload jsonb := jsonb_build_object('raw_data', jsonb_build_object('meta',
    jsonb_build_object('ad_id','AD9','adset_id','ADS9','campaign_id','CAMP9',
                       'form_id','FORM-LIGADO','page_id','PG9','platform','fb')));
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-payload', 'Casa do Payload')
  ON CONFLICT DO NOTHING;
  INSERT INTO meta_formularios (tenant_id, form_id, page_id, nome, captacao_ativa, lia_atende)
  VALUES (casa, 'FORM-LIGADO',    'PG9', 'Ligado',    true,  true),
         (casa, 'FORM-DESLIGADO', 'PG9', 'Desligado', false, false);

  -- ---------- 1. Formulário LIGADO ----------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Um', '11900000201', 'Facebook', 'Novos Leads', 1, payload)
  RETURNING id INTO l_id;

  SELECT w.payload INTO p FROM webhook_events w
   WHERE w.event_type = 'lead.created' AND w.source_id = l_id::text;

  IF p IS NULL THEN RAISE EXCEPTION 'FALHOU 1: nao enfileirou o lead.created'; END IF;
  IF (p->'meta_captado') IS DISTINCT FROM 'true'::jsonb
     OR (p->'meta_lia_atende') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 1: as chaves nao chegaram verdadeiras -- %', p;
  END IF;
  IF (p->>'meta_campaign_id') IS DISTINCT FROM 'CAMP9' THEN
    RAISE EXCEPTION 'FALHOU 1b: a campanha nao entrou no payload -- %', p->'meta_campaign_id';
  END IF;
  RAISE NOTICE 'OK 1: formulario ligado chega com as seis';

  -- ---------- 2. O CASO QUE SUSTENTA O ARQUIVO ----------
  -- `false` BOOLEANO, nunca a string "false".
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Dois', '11900000202', 'Facebook', 'Novos Leads', 1,
          jsonb_set(payload, '{raw_data,meta,form_id}', '"FORM-DESLIGADO"'))
  RETURNING id INTO l_id;

  SELECT w.payload INTO p FROM webhook_events w
   WHERE w.event_type = 'lead.created' AND w.source_id = l_id::text;

  IF jsonb_typeof(p->'meta_captado') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'FALHOU 2: meta_captado chegou como %, e nao boolean -- "false" e VERDADEIRO em JS',
      jsonb_typeof(p->'meta_captado');
  END IF;
  IF (p->'meta_captado') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 2b: formulario desligado nao chegou false -- %', p->'meta_captado';
  END IF;
  RAISE NOTICE 'OK 2: desligado chega como booleano false, nao string';

  -- ---------- 3. Formulário desconhecido chega NULO ----------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Tres', '11900000203', 'Facebook', 'Novos Leads', 1,
          jsonb_set(payload, '{raw_data,meta,form_id}', '"FORM-QUE-NINGUEM-CADASTROU"'))
  RETURNING id INTO l_id;

  SELECT w.payload INTO p FROM webhook_events w
   WHERE w.event_type = 'lead.created' AND w.source_id = l_id::text;

  IF jsonb_typeof(p->'meta_captado') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'FALHOU 3: formulario desconhecido devia chegar nulo, veio %', p->'meta_captado';
  END IF;
  RAISE NOTICE 'OK 3: formulario desconhecido chega NULO -- a LIA nao age com nulo';

  -- ---------- 4. Lead fora da Meta ----------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type)
  VALUES (gen_random_uuid(), casa, 'Lead Quatro', '11900000204', 'ZAP Imóveis', 'Novos Leads', 1)
  RETURNING id INTO l_id;

  SELECT w.payload INTO p FROM webhook_events w
   WHERE w.event_type = 'lead.created' AND w.source_id = l_id::text;

  IF jsonb_typeof(p->'meta_captado') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'FALHOU 4: lead fora da Meta devia chegar nulo';
  END IF;
  -- E o payload antigo continua inteiro: a Lia lê estas quatro desde sempre.
  IF (p->>'nome') IS DISTINCT FROM 'Lead Quatro' OR (p->>'numero') IS DISTINCT FROM '11900000204' THEN
    RAISE EXCEPTION 'FALHOU 4b: o payload antigo quebrou -- %', p;
  END IF;
  RAISE NOTICE 'OK 4: lead fora da Meta chega nulo, e o payload antigo segue intacto';
END $$;

ROLLBACK;

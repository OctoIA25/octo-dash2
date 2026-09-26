-- ============================================================
-- As duas chaves da Meta vêm do CADASTRO do formulário — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/meta_captado_vem_do_formulario.test.sql
--
-- `meta_captado` e `meta_lia_atende` estavam nulas em 5.405 de 5.405 leads. O
-- gatilho as procurava no payload da Meta, que nunca as trouxe: elas são do
-- FORMULÁRIO, não do lead.
--
-- O caso 3 é o que sustenta este arquivo, e é o único que descreve um estrago
-- em vez de uma ausência: formulário não cadastrado NÃO pode virar `false`.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := 'deda0000-0000-4000-a000-000000000001';
  l_id uuid;
  v_captado boolean;
  v_atende  boolean;

  -- O payload REAL da integração, com as oito chaves que ela grava. Repare no
  -- que não está aqui: `captacao_ativa` e `lia_atende`. Um exemplo que as
  -- incluísse faria o teste passar sobre um caso que não existe.
  payload jsonb := jsonb_build_object('raw_data', jsonb_build_object('meta',
    jsonb_build_object(
      'ad_id', 'AD1', 'adset_id', 'ADS1', 'campaign_id', 'CAMP1',
      'created_time', '2026-09-26T10:00:00Z', 'form_id', 'FORM-LIGADO',
      'leadgen_id', 'LG1', 'page_id', 'PG1', 'platform', 'fb')));
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-meta', 'Casa da Meta')
  ON CONFLICT DO NOTHING;

  INSERT INTO meta_formularios (tenant_id, form_id, page_id, nome, captacao_ativa, lia_atende)
  VALUES (casa, 'FORM-LIGADO',   'PG1', 'Ligado',   true,  true),
         (casa, 'FORM-DESLIGADO','PG1', 'Desligado', false, false);

  -- ----------------------------------------------------------
  -- 1. FORMULÁRIO LIGADO
  -- ----------------------------------------------------------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Um', '11900000001', 'Facebook', 'Novos Leads', 1, payload)
  RETURNING id INTO l_id;

  SELECT meta_captado, meta_lia_atende INTO v_captado, v_atende FROM leads WHERE id = l_id;
  IF v_captado IS DISTINCT FROM true OR v_atende IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 1: formulario ligado deu captado=%, atende=%', v_captado, v_atende;
  END IF;
  -- E os quatro que já funcionavam continuam funcionando.
  IF (SELECT meta_campaign_id FROM leads WHERE id = l_id) IS DISTINCT FROM 'CAMP1' THEN
    RAISE EXCEPTION 'FALHOU 1b: a campanha parou de ser promovida';
  END IF;
  RAISE NOTICE 'OK 1: formulario ligado marca as duas como verdadeiras';

  -- ----------------------------------------------------------
  -- 2. FORMULÁRIO DESLIGADO
  --
  -- É o caso que a Lia vai ler para NÃO distribuir e NÃO abordar. Sem ele,
  -- desligar um formulário na tela não teria efeito nenhum no lead.
  -- ----------------------------------------------------------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Dois', '11900000002', 'Facebook', 'Novos Leads', 1,
          jsonb_set(payload, '{raw_data,meta,form_id}', '"FORM-DESLIGADO"'))
  RETURNING id INTO l_id;

  SELECT meta_captado, meta_lia_atende INTO v_captado, v_atende FROM leads WHERE id = l_id;
  IF v_captado IS DISTINCT FROM false OR v_atende IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 2: formulario desligado deu captado=%, atende=%', v_captado, v_atende;
  END IF;
  RAISE NOTICE 'OK 2: formulario desligado marca as duas como falsas';

  -- ----------------------------------------------------------
  -- 3. FORMULÁRIO NÃO CADASTRADO FICA NULO — NUNCA `false`
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  --
  -- `false` quer dizer "alguém desligou". Um formulário que ninguém cadastrou
  -- não disse isso. Gravar `false` por omissão pararia a distribuição de um
  -- lead legítimo e a tela mostraria o motivo como decisão de alguém.
  -- ----------------------------------------------------------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Tres', '11900000003', 'Facebook', 'Novos Leads', 1,
          jsonb_set(payload, '{raw_data,meta,form_id}', '"FORM-QUE-NINGUEM-CADASTROU"'))
  RETURNING id INTO l_id;

  SELECT meta_captado, meta_lia_atende INTO v_captado, v_atende FROM leads WHERE id = l_id;
  IF v_captado IS NOT NULL OR v_atende IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 3: formulario desconhecido virou captado=%, atende=% — devia ficar nulo',
      v_captado, v_atende;
  END IF;
  RAISE NOTICE 'OK 3: formulario desconhecido fica NULO, e nao falso';

  -- ----------------------------------------------------------
  -- 4. O PAYLOAD EXPLÍCITO VENCE O CADASTRO
  --
  -- Se um dia a integração passar a mandar o dado, ela está afirmando algo
  -- sobre AQUELE lead — e isso é mais específico que a configuração do
  -- formulário inteiro.
  -- ----------------------------------------------------------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type, custom_fields)
  VALUES (gen_random_uuid(), casa, 'Lead Quatro', '11900000004', 'Facebook', 'Novos Leads', 1,
          jsonb_set(jsonb_set(payload, '{raw_data,meta,form_id}', '"FORM-LIGADO"'),
                    '{raw_data,meta,lia_atende}', 'false'))
  RETURNING id INTO l_id;

  SELECT meta_captado, meta_lia_atende INTO v_captado, v_atende FROM leads WHERE id = l_id;
  IF v_atende IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 4: o payload explicito nao venceu o cadastro — atende=%', v_atende;
  END IF;
  IF v_captado IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 4b: a outra chave deixou de vir do cadastro — captado=%', v_captado;
  END IF;
  RAISE NOTICE 'OK 4: o payload vence, e a chave que ele nao traz vem do cadastro';

  -- ----------------------------------------------------------
  -- 5. LEAD QUE NÃO É DA META NÃO É TOCADO
  --
  -- Nulo ali significa "siga como sempre", e é o que a Lia combinou ler.
  -- ----------------------------------------------------------
  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type)
  VALUES (gen_random_uuid(), casa, 'Lead Cinco', '11900000005', 'ZAP Imóveis', 'Novos Leads', 1)
  RETURNING id INTO l_id;

  SELECT meta_captado, meta_lia_atende INTO v_captado, v_atende FROM leads WHERE id = l_id;
  IF v_captado IS NOT NULL OR v_atende IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 5: lead fora da Meta foi marcado';
  END IF;
  RAISE NOTICE 'OK 5: lead que nao e da Meta segue nulo';
END $$;

ROLLBACK;

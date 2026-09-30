-- ============================================================
-- O código do imóvel nas vendas de terceiros — 29/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/codigo_das_vendas_de_terceiros.test.sql
--
-- O caso que sustenta o arquivo é o 2: o código é da VENDA. Digitado numa
-- linha, aparece na parcela; e NÃO aparece na venda de outro cliente, nem
-- quando a planilha é relida com as linhas em outra ordem.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa     uuid := 'c0d10000-0000-4000-a000-000000000001';
  u_admin  uuid := 'c0d11111-0000-4000-a000-000000000001';
  u_ana    uuid := 'c0d11111-0000-4000-a000-000000000002';
  cabeca   uuid := 'c0d12222-0000-4000-a000-000000000001';
  parcela  uuid := 'c0d12222-0000-4000-a000-000000000002';
  outra    uuid := 'c0d12222-0000-4000-a000-000000000003';
  sem_data uuid := 'c0d12222-0000-4000-a000-000000000004';
  lanc     uuid := 'c0d12222-0000-4000-a000-000000000005';
  p_terc   uuid;
  p_lanc   uuid;
  p_vazia  uuid;
  r        jsonb;
  cod      jsonb;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-codigo-terceiros', 'Casa') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin, 'admin@codigo.local', '{"name":"Diretoria"}'::jsonb),
    (u_ana,   'ana@codigo.local',   '{"name":"Ana"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, u_admin, 'admin'), (casa, u_ana, 'corretor');
  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo) VALUES
    (casa, 'TERCEIROS', 'TERCEIROS', 'terceiros'),
    (casa, 'CASTANHEIRA', 'RESERVA CASTANHEIRA', 'lancamento');

  INSERT INTO commercial_sales
    (id, tenant_id, empreendimento, quadra, unidade, origem, area_m2, valor_m2,
     total_unidade, valor_vgv, valor_vgc, valor_imovel, comissao_total_venda,
     valor_conta_japi, cliente_nome, corretor_nome, tipo,
     repasse_20, repasse_40, repasse_45, repasse_50, team_leader_valor,
     data_assinatura, data_recebimento, observacoes, raw_row, is_active)
  VALUES
    -- a venda a prazo: cabeça e parcela, com o nome escrito de dois jeitos
    (cabeca, casa, 'Terceiros', NULL, NULL, 'Permuta', 0, 0, 2650000, 0, 0, 0, 66250,
     0, 'Angelo Finati', 'Ana', 'PL', 0, 0, 0, 21875, 0, '2026-01-30', '2026-02-09', NULL, '{}'::jsonb, true),
    (parcela, casa, 'TERCEIROS', NULL, NULL, 'Permuta', 0, 0, 0, 0, 0, 0, 0,
     0, 'ANGELO FINATI ', 'Ana', 'PL', 0, 0, 0, 1250, 0, '2026-01-30', '2026-03-06', 'ok', '{}'::jsonb, true),
    -- outra venda de terceiros, mesmo dia, outro cliente
    (outra, casa, 'Terceiros', NULL, NULL, 'ZAP', 0, 0, 500000, 0, 0, 0, 15000,
     0, 'Outro Cliente', 'Ana', 'PL', 0, 6000, 0, 0, 0, '2026-01-30', NULL, NULL, '{}'::jsonb, true),
    (sem_data, casa, 'Terceiros', NULL, NULL, NULL, 0, 0, 300000, 0, 0, 0, 9000,
     0, 'Sem Data', 'Ana', 'PL', 0, 3600, 0, 0, 0, NULL, NULL, NULL, '{}'::jsonb, true),
    (lanc, casa, 'Castanheira', 'B', '27', 'Santa', 0, 0, 470000, 460000, 0, 0, 23000,
     0, 'Cliente Lanc', 'Ana', 'PL', 0, 9200, 0, 0, 4600, '2026-02-28', NULL, NULL, '{}'::jsonb, true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. O TIPO VAI NA LINHA, para a tela saber onde cabe o código
  -- ----------------------------------------------------------
  r := public.vendas_planilha_conferencia(casa);
  SELECT jsonb_object_agg(l ->> 'id', l -> 'tipo_negocio') INTO cod FROM jsonb_array_elements(r -> 'linhas') l;
  IF cod ->> cabeca::text IS DISTINCT FROM 'terceiros' OR cod ->> lanc::text IS DISTINCT FROM 'lancamento' THEN
    RAISE EXCEPTION 'FALHOU 1: tipo_negocio errado — %', cod;
  END IF;
  RAISE NOTICE 'OK 1: a linha diz se e lancamento ou terceiros';

  -- ----------------------------------------------------------
  -- 2. O CÓDIGO É DA VENDA
  -- ----------------------------------------------------------
  PERFORM public.venda_planilha_gravar_codigo(parcela, '  110D1GD ');
  r := public.vendas_planilha_conferencia(casa);
  SELECT jsonb_object_agg(l ->> 'id', l -> 'codigo_imovel') INTO cod FROM jsonb_array_elements(r -> 'linhas') l;
  IF cod ->> cabeca::text  IS DISTINCT FROM '110D1GD'
  OR cod ->> parcela::text IS DISTINCT FROM '110D1GD' THEN
    RAISE EXCEPTION 'FALHOU 2: o codigo digitado na parcela nao chegou a venda inteira — %', cod;
  END IF;
  IF cod -> outra::text IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 2b: o codigo vazou para a venda de outro cliente — %', cod;
  END IF;
  RAISE NOTICE 'OK 2: digitado numa linha, vale para a cabeca e a parcela, e so para elas';

  -- A releitura casa as linhas pela POSIÇÃO no arquivo: aqui a linha da
  -- "outra" venda passa a guardar o conteúdo da cabeça, e vice-versa. O
  -- código tem de seguir a venda, não o id.
  UPDATE commercial_sales SET cliente_nome = 'Outro Cliente', total_unidade = 500000 WHERE id = cabeca;
  UPDATE commercial_sales SET cliente_nome = 'Angelo Finati', total_unidade = 2650000 WHERE id = outra;
  r := public.vendas_planilha_conferencia(casa);
  SELECT jsonb_object_agg(l ->> 'id', l -> 'codigo_imovel') INTO cod FROM jsonb_array_elements(r -> 'linhas') l;
  IF cod ->> outra::text IS DISTINCT FROM '110D1GD' OR cod -> cabeca::text IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 2c: a planilha trocou as linhas de lugar e o codigo ficou no id — %', cod;
  END IF;
  RAISE NOTICE 'OK 2c: linhas trocadas de lugar, o codigo segue a venda';

  -- Apagar é mandar vazio.
  PERFORM public.venda_planilha_gravar_codigo(parcela, '   ');
  IF EXISTS (SELECT 1 FROM venda_planilha_codigo WHERE tenant_id = casa) THEN
    RAISE EXCEPTION 'FALHOU 2d: codigo vazio nao apagou';
  END IF;
  RAISE NOTICE 'OK 2d: codigo vazio apaga';

  -- Sem data de assinatura não há venda para amarrar.
  BEGIN
    PERFORM public.venda_planilha_gravar_codigo(sem_data, 'X1');
    RAISE EXCEPTION 'FALHOU 2e: gravou codigo numa linha sem data de assinatura';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 2e: linha sem data recusa o codigo, com o motivo';

  -- ----------------------------------------------------------
  -- 3. QUEM NÃO É DO FINANCEIRO NÃO GRAVA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ana, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.venda_planilha_gravar_codigo(cabeca, 'Z9');
    RAISE EXCEPTION 'FALHOU 3: a corretora gravou o codigo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  IF has_function_privilege('anon', 'public.venda_planilha_gravar_codigo(uuid,text)', 'execute')
  OR has_table_privilege('anon', 'public.venda_planilha_codigo', 'select')
  OR has_table_privilege('authenticated', 'public.venda_planilha_codigo', 'insert') THEN
    RAISE EXCEPTION 'FALHOU 3b: a tabela ou a funcao ficaram abertas';
  END IF;
  RAISE NOTICE 'OK 3: so o financeiro grava; a tabela so se abre pelas funcoes';

  -- ----------------------------------------------------------
  -- 4. NO CRM, O CÓDIGO VEM DA PROPOSTA
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, stage_id, value, property_reference, forecast_unidade)
    VALUES (casa, 'proposta-criada', 1, '110D1GD', NULL) RETURNING id INTO p_terc;
  INSERT INTO proposals (tenant_id, stage_id, value, property_reference, forecast_unidade)
    VALUES (casa, 'proposta-criada', 1, 'Castanheira B-27', 'B-27') RETURNING id INTO p_lanc;
  INSERT INTO proposals (tenant_id, stage_id, value, property_reference)
    VALUES (casa, 'proposta-criada', 1, 'Imóvel da carteira') RETURNING id INTO p_vazia;
  INSERT INTO vendas (tenant_id, proposta_id, data_venda, empreendimento, tipo, corretor_nome, vgv) VALUES
    (casa, p_terc,  '2026-09-10', 'Casa na Vila', 'terceiros',  'Ana', 100),
    (casa, p_lanc,  '2026-09-11', 'Castanheira',  'lancamento', 'Ana', 100),
    (casa, p_vazia, '2026-09-12', 'Apto',         'terceiros',  'Ana', 100);

  r := public.vendas_conferencia(casa, '2026-09-01', '2026-09-30');
  SELECT jsonb_object_agg(l ->> 'empreendimento', l -> 'codigo') INTO cod FROM jsonb_array_elements(r -> 'linhas') l;
  IF cod ->> 'Casa na Vila' IS DISTINCT FROM '110D1GD'
  OR cod ->> 'Castanheira'  IS DISTINCT FROM 'B-27'
  OR cod -> 'Apto'          IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 4: codigo do CRM errado — %', cod;
  END IF;
  RAISE NOTICE 'OK 4: terceiros traz o codigo da proposta, lancamento a unidade, e "Imovel da carteira" nao e codigo';
END $$;

ROLLBACK;

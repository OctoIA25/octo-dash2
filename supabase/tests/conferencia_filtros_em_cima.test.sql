-- ============================================================
-- Conferência de vendas: os filtros em cima — 29/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/conferencia_filtros_em_cima.test.sql
--
-- O cenário copia a forma das linhas reais da Lotus: a venda a prazo do
-- Angelo (uma linha com o valor cheio e parcelas zeradas embaixo), o
-- "1 de 5" escrito no status, e dois negócios do mesmo cliente no mesmo dia
-- — que NÃO são parcela um do outro.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- A linha crua da planilha com uma célula na posição 20, a da "Comissão
-- Imobiliária". As outras 24 ficam vazias.
CREATE FUNCTION pg_temp.linha_com(celula text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('values',
    (SELECT jsonb_agg(CASE WHEN i = 20 THEN celula ELSE '' END ORDER BY i)
       FROM generate_series(0, 24) i))
$$;

DO $$
DECLARE
  casa     uuid := 'f11e0000-0000-4000-a000-000000000001';
  u_admin  uuid := 'f11e1111-0000-4000-a000-000000000001';
  u_ana    uuid := 'f11e1111-0000-4000-a000-000000000002';
  u_bia    uuid := 'f11e1111-0000-4000-a000-000000000003';
  eq_lanc  uuid := 'f11e2222-0000-4000-a000-000000000001';
  eq_pront uuid := 'f11e2222-0000-4000-a000-000000000002';
  c_sa     uuid := 'f11e3333-0000-4000-a000-000000000001';
  c_mac    uuid := 'f11e3333-0000-4000-a000-000000000002';
  l_rc     uuid := 'f11e4444-0000-4000-a000-000000000001';
  l_av     uuid := 'f11e4444-0000-4000-a000-000000000002';
  lead_zap uuid;
  p_lead   uuid;
  p_manual uuid;
  r        jsonb;
  sit      jsonb;
  imob     jsonb;
  n        int;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-filtros-conf', 'Casa') ON CONFLICT DO NOTHING;
  INSERT INTO platform_owners (email) VALUES ('owner@filtros.local') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin, 'admin@filtros.local', '{"name":"Diretoria"}'::jsonb),
    (u_ana,   'ana@filtros.local',   '{"name":"Ana Lanca"}'::jsonb),
    (u_bia,   'bia@filtros.local',   '{"name":"Bia Pronta"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO teams (id, tenant_id, name) VALUES
    (eq_lanc, casa, 'Lançamentos'), (eq_pront, casa, 'Prontos');
  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id) VALUES
    (casa, u_admin, 'admin', NULL),
    (casa, u_ana, 'corretor', eq_lanc),
    (casa, u_bia, 'corretor', eq_pront);

  INSERT INTO construtoras (id, tenant_id, codigo, nome) VALUES
    (c_sa, casa, 'sa', 'Santa Ângela'), (c_mac, casa, 'mac', 'Mac Lucer');
  INSERT INTO lancamentos (id, tenant_id, nome, construtora_id) VALUES
    (l_rc, casa, 'Reserva Castanheira', c_sa),
    (l_av, casa, 'Avelã', c_mac);

  -- "Castanheira" só chega ao lançamento pelo de-para; "Avelã" chega pelo
  -- nome igual ao do cadastro. Os dois caminhos precisam funcionar.
  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo, lancamento_id) VALUES
    (casa, 'CASTANHEIRA', 'RESERVA CASTANHEIRA', 'lancamento', l_rc),
    (casa, 'TERCEIROS',   'TERCEIROS',           'terceiros',  NULL);

  INSERT INTO planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, situacao)
    VALUES (casa, 'Fulano Ex', NULL, 'ex_membro');

  INSERT INTO commercial_sales
    (tenant_id, empreendimento, origem, area_m2, valor_m2,
     total_unidade, valor_vgv, valor_vgc, valor_imovel, comissao_total_venda,
     valor_conta_japi, cliente_nome, corretor_nome, tipo,
     repasse_20, repasse_40, repasse_45, repasse_50, team_leader_valor,
     data_assinatura, data_recebimento, observacoes, raw_row, is_active)
  VALUES
    -- venda comum, recebida: a conta vale (25.000 − 10.000 − 5.000)
    (casa, 'Castanheira', 'Santa', 0, 0, 500000, 485000, 0, 0, 25000,
     0, 'Cliente Pago', 'Ana Lanca', 'PL', 0, 10000, 0, 0, 5000,
     '2026-06-10', '2026-06-20', 'ok', '{}'::jsonb, true),
    -- a receber; a célula 20 é uma DATA — não pode virar 3001 reais
    (casa, 'Avelã', 'ZAP', 0, 0, 300000, 291000, 0, 0, 15000,
     0, 'Cliente Pendente', 'Ana Lanca', 'PL', 0, 6000, 0, 0, 3000,
     '2026-06-11', NULL, 'Data de recebimento: A RECEBER', pg_temp.linha_com('30/01'), true),
    -- o parcelamento dito com todas as letras
    (casa, 'Castanheira', 'Dejoy', 0, 0, 400000, 388000, 0, 0, 20000,
     0, 'Cliente Cinco Vezes', 'Bia Pronta', 'PL', 0, 8000, 0, 0, 4000,
     '2026-06-12', NULL, 'R$ 2.243,70 | 1 de 5 | Data de recebimento: PARCELADO', '{}'::jsonb, true),
    -- a venda a prazo: a cabeça, com o valor cheio. A conta daria 44.375;
    -- a planilha diz 21.875 porque a parte do parceiro não está em coluna.
    (casa, 'Terceiros', 'Permuta + Parceria Japi', 0, 0, 2650000, 0, 0, 0, 66250,
     0, 'Angelo', 'Bia Pronta', 'Tropa', 0, 0, 0, 21875, 0,
     '2026-01-30', '2026-02-09', NULL, pg_temp.linha_com('R$ 21.875,00'), true),
    -- ...e a parcela: sem VGV nem comissão total, "para não constar
    -- duplicado". A conta daria −1.250.
    (casa, 'Terceiros', 'Permuta + Parceria Japi', 0, 0, 0, 0, 0, 0, 0,
     0, 'Angelo', 'Bia Pronta', 'Tropa', 0, 0, 0, 1250, 0,
     '2026-01-30', '2026-03-06', 'ok', pg_temp.linha_com('R$ 1.250,00'), true),
    -- mesmo cliente, mesmo dia, duas unidades: dois negócios, não parcelas
    (casa, 'Castanheira', 'Santa', 0, 0, 468000, 454000, 0, 0, 18850,
     0, 'Luciano', 'Ana Lanca', 'PL', 0, 7540, 0, 0, 3770,
     '2026-06-23', '2026-07-06', 'ok', '{}'::jsonb, true),
    (casa, 'Castanheira', 'Milani', 0, 0, 446000, 432000, 0, 0, 17500,
     0, 'Luciano', 'Ana Lanca', 'PL', 0, 7000, 0, 0, 3500,
     '2026-06-23', '2026-07-06', 'ok', '{}'::jsonb, true),
    -- linha em branco (nada distribuído): é pendência, não parcela
    (casa, 'Terceiros', NULL, 0, 0, 0, 0, 0, 0, 0,
     0, 'Sem Valores', 'Bia Pronta', 'PL', 0, 0, 0, 0, 0,
     '2026-06-15', NULL, NULL, '{}'::jsonb, true),
    -- ex-membro: não tem equipe
    (casa, 'Castanheira', 'Santa', 0, 0, 450000, 436000, 0, 0, 20000,
     0, 'Cliente do Ex', 'Fulano Ex', 'PL', 0, 8000, 0, 0, 4000,
     '2026-06-16', '2026-06-30', 'ok', '{}'::jsonb, true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. PAGO / PARCELADO / PENDENTE
  -- ----------------------------------------------------------
  r := public.vendas_planilha_conferencia(casa);
  IF (r ->> 'total_linhas')::int IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'FALHOU 0: esperava 9 linhas, veio %', r ->> 'total_linhas';
  END IF;

  SELECT jsonb_object_agg(k, v) INTO sit FROM (
    SELECT l ->> 'cliente_nome' || ' ' || (l ->> 'total_unidade')::numeric::bigint AS k, l -> 'situacao' AS v
      FROM jsonb_array_elements(r -> 'linhas') l) x;

  IF sit ->> 'Cliente Pago 500000'           IS DISTINCT FROM 'pago'
  OR sit ->> 'Cliente Pendente 300000'       IS DISTINCT FROM 'pendente'
  OR sit ->> 'Cliente Cinco Vezes 400000'    IS DISTINCT FROM 'parcelado'
  OR sit ->> 'Angelo 2650000'                IS DISTINCT FROM 'parcelado'
  OR sit ->> 'Angelo 0'                      IS DISTINCT FROM 'parcelado'
  OR sit ->> 'Luciano 468000'                IS DISTINCT FROM 'pago'
  OR sit ->> 'Luciano 446000'                IS DISTINCT FROM 'pago'
  OR sit ->> 'Sem Valores 0'                 IS DISTINCT FROM 'pendente'
  OR sit ->> 'Cliente do Ex 450000'          IS DISTINCT FROM 'pago' THEN
    RAISE EXCEPTION 'FALHOU 1: situacao errada — %', sit;
  END IF;
  RAISE NOTICE 'OK 1: pago, parcelado (dito, parcela e cabeca) e pendente; mesmo cliente no mesmo dia nao vira parcela';

  -- ----------------------------------------------------------
  -- 2. A COMISSÃO IMOBILIÁRIA É A DA PLANILHA
  -- ----------------------------------------------------------
  SELECT jsonb_object_agg(k, v) INTO imob FROM (
    SELECT l ->> 'cliente_nome' || ' ' || (l ->> 'total_unidade')::numeric::bigint AS k, l -> 'comissao_imobiliaria' AS v
      FROM jsonb_array_elements(r -> 'linhas') l) x;

  IF (imob ->> 'Angelo 0')::numeric IS DISTINCT FROM 1250
  OR (imob ->> 'Angelo 2650000')::numeric IS DISTINCT FROM 21875 THEN
    RAISE EXCEPTION 'FALHOU 2: a parcela e a cabeca nao trouxeram o valor da planilha — %', imob;
  END IF;
  -- Sem célula legível, a conta de sempre — inclusive quando a célula é uma
  -- data, que o filtro de "R$" barra.
  IF (imob ->> 'Cliente Pago 500000')::numeric IS DISTINCT FROM 10000
  OR (imob ->> 'Cliente Pendente 300000')::numeric IS DISTINCT FROM 6000 THEN
    RAISE EXCEPTION 'FALHOU 2b: sem celula legivel, a conta nao foi usada — %', imob;
  END IF;
  RAISE NOTICE 'OK 2: parcela +1.250 (e nao -1.250), cabeca 21.875; sem celula, a conta';

  -- As três colunas que o chefe tirou não voltam.
  IF (r -> 'linhas' -> 0) ?| ARRAY['area_m2', 'valor_m2', 'valor_vgv'] OR r ? 'total_vgv' THEN
    RAISE EXCEPTION 'FALHOU 2c: Area, R$/m2 ou Total (-3%%) voltaram na resposta';
  END IF;
  RAISE NOTICE 'OK 2c: Area, R$/m2 e Total (-3%%) sairam';

  -- ----------------------------------------------------------
  -- 3. OS FILTROS
  -- ----------------------------------------------------------
  n := (public.vendas_planilha_conferencia(casa, p_tipo => 'lancamento') ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'FALHOU 3a: lancamentos deu %, esperado 6', n; END IF;
  n := (public.vendas_planilha_conferencia(casa, p_tipo => 'terceiros') ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'FALHOU 3b: prontos deu %, esperado 3', n; END IF;

  n := (public.vendas_planilha_conferencia(casa, p_tipo => 'lancamento', p_construtora_id => c_sa) ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'FALHOU 3c: Santa Angela deu %, esperado 5 (de-para)', n; END IF;
  n := (public.vendas_planilha_conferencia(casa, p_construtora_id => c_mac) ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU 3d: Mac Lucer deu %, esperado 1 (nome do cadastro)', n; END IF;
  n := (public.vendas_planilha_conferencia(casa, p_lancamento_id => l_rc) ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'FALHOU 3e: Reserva Castanheira deu %, esperado 5', n; END IF;

  -- Equipe: a Ana tem 4 vendas; o ex-membro não entra em equipe nenhuma.
  n := (public.vendas_planilha_conferencia(casa, p_equipe_id => eq_lanc) ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'FALHOU 3f: equipe Lancamentos deu %, esperado 4', n; END IF;
  n := (public.vendas_planilha_conferencia(casa, p_equipe_id => eq_pront) ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'FALHOU 3g: equipe Prontos deu %, esperado 4', n; END IF;

  -- A situação filtra, e o rodapé é a soma do que ficou.
  r := public.vendas_planilha_conferencia(casa, p_situacao => 'parcelado');
  IF (r ->> 'total_linhas')::int IS DISTINCT FROM 3
  OR (r ->> 'total_unidade')::numeric IS DISTINCT FROM 3050000
  OR (r ->> 'total_imobiliaria')::numeric IS DISTINCT FROM (8000 + 21875 + 1250) THEN
    RAISE EXCEPTION 'FALHOU 3h: parcelado — linhas %, unidade %, imobiliaria %',
      r ->> 'total_linhas', r ->> 'total_unidade', r ->> 'total_imobiliaria';
  END IF;
  RAISE NOTICE 'OK 3: pronto/lancamento, construtora, empreendimento, equipe e situacao recortam; o rodape acompanha';

  -- ----------------------------------------------------------
  -- 4. A TELA QUE ESTÁ NO AR CONTINUA FUNCIONANDO
  --
  -- O front antigo chama com os 4 nomes de antes. Se a migration subir
  -- primeiro, ele não pode receber "function not found".
  -- ----------------------------------------------------------
  n := (public.vendas_planilha_conferencia(p_tenant_id => casa, p_de => NULL, p_ate => NULL,
                                            p_corretor => 'Ana Lanca') ->> 'total_linhas')::int;
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'FALHOU 4: a chamada antiga deu %, esperado 4', n; END IF;
  RAISE NOTICE 'OK 4: a chamada de 4 argumentos segue respondendo';

  -- ----------------------------------------------------------
  -- 5. O CRM: ORIGEM DO LEAD E OS MESMOS FILTROS
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, status, source)
  VALUES (casa, 'Lead do ZAP', '11999990000', 'Novos Leads', 'ZAP Imóveis')
  RETURNING id INTO lead_zap;
  -- A proposta copiou a origem ao nascer; se o lead mudar, o lead manda.
  INSERT INTO proposals (tenant_id, lead_id, stage_id, value, origin)
  VALUES (casa, lead_zap, 'proposta-criada', 500000, 'Santa Angela') RETURNING id INTO p_lead;
  INSERT INTO proposals (tenant_id, stage_id, value, origin)
  VALUES (casa, 'proposta-criada', 300000, 'Manual') RETURNING id INTO p_manual;

  INSERT INTO vendas (tenant_id, proposta_id, lead_id, data_venda, empreendimento, lancamento_id,
                      construtora_id, tipo, corretor_id, corretor_nome, vgv) VALUES
    (casa, p_lead,   lead_zap, '2026-06-10', 'Reserva Castanheira', l_rc, c_sa,  'lancamento', u_ana, 'Ana Lanca', 500000),
    (casa, p_manual, NULL,     '2026-06-11', 'Casa na Vila',        NULL, NULL,  'terceiros',  u_bia, 'Bia Pronta', 300000),
    (casa, NULL,     NULL,     '2026-06-12', 'Avelã',               l_av, c_mac, 'lancamento', u_ana, 'Ana Lanca', 400000);

  r := public.vendas_conferencia(casa, '2026-06-01', '2026-06-30');
  SELECT jsonb_object_agg(l ->> 'empreendimento', l -> 'origem') INTO sit
    FROM jsonb_array_elements(r -> 'linhas') l;
  IF sit ->> 'Reserva Castanheira' IS DISTINCT FROM 'ZAP Imóveis'
  OR sit ->> 'Casa na Vila'        IS DISTINCT FROM 'Manual'
  OR sit -> 'Avelã'                IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 5a: origem errada — %', sit;
  END IF;

  n := (public.vendas_conferencia(casa, '2026-06-01', '2026-06-30', p_equipe_id => eq_lanc) -> 'totais' ->> 'vendas')::int;
  IF n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'FALHOU 5b: equipe no CRM deu %, esperado 2', n; END IF;
  n := (public.vendas_conferencia(casa, '2026-06-01', '2026-06-30', p_tipo => 'terceiros') -> 'totais' ->> 'vendas')::int;
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU 5c: prontos no CRM deu %, esperado 1', n; END IF;
  n := (public.vendas_conferencia(casa, '2026-06-01', '2026-06-30', p_lancamento_id => l_av) -> 'totais' ->> 'vendas')::int;
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU 5d: empreendimento no CRM deu %, esperado 1', n; END IF;
  -- A chamada antiga, posicional, de 6 argumentos.
  n := (public.vendas_conferencia(casa, '2026-06-01', '2026-06-30', NULL, c_sa, NULL) -> 'totais' ->> 'vendas')::int;
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU 5e: a chamada antiga do CRM deu %, esperado 1', n; END IF;
  RAISE NOTICE 'OK 5: origem = a do lead, senao a da proposta; equipe, tipo e empreendimento recortam o CRM';

  -- ----------------------------------------------------------
  -- 6. A CHAVE DO NAVEGADOR NÃO CHAMA NENHUMA DAS DUAS
  --
  -- `has_function_privilege` conta o que vem de PUBLIC — é o que o REVOKE
  -- só do anon deixaria passar.
  -- ----------------------------------------------------------
  IF has_function_privilege('anon', 'public.vendas_planilha_conferencia(uuid,date,date,text,uuid,text,uuid,uuid,text)', 'execute')
  OR has_function_privilege('anon', 'public.vendas_conferencia(uuid,date,date,text,uuid,uuid,uuid,text,uuid)', 'execute') THEN
    RAISE EXCEPTION 'FALHOU 6: anon executa a conferencia';
  END IF;
  RAISE NOTICE 'OK 6: anon fora das duas';
END $$;

ROLLBACK;

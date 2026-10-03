-- ============================================================
-- Projeção 90 dias (20261028_projecao_90d.sql)
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/projecao_90d.test.sql
--
-- As datas saem de "hoje" em São Paulo: o teste vale em qualquer dia do mês.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF; END $$;

CREATE FUNCTION pg_temp.como(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO: ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  'a1280000-0000-4000-a000-000000000001'::uuid AS t,
  'a128b000-0000-4000-a000-000000000001'::uuid AS admin,
  'a128b000-0000-4000-a000-000000000002'::uuid AS gerente,
  'a128b000-0000-4000-a000-000000000003'::uuid AS corretor,
  (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje;
CREATE TEMP TABLE dx ON COMMIT DROP AS SELECT
  hoje,
  (date_trunc('month', hoje) + interval '1 month')::date AS m1,
  (date_trunc('month', hoje) + interval '2 months')::date AS m2,
  (date_trunc('month', hoje) + interval '3 months')::date AS m3,
  (date_trunc('month', hoje) + interval '4 months')::date AS m4
FROM fx;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-projecao', 'Teste Projeção' FROM fx;
INSERT INTO auth.users (id, email)
SELECT admin, 'admin@teste-projecao.dev' FROM fx
UNION ALL SELECT gerente, 'gerente@teste-projecao.dev' FROM fx
UNION ALL SELECT corretor, 'corretor@teste-projecao.dev' FROM fx;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, admin, 'admin', '{}'::jsonb FROM fx
UNION ALL SELECT t, gerente, 'team_leader', '{}'::jsonb FROM fx
UNION ALL SELECT t, corretor, 'corretor', '{}'::jsonb FROM fx;
INSERT INTO tenant_fiscal_config (tenant_id, imposto_pct) SELECT t, 10 FROM fx;
SELECT public.financeiro_cria_plano_padrao(t) FROM fx;

CREATE FUNCTION pg_temp.conta(p_papel text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM plano_contas WHERE tenant_id = (SELECT t FROM fx) AND papel = p_papel $$;
CREATE FUNCTION pg_temp.lanca(p_tipo text, p_conta uuid, p_desc text, p_valor numeric, p_venc date) RETURNS uuid LANGUAGE sql AS $$
  SELECT (pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.financeiro_lancar(%L, %L, %L, %L, %s, %L, %L)->>%L',
    (SELECT t FROM fx), p_tipo, p_conta, p_desc, p_valor,
    date_trunc('month', COALESCE(p_venc, (SELECT hoje FROM fx)))::date, p_venc, 'id')))::uuid $$;
CREATE FUNCTION pg_temp.baixa(p_id uuid, p_dia date) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_baixar(%L, %L, NULL)::text', p_id, p_dia)) $$;
CREATE FUNCTION pg_temp.vende(p_valor numeric, p_comissao numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid := gen_random_uuid(); v_id uuid;
BEGIN
  INSERT INTO proposals (id, tenant_id, stage_id, value, commission_total,
                         forecast_empreendimento, agent_user_id, agent_name, signed_at)
  SELECT v_prop, t, 'proposta-assinada', p_valor, p_comissao,
         'Residencial Projeção', corretor, 'Cora Corretora', now() FROM fx;
  SELECT id INTO v_id FROM vendas WHERE proposta_id = v_prop;
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.col(j jsonb, d date) RETURNS jsonb LANGUAGE sql AS $$
  SELECT c FROM jsonb_array_elements(j->'colunas') c WHERE (c->>'de')::date <= d AND (c->>'ate')::date >= d $$;
CREATE FUNCTION pg_temp.n(c jsonb, k text) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE((c->>k)::numeric, 0) $$;

-- O cenário ---------------------------------------------------------------------
-- Conta Inter: R$ 150.000 no fim de ontem. Uma baixa de anteontem (já dentro do
-- saldo) e uma de hoje (soma por cima).
DO $$
DECLARE r text; v1 uuid; v2 uuid; a uuid; b uuid;
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.financeiro_conta_bancaria(%L, %L, %L, %s, NULL, %L)::text',
    (SELECT t FROM fx), 'Inter', 'Inter', 150000, (SELECT hoje - 1 FROM fx)));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin informa o saldo (veio ' || coalesce(r, 'NULL') || ')');

  a := pg_temp.lanca('receber', NULL, 'Antes do saldo', 1000, (SELECT hoje - 3 FROM fx));
  PERFORM pg_temp.baixa(a, (SELECT hoje - 3 FROM fx));
  b := pg_temp.lanca('receber', NULL, 'Depois do saldo', 500, (SELECT hoje FROM fx));
  PERFORM pg_temp.baixa(b, (SELECT hoje FROM fx));

  PERFORM pg_temp.lanca('pagar', pg_temp.conta('pessoal'), 'Folha', 3000, (SELECT m1 + 9 FROM dx));
  PERFORM pg_temp.lanca('pagar', pg_temp.conta('midia'), 'Anúncios', 1500, (SELECT m2 + 12 FROM dx));
  PERFORM pg_temp.lanca('pagar', NULL, 'Aluguel sem conta', 2000, (SELECT m2 + 9 FROM dx));
  PERFORM pg_temp.lanca('receber', pg_temp.conta('comissao_parceria'), 'Parceiro', 5000, (SELECT m1 + 19 FROM dx));
  PERFORM pg_temp.lanca('pagar', NULL, 'Conta vencida', 999, (SELECT hoje - 5 FROM fx));
  PERFORM pg_temp.lanca('receber', NULL, 'Sem data', 777, NULL);
  PERFORM pg_temp.lanca('pagar', NULL, 'Além dos 90 dias', 888, (SELECT m4 + 9 FROM dx));

  -- Venda 1, sem folha: parcela hoje e parcela no mês que vem.
  v1 := pg_temp.vende(200000, 10000);
  r := pg_temp.como((SELECT admin FROM fx), format('SELECT public.venda_parcelar(%L, %L::jsonb)::text', v1,
         json_build_array(json_build_object('valor', 4000, 'vencimento', (SELECT hoje FROM fx)),
                          json_build_object('valor', 6000, 'vencimento', (SELECT m1 + 14 FROM dx)))::text));
  PERFORM pg_temp.checa(r NOT LIKE 'ERRO%', 'venda 1 parcelada (veio ' || coalesce(r, 'NULL') || ')');

  -- Venda 2, à vista daqui a dois meses, com a folha calculada (e a parte da casa).
  v2 := pg_temp.vende(200000, 10000);
  r := pg_temp.como((SELECT admin FROM fx), format('SELECT public.venda_parcelar(%L, %L::jsonb)::text', v2,
         json_build_array(json_build_object('valor', 10000, 'vencimento', (SELECT m2 + 4 FROM dx)))::text));
  INSERT INTO venda_repasses (venda_id, tenant_id, papel, nome, pct, valor)
  SELECT v2, t, 'corretor', 'Cora', 45, 4500 FROM fx
  UNION ALL SELECT v2, t, 'lider', 'Gil', 15, 1500 FROM fx
  UNION ALL SELECT v2, t, 'lotus', 'Casa', 40, 4000 FROM fx;
END $$;

-- 1. As colunas -------------------------------------------------------------------
DO $$
DECLARE j jsonb := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_projecao(%L)::text', (SELECT t FROM fx)))::jsonb;
BEGIN
  PERFORM pg_temp.checa(j IS NOT NULL, 'admin lê a projeção');
  PERFORM pg_temp.checa((j->'colunas'->0->>'de')::date = (SELECT hoje FROM fx), 'a primeira coluna começa hoje');
  PERFORM pg_temp.checa((j->'colunas'->0->>'tipo') = 'semana', 'o mês atual vem em semanas');
  PERFORM pg_temp.checa((j->'colunas'->-1->>'ate')::date = (SELECT m3 - 1 FROM dx), 'a última coluna fecha o mês +2');
  PERFORM pg_temp.checa(jsonb_array_length(j->'colunas') BETWEEN 3 AND 6, 'de 1 a 4 semanas + 2 meses');
  RAISE NOTICE 'OK 1 · semanas que restam do mês, depois os dois meses seguintes';
END $$;

-- 2. O saldo inicial ----------------------------------------------------------------
DO $$
DECLARE j jsonb := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_projecao(%L)::text', (SELECT t FROM fx)))::jsonb;
BEGIN
  -- 150.000 no fim de ontem; a baixa de anteontem já estava dentro; a de hoje soma.
  PERFORM pg_temp.checa((j->>'saldo_inicial')::numeric = 150500, 'saldo inicial = informado + o que entrou depois (veio ' || (j->>'saldo_inicial') || ')');
  PERFORM pg_temp.checa((j->>'saldo_em')::date = (SELECT hoje - 1 FROM fx) AND (j->>'tem_conta')::boolean, 'diz de quando é o saldo');
  RAISE NOTICE 'OK 2 · o saldo informado vale no dia dele, e o que veio depois soma';
END $$;

-- 3. As linhas, coluna a coluna ------------------------------------------------------
DO $$
DECLARE
  j jsonb := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_projecao(%L)::text', (SELECT t FROM fx)))::jsonb;
  c0 jsonb := pg_temp.col(j, (SELECT hoje FROM fx));
  c1 jsonb := pg_temp.col(j, (SELECT m1 + 9 FROM dx));
  c2 jsonb := pg_temp.col(j, (SELECT m2 + 9 FROM dx));
BEGIN
  PERFORM pg_temp.checa(pg_temp.n(c0, 'comissoes') = 4000, 'hoje: a parcela de 4.000 (veio ' || pg_temp.n(c0, 'comissoes') || ')');
  PERFORM pg_temp.checa(pg_temp.n(c0, 'repasses_estimados') = 2400, 'hoje: 60% estimado da parcela sem folha');
  PERFORM pg_temp.checa(pg_temp.n(c0, 'impostos') = 400, 'hoje: o imposto da parcela');

  PERFORM pg_temp.checa(pg_temp.n(c1, 'comissoes') = 6000, 'mês +1: a parcela de 6.000');
  PERFORM pg_temp.checa(pg_temp.n(c1, 'parceiros') = 5000, 'mês +1: o repasse do parceiro (conta 1.2)');
  PERFORM pg_temp.checa(pg_temp.n(c1, 'custos_fixos') = 3000, 'mês +1: a folha é custo fixo');
  PERFORM pg_temp.checa(pg_temp.n(c1, 'provisoes') = 583.20, 'mês +1: provisão = 19,44% da folha (veio ' || pg_temp.n(c1, 'provisoes') || ')');
  PERFORM pg_temp.checa(pg_temp.n(c1, 'repasses_estimados') = 3600, 'mês +1: 60% estimado');

  PERFORM pg_temp.checa(pg_temp.n(c2, 'comissoes') = 10000, 'mês +2: a venda à vista');
  PERFORM pg_temp.checa(pg_temp.n(c2, 'repasses') = 6000, 'mês +2: corretor + líder registrados; a casa não (veio ' || pg_temp.n(c2, 'repasses') || ')');
  PERFORM pg_temp.checa(pg_temp.n(c2, 'repasses_estimados') = 0, 'com folha registrada não há estimativa');
  PERFORM pg_temp.checa(pg_temp.n(c2, 'marketing') = 1500, 'mês +2: marketing pela conta de mídia');
  PERFORM pg_temp.checa(pg_temp.n(c2, 'custos_fixos') = 2000, 'mês +2: o sem conta cai em custos fixos');
  PERFORM pg_temp.checa(pg_temp.n(c2, 'impostos') = 1000, 'mês +2: o imposto da venda à vista');
  RAISE NOTICE 'OK 3 · cada lançamento na linha e na coluna certas';
END $$;

-- 4. Atrasado / sem data, e o que passa dos 90 dias -----------------------------------
DO $$
DECLARE j jsonb := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_projecao(%L)::text', (SELECT t FROM fx)))::jsonb;
BEGIN
  PERFORM pg_temp.checa(pg_temp.n(j->'atrasado', 'custos_fixos') = 999, 'a conta vencida vai para atrasado');
  PERFORM pg_temp.checa(pg_temp.n(j->'atrasado', 'outras_entradas') = 777, 'o sem data vai para atrasado');
  PERFORM pg_temp.checa(pg_temp.n(j->'atrasado', 'sem_data') = 1, 'e conta quantos estão sem data');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'colunas') c
                                     WHERE pg_temp.n(c, 'custos_fixos') IN (888, 999) OR pg_temp.n(c, 'outras_entradas') = 777),
    'nem o atrasado nem o que passa dos 90 dias entra nas colunas');
  RAISE NOTICE 'OK 4 · atrasado e sem data ficam à parte; além de 90 dias fica de fora';
END $$;

-- 5. O alerta ---------------------------------------------------------------------------
DO $$
DECLARE r text; j jsonb;
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_definir_alerta(%L, %s)::text', (SELECT t FROM fx), 100000));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin define o alerta');
  j := pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_projecao(%L)::text', (SELECT t FROM fx)))::jsonb;
  PERFORM pg_temp.checa((j->>'alerta')::numeric = 100000, 'a projeção traz o alerta');
  PERFORM pg_temp.checa(pg_temp.como((SELECT gerente FROM fx), format('SELECT public.financeiro_definir_alerta(%L, %s)::text', (SELECT t FROM fx), 1)) IS NULL,
    'gerente não mexe no alerta');
  RAISE NOTICE 'OK 5 · o alerta é da casa, e só quem cuida do dinheiro muda';
END $$;

-- 6. Quem lê ----------------------------------------------------------------------------
DO $$
DECLARE v_msg text; v_t uuid := (SELECT t FROM fx);
BEGIN
  PERFORM pg_temp.checa(pg_temp.como((SELECT gerente FROM fx), format('SELECT public.financeiro_projecao(%L)::text', v_t)) IS NULL,
    'gerente não lê a projeção');
  PERFORM pg_temp.checa(pg_temp.como((SELECT corretor FROM fx), format('SELECT public.financeiro_projecao(%L)::text', v_t)) IS NULL,
    'corretor não lê a projeção');
  -- O tenant vai numa variável: como anon, ler a tabela temporária `fx` daria
  -- "permission denied" por conta própria, e o teste passaria pelo motivo errado.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.financeiro_projecao(v_t);
    v_msg := 'executou';
  EXCEPTION WHEN insufficient_privilege THEN v_msg := 'negado';
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v_msg IS NOT DISTINCT FROM 'negado', 'anon barrado (veio ' || v_msg || ')');
  RAISE NOTICE 'OK 6 · só quem cuida do dinheiro lê';
END $$;

-- 7. Saldo do futuro não, e o fluxo de caixa concorda ------------------------------------
DO $$
DECLARE r text; f jsonb;
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.financeiro_conta_bancaria(%L, %L, %L, %s, NULL, %L)::text',
    (SELECT t FROM fx), 'Futuro', '', 1, (SELECT hoje + 1 FROM fx)));
  PERFORM pg_temp.checa(r LIKE 'ERRO%ainda não chegou%', 'saldo com data de amanhã é recusado (veio ' || coalesce(r, 'NULL') || ')');
  f := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.financeiro_fluxo_de_caixa(%L, %L, %L, %L)::text', (SELECT t FROM fx),
    (SELECT hoje FROM fx), (SELECT hoje FROM fx), 'dia'))::jsonb;
  PERFORM pg_temp.checa((f->>'saldo_inicial')::numeric = 150000,
    'o fluxo de caixa começa hoje do mesmo saldo informado (veio ' || (f->>'saldo_inicial') || ')');
  PERFORM pg_temp.checa(pg_temp.como((SELECT admin FROM fx), format('SELECT public.financeiro_contas_bancarias(%L)::text', (SELECT t FROM fx)))::jsonb->0->>'saldo_em'
                        IS NOT DISTINCT FROM (SELECT (hoje - 1)::text FROM fx), 'a lista de contas devolve a data do saldo');
  RAISE NOTICE 'OK 7 · saldo do futuro não entra; projeção e fluxo partem do mesmo saldo';
END $$;

ROLLBACK;

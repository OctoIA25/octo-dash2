-- ============================================================
-- A Conferência edita vendas (20261026_conferencia_edita_vendas.sql)
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/conferencia_edita_vendas.test.sql
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
  'a1260000-0000-4000-a000-000000000001'::uuid AS t,
  'a1260000-0000-4000-a000-000000000002'::uuid AS outra,
  'a126b000-0000-4000-a000-000000000001'::uuid AS admin,
  'a126b000-0000-4000-a000-000000000002'::uuid AS gerente,
  'a126b000-0000-4000-a000-000000000003'::uuid AS corretor,
  'a126b000-0000-4000-a000-000000000004'::uuid AS de_fora,
  'a126c000-0000-4000-a000-000000000001'::uuid AS constr,
  'a126d000-0000-4000-a000-000000000001'::uuid AS lanc;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-edita-vendas', 'Teste Edita Vendas' FROM fx
UNION ALL SELECT outra, 'teste-edita-vendas-2', 'Outra Casa' FROM fx;
INSERT INTO auth.users (id, email)
SELECT admin, 'admin@teste-edita.dev' FROM fx
UNION ALL SELECT gerente, 'gerente@teste-edita.dev' FROM fx
UNION ALL SELECT corretor, 'corretor@teste-edita.dev' FROM fx
UNION ALL SELECT de_fora, 'fora@teste-edita.dev' FROM fx;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, admin, 'admin', '{}'::jsonb FROM fx
UNION ALL SELECT t, gerente, 'team_leader', '{}'::jsonb FROM fx
UNION ALL SELECT t, corretor, 'corretor', '{}'::jsonb FROM fx
UNION ALL SELECT outra, de_fora, 'corretor', '{}'::jsonb FROM fx;
INSERT INTO tenant_fiscal_config (tenant_id, imposto_pct) SELECT t, 10 FROM fx;
INSERT INTO construtoras (id, tenant_id, codigo, nome) SELECT constr, t, 'teste_edita_c1', 'Construtora Edita' FROM fx;
INSERT INTO lancamentos (id, tenant_id, nome, construtora_id) SELECT lanc, t, 'Residencial Edita', constr FROM fx;

CREATE TEMP TABLE vx (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.vid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM vx WHERE nome = p $$;
CREATE FUNCTION pg_temp.v(p text) RETURNS public.vendas LANGUAGE sql AS $$
  SELECT v.* FROM vendas v WHERE v.id = pg_temp.vid(p) $$;
CREATE FUNCTION pg_temp.parc(p text, n int) RETURNS public.lancamentos_financeiros LANGUAGE sql AS $$
  SELECT l.* FROM lancamentos_financeiros l
   WHERE l.origem = 'venda' AND l.origem_id = pg_temp.vid(p) AND l.parcela = n AND l.status <> 'cancelado' $$;

-- 1. O Gerente cria uma venda parcelada --------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, %L, %L, %L, %L, %s, %s, %L::jsonb)::text',
    (SELECT t FROM fx), '2026-09-20', '', (SELECT lanc FROM fx), (SELECT corretor FROM fx),
    'Cora Corretora', 'Cliente Ana', 200000, 10000,
    '[{"valor":5000,"vencimento":"2026-10-10"},{"valor":5000,"vencimento":"2026-11-10"}]'));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'gerente cria venda (veio ' || coalesce(r, 'NULL') || ')');
  INSERT INTO vx VALUES ('manual', (r::jsonb->>'id')::uuid);
  PERFORM pg_temp.checa((pg_temp.v('manual')).tipo IS NOT DISTINCT FROM 'lancamento', 'com empreendimento do cadastro é lançamento');
  PERFORM pg_temp.checa((pg_temp.v('manual')).empreendimento IS NOT DISTINCT FROM 'Residencial Edita', 'o nome vem do cadastro');
  PERFORM pg_temp.checa((pg_temp.v('manual')).construtora_id IS NOT DISTINCT FROM (SELECT constr FROM fx), 'e a construtora junto');
  PERFORM pg_temp.checa((pg_temp.v('manual')).cliente IS NOT DISTINCT FROM 'Cliente Ana', 'o cliente fica na venda');
  PERFORM pg_temp.checa((pg_temp.v('manual')).comissao_pct = 5, 'o % sai da comissão (10000 de 200000 = 5)');
  PERFORM pg_temp.checa((pg_temp.v('manual')).imposto_valor = 1000, 'imposto da casa (10%)');
  PERFORM pg_temp.checa((pg_temp.parc('manual', 2)).valor = 5000, 'nasce com as duas parcelas');
  RAISE NOTICE 'OK 1 · o Gerente cria a venda, e ela nasce parcelada';
END $$;

-- 2. Quem não pode, e o que não passa ---------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.como((SELECT corretor FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, NULL, NULL, %L, %L, %s, %s)::text',
    (SELECT t FROM fx), '2026-09-20', 'Terceiros X', '', '', 100000, 3000));
  PERFORM pg_temp.checa(r IS NULL, 'corretor não cria venda (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, NULL, NULL, %L, %L, %s, %s)::text',
    (SELECT t FROM fx), '2026-09-20', 'Terceiros X', '', '', 100000, 0));
  PERFORM pg_temp.checa(r LIKE 'ERRO%comissão%', 'sem comissão não cria (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, NULL, %L, %L, %L, %s, %s)::text',
    (SELECT t FROM fx), '2026-09-20', 'Terceiros X', (SELECT de_fora FROM fx), '', '', 100000, 3000));
  PERFORM pg_temp.checa(r LIKE 'ERRO%não é desta imobiliária%', 'corretor de outra casa não entra (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, NULL, NULL, %L, %L, %s, %s)::text',
    (SELECT t FROM fx), '2026-09-21', 'Apto Centro', '', 'Cliente Bia', 300000, 9000));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin cria venda à vista (veio ' || coalesce(r, 'NULL') || ')');
  INSERT INTO vx VALUES ('avista', (r::jsonb->>'id')::uuid);
  PERFORM pg_temp.checa((pg_temp.v('avista')).tipo IS NOT DISTINCT FROM 'terceiros', 'sem cadastro é terceiros');
  PERFORM pg_temp.checa((SELECT count(*) FROM lancamentos_financeiros WHERE origem = 'venda' AND origem_id = pg_temp.vid('avista')) = 1,
    'sem parcelas informadas nasce à vista');
  RAISE NOTICE 'OK 2 · corretor não cria; sem comissão e corretor de fora não passam';
END $$;

-- 3. O Gerente baixa parcela de venda, e só isso ------------------------------
DO $$
DECLARE r text; v_manual uuid;
BEGIN
  r := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.financeiro_baixar(%L, %L, NULL)::text', (pg_temp.parc('manual', 1)).id, '2026-10-11'));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'gerente baixa parcela de venda (veio ' || coalesce(r, 'NULL') || ')');

  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT (public.financeiro_lancar(%L, %L, NULL, %L, %s, %L)->>%L)',
    (SELECT t FROM fx), 'pagar', 'Aluguel', 3400, '2026-10-01', 'id'));
  v_manual := r::uuid;
  r := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.financeiro_baixar(%L, %L, NULL)::text', v_manual, '2026-10-11'));
  PERFORM pg_temp.checa(r IS NULL, 'gerente NÃO baixa conta da casa (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.como((SELECT corretor FROM fx), format(
    'SELECT public.financeiro_baixar(%L, %L, NULL)::text', (pg_temp.parc('manual', 2)).id, '2026-10-11'));
  PERFORM pg_temp.checa(r IS NULL, 'corretor não baixa parcela (veio ' || coalesce(r, 'NULL') || ')');
  RAISE NOTICE 'OK 3 · o Gerente baixa parcela de venda e nada mais do Financeiro';
END $$;

-- 4. A leitura da Conferência --------------------------------------------------
DO $$
DECLARE j jsonb; l jsonb;
BEGIN
  j := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.vendas_conferencia(%L, %L, %L)::text', (SELECT t FROM fx), '2026-09-01', '2026-09-30'))::jsonb;
  PERFORM pg_temp.checa(j IS NOT NULL, 'gerente lê a conferência');
  SELECT x INTO l FROM jsonb_array_elements(j->'linhas') x WHERE x->>'id' = pg_temp.vid('manual')::text;
  PERFORM pg_temp.checa(l->>'situacao' IS NOT DISTINCT FROM 'parcelado', 'situação parcelado (veio ' || coalesce(l->>'situacao', 'NULL') || ')');
  PERFORM pg_temp.checa((l->>'parcelas')::int = 2 AND (l->>'parcelas_pagas')::int = 1, 'uma de duas');
  PERFORM pg_temp.checa(l->>'cliente' IS NOT DISTINCT FROM 'Cliente Ana', 'o cliente vem na linha');
  -- manual: 10000 − 5000 recebido; avista: 9000 → 14000.
  PERFORM pg_temp.checa((j->'totais'->>'a_receber')::numeric = 14000,
    'a receber = bruta − o que já entrou (veio ' || (j->'totais'->>'a_receber') || ')');

  j := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.vendas_conferencia(%L, %L, %L, p_situacao => %L)::text',
    (SELECT t FROM fx), '2026-09-01', '2026-09-30', 'pendente'))::jsonb;
  PERFORM pg_temp.checa(jsonb_array_length(j->'linhas') = 1 AND j->'linhas'->0->>'id' = pg_temp.vid('avista')::text,
    'o filtro de situação deixa só a pendente');

  PERFORM pg_temp.checa(pg_temp.como((SELECT corretor FROM fx), format(
    'SELECT public.vendas_conferencia(%L, %L, %L)::text', (SELECT t FROM fx), '2026-09-01', '2026-09-30')) IS NULL,
    'corretor não lê a conferência');
  RAISE NOTICE 'OK 4 · a Conferência diz a situação, filtra por ela e soma o que falta receber';
END $$;

-- 5. O detalhe traz as parcelas -------------------------------------------------
DO $$
DECLARE j jsonb;
BEGIN
  j := pg_temp.como((SELECT gerente FROM fx), format('SELECT public.venda_detalhe(%L)::text', pg_temp.vid('manual')))::jsonb;
  PERFORM pg_temp.checa(jsonb_array_length(j->'parcelas') = 2, 'o detalhe traz as duas parcelas');
  PERFORM pg_temp.checa(j->'parcelas'->0->>'status' IS NOT DISTINCT FROM 'baixado', 'em ordem, a 1 paga');
  RAISE NOTICE 'OK 5 · o detalhe da venda traz as parcelas';
END $$;

-- 6. A nota não mexe no recebimento ---------------------------------------------
UPDATE vendas SET recebido_em = '2026-09-25', valor_recebido = 9000 WHERE id = pg_temp.vid('avista');
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.venda_gravar_nf(%L, %L, %L, NULL)::text', pg_temp.vid('avista'), 'NF-77', '2026-09-26'));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'gerente grava a nota (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa((pg_temp.v('avista')).nf_numero IS NOT DISTINCT FROM 'NF-77', 'a nota ficou');
  PERFORM pg_temp.checa((pg_temp.v('avista')).recebido_em IS NOT DISTINCT FROM '2026-09-25'::date
                    AND (pg_temp.v('avista')).status IS NOT DISTINCT FROM 'recebido',
    'gravar a nota não desfaz o recebimento');
  r := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.venda_gravar_nf(%L, %L, %L, NULL)::text', pg_temp.vid('manual'), 'NF-78', '2026-09-26'));
  PERFORM pg_temp.checa((pg_temp.v('manual')).status IS NOT DISTINCT FROM 'faturado', 'com nota e sem tudo recebido: faturado');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM venda_historico WHERE venda_id = pg_temp.vid('manual') AND campo = 'nf_numero'),
    'a troca da nota fica no histórico');
  PERFORM pg_temp.checa(pg_temp.como((SELECT corretor FROM fx), format(
    'SELECT public.venda_gravar_nf(%L, %L, NULL, NULL)::text', pg_temp.vid('manual'), 'NF-X')) IS NULL,
    'corretor não grava nota');
  RAISE NOTICE 'OK 6 · a nota é só a nota';
END $$;

-- 7. anon não chama as funções novas -------------------------------------------
DO $$
DECLARE v_msg text;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.venda_criar(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    v_msg := 'executou';
  EXCEPTION WHEN insufficient_privilege THEN v_msg := 'negado';
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v_msg IS NOT DISTINCT FROM 'negado', 'anon não chama venda_criar (veio ' || v_msg || ')');
  RAISE NOTICE 'OK 7 · anon barrado';
END $$;

-- 8. A mesma venda não se cria duas vezes à mão -------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.venda_criar(%L, %L, %L, NULL, NULL, %L, %L, %s, %s)::text',
    (SELECT t FROM fx), '2026-09-21', 'Apto Centro', '', 'Cliente Bia', 300000, 9000));
  PERFORM pg_temp.checa(r LIKE 'ERRO%existe uma venda%', 'mesma data e VGV: recusa a duplicata (veio ' || coalesce(r, 'NULL') || ')');
  RAISE NOTICE 'OK 8 · venda repetida à mão é recusada';
END $$;

ROLLBACK;

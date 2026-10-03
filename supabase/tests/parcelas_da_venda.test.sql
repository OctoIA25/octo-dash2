-- ============================================================
-- Parcelas da venda (20261025_parcelas_da_venda.sql)
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/parcelas_da_venda.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant.
-- Sucesso = um NOTICE "OK" por bloco. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF; END $$;

-- Executa como uma pessoa logada e devolve o resultado (ou 'ERRO: <mensagem>').
-- Limpa o JWT no fim: sem isso o resto da transação continuaria "logado".
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
  'a1250000-0000-4000-a000-000000000001'::uuid AS t,
  'a125b000-0000-4000-a000-000000000001'::uuid AS admin,
  'a125b000-0000-4000-a000-000000000002'::uuid AS gerente,
  'a125b000-0000-4000-a000-000000000003'::uuid AS corretor;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-parcelas', 'Teste Parcelas' FROM fx;
INSERT INTO auth.users (id, email)
SELECT admin, 'admin@teste-parcelas.dev' FROM fx
UNION ALL SELECT gerente, 'gerente@teste-parcelas.dev' FROM fx
UNION ALL SELECT corretor, 'corretor@teste-parcelas.dev' FROM fx;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, admin, 'admin', '{}'::jsonb FROM fx
UNION ALL SELECT t, gerente, 'team_leader', '{}'::jsonb FROM fx
UNION ALL SELECT t, corretor, 'corretor', '{}'::jsonb FROM fx;
INSERT INTO tenant_fiscal_config (tenant_id, imposto_pct) SELECT t, 10 FROM fx;

-- A venda nasce pelo caminho real: proposta assinada → gatilho.
CREATE FUNCTION pg_temp.vende(p_valor numeric, p_comissao numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid := gen_random_uuid(); v_id uuid;
BEGIN
  INSERT INTO proposals (id, tenant_id, stage_id, value, commission_total,
                         forecast_empreendimento, agent_user_id, agent_name, signed_at)
  SELECT v_prop, t, 'proposta-assinada', p_valor, p_comissao,
         'Residencial Parcelas', corretor, 'Cora Corretora', '2026-09-15 12:00-03' FROM fx;
  SELECT id INTO v_id FROM vendas WHERE proposta_id = v_prop;
  RETURN v_id;
END $$;

CREATE TEMP TABLE vx (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO vx VALUES ('parcelada', pg_temp.vende(200000, 10000)),
                      ('avista',    pg_temp.vende(100000, 5000)),
                      ('legado',    pg_temp.vende(80000, 4000));

CREATE FUNCTION pg_temp.vid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM vx WHERE nome = p $$;
CREATE FUNCTION pg_temp.v(p text) RETURNS public.vendas LANGUAGE sql AS $$
  SELECT v.* FROM vendas v WHERE v.id = pg_temp.vid(p) $$;
CREATE FUNCTION pg_temp.parc(p text, n int) RETURNS public.lancamentos_financeiros LANGUAGE sql AS $$
  SELECT l.* FROM lancamentos_financeiros l
   WHERE l.origem = 'venda' AND l.origem_id = pg_temp.vid(p) AND l.parcela = n AND l.status <> 'cancelado' $$;
CREATE FUNCTION pg_temp.qtd(p text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM lancamentos_financeiros
   WHERE origem = 'venda' AND origem_id = pg_temp.vid(p) AND status <> 'cancelado' $$;
CREATE FUNCTION pg_temp.imposto(p text, n int) RETURNS numeric LANGUAGE sql AS $$
  SELECT valor FROM lancamentos_financeiros
   WHERE origem = 'imposto' AND origem_id = pg_temp.vid(p) AND parcela = n $$;
CREATE FUNCTION pg_temp.situacao(p text) RETURNS text LANGUAGE sql AS $$
  SELECT situacao FROM public.venda_parcelas_resumo(pg_temp.vid(p)) $$;
CREATE FUNCTION pg_temp.parcelar(p_user uuid, p text, p_json text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, format('SELECT public.venda_parcelar(%L, %L::jsonb)::text', pg_temp.vid(p), p_json)) $$;
CREATE FUNCTION pg_temp.baixar(p_user uuid, p_id uuid, p_dia date) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, format('SELECT public.financeiro_baixar(%L, %L, NULL)::text', p_id, p_dia)) $$;

-- 1. Nascimento ----------------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.checa(pg_temp.qtd('parcelada') = 1, 'a venda nasce com uma parcela (veio ' || pg_temp.qtd('parcelada') || ')');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 1)).valor = 10000, 'a parcela 1 é a comissão inteira');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 1)).descricao NOT LIKE '%parcela%', 'à vista a descrição não muda');
  PERFORM pg_temp.checa(pg_temp.imposto('parcelada', 1) = 1000, 'o imposto da parcela 1 é o da venda');
  PERFORM pg_temp.checa(pg_temp.situacao('parcelada') IS NOT DISTINCT FROM 'pendente', 'nada recebido = pendente');
  RAISE NOTICE 'OK 1 · a venda nasce à vista: parcela 1 de 1, com o imposto dela';
END $$;

-- 2. Parcelar ------------------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada',
         '[{"valor":4000,"vencimento":"2026-10-20"},{"valor":6000,"vencimento":"2026-11-20"}]');
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin parcela (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.qtd('parcelada') = 2, 'duas parcelas (veio ' || pg_temp.qtd('parcelada') || ')');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 1)).valor = 4000 AND (pg_temp.parc('parcelada', 2)).valor = 6000, 'valores 4000 e 6000');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 2)).vencimento IS NOT DISTINCT FROM '2026-11-20'::date, 'vencimento da parcela 2');
  PERFORM pg_temp.checa(pg_temp.imposto('parcelada', 1) = 400 AND pg_temp.imposto('parcelada', 2) = 600, 'imposto por parcela');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 2)).descricao LIKE '% · parcela 2',
    'a descrição diz qual parcela (veio ' || (pg_temp.parc('parcelada', 2)).descricao || ')');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).recebimento_previsto_em IS NOT DISTINCT FROM '2026-10-20'::date,
    'a previsão da venda é a próxima parcela');
  RAISE NOTICE 'OK 2 · parcelar troca a parcela única por duas, com imposto em cada';
END $$;

-- 3. Soma errada e permissões ---------------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada', '[{"valor":4000},{"valor":5000}]');
  PERFORM pg_temp.checa(r LIKE 'ERRO%somam%', 'soma que não fecha é recusada (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.qtd('parcelada') = 2, 'a recusa não mexe nas parcelas');
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada', '[{"valor":10000},{"valor":0}]');
  PERFORM pg_temp.checa(r LIKE 'ERRO%maior que zero%', 'parcela de zero é recusada (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.parcelar((SELECT corretor FROM fx), 'parcelada', '[{"valor":10000}]');
  PERFORM pg_temp.checa(r IS NULL, 'corretor não parcela (veio ' || coalesce(r, 'NULL') || ')');
  r := pg_temp.parcelar((SELECT gerente FROM fx), 'avista', '[{"valor":5000,"vencimento":"2026-12-01"}]');
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'gerente parcela (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.qtd('avista') = 1, 'uma parcela só continua à vista');
  PERFORM pg_temp.checa((pg_temp.v('avista')).recebimento_previsto_em IS NOT DISTINCT FROM '2026-12-01'::date
                    AND (pg_temp.parc('avista', 1)).vencimento IS NOT DISTINCT FROM '2026-12-01'::date,
    'à vista a data vai na venda e a parcela acompanha');
  RAISE NOTICE 'OK 3 · soma errada não passa; corretor não parcela; gerente parcela';
END $$;

-- 4. Baixa de uma parcela -------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.baixar((SELECT admin FROM fx), (pg_temp.parc('parcelada', 1)).id, '2026-10-21');
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin baixa a parcela 1 (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.situacao('parcelada') IS NOT DISTINCT FROM 'parcelado', 'uma de duas = parcelado');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).valor_recebido IS NOT DISTINCT FROM 4000::numeric,
    'a venda soma o que entrou (veio ' || coalesce((pg_temp.v('parcelada')).valor_recebido::text, 'NULL') || ')');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).recebido_em IS NULL, 'com parcela em aberto a venda não está recebida');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).status IS NOT DISTINCT FROM 'a_faturar', 'recebimento parcial não mexe no status da nota');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).recebimento_previsto_em IS NOT DISTINCT FROM '2026-11-20'::date,
    'a previsão anda para a próxima parcela');
  RAISE NOTICE 'OK 4 · baixar uma parcela deixa a venda parcelada, com o recebido somado';
END $$;

-- 5. Re-parcelar o resto preserva a baixada --------------------------------
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada',
         '[{"valor":3000,"vencimento":"2026-11-20"},{"valor":3000,"vencimento":"2026-12-20"}]');
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 're-parcelar o resto (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.qtd('parcelada') = 3, 'a baixada fica e entram duas (veio ' || pg_temp.qtd('parcelada') || ')');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 1)).pago_em IS NOT DISTINCT FROM '2026-10-21'::date, 'a parcela 1 continua paga');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 3)).valor = 3000, 'as novas são numeradas depois da paga');
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada', '[{"valor":10000}]');
  PERFORM pg_temp.checa(r LIKE 'ERRO%somam%', 'refazer ignorando o que já entrou é recusado (veio ' || coalesce(r, 'NULL') || ')');
  RAISE NOTICE 'OK 5 · re-parcelar só mexe no que está em aberto';
END $$;

-- 6. Tudo pago, e desfazer -------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.baixar((SELECT admin FROM fx), (pg_temp.parc('parcelada', 2)).id, '2026-11-21');
  PERFORM pg_temp.baixar((SELECT admin FROM fx), (pg_temp.parc('parcelada', 3)).id, '2026-12-21');
  PERFORM pg_temp.checa(pg_temp.situacao('parcelada') IS NOT DISTINCT FROM 'pago', 'todas pagas = pago');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).recebido_em IS NOT DISTINCT FROM '2026-12-21'::date, 'recebido_em é a última baixa');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).status IS NOT DISTINCT FROM 'recebido',
    'status recebido (veio ' || (pg_temp.v('parcelada')).status || ')');

  r := pg_temp.baixar((SELECT admin FROM fx), (pg_temp.parc('parcelada', 3)).id, NULL);
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).recebido_em IS NULL, 'desfazer uma baixa tira o recebido_em');
  PERFORM pg_temp.checa((pg_temp.v('parcelada')).status IS NOT DISTINCT FROM 'a_faturar',
    'e o status volta ao da nota (veio ' || (pg_temp.v('parcelada')).status || ')');
  PERFORM pg_temp.checa(pg_temp.situacao('parcelada') IS NOT DISTINCT FROM 'parcelado', 'e a situação volta a parcelado');
  RAISE NOTICE 'OK 6 · pago quando todas entram; desfazer uma baixa volta um passo';
END $$;

-- 7. Comissão muda: à vista acompanha, parcelada não se reescreve ----------
UPDATE vendas SET comissao_bruta = 6000 WHERE id = pg_temp.vid('avista');
UPDATE vendas SET comissao_bruta = 12000 WHERE id = pg_temp.vid('parcelada');
DO $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.checa((pg_temp.parc('avista', 1)).valor = 6000,
    'à vista em aberto acompanha a comissão (veio ' || (pg_temp.parc('avista', 1)).valor || ')');
  PERFORM pg_temp.checa((pg_temp.parc('parcelada', 3)).valor = 3000, 'parcelada não se reescreve sozinha');
  r := pg_temp.parcelar((SELECT admin FROM fx), 'parcelada', '[{"valor":3000}]');
  PERFORM pg_temp.checa(r LIKE 'ERRO%somam%', 'com a comissão nova, o resto antigo não fecha mais');
  RAISE NOTICE 'OK 7 · a comissão muda a parcela única; na parcelada a diferença aparece';
END $$;

-- 8. À vista: o contrato de 21/09 continua (a venda manda) -----------------
UPDATE vendas SET recebido_em = '2026-09-30', valor_recebido = 4000 WHERE id = pg_temp.vid('legado');
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.parc('legado', 1)).status IS NOT DISTINCT FROM 'baixado'
                    AND (pg_temp.parc('legado', 1)).pago_em IS NOT DISTINCT FROM '2026-09-30'::date,
    'escrever o recebimento na venda à vista baixa a parcela');
  PERFORM pg_temp.checa(pg_temp.qtd('legado') = 1, 'e não cria parcela nova');
  RAISE NOTICE 'OK 8 · venda à vista: quem grava na venda continua baixando o Financeiro';
END $$;

-- 9. Líquido proporcional, repasse e a parte da casa -----------------------
INSERT INTO venda_repasses (venda_id, tenant_id, papel, nome, pct, valor)
SELECT pg_temp.vid('parcelada'), t, 'corretor', 'Cora Corretora', 45, 5400 FROM fx
UNION ALL SELECT pg_temp.vid('parcelada'), t, 'lider', 'Gil Gerente', 15, 1800 FROM fx
UNION ALL SELECT pg_temp.vid('parcelada'), t, 'lotus', 'Casa', 40, 4800 FROM fx;
DO $$
DECLARE j jsonb; v_liq numeric; v_tot numeric;
BEGIN
  PERFORM pg_temp.checa((SELECT count(*) FROM lancamentos_financeiros WHERE origem = 'repasse'
      AND origem_id IN (SELECT id FROM venda_repasses WHERE venda_id = pg_temp.vid('parcelada'))) = 2,
    'corretor e líder viram "a pagar"; a parte da casa não');
  j := pg_temp.como((SELECT admin FROM fx), format(
    'SELECT public.financeiro_lancamentos(%L, %L, %L, %L)::text',
    (SELECT t FROM fx), '2026-01-01', '2026-12-31', 'receber'))::jsonb;
  SELECT (x->>'valor_liquido')::numeric INTO v_liq FROM jsonb_array_elements(j->'linhas') x
   WHERE x->>'id' = (pg_temp.parc('parcelada', 3)).id::text;
  -- líquida = 12000 − 5400 − 1800 = 4800; a parcela 3 é 3000 de 12000 → 1200.
  PERFORM pg_temp.checa(v_liq IS NOT DISTINCT FROM 1200.00, 'o líquido da parcela é proporcional (veio ' || coalesce(v_liq::text, 'NULL') || ')');
  -- 'parcelada': 4000 + 3000 + 3000 de 12000 → 4000. As outras não têm folha.
  v_tot := (j->'totais'->>'liquido')::numeric;
  PERFORM pg_temp.checa(v_tot IS NOT DISTINCT FROM 4000.00, 'o líquido total não multiplica pelas parcelas (veio ' || coalesce(v_tot::text, 'NULL') || ')');
  RAISE NOTICE 'OK 9 · líquido proporcional por parcela; a parte da casa não vira despesa';
END $$;

-- 10. Nenhum imposto órfão --------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.checa(NOT EXISTS (
    SELECT 1 FROM lancamentos_financeiros i
     WHERE i.origem = 'imposto' AND i.origem_id IN (SELECT id FROM vx)
       AND NOT EXISTS (SELECT 1 FROM lancamentos_financeiros p WHERE p.origem = 'venda'
                        AND p.origem_id = i.origem_id AND p.parcela = i.parcela)),
    'nenhum imposto sem a parcela dele');
  RAISE NOTICE 'OK 10 · nenhum imposto órfão depois de parcelar e re-parcelar';
END $$;

ROLLBACK;

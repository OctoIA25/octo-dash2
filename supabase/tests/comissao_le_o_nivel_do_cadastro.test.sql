-- ============================================================
-- A comissão lê o nível do cadastro e completa o que nasceu vazio
-- (20261006_comissao_le_o_nivel_do_cadastro.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/comissao_le_o_nivel_do_cadastro.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant: não depende do dump.
-- Sucesso = um NOTICE "OK" por bloco. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Executa como uma pessoa logada; devolve o resultado ou a mensagem de erro.
CREATE FUNCTION pg_temp.como(p_user uuid, p_email text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

-- A casa T: a diretora (admin), um corretor Pleno, um sem nível, um com nível
-- inválido no jsonb. A Construtora C ainda sem percentual — como a Santa Ângela.
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7d1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7d1b0000-0000-4000-a000-000000000001'::uuid AS diretora,
  '7d1b0000-0000-4000-a000-000000000002'::uuid AS pleno,
  '7d1b0000-0000-4000-a000-000000000003'::uuid AS sem_nivel,
  '7d1b0000-0000-4000-a000-000000000004'::uuid AS estranho,
  '7d1c0000-0000-4000-a000-000000000001'::uuid AS constr,
  '7d1c0000-0000-4000-a000-000000000002'::uuid AS constr2,
  '7d1d0000-0000-4000-a000-000000000001'::uuid AS lanc,
  '7d1d0000-0000-4000-a000-000000000002'::uuid AS lanc2;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-comissao-nivel', 'Teste Comissão Nível' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.diretora,  'diretora@teste-nivel.dev', '{"name":"Ana Diretora"}'::jsonb),
  (fx.pleno,     'pleno@teste-nivel.dev',    '{"name":"Hugo Pleno"}'::jsonb),
  (fx.sem_nivel, 'sem@teste-nivel.dev',      '{"name":"Sol Sem Nível"}'::jsonb),
  (fx.estranho,  'estranho@teste-nivel.dev', '{"name":"Edu Estranho"}'::jsonb)
) AS v(id, email, meta)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, diretora,  'admin',    '{}'::jsonb FROM fx
UNION ALL SELECT t, pleno,     'corretor', '{"nivel_comissao":"pleno"}'::jsonb FROM fx
UNION ALL SELECT t, sem_nivel, 'corretor', '{}'::jsonb FROM fx
UNION ALL SELECT t, estranho,  'corretor', '{"nivel_comissao":"Chefe"}'::jsonb FROM fx;

INSERT INTO public.construtoras (id, tenant_id, codigo, nome, comissao_padrao_pct)
SELECT constr,  t, 'teste_nivel_c1', 'Construtora Teste',  NULL::numeric FROM fx
UNION ALL SELECT constr2, t, 'teste_nivel_c2', 'Construtora Dois', NULL FROM fx;

INSERT INTO public.lancamentos (id, tenant_id, nome, construtora_id)
SELECT lanc,  t, 'Residencial Teste Nível', constr  FROM fx
UNION ALL SELECT lanc2, t, 'Residencial Dois Nível', constr2 FROM fx;

-- Cada proposta assinada vira uma venda pelo gatilho que já existe.
CREATE FUNCTION pg_temp.vende(p_corretor uuid, p_empreend text, p_valor numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid := gen_random_uuid(); v_venda uuid;
BEGIN
  INSERT INTO public.proposals (id, tenant_id, stage_id, value, forecast_empreendimento, agent_user_id, agent_name)
  SELECT v_prop, fx.t, 'proposta-assinada', p_valor, p_empreend, p_corretor, 'corretor de teste' FROM fx;
  SELECT id INTO v_venda FROM public.vendas WHERE proposta_id = v_prop;
  RETURN v_venda;
END $$;

CREATE TEMP TABLE vx (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO vx VALUES
  ('pleno',     pg_temp.vende((SELECT pleno FROM fx),     'Residencial Teste Nível', 500000)),
  ('sem_nivel', pg_temp.vende((SELECT sem_nivel FROM fx), 'Residencial Teste Nível', 400000)),
  ('estranho',  pg_temp.vende((SELECT estranho FROM fx),  'Residencial Teste Nível', 300000)),
  ('recebida',  pg_temp.vende((SELECT pleno FROM fx),     'Residencial Teste Nível', 200000)),
  ('dois',      pg_temp.vende((SELECT pleno FROM fx),     'Residencial Dois Nível',  100000));

CREATE FUNCTION pg_temp.v(p text) RETURNS public.vendas LANGUAGE sql AS $$
  SELECT v.* FROM public.vendas v JOIN vx ON vx.id = v.id WHERE vx.nome = p;
$$;

-- 1. A venda nasce com o nível do cadastro --------------------------------
DO $$ BEGIN
  PERFORM pg_temp.checa((SELECT count(*) FROM vx WHERE id IS NOT NULL) = 5, 'as cinco propostas viraram venda');
  PERFORM pg_temp.checa((pg_temp.v('pleno')).nivel_corretor IS NOT DISTINCT FROM 'pleno',
    'venda do Pleno nasce Pleno (veio ' || coalesce((pg_temp.v('pleno')).nivel_corretor, 'NULL') || ')');
  PERFORM pg_temp.checa((pg_temp.v('sem_nivel')).nivel_corretor IS NULL, 'venda de quem não tem nível nasce sem nível');
  PERFORM pg_temp.checa((pg_temp.v('estranho')).nivel_corretor IS NULL,
    'nível inválido no cadastro ("Chefe") não entra na venda nem quebra o INSERT');
  PERFORM pg_temp.checa((pg_temp.v('pleno')).comissao_pct = 0, 'construtora sem % → venda nasce com 0');
  RAISE NOTICE 'OK 1 · a venda nasce com o nível de onde a Gestão de Equipe grava';
END $$;

-- 2. Quem ganha nível completa a venda que esperava ------------------------
UPDATE public.tenant_memberships SET permissions = permissions || '{"nivel_comissao":"junior"}'
 WHERE user_id = (SELECT sem_nivel FROM fx) AND tenant_id = (SELECT t FROM fx);
UPDATE public.tenant_memberships SET permissions = permissions || '{"nivel_comissao":"senior"}'
 WHERE user_id = (SELECT pleno FROM fx) AND tenant_id = (SELECT t FROM fx);

DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('sem_nivel')).nivel_corretor IS NOT DISTINCT FROM 'junior',
    'venda sem nível pega o nível novo do cadastro (veio ' || coalesce((pg_temp.v('sem_nivel')).nivel_corretor, 'NULL') || ')');
  PERFORM pg_temp.checa((pg_temp.v('pleno')).nivel_corretor IS NOT DISTINCT FROM 'pleno',
    'promover o Pleno a Sênior NÃO muda a venda que já era Pleno');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM public.venda_historico h
      WHERE h.venda_id = (pg_temp.v('sem_nivel')).id AND h.campo = 'nivel_corretor'
        AND h.de IS NULL AND h.para = 'junior'),
    'o nível completado fica no histórico da venda');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM public.venda_historico h
      WHERE h.venda_id = (pg_temp.v('pleno')).id AND h.campo = 'nivel_corretor'),
    'a venda que não mudou não ganha linha de histórico');
  RAISE NOTICE 'OK 2 · nível: o vazio se completa, o gravado fica';
END $$;

-- 3. A construtora ganha % e as vendas se completam -----------------------
UPDATE public.vendas SET recebido_em = current_date, valor_recebido = 1000
 WHERE id = (pg_temp.v('recebida')).id;
UPDATE public.construtoras SET comissao_padrao_pct = 5 WHERE id = (SELECT constr FROM fx);

DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('pleno')).comissao_pct = 5
      AND (pg_temp.v('pleno')).comissao_bruta = 25000,
    'venda de R$ 500 mil ganha 5% e bruta de R$ 25 mil (veio ' || (pg_temp.v('pleno')).comissao_pct || '% / ' || (pg_temp.v('pleno')).comissao_bruta || ')');
  PERFORM pg_temp.checa((pg_temp.v('sem_nivel')).comissao_bruta = 20000, 'segunda venda: R$ 400 mil × 5% = R$ 20 mil');
  PERFORM pg_temp.checa((pg_temp.v('recebida')).comissao_pct = 0, 'venda já recebida NÃO é completada');
  PERFORM pg_temp.checa((pg_temp.v('dois')).comissao_pct = 0, 'venda de outra construtora não é tocada');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM public.venda_historico h
      WHERE h.venda_id = (pg_temp.v('pleno')).id AND h.campo = 'comissao_pct'
        AND h.de::numeric = 0 AND h.para::numeric = 5 AND h.justificativa LIKE '%completado do cadastro%'),
    'o percentual completado fica no histórico, com o motivo');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM public.lancamentos_financeiros l
      WHERE l.origem = 'venda' AND l.origem_id = (pg_temp.v('pleno')).id AND l.valor = 25000),
    'o Financeiro ganha o "a receber" da comissão completada');
  RAISE NOTICE 'OK 3 · percentual: o 0 se completa do cadastro, o recebido fica';
END $$;

-- 4. O percentual gravado não muda quando a construtora muda --------------
UPDATE public.construtoras SET comissao_padrao_pct = 6 WHERE id = (SELECT constr FROM fx);

DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('pleno')).comissao_pct = 5,
    'construtora de 5% para 6% NÃO muda a venda que já tinha 5%');
  RAISE NOTICE 'OK 4 · percentual gravado é travado';
END $$;

-- 5. A trava: completar sim, mudar não -----------------------------------
-- A construtora Dois ganha 3% sem disparar o completar (réplica ignora gatilho
-- de usuário), para testar a trava pela porta da frente.
SET LOCAL session_replication_role = replica;
UPDATE public.construtoras SET comissao_padrao_pct = 3 WHERE id = (SELECT constr2 FROM fx);
SET LOCAL session_replication_role = origin;

DO $$
DECLARE f record; v text; v_venda uuid := (pg_temp.v('dois')).id;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', format(
    'UPDATE public.vendas SET comissao_pct = 4 WHERE id = %L RETURNING comissao_pct::text', v_venda));
  PERFORM pg_temp.checa(v LIKE '%travado%', 'admin NÃO põe 4% numa venda cuja construtora tem 3% (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', format(
    'UPDATE public.vendas SET comissao_pct = 3 WHERE id = %L RETURNING comissao_pct::text', v_venda));
  PERFORM pg_temp.checa(v = '3', 'admin completa com o % do cadastro (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', format(
    'UPDATE public.vendas SET comissao_pct = 6 WHERE id = %L RETURNING comissao_pct::text', (pg_temp.v('pleno')).id));
  PERFORM pg_temp.checa(v LIKE '%travado%', 'admin NÃO muda 5% para 6%, mesmo sendo o % novo da construtora (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 5 · a trava aceita completar e recusa mudar';
END $$;

-- 6. As funções internas não são da tela ---------------------------------
DO $$
DECLARE f record; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', format(
    'SELECT public.vendas_completar_do_cadastro(%L)::text', f.t));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'logado não chama vendas_completar_do_cadastro (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', format(
    'SELECT public.nivel_do_membro(%L, %L)', f.t, f.pleno));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'logado não chama nivel_do_membro (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.diretora, 'diretora@teste-nivel.dev', 'SELECT public.tg_membro_completa_vendas()::text');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'função de gatilho não roda pela tela (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 6 · completar e ler o nível ficam dentro do banco';
END $$;

ROLLBACK;

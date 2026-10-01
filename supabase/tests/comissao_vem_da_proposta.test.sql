-- ============================================================
-- A comissão da venda é a negociada na proposta (20261014_comissao_vem_da_proposta.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/comissao_vem_da_proposta.test.sql
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

CREATE FUNCTION pg_temp.como(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

-- A casa T: a diretora e um corretor. C1 tem 5% de comissão padrão; C2 não tem
-- nenhum — como as 21 da Lotus.
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7e1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7e1b0000-0000-4000-a000-000000000001'::uuid AS diretora,
  '7e1b0000-0000-4000-a000-000000000002'::uuid AS corretor,
  '7e1c0000-0000-4000-a000-000000000001'::uuid AS c1,
  '7e1c0000-0000-4000-a000-000000000002'::uuid AS c2,
  '7e1d0000-0000-4000-a000-000000000001'::uuid AS l1,
  '7e1d0000-0000-4000-a000-000000000002'::uuid AS l2;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-comissao-proposta', 'Teste Comissão Proposta' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, '{}'::jsonb FROM fx, LATERAL (VALUES
  (fx.diretora, 'diretora@teste-cprop.dev'), (fx.corretor, 'corretor@teste-cprop.dev')) AS v(id, email)
ON CONFLICT (id) DO NOTHING;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, diretora, 'admin', '{}'::jsonb FROM fx
UNION ALL SELECT t, corretor, 'corretor', '{"nivel_comissao":"pleno"}'::jsonb FROM fx;
INSERT INTO construtoras (id, tenant_id, codigo, nome, comissao_padrao_pct)
SELECT c1, t, 'teste_cprop_c1', 'Construtora Cinco', 5 FROM fx
UNION ALL SELECT c2, t, 'teste_cprop_c2', 'Construtora Sem', NULL FROM fx;
INSERT INTO lancamentos (id, tenant_id, nome, construtora_id)
SELECT l1, t, 'Residencial Cinco', c1 FROM fx
UNION ALL SELECT l2, t, 'Residencial Sem', c2 FROM fx;

-- Proposta assinada → venda, pelo gatilho que já existe.
CREATE FUNCTION pg_temp.vende(p_empreend text, p_valor numeric, p_comissao numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid := gen_random_uuid();
BEGIN
  INSERT INTO proposals (id, tenant_id, stage_id, value, commission_total, forecast_empreendimento, agent_user_id, agent_name, signed_at)
  SELECT v_prop, fx.t, 'proposta-assinada', p_valor, p_comissao, p_empreend, fx.corretor, 'Corretor Teste', '2026-09-15 15:00-03' FROM fx;
  RETURN v_prop;
END $$;

CREATE FUNCTION pg_temp.venda_da(p_prop uuid) RETURNS vendas LANGUAGE sql AS $$
  SELECT * FROM vendas WHERE proposta_id = p_prop;
$$;

CREATE FUNCTION pg_temp.receber(p_venda uuid) RETURNS lancamentos_financeiros LANGUAGE sql AS $$
  SELECT * FROM lancamentos_financeiros WHERE origem = 'venda' AND origem_id = p_venda;
$$;

-- As vendas de antes desta migration: percentual e comissão zerados, com a
-- comissão da proposta guardada ao lado. Entram sem gatilho, como a carga antiga.
CREATE TEMP TABLE antiga (nome text PRIMARY KEY, id uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO antiga (nome) VALUES ('A'), ('B'), ('C'), ('D'), ('E'), ('F'), ('G1'), ('G2'), ('H'), ('I'), ('J'), ('K');
CREATE FUNCTION pg_temp.a(p text) RETURNS vendas LANGUAGE sql AS $$
  SELECT v.* FROM vendas v JOIN antiga x ON x.id = v.id WHERE x.nome = p;
$$;

SET LOCAL session_replication_role = replica;
INSERT INTO vendas (id, tenant_id, data_venda, empreendimento, construtora_id, corretor_nome, vgv, comissao_pct, comissao_bruta,
                    imposto_pct, comissao_da_proposta, recebido_em, valor_recebido, status)
SELECT x.id, fx.t, d.data, 'Residencial Sem', fx.c2, 'Corretor Teste', d.vgv, d.pct, d.bruta, d.imp, d.cp, d.rec, d.vrec, 'a_faturar'
  FROM fx, antiga x JOIN (VALUES
    -- nome, data, vgv, pct, bruta, imposto%, comissão da proposta, recebido em, valor recebido
    ('A',  DATE '2026-02-28', 460663.55, 0,   0,    6, 23745.54, NULL::date, NULL::numeric),  -- a típica da Lotus
    ('B',  DATE '2026-03-01', 100000,    2.5, 2500, 0, 5000,     NULL, NULL),                 -- % posto pelo dono: não mexe
    ('C',  DATE '2026-03-02', 100000,    0,   0,    0, NULL,     NULL, NULL),                 -- sem comissão na proposta
    ('D',  DATE '2026-03-03', 100000,    0,   0,    0, 150000,   NULL, NULL),                 -- comissão > VGV: erro de digitação
    ('E',  DATE '2026-03-04', 100000,    0,   0,    0, 1000,     NULL, NULL),                 -- a da trava
    ('F',  DATE '2026-04-01', 300000,    0,   0,    0, 15000,    NULL, NULL),                 -- duas linhas na planilha
    ('G1', DATE '2026-04-02', 200000,    0,   0,    0, 10000,    NULL, NULL),                 -- duas vendas iguais,
    ('G2', DATE '2026-04-02', 200000,    0,   0,    0, 10000,    NULL, NULL),                 --   uma linha só
    ('H',  DATE '2026-04-03', 250000,    0,   0,    0, 12500,    NULL, NULL),                 -- planilha sem recebimento
    ('I',  DATE '2026-04-04', 260000,    0,   0,    0, 13000,    DATE '2026-05-01', 13000),   -- já tinha recebimento
    ('J',  DATE '2026-04-05', 270000,    0,   0,    0, 13500,    NULL, NULL),                 -- linha da planilha inativa
    ('K',  DATE '2026-04-06', 280000,    0,   0,    0, 14000,    NULL, NULL)                  -- mesmo VGV e data, outra comissão
  ) AS d(nome, data, vgv, pct, bruta, imp, cp, rec, vrec) ON d.nome = x.nome;

INSERT INTO commercial_sales (tenant_id, valor_vgv, data_assinatura, comissao_total_venda, data_recebimento, is_active)
SELECT fx.t, d.vgv, d.data, d.com, d.rec, d.ativa FROM fx, (VALUES
  (460663.55, DATE '2026-02-28', 23745.54, DATE '2026-03-10', true),   -- A
  (300000,    DATE '2026-04-01', 15000,    DATE '2026-04-20', true),   -- F, linha 1
  (300000,    DATE '2026-04-01', 15000,    DATE '2026-04-21', true),   -- F, linha 2
  (200000,    DATE '2026-04-02', 10000,    DATE '2026-04-22', true),   -- G1/G2
  (250000,    DATE '2026-04-03', 12500,    NULL,              true),   -- H
  (260000,    DATE '2026-04-04', 13000,    DATE '2026-04-30', true),   -- I (data diferente da que já tem)
  (270000,    DATE '2026-04-05', 13500,    DATE '2026-04-25', false),  -- J
  (280000,    DATE '2026-04-06', 9999,     DATE '2026-04-26', true)    -- K: a comissão não bate
) AS d(vgv, data, com, rec, ativa);
SET LOCAL session_replication_role = origin;

-- 1. Venda nova: a comissão negociada manda --------------------------------------------
DO $$
DECLARE p1 uuid; p2 uuid; v vendas; lf lancamentos_financeiros;
BEGIN
  p1 := pg_temp.vende('Residencial Sem', 500000, 21000);
  v := pg_temp.venda_da(p1);
  PERFORM pg_temp.checa(v.comissao_bruta = 21000 AND v.comissao_pct = 4.2,
    'construtora sem %: a comissão da proposta vira a comissão (veio ' || v.comissao_bruta || ' / ' || v.comissao_pct || '%)');
  lf := pg_temp.receber(v.id);
  PERFORM pg_temp.checa(lf.valor = 21000 AND lf.tipo = 'receber' AND lf.status = 'aberto', 'e o Financeiro ganha o "a receber"');

  p2 := pg_temp.vende('Residencial Cinco', 400000, 12345.67);
  v := pg_temp.venda_da(p2);
  PERFORM pg_temp.checa(v.comissao_bruta = 12345.67 AND v.comissao_pct = round(12345.67 / 400000 * 100, 4),
    'construtora com 5%: a negociada vale mais que a padrão (veio ' || v.comissao_bruta || ')');
  PERFORM pg_temp.checa(v.comissao_da_proposta = 12345.67, 'a comissão da proposta segue guardada ao lado');
  RAISE NOTICE 'OK 1 · a venda nova nasce com a comissão negociada na proposta';
END $$;

-- 2. Reserva e erro de digitação ------------------------------------------------------------
DO $$
DECLARE v vendas;
BEGIN
  v := pg_temp.venda_da(pg_temp.vende('Residencial Cinco', 200000, NULL));
  PERFORM pg_temp.checa(v.comissao_pct = 5 AND v.comissao_bruta = 10000, 'proposta sem comissão: vale o % da construtora');
  v := pg_temp.venda_da(pg_temp.vende('Residencial Sem', 200000, 0));
  PERFORM pg_temp.checa(v.comissao_pct = 0 AND v.comissao_bruta = 0, 'sem comissão e sem %: nasce zero, visível');
  PERFORM pg_temp.checa(pg_temp.receber(v.id) IS NULL OR (pg_temp.receber(v.id)).id IS NULL, 'e não cria "a receber" de R$ 0');
  v := pg_temp.venda_da(pg_temp.vende('Residencial Cinco', 100000, 150000));
  PERFORM pg_temp.checa(v.id IS NOT NULL, 'comissão maior que o VGV não derruba a assinatura da proposta');
  PERFORM pg_temp.checa(v.comissao_pct = 5 AND v.comissao_bruta = 5000,
    'e é ignorada: vale o % da construtora (veio ' || v.comissao_bruta || ')');
  RAISE NOTICE 'OK 2 · sem comissão vale a construtora; comissão impossível é ignorada';
END $$;

-- 3. A trava ---------------------------------------------------------------------------
DO $$
DECLARE f record; r text;
BEGIN
  SELECT * INTO f FROM fx;
  r := pg_temp.como(f.diretora, format('UPDATE public.vendas SET comissao_pct = 1.5 WHERE id = %L RETURNING comissao_pct::text', (pg_temp.a('E')).id));
  PERFORM pg_temp.checa(r LIKE '%travado%', 'a diretora não completa com um % qualquer (veio ' || coalesce(r, 'nada') || ')');
  r := pg_temp.como(f.diretora, format('UPDATE public.vendas SET comissao_pct = 1 WHERE id = %L RETURNING comissao_pct::text', (pg_temp.a('E')).id));
  PERFORM pg_temp.checa(r = '1', 'completar com o % que sai da comissão da proposta é permitido (veio ' || coalesce(r, 'nada') || ')');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM venda_historico h WHERE h.venda_id = (pg_temp.a('E')).id AND h.campo = 'comissao_pct'
                                  AND h.justificativa LIKE '%comissão negociada na proposta%'), 'e fica no histórico da venda');
  r := pg_temp.como(f.diretora, format('UPDATE public.vendas SET comissao_pct = 9 WHERE id = %L RETURNING comissao_pct::text', (pg_temp.a('B')).id));
  PERFORM pg_temp.checa(r LIKE '%travado%', 'mudar % que já existe continua exigindo o dono da plataforma');
  RAISE NOTICE 'OK 3 · a trava aceita completar com a comissão da proposta, e só isso';
END $$;

-- 4. As vendas antigas ------------------------------------------------------------------
DO $$
DECLARE n int; v vendas;
BEGIN
  n := public.vendas_completar_da_proposta((SELECT t FROM fx));
  PERFORM pg_temp.checa(n = 8, 'completa as 8 zeradas com comissão válida: A, F, G1, G2, H, I, J, K (veio ' || n || ')');
  v := pg_temp.a('A');
  PERFORM pg_temp.checa(v.comissao_bruta = 23745.54 AND v.comissao_pct = round(23745.54 / 460663.55 * 100, 4),
    'a típica da Lotus ganha a comissão da proposta (veio ' || v.comissao_bruta || ' / ' || v.comissao_pct || '%)');
  PERFORM pg_temp.checa(v.imposto_valor = round(23745.54 * 6 / 100, 2), 'com o imposto da própria venda');
  PERFORM pg_temp.checa((pg_temp.receber(v.id)).valor = 23745.54, 'e o "a receber" no Financeiro');
  PERFORM pg_temp.checa(v.comissao_liquida IS NULL, 'a líquida segue desconhecida até haver repasse');
  PERFORM pg_temp.checa((pg_temp.a('B')).comissao_pct = 2.5 AND (pg_temp.a('B')).comissao_bruta = 2500, 'o % posto pelo dono não muda');
  PERFORM pg_temp.checa((pg_temp.a('C')).comissao_bruta = 0, 'sem comissão na proposta, fica zero');
  PERFORM pg_temp.checa((pg_temp.a('D')).comissao_bruta = 0, 'comissão maior que o VGV não é usada');
  n := public.vendas_completar_da_proposta((SELECT t FROM fx));
  PERFORM pg_temp.checa(n = 0, 'rodar de novo não mexe em nada (veio ' || n || ')');
  RAISE NOTICE 'OK 4 · as vendas antigas ganham a comissão da proposta, uma vez';
END $$;

-- 5. O recebimento da planilha ----------------------------------------------------------
DO $$
DECLARE n int; v vendas; lf lancamentos_financeiros;
BEGIN
  n := public.vendas_recebido_da_planilha((SELECT t FROM fx));
  PERFORM pg_temp.checa(n = 1, 'só a A tem par único com recebimento (veio ' || n || ')');
  v := pg_temp.a('A');
  PERFORM pg_temp.checa(v.recebido_em = DATE '2026-03-10' AND v.valor_recebido = 23745.54 AND v.status = 'recebido',
    'a A fica recebida, na data da planilha (veio ' || coalesce(v.recebido_em::text, 'nulo') || ' / ' || v.status || ')');
  lf := pg_temp.receber(v.id);
  PERFORM pg_temp.checa(lf.status = 'baixado' AND lf.pago_em = DATE '2026-03-10', 'e o Financeiro mostra como recebido, não como a receber');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM venda_historico h WHERE h.venda_id = v.id AND h.campo = 'recebido_em'
                                  AND h.justificativa LIKE '%planilha%'), 'com a origem no histórico');
  PERFORM pg_temp.checa((pg_temp.a('F')).recebido_em IS NULL, 'duas linhas para uma venda: não escolhe');
  PERFORM pg_temp.checa((pg_temp.a('G1')).recebido_em IS NULL AND (pg_temp.a('G2')).recebido_em IS NULL, 'uma linha para duas vendas: não escolhe');
  PERFORM pg_temp.checa((pg_temp.a('H')).recebido_em IS NULL, 'planilha sem data de recebimento: segue a receber');
  PERFORM pg_temp.checa((pg_temp.a('I')).recebido_em = DATE '2026-05-01', 'recebimento que já existia não é sobrescrito');
  PERFORM pg_temp.checa((pg_temp.a('J')).recebido_em IS NULL, 'linha inativa da planilha não vale');
  PERFORM pg_temp.checa((pg_temp.a('K')).recebido_em IS NULL, 'mesmo VGV e data com outra comissão não é a mesma venda');
  n := public.vendas_recebido_da_planilha((SELECT t FROM fx));
  PERFORM pg_temp.checa(n = 0, 'rodar de novo não mexe em nada');
  RAISE NOTICE 'OK 5 · o recebimento vem da planilha, só com par único';
END $$;

-- 6. Uma fonte: a Conferência e as metas dizem a mesma comissão --------------------------
DO $$
DECLARE p uuid; v vendas; vgc numeric;
BEGIN
  p := pg_temp.vende('Residencial Sem', 333000, 17777.77);
  v := pg_temp.venda_da(p);
  SELECT va.vgc INTO vgc FROM vendas_assinadas va WHERE va.id = p;
  PERFORM pg_temp.checa(vgc = v.comissao_bruta, 'VGC das metas = comissão da Conferência (veio ' || vgc || ' × ' || v.comissao_bruta || ')');
  RAISE NOTICE 'OK 6 · o VGC é o mesmo nas duas telas';
END $$;

-- 7. As peças internas não se chamam de fora -------------------------------------------
DO $$
DECLARE f record; r text;
BEGIN
  SELECT * INTO f FROM fx;
  r := pg_temp.como(f.diretora, format('SELECT public.vendas_completar_da_proposta(%L)::text', f.t));
  PERFORM pg_temp.checa(r LIKE 'permission denied%', 'completar não é chamável pela tela (veio ' || coalesce(r, 'nada') || ')');
  r := pg_temp.como(f.diretora, format('SELECT public.vendas_recebido_da_planilha(%L)::text', f.t));
  PERFORM pg_temp.checa(r LIKE 'permission denied%', 'o recebimento também não');
  RAISE NOTICE 'OK 7 · as funções de carga são internas';
END $$;

ROLLBACK;

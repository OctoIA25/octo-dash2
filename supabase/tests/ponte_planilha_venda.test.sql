-- ============================================================
-- Ponte planilha → venda (20261027_ponte_planilha_venda.sql)
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/ponte_planilha_venda.test.sql
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
  'a1270000-0000-4000-a000-000000000001'::uuid AS t,
  'a127b000-0000-4000-a000-000000000001'::uuid AS admin,
  'a127b000-0000-4000-a000-000000000002'::uuid AS gerente,
  'a127b000-0000-4000-a000-000000000003'::uuid AS corretor;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-ponte', 'Teste Ponte' FROM fx;
INSERT INTO auth.users (id, email)
SELECT admin, 'admin@teste-ponte.dev' FROM fx
UNION ALL SELECT gerente, 'gerente@teste-ponte.dev' FROM fx
UNION ALL SELECT corretor, 'corretor@teste-ponte.dev' FROM fx;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, admin, 'admin', '{}'::jsonb FROM fx
UNION ALL SELECT t, gerente, 'team_leader', '{}'::jsonb FROM fx
UNION ALL SELECT t, corretor, 'corretor', '{}'::jsonb FROM fx;

-- Venda pelo caminho real (proposta assinada).
CREATE FUNCTION pg_temp.vende(p_valor numeric, p_comissao numeric, p_assinada timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid := gen_random_uuid(); v_id uuid;
BEGIN
  INSERT INTO proposals (id, tenant_id, stage_id, value, commission_total,
                         forecast_empreendimento, agent_user_id, agent_name, signed_at)
  SELECT v_prop, t, 'proposta-assinada', p_valor, p_comissao,
         'Residencial Ponte', corretor, 'Cora Corretora', p_assinada FROM fx;
  SELECT id INTO v_id FROM vendas WHERE proposta_id = v_prop;
  RETURN v_id;
END $$;

-- Linha da planilha, como o sync a grava.
CREATE FUNCTION pg_temp.linha(p_n int, p_data date, p_vgv numeric, p_comissao numeric,
                              p_recebido date DEFAULT NULL, p_cliente text DEFAULT 'Cliente') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO commercial_sales (tenant_id, empreendimento, valor_vgv, comissao_total_venda,
                                data_assinatura, data_recebimento, cliente_nome, corretor_nome,
                                spreadsheet_id, sheet_gid, source_row_number, is_active)
  SELECT t, 'Terceiros', p_vgv, p_comissao, p_data, p_recebido, p_cliente, 'Cora Corretora',
         'planilha-teste', '0', p_n, true FROM fx
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE TEMP TABLE vx (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.vid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM vx WHERE nome = p $$;
CREATE FUNCTION pg_temp.v(p text) RETURNS public.vendas LANGUAGE sql AS $$
  SELECT v.* FROM vendas v WHERE v.id = pg_temp.vid(p) $$;
CREATE FUNCTION pg_temp.da_linha(p text) RETURNS public.vendas LANGUAGE sql AS $$
  SELECT v.* FROM vendas v WHERE v.planilha_id = pg_temp.vid(p) $$;
CREATE FUNCTION pg_temp.qtd_vendas() RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM vendas WHERE tenant_id = (SELECT t FROM fx) $$;

-- 1. A venda do CRM e a linha da planilha se ligam ----------------------------
INSERT INTO vx VALUES ('crm', pg_temp.vende(300000, 15000, '2026-08-10 12:00-03'));
INSERT INTO vx VALUES ('l1', pg_temp.linha(10, '2026-08-10', 300000, 15000));
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm')).planilha_id IS NOT DISTINCT FROM pg_temp.vid('l1'), 'a linha liga na venda do CRM');
  PERFORM pg_temp.checa(pg_temp.qtd_vendas() = 1, 'e não cria outra venda');
  RAISE NOTICE 'OK 1 · mesma data e VGV: liga, não duplica';
END $$;

-- 2. A planilha preenche o recebimento vazio, e nunca desfaz --------------------
UPDATE commercial_sales SET data_recebimento = '2026-09-02' WHERE id = pg_temp.vid('l1');
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm')).recebido_em IS NOT DISTINCT FROM '2026-09-02'::date, 'a data da planilha vira o recebimento');
  PERFORM pg_temp.checa((SELECT situacao FROM venda_parcelas_resumo(pg_temp.vid('crm'))) IS NOT DISTINCT FROM 'pago', 'e a parcela fica paga');
END $$;
UPDATE commercial_sales SET data_recebimento = NULL WHERE id = pg_temp.vid('l1');
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm')).recebido_em IS NOT DISTINCT FROM '2026-09-02'::date, 'apagar na planilha não desfaz na Dash');
END $$;
UPDATE commercial_sales SET data_recebimento = '2026-09-20' WHERE id = pg_temp.vid('l1');
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm')).recebido_em IS NOT DISTINCT FROM '2026-09-02'::date, 'outra data na planilha não sobrescreve');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM venda_historico WHERE venda_id = pg_temp.vid('crm')
                                   AND campo = 'recebido_em' AND justificativa LIKE '%planilha%'), 'a origem fica no histórico');
  RAISE NOTICE 'OK 2 · a planilha preenche o vazio, não desfaz e não sobrescreve';
END $$;

-- 3. Linha sem venda vira venda ---------------------------------------------------
INSERT INTO vx VALUES ('l_parceria', pg_temp.linha(20, '2026-04-29', 0, 9870, '2026-04-30', 'Parceiro Fulano'));
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.da_linha('l_parceria')).id IS NOT NULL, 'a linha sem venda cria a venda');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_parceria')).comissao_bruta = 9870, 'com a comissão da planilha');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_parceria')).cliente IS NOT DISTINCT FROM 'Parceiro Fulano', 'e o cliente');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_parceria')).tipo IS NOT DISTINCT FROM 'terceiros', 'sem cadastro, terceiros');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_parceria')).status IS NOT DISTINCT FROM 'recebido', 'já recebida na planilha nasce recebida');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM lancamentos_financeiros WHERE origem = 'venda'
     AND origem_id = (pg_temp.da_linha('l_parceria')).id AND status = 'baixado' AND pago_em = '2026-04-30'),
    'e o Financeiro conta como recebido na data da planilha');
  RAISE NOTICE 'OK 3 · linha sem venda vira venda, já com o recebimento';
END $$;

-- 4. Comissão zero (as parcelas soltas da planilha) não vira venda -----------------
INSERT INTO vx VALUES ('l_zero', pg_temp.linha(21, '2026-01-30', 0, 0, '2026-03-06'));
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.da_linha('l_zero')).id IS NULL, 'linha de comissão zero não vira venda');
  RAISE NOTICE 'OK 4 · comissão zero é ignorada';
END $$;

-- 5. Ambíguo e duplicado: sem_par, nada criado --------------------------------------
INSERT INTO vx VALUES ('crm_a', pg_temp.vende(450000, 20000, '2026-07-01 12:00-03')),
                      ('crm_b', pg_temp.vende(450000, 20000, '2026-07-01 13:00-03')),
                      ('crm_k', pg_temp.vende(280000, 14000, '2026-06-06 12:00-03'));
DO $$
DECLARE n int := pg_temp.qtd_vendas();
BEGIN
  INSERT INTO vx VALUES ('l_amb', pg_temp.linha(30, '2026-07-01', 450000, 20000));
  PERFORM pg_temp.checa((pg_temp.da_linha('l_amb')).id IS NULL AND pg_temp.qtd_vendas() = n,
    'duas vendas casam: não liga nem cria');
  INSERT INTO vx VALUES ('l_dup', pg_temp.linha(11, '2026-08-10', 300000, 15000));
  PERFORM pg_temp.checa((pg_temp.da_linha('l_dup')).id IS NULL AND pg_temp.qtd_vendas() = n,
    'linha repetida de uma venda já ligada não cria outra venda');
  INSERT INTO vx VALUES ('l_k', pg_temp.linha(12, '2026-06-06', 280000, 9999));
  PERFORM pg_temp.checa((pg_temp.da_linha('l_k')).id IS NULL AND (pg_temp.v('crm_k')).planilha_id IS NULL
                    AND pg_temp.qtd_vendas() = n,
    'mesmo VGV e data com outra comissão: não liga nem cria');
  INSERT INTO vx VALUES ('g1', pg_temp.linha(13, '2026-05-05', 123456, 6000)),
                        ('g2', pg_temp.linha(14, '2026-05-05', 123456, 6000));
  PERFORM pg_temp.checa((pg_temp.da_linha('g2')).id IS NULL AND pg_temp.qtd_vendas() = n + 1,
    'duas linhas gêmeas sem venda: a segunda não cria outra (veio ' || pg_temp.qtd_vendas() || ' de ' || n || ')');
  RAISE NOTICE 'OK 5 · ambíguo, repetido, comissão diferente ou gêmea ficam "sem par"';
END $$;

-- 6. A linha que deslocou desliga -----------------------------------------------------
UPDATE commercial_sales SET valor_vgv = 777777, comissao_total_venda = 30000, data_recebimento = NULL
 WHERE id = pg_temp.vid('l1');
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm')).planilha_id IS NULL, 'a venda antiga desliga da linha que mudou de conteúdo');
  PERFORM pg_temp.checa((pg_temp.da_linha('l1')).vgv = 777777, 'o conteúdo novo, sem par, vira a venda dele');
  RAISE NOTICE 'OK 6 · deslocamento: desliga e trata como linha nova';
END $$;

-- 7. A proposta adota a venda que chegou antes pela planilha ------------------------
INSERT INTO vx VALUES ('l_antes', pg_temp.linha(40, '2026-09-12', 500000, 25000));
DO $$
DECLARE n int := pg_temp.qtd_vendas();
BEGIN
  PERFORM pg_temp.checa((pg_temp.da_linha('l_antes')).proposta_id IS NULL, 'a planilha chegou primeiro');
  INSERT INTO vx VALUES ('crm_depois', pg_temp.vende(500000, 25000, '2026-09-12 22:30-03'));
  PERFORM pg_temp.checa(pg_temp.qtd_vendas() = n, 'a proposta não cria outra venda (veio ' || pg_temp.qtd_vendas() || ' de ' || n || ')');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_antes')).proposta_id IS NOT NULL, 'a venda da planilha ganha a proposta');
  RAISE NOTICE 'OK 7 · a proposta assinada às 22h adota a venda da planilha';
END $$;

-- 8. Assinada às 22h no CRM, e a planilha anota o dia daqui ----------------------------
INSERT INTO vx VALUES ('crm_noite', pg_temp.vende(610000, 30500, '2026-09-10 23:30-03'));
INSERT INTO vx VALUES ('l_noite', pg_temp.linha(50, '2026-09-10', 610000, 30500));
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.v('crm_noite')).planilha_id IS NOT DISTINCT FROM pg_temp.vid('l_noite'),
    'venda do dia 11 em UTC liga com a linha do dia 10 (veio data_venda ' || (pg_temp.v('crm_noite')).data_venda || ')');
  RAISE NOTICE 'OK 8 · o fuso não faz a mesma venda nascer duas vezes';
END $$;

-- 9. A aba Planilha diz a situação da venda e o "sem par" -------------------------------
DO $$
DECLARE j jsonb; l jsonb;
BEGIN
  j := pg_temp.como((SELECT gerente FROM fx), format(
    'SELECT public.vendas_planilha_conferencia(%L)::text', (SELECT t FROM fx)))::jsonb;
  PERFORM pg_temp.checa(j IS NOT NULL AND j::text NOT LIKE 'ERRO%', 'gerente lê a aba Planilha');
  SELECT x INTO l FROM jsonb_array_elements(j->'linhas') x WHERE x->>'id' = pg_temp.vid('l_parceria')::text;
  PERFORM pg_temp.checa(l->>'venda_id' IS NOT DISTINCT FROM (pg_temp.da_linha('l_parceria')).id::text, 'a linha diz qual venda');
  PERFORM pg_temp.checa(l->>'situacao' IS NOT DISTINCT FROM 'pago', 'situação da venda ligada');
  SELECT x INTO l FROM jsonb_array_elements(j->'linhas') x WHERE x->>'id' = pg_temp.vid('l_amb')::text;
  PERFORM pg_temp.checa((l->>'sem_par')::boolean IS TRUE, 'a ambígua aparece como sem par');
  SELECT x INTO l FROM jsonb_array_elements(j->'linhas') x WHERE x->>'id' = pg_temp.vid('l_zero')::text;
  PERFORM pg_temp.checa((l->>'sem_par')::boolean IS FALSE, 'comissão zero não é "sem par": não é venda');
  PERFORM pg_temp.checa(pg_temp.como((SELECT corretor FROM fx), format(
    'SELECT public.vendas_planilha_conferencia(%L)::text', (SELECT t FROM fx))) LIKE 'ERRO%sem permissao%',
    'corretor continua barrado');
  RAISE NOTICE 'OK 9 · a aba Planilha mostra a venda ligada e o que está sem par';
END $$;

-- 10. A carga inicial é idempotente ------------------------------------------------------
DO $$
DECLARE r text; n int := pg_temp.qtd_vendas();
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format('SELECT public.vendas_ligar_planilha(%L)::text', (SELECT t FROM fx)));
  PERFORM pg_temp.checa(r IS NOT NULL AND r NOT LIKE 'ERRO%', 'admin roda a carga (veio ' || coalesce(r, 'NULL') || ')');
  PERFORM pg_temp.checa(pg_temp.qtd_vendas() = n, 'rodar de novo não cria venda (veio ' || pg_temp.qtd_vendas() || ' de ' || n || ')');
  PERFORM pg_temp.checa(pg_temp.como((SELECT gerente FROM fx), format('SELECT public.vendas_ligar_planilha(%L)::text', (SELECT t FROM fx))) IS NULL,
    'a carga é de quem cuida do dinheiro');
  RAISE NOTICE 'OK 10 · a carga roda de novo sem duplicar';
END $$;

-- 12. Venda que a PLANILHA diz parcelada: a data é da 1ª parcela -----------------------
-- A linha principal de uma venda a prazo traz a data em que entrou a primeira
-- parcela. Marcar a comissão inteira como recebida por ela inflaria o caixa.
WITH nova AS (
  INSERT INTO commercial_sales (tenant_id, empreendimento, valor_vgv, comissao_total_venda,
                                data_assinatura, data_recebimento, cliente_nome, corretor_nome,
                                observacoes, spreadsheet_id, sheet_gid, source_row_number, is_active)
  SELECT t, 'Terceiros', 380000, 19000, '2026-03-03', '2026-03-20', 'Cliente Prazo', 'Cora Corretora',
         'PARCELADO 1 de 4', 'planilha-teste', '0', 60, true FROM fx
  RETURNING id)
INSERT INTO vx SELECT 'l_prazo', id FROM nova;
DO $$
DECLARE j jsonb; l jsonb;
BEGIN
  PERFORM pg_temp.checa((pg_temp.da_linha('l_prazo')).id IS NOT NULL, 'a venda a prazo vira venda');
  PERFORM pg_temp.checa((pg_temp.da_linha('l_prazo')).recebido_em IS NULL,
    'mas não nasce recebida pela data da 1ª parcela (veio ' || coalesce((pg_temp.da_linha('l_prazo')).recebido_em::text, 'NULL') || ')');
  j := pg_temp.como((SELECT admin FROM fx), format('SELECT public.vendas_planilha_conferencia(%L)::text', (SELECT t FROM fx)))::jsonb;
  SELECT x INTO l FROM jsonb_array_elements(j->'linhas') x WHERE x->>'id' = pg_temp.vid('l_prazo')::text;
  PERFORM pg_temp.checa(l->>'situacao' IS NOT DISTINCT FROM 'parcelado',
    'e a aba Planilha segue dizendo parcelado (veio ' || coalesce(l->>'situacao', 'NULL') || ')');
  RAISE NOTICE 'OK 12 · a prazo na planilha: a venda fica a receber até alguém parcelar na Dash';
END $$;

-- 13. A prazo com TODAS as parcelas recebidas conta como recebida -----------------
-- O caso real da Lotus (30/01, R$ 66.250): a linha principal e as parcelas
-- abaixo dela, todas com data. Como a carga roda: as linhas já estão todas lá.
SET LOCAL session_replication_role = replica;
INSERT INTO commercial_sales (tenant_id, empreendimento, valor_vgv, comissao_total_venda, data_assinatura,
                              data_recebimento, cliente_nome, corretor_nome, repasse_40, is_active, source_row_number)
SELECT t, 'Terceiros', 0, 66250, '2026-01-30'::date, '2026-02-09'::date, 'Cliente Quitou', 'Cora', 21875, true, 70 FROM fx
UNION ALL SELECT t, 'Terceiros', 0, 0, '2026-01-30', '2026-03-06', 'Cliente Quitou', 'Cora', 1250, true, 71 FROM fx
UNION ALL SELECT t, 'Terceiros', 0, 0, '2026-01-30', '2026-07-31', 'Cliente Quitou', 'Cora', 1250, true, 72 FROM fx
-- e uma a prazo com uma parcela ainda sem data
UNION ALL SELECT t, 'Terceiros', 0, 50000, '2026-02-02', '2026-02-10', 'Cliente Devendo', 'Cora', 20000, true, 73 FROM fx
UNION ALL SELECT t, 'Terceiros', 0, 0, '2026-02-02', '2026-03-10', 'Cliente Devendo', 'Cora', 1000, true, 74 FROM fx
UNION ALL SELECT t, 'Terceiros', 0, 0, '2026-02-02', NULL, 'Cliente Devendo', 'Cora', 1000, true, 75 FROM fx;
SET LOCAL session_replication_role = origin;
DO $$
DECLARE r text; vq vendas; vd vendas;
BEGIN
  r := pg_temp.como((SELECT admin FROM fx), format('SELECT public.vendas_ligar_planilha(%L)::text', (SELECT t FROM fx)));
  SELECT * INTO vq FROM vendas WHERE tenant_id = (SELECT t FROM fx) AND cliente = 'Cliente Quitou';
  SELECT * INTO vd FROM vendas WHERE tenant_id = (SELECT t FROM fx) AND cliente = 'Cliente Devendo';
  PERFORM pg_temp.checa(vq.recebido_em IS NOT DISTINCT FROM '2026-07-31'::date,
    'a prazo com todas as parcelas pagas: recebida na data da última (veio ' || coalesce(vq.recebido_em::text, 'NULL') || ')');
  PERFORM pg_temp.checa(vd.id IS NOT NULL AND vd.recebido_em IS NULL,
    'a prazo com parcela sem data: fica a receber (veio ' || coalesce(vd.recebido_em::text, 'NULL') || ')');
  RAISE NOTICE 'OK 13 · a prazo quitada conta como recebida; com parcela em aberto, não';
END $$;

ROLLBACK;

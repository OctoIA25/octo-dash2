-- ============================================================
-- Funil da Visão Geral: "Proposta" junta três etapas, e a Venda vem da
-- Conferência (20261022_funil_proposta_junta_e_venda.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/funil_proposta_junta_e_venda.test.sql
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

CREATE FUNCTION pg_temp.como(p_role text, p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', p_role, 'email', 'x@teste-funil-venda.dev')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7f2a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7f2a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7f2b0000-0000-4000-a000-000000000001'::uuid AS corretor,
  '7f2b0000-0000-4000-a000-000000000002'::uuid AS de_fora,
  '7f2b0000-0000-4000-a000-000000000003'::uuid AS gerente,
  ARRAY['Proposta Enviada','Proposta Criada','Proposta Assinada'] AS proposta;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-funil-venda', 'Teste Funil Venda' FROM fx
UNION ALL SELECT t2, 'teste-funil-venda-viz', 'Vizinha Funil Venda' FROM fx
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email) SELECT corretor, 'corretor@teste-funil-venda.dev' FROM fx
UNION ALL SELECT de_fora, 'fora@teste-funil-venda.dev' FROM fx
UNION ALL SELECT gerente, 'gerente@teste-funil-venda.dev' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT t, corretor, 'corretor' FROM fx UNION ALL SELECT t2, de_fora, 'admin' FROM fx
UNION ALL SELECT t, gerente, 'team_leader' FROM fx;

SET LOCAL session_replication_role = replica;

-- A passou por Enviada E Assinada; B só por Assinada; C parou em Negociação;
-- V é da vizinha. Somando por etapa, "Proposta" daria 3 (2 + 1); são 2 leads.
INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, metadata, created_at)
SELECT CASE WHEN v.lead = 'V' THEN fx.t2 ELSE fx.t END, 'lead-' || v.lead, 'leads', 'lead.stage_changed',
       v.para, 'usuario', '{}'::jsonb, v.quando
  FROM fx, (VALUES
    ('A', 'Proposta Enviada',  '2026-09-12 10:00-03'::timestamptz),
    ('A', 'Proposta Assinada', '2026-09-20 10:00-03'),
    ('B', 'Proposta Assinada', '2026-09-25 10:00-03'),
    ('C', 'Negociação',        '2026-09-25 10:00-03'),
    ('V', 'Proposta Enviada',  '2026-09-25 10:00-03')
  ) AS v(lead, para, quando);

-- Agosto, setembro (2: um lançamento, um pronto), outubro, e uma da vizinha.
-- 30/09 e 01/10 testam a borda do período — que é DATA, sem fuso. Só a de
-- 01/09 é do corretor.
INSERT INTO public.vendas (tenant_id, data_venda, tipo, empreendimento, corretor_id)
SELECT CASE WHEN v.viz THEN fx.t2 ELSE fx.t END, v.dia, v.tipo, 'Teste',
       CASE WHEN v.dele THEN fx.corretor END
  FROM fx, (VALUES
    ('2026-08-31'::date, 'lancamento', false, false),
    ('2026-09-01'::date, 'lancamento', false, true),
    ('2026-09-30'::date, 'terceiros',  false, false),
    ('2026-10-01'::date, 'lancamento', false, false),
    ('2026-09-15'::date, 'lancamento', true,  false)
  ) AS v(dia, tipo, viz, dele);

SET LOCAL session_replication_role = origin;

-- 1. "Proposta" conta o lead UMA vez ------------------------------------------
DO $$
DECLARE f record; n bigint; soma bigint;
BEGIN
  SELECT * INTO f FROM fx;
  n := public.funil_passaram_por_alguma(f.t, f.proposta);
  SELECT sum(passaram) INTO soma FROM public.funil_passaram_por_etapa(f.t) WHERE etapa = ANY (f.proposta);
  PERFORM pg_temp.checa(soma = 3, 'premissa: somando por etapa dá 3 (veio ' || coalesce(soma::text, 'nada') || ')');
  PERFORM pg_temp.checa(n = 2, 'A e B passaram pela Proposta: 2, não 3 (veio ' || n || ')');
  n := public.funil_passaram_por_alguma(f.t, f.proposta, '2026-09-21 00:00-03', NULL);
  PERFORM pg_temp.checa(n = 1, 'a partir de 21/09 só o B (veio ' || n || ')');
  RAISE NOTICE 'OK 1 · a Proposta junta três etapas sem contar lead duas vezes';
END $$;

-- 2. Venda: pela data da venda, na casa, por atuação --------------------------
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM fx;
  PERFORM pg_temp.checa(public.funil_vendas_no_periodo(f.t, '2026-09-01', '2026-09-30') = 2,
    'setembro: 01/09 e 30/09 — fora 31/08, 01/10 e a da vizinha');
  PERFORM pg_temp.checa(public.funil_vendas_no_periodo(f.t, '2026-09-01', '2026-09-30', 'lancamento') = 1,
    'setembro, só lançamento: 1');
  PERFORM pg_temp.checa(public.funil_vendas_no_periodo(f.t, '2026-09-01', '2026-09-30', 'pronto') = 1,
    'setembro, só pronto: 1 — o pronto da venda se chama terceiros');
  PERFORM pg_temp.checa(public.funil_vendas_no_periodo(f.t) = 4, 'sem período: as 4 da casa');
  PERFORM pg_temp.checa(public.funil_vendas_no_periodo(f.t, '2025-01-01', '2025-01-31') = 0, 'mês sem venda: 0');
  RAISE NOTICE 'OK 2 · a Venda é a da Conferência, cada uma pela própria data';
END $$;

-- 3. Quem lê -----------------------------------------------------------------
DO $$
DECLARE f record; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como('authenticated', f.gerente,
    format('SELECT public.funil_vendas_no_periodo(%L, %L, %L)', f.t, '2026-09-01', '2026-09-30'));
  PERFORM pg_temp.checa(v = '2', 'o gerente lê as da casa: 2 em setembro (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('authenticated', f.corretor,
    format('SELECT public.funil_vendas_no_periodo(%L, %L, %L)', f.t, '2026-09-01', '2026-09-30'));
  PERFORM pg_temp.checa(v = '1', 'o corretor conta só a DELE, como os leads do funil (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('authenticated', f.corretor, format('SELECT public.funil_vendas_no_periodo(%L)', f.t));
  PERFORM pg_temp.checa(v = '1', 'sem período, o corretor segue vendo só a dele (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('authenticated', f.de_fora,
    format('SELECT public.funil_vendas_no_periodo(%L)', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin de outra casa NÃO lê (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('authenticated', f.de_fora,
    format('SELECT public.funil_passaram_por_alguma(%L, %L::text[])', f.t, f.proposta));
  PERFORM pg_temp.checa(v = '0', 'admin de outra casa conta zero na Proposta (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('anon', NULL, format('SELECT public.funil_vendas_no_periodo(%L)', f.t));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'anônimo é barrado (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como('anon', NULL, format('SELECT public.funil_passaram_por_alguma(%L, %L::text[])', f.t, f.proposta));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'anônimo é barrado na Proposta (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 3 · a casa lê o número, o corretor só o dele; vizinho e anônimo não';
END $$;

ROLLBACK;

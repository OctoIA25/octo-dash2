-- ============================================================
-- A.5 · Funil de safra (20261008_funil_de_safra.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/funil_de_safra.test.sql
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

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7f1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7f1a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7f1b0000-0000-4000-a000-000000000001'::uuid AS membro,
  '7f1b0000-0000-4000-a000-000000000002'::uuid AS de_fora,
  ARRAY['Novos Leads','Interação','Visita Agendada','Visita Realizada','Negociação','Proposta Enviada','Proposta Assinada'] AS etapas;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-safra', 'Teste Safra' FROM fx
UNION ALL SELECT t2, 'teste-safra-viz', 'Vizinha Safra' FROM fx
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) SELECT membro, 'membro@teste-safra.dev' FROM fx
UNION ALL SELECT de_fora, 'fora@teste-safra.dev' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT t, membro, 'corretor' FROM fx UNION ALL SELECT t2, de_fora, 'admin' FROM fx;

-- Os leads entram com os gatilhos de usuário desligados: a tabela tem mais de
-- vinte (classificação, bolsão, registro de evento), e o cenário precisa ser exato.
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE lx (nome text PRIMARY KEY, id uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO lx (nome) VALUES ('L1'),('L2'),('L3'),('L4'),('L5'),('L6'),('L7'),('L8'),('L9');

INSERT INTO public.leads (id, tenant_id, name, status, classification, created_at)
SELECT lx.id, CASE WHEN lx.nome = 'L7' THEN fx.t2 ELSE fx.t END, lx.nome, v.status, v.classif, v.criado
  FROM fx, lx JOIN (VALUES
    ('L1', 'Visita Agendada',   ARRAY['lancamento'], '2026-10-05 10:00-03'::timestamptz),
    ('L2', 'Proposta Assinada', ARRAY['lancamento'], '2026-10-10 10:00-03'),
    ('L3', 'Interação',         ARRAY['pronto'],     '2026-10-12 10:00-03'),
    ('L4', 'Arquivado',         ARRAY['pronto'],     '2026-10-15 10:00-03'),
    ('L5', 'Negociação',        ARRAY['lancamento'], '2026-09-28 10:00-03'),
    ('L6', 'Novos Leads',       ARRAY['lancamento'], '2026-10-31 23:30-03'),
    ('L7', 'Novos Leads',       ARRAY['lancamento'], '2026-10-05 10:00-03'),
    ('L8', 'Proposta Assinada', ARRAY['lancamento'], '2026-10-20 10:00-03'),
    ('L9', 'Proposta Assinada', ARRAY['lancamento'], '2026-10-02 10:00-03')
  ) AS v(nome, status, classif, criado) ON v.nome = lx.nome;

-- L2 fecha pelo evento (10 dias); L3 fecha por proposta assinada ligada ao lead
-- (4 dias), com o card parado em Interação; L8 está em Proposta Assinada sem data;
-- L9 fecha 40 dias depois, já em novembro — com três durações, média (18) e mediana (10) divergem.
INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, metadata, created_at)
SELECT fx.t, lx.id, 'leads', 'lead.stage_changed', 'Proposta Assinada', 'usuario', '{}'::jsonb, '2026-10-20 10:00-03'::timestamptz
  FROM fx, lx WHERE lx.nome = 'L2'
UNION ALL
SELECT fx.t, lx.id, 'leads', 'lead.stage_changed', 'Proposta Assinada', 'usuario', '{}'::jsonb, '2026-11-11 10:00-03'::timestamptz
  FROM fx, lx WHERE lx.nome = 'L9';
INSERT INTO public.proposals (tenant_id, lead_id, stage_id, value, signed_at)
SELECT fx.t, lx.id, 'proposta-assinada', 300000, '2026-10-16 10:00-03'
  FROM fx, lx WHERE lx.nome = 'L3';
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.safra(p_atuacao text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.funil_de_safra(fx.t, '2026-10-01', '2026-10-31', fx.etapas, p_atuacao) FROM fx;
$$;

-- 1. Só quem entrou no período, no dia de São Paulo ------------------------
DO $$
DECLARE s jsonb := pg_temp.safra();
BEGIN
  PERFORM pg_temp.checa((s->>'entraram')::int = 7,
    'outubro tem 7 (L1 L2 L3 L4 L6 L8 L9): fora o de setembro e o da vizinha (veio ' || (s->>'entraram') || ')');
  RAISE NOTICE 'OK 1 · a safra é quem entrou no período — 31/10 às 23h30 ainda é outubro';
END $$;

-- 2. Os três números ------------------------------------------------------
DO $$
DECLARE s jsonb := pg_temp.safra();
BEGIN
  PERFORM pg_temp.checa((s->>'fecharam')::int = 4, 'fecharam 4: L2 e L9 (evento), L3 (proposta), L8 (etapa) (veio ' || (s->>'fecharam') || ')');
  PERFORM pg_temp.checa((s->>'fecharam_com_data')::int = 3, 'L2, L3 e L9 têm data de fechamento; L8 não');
  PERFORM pg_temp.checa((s->>'mediana_dias')::numeric = 10.0, 'mediana de 4, 10 e 40 dias = 10 (a média seria 18) (veio ' || coalesce(s->>'mediana_dias', 'nada') || ')');
  PERFORM pg_temp.checa((s->>'viva')::int = 2, 'safra viva: L1 e L6 — não fecharam e não foram arquivados (veio ' || (s->>'viva') || ')');
  PERFORM pg_temp.checa((s->>'arquivados')::int = 1, 'L4 arquivado não conta como viva');
  RAISE NOTICE 'OK 2 · %% que fechou, mediana de dias e safra viva';
END $$;

-- 3. Por etapa: nunca acima do total, e quem fechou passou por todas ---------
DO $$
DECLARE s jsonb := pg_temp.safra(); e jsonb := s->'por_etapa';
BEGIN
  PERFORM pg_temp.checa(e = '[7, 5, 5, 4, 4, 4, 4]'::jsonb, 'contagem por etapa (veio ' || e::text || ')');
  PERFORM pg_temp.checa((SELECT bool_and(x::int <= (s->>'entraram')::int) FROM jsonb_array_elements_text(e) x),
    'nenhuma etapa passa do total que entrou');
  PERFORM pg_temp.checa((e->>6)::int = (s->>'fecharam')::int, 'a última etapa bate com quem fechou');
  PERFORM pg_temp.checa((e->>0)::int = (s->>'entraram')::int, 'a primeira etapa é o total que entrou — inclusive o arquivado');
  RAISE NOTICE 'OK 3 · a soma da safra nunca é maior que o total que entrou';
END $$;

-- 4. Lançamento e Pronto trazem medianas diferentes --------------------------
DO $$
DECLARE l jsonb := pg_temp.safra('lancamento'); p jsonb := pg_temp.safra('pronto');
BEGIN
  PERFORM pg_temp.checa((l->>'entraram')::int = 5 AND (p->>'entraram')::int = 2, 'lançamento 5, pronto 2');
  PERFORM pg_temp.checa((l->>'mediana_dias')::numeric = 25.0 AND (p->>'mediana_dias')::numeric = 4.0,
    'medianas por atuação: lançamento 25 (10 e 40), pronto 4 (veio ' || coalesce(l->>'mediana_dias','nada') || ' e ' || coalesce(p->>'mediana_dias','nada') || ')');
  RAISE NOTICE 'OK 4 · o recorte por atuação separa as duas verdades';
END $$;

-- 5. Sem amostra é nulo, não zero; e quem é de fora não lê -------------------
DO $$
DECLARE f record; v text; s jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  s := public.funil_de_safra(f.t, '2025-01-01', '2025-01-31', f.etapas, NULL);
  PERFORM pg_temp.checa((s->>'entraram')::int = 0 AND s->'mediana_dias' = 'null'::jsonb,
    'mês sem lead: 0 entraram e mediana NULA — a tela escreve "Sem dados", nunca zero');
  v := pg_temp.como(f.membro, 'membro@teste-safra.dev',
    format('SELECT (public.funil_de_safra(%L, %L, %L, %L::text[], NULL)->>''entraram'')', f.t, '2026-10-01', '2026-10-31', f.etapas));
  PERFORM pg_temp.checa(v = '7', 'quem é da casa lê a safra (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.de_fora, 'fora@teste-safra.dev',
    format('SELECT (public.funil_de_safra(%L, %L, %L, %L::text[], NULL)->>''entraram'')', f.t, '2026-10-01', '2026-10-31', f.etapas));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin de outra casa NÃO lê (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.membro, 'membro@teste-safra.dev',
    format('SELECT (public.funil_de_safra(%L, %L, %L, %L::text[], NULL)->>''entraram'')', f.t, '2026-10-31', '2026-10-01', f.etapas));
  PERFORM pg_temp.checa(v = 'periodo_invalido', 'período invertido é recusado (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 5 · sem dados é nulo, e a safra é só de quem é da casa';
END $$;

ROLLBACK;

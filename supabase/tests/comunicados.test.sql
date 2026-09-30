-- ============================================================
-- Comunicados e alertas (20261001_comunicados.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/comunicados.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant: não depende do dump.
-- Sucesso = NOTICE final. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Pessoas (7c0b…): a casa T tem diretoria, dois gerentes, quatro corretores e o
-- owner da plataforma como membro — ele NUNCA recebe nada da casa.
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c0a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c0a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7c0b0000-0000-4000-a000-000000000001'::uuid AS diretora,
  '7c0b0000-0000-4000-a000-000000000002'::uuid AS gerente_a,
  '7c0b0000-0000-4000-a000-000000000003'::uuid AS gerente_b,
  '7c0b0000-0000-4000-a000-000000000004'::uuid AS cor_a1,
  '7c0b0000-0000-4000-a000-000000000005'::uuid AS cor_a2,
  '7c0b0000-0000-4000-a000-000000000006'::uuid AS cor_b1,
  '7c0b0000-0000-4000-a000-000000000007'::uuid AS cor_sem,
  '7c0b0000-0000-4000-a000-000000000008'::uuid AS dono,
  '7c0b0000-0000-4000-a000-000000000009'::uuid AS vizinho,
  '7c0b0000-0000-4000-a000-000000000010'::uuid AS ex_gerente,
  '7c0c0000-0000-4000-a000-000000000001'::uuid AS equipe_a,
  '7c0c0000-0000-4000-a000-000000000002'::uuid AS equipe_b,
  '7c0c0000-0000-4000-a000-000000000003'::uuid AS equipe_vazia,
  '7c0c0000-0000-4000-a000-000000000009'::uuid AS equipe_vizinha,
  '7c0d0000-0000-4000-a000-000000000001'::uuid AS lead_t,
  '7c0d0000-0000-4000-a000-000000000002'::uuid AS lead_t2,
  '7c0e0000-0000-4000-a000-000000000001'::uuid AS cargo_diretoria;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-comunicados', 'Teste Comunicados' FROM fx
UNION ALL SELECT t2, 'teste-comunicados-2', 'Vizinha Comunicados' FROM fx
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.diretora,   'diretora@teste-comunicados.dev',   '{"name":"Ana Diretora"}'::jsonb),
  (fx.gerente_a,  'gerente-a@teste-comunicados.dev',  '{"name":"Gil Gerente"}'::jsonb),
  (fx.gerente_b,  'gerente-b@teste-comunicados.dev',  '{"name":"Bia Gerente"}'::jsonb),
  (fx.cor_a1,     'joao-a1@teste-comunicados.dev',    '{"name":"João A1"}'::jsonb),
  (fx.cor_a2,     'rui-a2@teste-comunicados.dev',     '{"name":"Rui A2"}'::jsonb),
  (fx.cor_b1,     'teo-b1@teste-comunicados.dev',     '{"name":"Téo B1"}'::jsonb),
  (fx.cor_sem,    'sol@teste-comunicados.dev',        '{"name":"Sol Sem Equipe"}'::jsonb),
  (fx.dono,       'dono@teste-comunicados.dev',       NULL),
  (fx.vizinho,    'vizinho@teste-comunicados.dev',    '{"name":"Vic Vizinho"}'::jsonb),
  (fx.ex_gerente, 'ex@teste-comunicados.dev',         '{"name":"Ex Gerente"}'::jsonb)
) AS v(id, email, meta)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_owners (email) VALUES ('dono@teste-comunicados.dev') ON CONFLICT DO NOTHING;

INSERT INTO public.cargos (id, tenant_id, nome, role, nivel_acesso)
SELECT cargo_diretoria, t, 'Diretoria Comercial', 'admin', 100 FROM fx;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_a, t, 'Equipe A', gerente_a, ARRAY[gerente_a] FROM fx
UNION ALL SELECT equipe_b, t, 'Equipe B', gerente_b, ARRAY[gerente_b, ex_gerente] FROM fx
UNION ALL SELECT equipe_vazia, t, 'Equipe Vazia', NULL, '{}'::uuid[] FROM fx
UNION ALL SELECT equipe_vizinha, t2, 'Equipe Vizinha', NULL, '{}'::uuid[] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id, cargo_id)
SELECT t, diretora,  'admin',       NULL::uuid, NULL::uuid, cargo_diretoria FROM fx
UNION ALL SELECT t, gerente_a, 'team_leader', equipe_a, NULL,      NULL FROM fx
UNION ALL SELECT t, gerente_b, 'team_leader', equipe_b, NULL,      NULL FROM fx
UNION ALL SELECT t, cor_a1,    'corretor',    equipe_a, gerente_a, NULL FROM fx
UNION ALL SELECT t, cor_a2,    'corretor',    equipe_a, NULL,      NULL FROM fx
UNION ALL SELECT t, cor_b1,    'corretor',    equipe_b, gerente_b, NULL FROM fx
UNION ALL SELECT t, cor_sem,   'corretor',    NULL,     NULL,      NULL FROM fx
UNION ALL SELECT t, dono,      'admin',       NULL,     NULL,      NULL FROM fx
UNION ALL SELECT t2, vizinho,  'admin',       NULL,     NULL,      NULL FROM fx
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO public.leads (id, tenant_id, name)
SELECT lead_t, t, 'Maria Lead' FROM fx
UNION ALL SELECT lead_t2, t2, 'Lead da Vizinha' FROM fx
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.resp(p_user uuid) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(r ORDER BY r), '{}') FROM public.responsaveis_pelo_membro((SELECT t FROM fx), p_user) r
$$;

-- ----------------------------------------------------------
-- 1. Quem responde por cada um
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v_erro text;
BEGIN
  SELECT * INTO f FROM fx;

  PERFORM pg_temp.checa(pg_temp.resp(f.cor_a1) = ARRAY[f.gerente_a],
    'corretor com leader_user_id responde ao gerente dele');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_a2) = ARRAY[f.gerente_a],
    'corretor sem leader_user_id responde ao gestor da equipe (teams.leader_user_ids)');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_b1) = ARRAY[f.gerente_b],
    'gestor que já saiu da casa (ex_gerente) não conta');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_sem) = ARRAY[f.diretora],
    'sem gestor, responde a Diretoria — e o owner da plataforma (admin na casa) fica de fora');
  PERFORM pg_temp.checa(pg_temp.resp(f.gerente_a) = ARRAY[f.diretora],
    'o gerente não responde a si mesmo: cai na Diretoria');

  PERFORM pg_temp.checa(public.nome_de_exibicao(f.cor_a1) = 'João A1', 'nome vem do cadastro');
  PERFORM pg_temp.checa(public.nome_de_exibicao(f.dono) = 'dono@teste-comunicados.dev', 'sem nome, e-mail');

  -- Internas: ninguém de fora executa.
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', f.diretora, 'role', 'authenticated', 'email', 'diretora@teste-comunicados.dev')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.responsaveis_pelo_membro(f.t, f.cor_a1);
    v_erro := NULL;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'negado';
  END;
  BEGIN
    PERFORM count(*) FROM public.comunicados;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := v_erro || '+tabela';
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v_erro = 'negado+tabela',
    'authenticated não executa responsaveis_pelo_membro nem lê comunicados direto (veio: ' || coalesce(v_erro, 'nada') || ')');

  RAISE NOTICE 'OK 1: responsáveis, nome e fechamento';
END $$;

ROLLBACK;

-- ============================================================
-- O aviso das Demandas mora no banco: responsável novo e passagem para
-- "aprovado". Ninguém é avisado da própria ação. Os casos são os que
-- src/features/marketing/demandas.test.ts cobria até 30/09.
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/demandas_avisam_por_gatilho.test.sql
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c2a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c2b0000-0000-4000-a000-000000000001'::uuid AS gestor,
  '7c2b0000-0000-4000-a000-000000000002'::uuid AS bruno,
  '7c2b0000-0000-4000-a000-000000000003'::uuid AS ana;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-demandas-aviso', 'Teste Demandas Aviso' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email)
SELECT gestor, 'gestor@teste-demandas.dev' FROM fx
UNION ALL SELECT bruno, 'bruno@teste-demandas.dev' FROM fx
UNION ALL SELECT ana, 'ana@teste-demandas.dev' FROM fx
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT t, gestor, 'admin' FROM fx
UNION ALL SELECT t, bruno, 'corretor' FROM fx
UNION ALL SELECT t, ana, 'corretor' FROM fx
ON CONFLICT (tenant_id, user_id) DO NOTHING;

CREATE FUNCTION pg_temp.como(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
END $$;
CREATE FUNCTION pg_temp.avisos(p_demanda uuid, p_user uuid, p_titulo text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications
   WHERE link_type = 'mkt_demanda' AND link_id = p_demanda::text AND user_id = p_user AND title = p_titulo
$$;

DO $$
DECLARE f fx%ROWTYPE; d uuid; d2 uuid;
BEGIN
  SELECT * INTO f FROM fx;
  INSERT INTO public.mkt_demandas (tenant_id, titulo, prazo, solicitante_id)
  VALUES (f.t, 'Post do Gioviale', current_date + 7, f.ana) RETURNING id INTO d;

  -- O gestor atribui ao Bruno: Bruno é avisado, com o título da demanda.
  PERFORM pg_temp.como(f.gestor);
  UPDATE public.mkt_demandas SET responsavel_id = f.bruno, status = 'briefing' WHERE id = d;
  PERFORM pg_temp.checa(pg_temp.avisos(d, f.bruno, 'Nova demanda para você') = 1, 'avisa quem recebeu a demanda');
  PERFORM pg_temp.checa((SELECT body FROM public.notifications WHERE link_id = d::text AND user_id = f.bruno)
    = '"Post do Gioviale" foi atribuída a você.', 'corpo com o título');

  -- Responsável que não mudou não é avisado de novo.
  UPDATE public.mkt_demandas SET status = 'producao', responsavel_id = f.bruno WHERE id = d;
  PERFORM pg_temp.checa(pg_temp.avisos(d, f.bruno, 'Nova demanda para você') = 1, 'responsável igual não é avisado de novo');

  -- A passagem PARA aprovado avisa quem pediu.
  UPDATE public.mkt_demandas SET status = 'aprovado' WHERE id = d;
  PERFORM pg_temp.checa(pg_temp.avisos(d, f.ana, 'Sua demanda foi aprovada') = 1, 'avisa quem pediu quando é aprovada');

  -- aprovado → aprovado não é aprovação nova.
  UPDATE public.mkt_demandas SET status = 'aprovado' WHERE id = d;
  PERFORM pg_temp.checa(pg_temp.avisos(d, f.ana, 'Sua demanda foi aprovada') = 1, 'só a passagem PARA aprovado conta');

  -- Quem se atribui não é avisado; quem aprova a própria demanda também não.
  INSERT INTO public.mkt_demandas (tenant_id, titulo, prazo, solicitante_id)
  VALUES (f.t, 'Reels', current_date + 7, f.bruno) RETURNING id INTO d2;
  PERFORM pg_temp.como(f.bruno);
  UPDATE public.mkt_demandas SET responsavel_id = f.bruno WHERE id = d2;
  UPDATE public.mkt_demandas SET status = 'aprovado' WHERE id = d2;
  PERFORM pg_temp.checa((SELECT count(*) FROM public.notifications WHERE link_id = d2::text) = 0,
    'ninguém é avisado da própria ação');

  RAISE NOTICE 'OK — demandas_avisam_por_gatilho: todos os casos passaram';
END $$;

ROLLBACK;

-- ============================================================
-- A.1 · Super Meta (20261007_super_meta.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/super_meta.test.sql
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

-- Devolve a mensagem de erro do comando, ou NULL se ele passou.
CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7e1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7e1b0000-0000-4000-a000-000000000001'::uuid AS sem_super,
  '7e1b0000-0000-4000-a000-000000000002'::uuid AS com_super,
  '7e1b0000-0000-4000-a000-000000000003'::uuid AS ja_nasce_batida;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-super-meta', 'Teste Super Meta' FROM fx ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.g(p uuid) RETURNS public.goals LANGUAGE sql AS $$
  SELECT * FROM public.goals WHERE id = p;
$$;
CREATE FUNCTION pg_temp.eventos(p uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.goal_history WHERE goal_id = p AND change_type = 'super_meta_batida';
$$;

INSERT INTO public.goals (id, tenant_id, name, category_id, model, start_date, end_date, unit, target_value, current_value, valor_super)
SELECT sem_super, t, 'VGC Q4 sem super', 'vgc', 'simple', '2026-10-01'::date, '2026-12-31'::date, 'currency', 45000, 50000, NULL::numeric FROM fx
UNION ALL SELECT com_super, t, 'VGC Q4 com super', 'vgc', 'simple', '2026-10-01', '2026-12-31', 'currency', 45000, 27000, 60000 FROM fx;

-- 1. Meta sem super meta é a de hoje -------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.g((SELECT sem_super FROM fx))).super_batida_em IS NULL
    AND pg_temp.eventos((SELECT sem_super FROM fx)) = 0,
    'meta sem super meta, mesmo passando de 100%, não gera evento nenhum');
  RAISE NOTICE 'OK 1 · meta sem super meta se comporta como hoje';
END $$;

-- 2. A trava: maior que o alvo, e só no modelo simples ---------------------
DO $$
DECLARE f record; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.erro(format('UPDATE public.goals SET valor_super = 45000 WHERE id = %L', f.com_super));
  PERFORM pg_temp.checa(v LIKE '%goals_valor_super_check%', 'super meta igual ao alvo é recusada (veio ' || coalesce(v, 'passou') || ')');
  v := pg_temp.erro(format('UPDATE public.goals SET valor_super = 30000 WHERE id = %L', f.com_super));
  PERFORM pg_temp.checa(v LIKE '%goals_valor_super_check%', 'super meta menor que o alvo é recusada (veio ' || coalesce(v, 'passou') || ')');
  v := pg_temp.erro(format(
    $q$INSERT INTO public.goals (tenant_id, name, category_id, model, start_date, end_date, target_value, valor_super, config)
       VALUES (%L, 'escalonada', 'vgc', 'scaled', '2026-10-01', '2026-12-31', 100, 200, '{"kind":"scaled","levels":[]}')$q$, f.t));
  PERFORM pg_temp.checa(v LIKE '%goals_valor_super_check%', 'escalonada não aceita super meta (veio ' || coalesce(v, 'passou') || ')');
  RAISE NOTICE 'OK 2 · super meta só acima do alvo, e só na meta simples';
END $$;

-- 3. Cruzar a meta não é cruzar a super; cruzar a super grava UMA vez -------
UPDATE public.goals SET current_value = 50000 WHERE id = (SELECT com_super FROM fx);
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.g((SELECT com_super FROM fx))).super_batida_em IS NULL
    AND pg_temp.eventos((SELECT com_super FROM fx)) = 0,
    'meta batida (50 mil de 45 mil) ainda não é super meta batida');
END $$;

UPDATE public.goals SET current_value = 61000 WHERE id = (SELECT com_super FROM fx);
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.g((SELECT com_super FROM fx))).super_batida_em IS NOT NULL,
    'ao cruzar 60 mil, a meta fica marcada como super batida');
  PERFORM pg_temp.checa(pg_temp.eventos((SELECT com_super FROM fx)) = 1,
    'o evento super_meta_batida aparece no extrato (veio ' || pg_temp.eventos((SELECT com_super FROM fx)) || ')');
  RAISE NOTICE 'OK 3 · o evento nasce quando o realizado cruza a super meta';
END $$;

-- 4. Nunca duas vezes ----------------------------------------------------
CREATE TEMP TABLE marca ON COMMIT DROP AS
  SELECT super_batida_em AS em FROM public.goals WHERE id = (SELECT com_super FROM fx);
UPDATE public.goals SET current_value = 40000 WHERE id = (SELECT com_super FROM fx);
UPDATE public.goals SET current_value = 70000 WHERE id = (SELECT com_super FROM fx);
UPDATE public.goals SET super_batida_em = NULL WHERE id = (SELECT com_super FROM fx);
UPDATE public.goals SET current_value = 80000 WHERE id = (SELECT com_super FROM fx);
DO $$ BEGIN
  PERFORM pg_temp.checa(pg_temp.eventos((SELECT com_super FROM fx)) = 1,
    'cair, subir de novo e tentar zerar a marca não gera segundo evento (veio ' || pg_temp.eventos((SELECT com_super FROM fx)) || ')');
  PERFORM pg_temp.checa((pg_temp.g((SELECT com_super FROM fx))).super_batida_em = (SELECT em FROM marca),
    'a data em que a super meta foi batida não muda');
  RAISE NOTICE 'OK 4 · uma vez por meta, nunca duas';
END $$;

-- 5. Quem vem de fora não escreve a marca --------------------------------
INSERT INTO public.goals (id, tenant_id, name, category_id, model, start_date, end_date, target_value, current_value, valor_super, super_batida_em)
SELECT ja_nasce_batida, t, 'nasce batida', 'vgc', 'simple', '2026-10-01', '2026-12-31', 100, 250, 200, '2020-01-01' FROM fx;
DO $$ BEGIN
  PERFORM pg_temp.checa((pg_temp.g((SELECT ja_nasce_batida FROM fx))).super_batida_em > '2026-01-01',
    'a data mandada de fora (2020) é ignorada: vale a do banco');
  PERFORM pg_temp.checa(pg_temp.eventos((SELECT ja_nasce_batida FROM fx)) = 1,
    'meta que já nasce acima da super meta ganha o evento no nascimento');
  UPDATE public.goals SET super_batida_em = '2020-01-01' WHERE id = (SELECT sem_super FROM fx);
  PERFORM pg_temp.checa((pg_temp.g((SELECT sem_super FROM fx))).super_batida_em IS NULL,
    'meta sem super meta não aceita marca de super batida mandada de fora');
  RAISE NOTICE 'OK 5 · a marca é do banco';
END $$;

ROLLBACK;

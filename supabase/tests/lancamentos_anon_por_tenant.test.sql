-- Testes de 20260918_lancamentos_anon_por_tenant.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lancamentos_anon_por_tenant.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.
--
-- A regra da chave pública lia TODOS os lançamentos da plataforma. Hoje não
-- vazava porque só uma imobiliária tem lançamento; o teste prova que uma
-- segunda não nasce pública.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- A imobiliária do portal é a que a policy nomeia. Ler do catálogo, e não
-- repetir o uuid, faz o teste acompanhar a policy se ela mudar de tenant.
CREATE FUNCTION pg_temp.tenant_do_portal() RETURNS uuid LANGUAGE sql AS $$
  SELECT (regexp_match(pg_get_expr(polqual, polrelid),
                       '([0-9a-f-]{36})'))[1]::uuid
    FROM pg_policy
   WHERE polname = 'portal_anon_select_lancamentos';
$$;

SELECT pg_temp.checa(
  pg_temp.tenant_do_portal() IS NOT NULL,
  'a policy nomeia uma imobiliaria (nao e mais USING true)');

-- ----------------------------------------------------------------------------
-- Duas imobiliárias, um lançamento em cada.
-- ----------------------------------------------------------------------------
-- A imobiliária do portal pode não existir neste banco (o local só tem o
-- tenant de teste): cria as duas, e o ROLLBACK desfaz.
INSERT INTO public.tenants (id, code, name)
VALUES
  (pg_temp.tenant_do_portal(), 'teste-portal-a', 'Teste Portal A'),
  ('1a1c0000-0000-4000-a000-00000000000b', 'teste-portal-b', 'Teste Portal B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lancamentos (id, tenant_id, nome, publicar_site)
VALUES
  ('1a1c0000-0000-4000-a000-0000000000a1', pg_temp.tenant_do_portal(), 'Do portal', true),
  ('1a1c0000-0000-4000-a000-0000000000b1', '1a1c0000-0000-4000-a000-00000000000b', 'De outra imobiliaria', true);

-- ----------------------------------------------------------------------------
-- O que a chave pública enxerga.
-- ----------------------------------------------------------------------------
SET LOCAL role = anon;

SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM public.lancamentos WHERE id = '1a1c0000-0000-4000-a000-0000000000a1'),
  'o lancamento da imobiliaria do portal continua publico');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = '1a1c0000-0000-4000-a000-0000000000b1'),
  'o lancamento de OUTRA imobiliaria NAO e publico');

SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM public.lancamentos
     WHERE tenant_id IS DISTINCT FROM pg_temp.tenant_do_portal()
  ),
  'a chave publica nao alcanca lancamento de nenhuma outra imobiliaria');

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Quem loga continua vendo o da própria imobiliária, e só.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  (SELECT count(*) FROM public.lancamentos
    WHERE id IN ('1a1c0000-0000-4000-a000-0000000000a1','1a1c0000-0000-4000-a000-0000000000b1')) = 2,
  'o dono do banco (service_role) continua vendo os dois — a policy nao e um REVOKE');

ROLLBACK;

\echo 'OK: lancamentos_anon_por_tenant — 5 casos passaram.'

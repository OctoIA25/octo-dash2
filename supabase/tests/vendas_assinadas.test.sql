-- Testes de 20260917_view_vendas_assinadas.sql.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/vendas_assinadas.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

-- ----------------------------------------------------------------------------
-- Fixtures: dois tenants, um membro em cada, e quatro vendas que exercitam
-- comissão gravada, os dois fallbacks e a borda do fuso.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('5a1e0000-0000-4000-a000-000000000001', 'gestor-a@teste-venda.dev'),
  ('5a1e0000-0000-4000-a000-000000000002', 'gestor-b@teste-venda.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('5a1e0000-0000-4000-a000-00000000000a', 'teste-venda-a', 'Teste Venda A'),
  ('5a1e0000-0000-4000-a000-00000000000b', 'teste-venda-b', 'Teste Venda B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('5a1e0000-0000-4000-a000-00000000000a', '5a1e0000-0000-4000-a000-000000000001', 'admin', '{}'),
  ('5a1e0000-0000-4000-a000-00000000000b', '5a1e0000-0000-4000-a000-000000000002', 'admin', '{}');

-- A classificação é DERIVADA por trigger (tr_leads_classificar): passar o valor
-- no INSERT não adianta, ele vira {indefinido}. Um UPDATE depois grava — é como
-- a reclassificação manual da tela faz.
INSERT INTO public.leads (id, tenant_id, name) VALUES
  ('5a1e0000-0000-4000-a000-0000000000e1', '5a1e0000-0000-4000-a000-00000000000a', 'Lead Lancamento'),
  ('5a1e0000-0000-4000-a000-0000000000e2', '5a1e0000-0000-4000-a000-00000000000a', 'Lead Pronto');

UPDATE public.leads SET classification = ARRAY['lancamento'] WHERE id = '5a1e0000-0000-4000-a000-0000000000e1';
UPDATE public.leads SET classification = ARRAY['pronto']     WHERE id = '5a1e0000-0000-4000-a000-0000000000e2';

INSERT INTO public.proposals (id, tenant_id, lead_id, stage_id, value, commission_total, signed_at) VALUES
  -- comissão gravada vence o cálculo
  ('5a1e0000-0000-4000-a000-0000000000f1', '5a1e0000-0000-4000-a000-00000000000a', NULL,
   'proposta-assinada', 100000, 9999, '2026-03-10T14:00:00Z'),
  -- lançamento sem comissão gravada: 3,5%
  ('5a1e0000-0000-4000-a000-0000000000f2', '5a1e0000-0000-4000-a000-00000000000a', '5a1e0000-0000-4000-a000-0000000000e1',
   'proposta-assinada', 100000, NULL, '2026-03-11T14:00:00Z'),
  -- terceiros sem comissão gravada: 6%
  ('5a1e0000-0000-4000-a000-0000000000f3', '5a1e0000-0000-4000-a000-00000000000a', '5a1e0000-0000-4000-a000-0000000000e2',
   'proposta-assinada', 100000, NULL, '2026-03-12T14:00:00Z'),
  -- 31/03 às 22h em São Paulo = 01/04 01:00 em UTC. O mês do gestor é março.
  ('5a1e0000-0000-4000-a000-0000000000f4', '5a1e0000-0000-4000-a000-00000000000a', NULL,
   'proposta-assinada', 50000, 1000, '2026-04-01T01:00:00Z'),
  -- do outro tenant, para a fronteira
  ('5a1e0000-0000-4000-a000-0000000000f5', '5a1e0000-0000-4000-a000-00000000000b', NULL,
   'proposta-assinada', 777000, 7777, '2026-03-15T14:00:00Z'),
  -- ainda não assinada: fora da view
  ('5a1e0000-0000-4000-a000-0000000000f6', '5a1e0000-0000-4000-a000-00000000000a', NULL,
   'proposta-criada', 999000, 500, '2026-03-16T14:00:00Z');

-- 1. A view é security_invoker. Sem isso ela vaza VGV entre imobiliárias.
SELECT pg_temp.checa(
  (SELECT 'security_invoker=true' = ANY(c.reloptions)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vendas_assinadas'),
  'a view e security_invoker');

-- 2. Comissão gravada vence o cálculo.
SELECT pg_temp.checa(
  (SELECT vgc FROM public.vendas_assinadas WHERE id = '5a1e0000-0000-4000-a000-0000000000f1') = 9999,
  'comissao gravada e usada como esta');

-- 3. Fallback de lançamento: 3,5%.
SELECT pg_temp.checa(
  (SELECT vgc FROM public.vendas_assinadas WHERE id = '5a1e0000-0000-4000-a000-0000000000f2') = 3500,
  'lancamento sem comissao gravada cai em 3,5%');

-- 4. Fallback de terceiros: 6%.
SELECT pg_temp.checa(
  (SELECT vgc FROM public.vendas_assinadas WHERE id = '5a1e0000-0000-4000-a000-0000000000f3') = 6000,
  'terceiros sem comissao gravada cai em 6%');

-- 5. Fuso: 01/04 01:00 UTC é 31/03 em São Paulo.
SELECT pg_temp.checa(
  (SELECT data_assinatura FROM public.vendas_assinadas WHERE id = '5a1e0000-0000-4000-a000-0000000000f4') = DATE '2026-03-31',
  'venda da virada fica no mes de Sao Paulo, nao no de UTC');

-- 6. Proposta não assinada fica de fora.
SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.vendas_assinadas WHERE id = '5a1e0000-0000-4000-a000-0000000000f6'),
  'proposta nao assinada nao entra na view');

-- 7. Fronteira de tenant, pelo caminho real do usuário.
SELECT pg_temp.como('5a1e0000-0000-4000-a000-000000000001', 'gestor-a@teste-venda.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.vendas_assinadas
    WHERE tenant_id = '5a1e0000-0000-4000-a000-00000000000b') = 0,
  'gestor do tenant A nao ve venda do tenant B');

RESET ROLE;

SELECT 'OK: vendas_assinadas - 9 casos passaram' AS resultado;

-- O pg_default_acl do Supabase concede arwdDxtm a anon e authenticated em toda
-- relação nova, views inclusive: sem o REVOKE da migration esta view nascia
-- legível por `anon`, a chave que vai no bundle do browser. Descoberto em
-- 18/09/2026 ao testar primeira_interacao, que tinha o mesmo defeito.
SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.vendas_assinadas', 'SELECT') IS FALSE,
  'vendas_assinadas NAO tem GRANT para anon');

SELECT pg_temp.checa(
  has_table_privilege('authenticated', 'public.vendas_assinadas', 'SELECT') IS TRUE,
  'vendas_assinadas TEM GRANT para authenticated');

ROLLBACK;

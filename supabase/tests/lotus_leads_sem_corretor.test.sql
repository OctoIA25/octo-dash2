-- Testes de 20260918_lotus_leads_sem_corretor.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lotus_leads_sem_corretor.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

INSERT INTO public.tenants (id, code, name)
VALUES ('10705000-0000-4000-a000-00000000000a', 'teste-lotus-leads', 'Teste Lotus Leads');

-- Os seis nomes medidos em produção, com um lead cada.
INSERT INTO public.leads (id, tenant_id, name, assigned_agent_name, participa_bolsao) VALUES
  ('10705000-0000-4000-a000-000000000001', '10705000-0000-4000-a000-00000000000a', 'Lead 1', 'LOTUS LEADS', false),
  ('10705000-0000-4000-a000-000000000002', '10705000-0000-4000-a000-00000000000a', 'Lead 2', 'LOTUS LEADS', true),
  ('10705000-0000-4000-a000-000000000003', '10705000-0000-4000-a000-00000000000a', 'Lead 3', 'FERNANDA SOUZA', false),
  ('10705000-0000-4000-a000-000000000004', '10705000-0000-4000-a000-00000000000a', 'Lead 4', 'FABIO GONCALVES', false),
  ('10705000-0000-4000-a000-000000000005', '10705000-0000-4000-a000-00000000000a', 'Lead 5', 'Ana Souza', false);

-- A MESMA instrução da migration.
UPDATE public.leads
   SET assigned_agent_name = NULL, participa_bolsao = true, updated_at = now()
 WHERE assigned_agent_name = 'LOTUS LEADS';

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.leads WHERE assigned_agent_name = 'LOTUS LEADS'),
  'nenhum lead continua com "LOTUS LEADS" como corretor');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.leads
    WHERE id IN ('10705000-0000-4000-a000-000000000001','10705000-0000-4000-a000-000000000002')
      AND assigned_agent_name IS NULL AND participa_bolsao) = 2,
  'os dois voltam para a fila, sem corretor');

SELECT pg_temp.checa(
  (SELECT participa_bolsao FROM public.leads WHERE id='10705000-0000-4000-a000-000000000001') IS TRUE,
  'quem estava FORA do bolsao entra');

SELECT pg_temp.checa(
  (SELECT assigned_agent_name FROM public.leads WHERE id='10705000-0000-4000-a000-000000000003') = 'FERNANDA SOUZA',
  'os outros cinco nomes NAO sao tocados: esperam o confere do Erick');

SELECT pg_temp.checa(
  (SELECT participa_bolsao FROM public.leads WHERE id='10705000-0000-4000-a000-000000000004') IS FALSE,
  'e nem o bolsao deles muda');

SELECT pg_temp.checa(
  (SELECT assigned_agent_name FROM public.leads WHERE id='10705000-0000-4000-a000-000000000005') = 'Ana Souza',
  'corretor de verdade segue intocado');

ROLLBACK;

\echo 'OK: lotus_leads_sem_corretor — 6 casos passaram.'

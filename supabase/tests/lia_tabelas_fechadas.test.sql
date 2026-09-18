-- Testes de 20260918_rls_fecha_tabelas_lia.sql: as tabelas da LIA são do
-- servidor. Nem o visitante anônimo nem o usuário logado alcançam qualquer uma.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lia_tabelas_fechadas.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE TEMP TABLE alvo(t text) ON COMMIT DROP;
INSERT INTO alvo VALUES
  ('lia_bolsao_estado'),('lia_captacoes'),('lia_corretor_messages'),
  ('lia_empreendimento_chunks'),('lia_empreendimento_views'),('lia_fila_vistas'),
  ('lia_followups'),('lia_interaction_examples'),('lia_lead_extra'),
  ('lia_lead_facts'),('lia_perguntas_corretor'),('lia_regras'),
  ('lia_unidades'),('lia_visitas');

-- 1. A lista do teste tem que cobrir TODAS as lia_* que existem. Se alguém criar
--    uma nova e não fechar, o teste avisa aqui — é o caso que mais importa.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'lia\_%'
       AND c.relname NOT IN (SELECT t FROM alvo)),
  'existe tabela lia_* fora desta lista — feche-a e acrescente aqui');

-- 2. Nem anon nem authenticated tocam em nenhuma delas.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM alvo, unnest(ARRAY['anon','authenticated']) AS r(papel),
                 unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p(priv)
     WHERE has_table_privilege(r.papel, 'public.' || alvo.t, p.priv)),
  'anon e authenticated nao tem privilegio nenhum nas tabelas da LIA');

-- 3. RLS ligada nas 14 — segunda camada, para a tabela não depender só do grant.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM alvo JOIN pg_class c ON c.relname = alvo.t
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relrowsecurity IS NOT TRUE),
  'RLS ligada em todas as 14');

-- 4. O servidor continua enxergando: é ele que alimenta a saúde do tenant e a
--    telemetria dos agentes. service_role tem bypass de RLS.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM alvo WHERE NOT has_table_privilege('service_role', 'public.' || alvo.t, 'SELECT')),
  'service_role continua lendo as 14');

SELECT 'OK: tabelas da LIA fechadas - 4 casos passaram' AS resultado;

ROLLBACK;

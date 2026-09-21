-- ============================================================
-- OKRs e PDI numa página só (P3.4).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/okrs_e_pdi.test.sql
--
-- O que estas tabelas existem para consertar, medido em 21/09/2026: o OKR não
-- tinha banco nenhum (F5 e sumia; apagar não apagava) e o PDI vivia no
-- localStorage de cada navegador, sem tenant.
--
-- Os casos 2 e 9 são os que separam "funciona" de "está certo": PDI é conversa
-- entre a pessoa e o gestor, e um corretor NÃO pode ler o do colega.
--
-- Os usuários "entram" como no PostgREST: role authenticated + jwt claims.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.como_servidor() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
END $$;

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Uma escrita que DEVE ser barrada. Sem isto, um teste "passa" só porque a
-- linha não apareceu — quando na verdade ela foi gravada e o SELECT é que a
-- escondeu.
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (a escrita passou e deveria ter sido barrada)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
  WHEN others THEN
    IF SQLSTATE = '42501' THEN RETURN; END IF;
    RAISE;
END $$;

-- Uma escrita que deve bater numa REGRA DA TABELA (CHECK), e não em permissão.
-- Separada de `deve_barrar` de propósito: um helper que engolisse qualquer erro
-- faria os casos de permissão passarem pelo motivo errado.
CREATE FUNCTION pg_temp.deve_recusar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (a regra da tabela deixou passar)', p_caso;
EXCEPTION
  WHEN check_violation THEN RETURN;
END $$;

-- ------------------------------------------------------------
-- Elenco
-- ------------------------------------------------------------
-- Como postgres: `service_role` não escreve em auth.users, e o fixture precisa
-- existir antes de qualquer troca de papel.
INSERT INTO auth.users (id, email) VALUES
  ('0aaa0000-0000-4000-a000-000000000001', 'gestor@teste-okr.dev'),
  ('0aaa0000-0000-4000-a000-000000000002', 'ana@teste-okr.dev'),
  ('0aaa0000-0000-4000-a000-000000000003', 'bruno@teste-okr.dev'),
  ('0aaa0000-0000-4000-a000-000000000004', 'forasteiro@teste-okr.dev')
ON CONFLICT DO NOTHING;

INSERT INTO tenants (id, code, name) VALUES
  ('0aaa1111-0000-4000-a000-000000000001', 'teste-okr-a', 'Imobiliária A'),
  ('0aaa1111-0000-4000-a000-000000000002', 'teste-okr-b', 'Imobiliária B')
ON CONFLICT DO NOTHING;

INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
  ('0aaa1111-0000-4000-a000-000000000001', '0aaa0000-0000-4000-a000-000000000001', 'admin'),
  ('0aaa1111-0000-4000-a000-000000000001', '0aaa0000-0000-4000-a000-000000000002', 'corretor'),
  ('0aaa1111-0000-4000-a000-000000000001', '0aaa0000-0000-4000-a000-000000000003', 'corretor'),
  ('0aaa1111-0000-4000-a000-000000000002', '0aaa0000-0000-4000-a000-000000000004', 'admin')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 1. A PESSOA CRIA E LÊ O SEU OKR.
--
-- O básico que não existia: antes disto, criar e recarregar perdia tudo.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000002', 'ana@teste-okr.dev');

INSERT INTO okrs (tenant_id, corretor_email, titulo, trimestre, ano, key_results)
VALUES ('0aaa1111-0000-4000-a000-000000000001', 'ana@teste-okr.dev',
        'Dobrar visitas agendadas', 'Q3', 2026,
        '[{"id":"kr1","titulo":"40 visitas","meta":40,"alcancadoQ1":0,"alcancadoQ2":0,"alcancadoQ3":12,"alcancadoQ4":0,"concluido":false,"progresso":30}]'::jsonb);

SELECT pg_temp.checa(
  (SELECT count(*) FROM okrs WHERE corretor_email = 'ana@teste-okr.dev') = 1,
  'a Ana não conseguiu ler o OKR que ela mesma criou');

-- E o key result foi guardado inteiro, não só o título.
SELECT pg_temp.checa(
  (SELECT (key_results->0->>'alcancadoQ3')::int FROM okrs WHERE corretor_email = 'ana@teste-okr.dev') = 12,
  'o key result perdeu o valor do trimestre ao ser gravado');

-- ------------------------------------------------------------
-- 2. O COLEGA NÃO LÊ O OKR DO OUTRO.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000003', 'bruno@teste-okr.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM okrs) = 0,
  'um corretor leu o OKR do colega');

-- ------------------------------------------------------------
-- 3. A GESTÃO LÊ O DA CASA INTEIRA.
--
-- É literalmente para isto que a aba "Gestão de Equipe" existe, e é o
-- critério do plano: editar na Home tem de aparecer lá.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000001', 'gestor@teste-okr.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM okrs) = 1,
  'o gestor não enxergou o OKR do corretor da própria imobiliária');

-- O critério do plano, ponta a ponta: o gestor EDITA, e a dona vê editado.
UPDATE okrs SET titulo = 'Dobrar visitas agendadas (revisado)'
 WHERE corretor_email = 'ana@teste-okr.dev';

SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000002', 'ana@teste-okr.dev');
SELECT pg_temp.checa(
  (SELECT titulo FROM okrs WHERE corretor_email = 'ana@teste-okr.dev') = 'Dobrar visitas agendadas (revisado)',
  'a edição do gestor não chegou na tela da pessoa');

-- ------------------------------------------------------------
-- 4. QUEM É DE OUTRA IMOBILIÁRIA NÃO LÊ NADA.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000004', 'forasteiro@teste-okr.dev');
SELECT pg_temp.checa((SELECT count(*) FROM okrs) = 0, 'vazou OKR para outra imobiliária');
SELECT pg_temp.checa((SELECT count(*) FROM pdis) = 0, 'vazou PDI para outra imobiliária');

-- E nem escrever na imobiliária alheia.
SELECT pg_temp.deve_barrar($$
  INSERT INTO okrs (tenant_id, corretor_email, titulo, trimestre, ano)
  VALUES ('0aaa1111-0000-4000-a000-000000000001', 'forasteiro@teste-okr.dev', 'Invasão', 'Q3', 2026)
$$, 'alguém de fora gravou OKR na imobiliária A');

-- ------------------------------------------------------------
-- 5. O COLEGA NÃO ALTERA O OKR DO OUTRO.
--
-- UPDATE barrado por RLS não dá erro: ele acerta zero linhas em silêncio.
-- Por isso o teste confere o CONTEÚDO depois, e não o sucesso do comando.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000003', 'bruno@teste-okr.dev');
UPDATE okrs SET titulo = 'Sequestrado pelo Bruno' WHERE corretor_email = 'ana@teste-okr.dev';

SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000002', 'ana@teste-okr.dev');
SELECT pg_temp.checa(
  (SELECT titulo FROM okrs WHERE corretor_email = 'ana@teste-okr.dev') = 'Dobrar visitas agendadas (revisado)',
  'o colega conseguiu reescrever o OKR alheio');

-- ------------------------------------------------------------
-- 6. A GESTÃO ATRIBUI UM OKR A ALGUÉM.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000001', 'gestor@teste-okr.dev');

INSERT INTO okrs (tenant_id, corretor_email, titulo, trimestre, ano, criador_email, atribuido_por_admin)
VALUES ('0aaa1111-0000-4000-a000-000000000001', 'bruno@teste-okr.dev',
        'Fechar 5 vendas', 'Q3', 2026, 'gestor@teste-okr.dev', true);

SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000003', 'bruno@teste-okr.dev');
SELECT pg_temp.checa(
  (SELECT count(*) FROM okrs WHERE atribuido_por_admin) = 1,
  'o OKR atribuído pelo gestor não apareceu para quem o recebeu');

-- ------------------------------------------------------------
-- 7. APAGAR APAGA DE VERDADE.
--
-- O botão de apagar da tela de OKR não fazia NADA até hoje — o hook só
-- escrevia um aviso no console. Este caso é o que prova que passou a apagar.
-- ------------------------------------------------------------
DELETE FROM okrs WHERE corretor_email = 'bruno@teste-okr.dev';
SELECT pg_temp.checa((SELECT count(*) FROM okrs) = 0, 'o OKR continuou lá depois de apagar');

SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000001', 'gestor@teste-okr.dev');
SELECT pg_temp.checa(
  (SELECT count(*) FROM okrs) = 1,
  'apagar o OKR do Bruno levou junto o da Ana');

-- ------------------------------------------------------------
-- 8. O PDI SOBE DO NAVEGADOR MARCADO COMO TAL.
--
-- Quem tinha plano escrito no localStorage pode subi-lo. A coluna `origem`
-- guarda de onde veio, para dar para separar depois o migrado do que nasceu
-- na tela.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000002', 'ana@teste-okr.dev');

INSERT INTO pdis (tenant_id, corretor_email, tipo, competencia, origem, acoes)
VALUES ('0aaa1111-0000-4000-a000-000000000001', 'ana@teste-okr.dev', 'individual',
        'Negociação', 'navegador',
        '[{"id":"a1","descricao":"Ler o livro","concluida":false}]'::jsonb);

SELECT pg_temp.checa(
  (SELECT origem FROM pdis WHERE corretor_email = 'ana@teste-okr.dev') = 'navegador',
  'o PDI migrado não guardou de onde veio');

-- `origem` só aceita os dois valores previstos: um terceiro valor tornaria a
-- separação inútil sem ninguém perceber.
SELECT pg_temp.deve_recusar($$
  UPDATE pdis SET origem = 'sei_la' WHERE corretor_email = 'ana@teste-okr.dev'
$$, 'a coluna origem aceitou um valor que não existe');

-- ------------------------------------------------------------
-- 9. O COLEGA NÃO LÊ O PDI DO OUTRO.
--
-- O mais sensível dos dois: plano de desenvolvimento é conversa entre a
-- pessoa e o gestor, e não documento de equipe.
-- ------------------------------------------------------------
SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000003', 'bruno@teste-okr.dev');
SELECT pg_temp.checa((SELECT count(*) FROM pdis) = 0, 'um corretor leu o PDI do colega');

SELECT pg_temp.como('0aaa0000-0000-4000-a000-000000000001', 'gestor@teste-okr.dev');
SELECT pg_temp.checa((SELECT count(*) FROM pdis) = 1, 'o gestor não enxergou o PDI da equipe');

-- ------------------------------------------------------------
-- 10. O ANÔNIMO NÃO ENCOSTA.
--
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE da migration, o PDI de cada pessoa sairia pela API pública.
-- ------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM okrs $$, 'o anônimo conseguiu ler a tabela de OKRs');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM pdis $$, 'o anônimo conseguiu ler a tabela de PDIs');

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: OKRs e PDI — 10 casos'; END $$;

ROLLBACK;

-- Testes de 20260915_imovel_captador_edita_proprietario_protegido.sql:
-- quem edita, quem vê o proprietário, fronteira de tenant, RPCs, publicação e log.
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra o
-- banco real depois da migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/imoveis_permissoes_proprietario.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.
--
-- Os usuários "entram" como no PostgREST: SET ROLE authenticated + request.jwt.claims.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
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
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

-- Executa p_sql e exige o SQLSTATE (e, se dado, um trecho da mensagem).
CREATE FUNCTION pg_temp.falha(p_sql text, p_sqlstate text, p_caso text, p_trecho text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_sqlstate AND (p_trecho IS NULL OR strpos(SQLERRM, p_trecho) > 0) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'FALHOU: % (esperado %/%, veio %: %)', p_caso, p_sqlstate, p_trecho, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % (esperado erro %, a operação passou)', p_caso, p_sqlstate;
END $$;

-- Linhas afetadas por um UPDATE/DELETE (RLS filtra em silêncio).
CREATE FUNCTION pg_temp.afetadas(p_sql text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ----------------------------------------------------------------------------
-- Fixtures (como postgres)
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('0e5e0000-0000-4000-a000-000000000001', 'admin-a@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000002', 'flavia@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000003', 'fernanda@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000004', 'mari@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000005', 'lider@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000006', 'lancamentos@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000007', 'admin-b@teste-imovel.dev'),
  ('0e5e0000-0000-4000-a000-000000000008', 'plataforma@teste-imovel.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('0e5e0000-0000-4000-a000-00000000000a', 'teste-imovel-a', 'Teste Imóvel A'),
  ('0e5e0000-0000-4000-a000-00000000000b', 'teste-imovel-b', 'Teste Imóvel B');

INSERT INTO public.platform_owners (email) VALUES ('plataforma@teste-imovel.dev');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions, leader_user_id) VALUES
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000001', 'admin', '{}', NULL),
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000002', 'corretor', '{}', '0e5e0000-0000-4000-a000-000000000005'),
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000003', 'corretor', '{}', NULL),
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000004', 'team_leader', '{"atuacao":["prontos"]}', NULL),
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000005', 'team_leader', '{}', NULL),
  ('0e5e0000-0000-4000-a000-00000000000a', '0e5e0000-0000-4000-a000-000000000006', 'team_leader', '{"atuacao":["lancamentos"]}', NULL),
  ('0e5e0000-0000-4000-a000-00000000000b', '0e5e0000-0000-4000-a000-000000000007', 'admin', '{}', NULL);

-- Publicados completos, um rascunho incompleto e um publicado legado (sem proprietário).
-- Gravados como owner da plataforma: tg_guard_captador não aceita captador sem usuário.
SELECT set_config('request.jwt.claims', '{"sub":"0e5e0000-0000-4000-a000-000000000008","email":"plataforma@teste-imovel.dev"}', true);
INSERT INTO public.imoveis_locais
  (tenant_id, codigo_imovel, finalidade, status_aprovacao, criado_por, captador_id,
   proprietario_nome, proprietario_telefone, proprietario_email,
   cep, logradouro, numero, bairro, cidade, estado, titulo)
VALUES
  -- Criado pelo admin, captado pela Flávia.
  ('0e5e0000-0000-4000-a000-00000000000a', 'T-CAP', 'venda', 'aprovado',
   '0e5e0000-0000-4000-a000-000000000001', '0e5e0000-0000-4000-a000-000000000002',
   'José da Silva', '(11) 99999-9999', 'jose@x.com',
   '13201-000', 'Rua A', '10', 'Centro', 'Jundiaí', 'SP', 'Casa'),
  -- Locação, sem captador_id: a captadora é quem cadastrou (Fernanda).
  ('0e5e0000-0000-4000-a000-00000000000a', 'T-LOC', 'locacao', 'aprovado',
   '0e5e0000-0000-4000-a000-000000000003', NULL,
   'Ana Locadora', '(11) 98888-8888', NULL,
   '13201-001', 'Rua B', '20', 'Centro', 'Jundiaí', 'SP', 'Apto'),
  ('0e5e0000-0000-4000-a000-00000000000b', 'T-B', 'venda', 'aprovado',
   '0e5e0000-0000-4000-a000-000000000007', NULL,
   'Dono do B', '(11) 97777-7777', NULL,
   '13201-002', 'Rua C', '30', 'Centro', 'Jundiaí', 'SP', 'Sala');

INSERT INTO public.imoveis_locais (tenant_id, codigo_imovel, finalidade, status_aprovacao, criado_por, captador_id, titulo)
VALUES ('0e5e0000-0000-4000-a000-00000000000a', 'T-RASC', 'venda', 'rascunho',
        '0e5e0000-0000-4000-a000-000000000003', '0e5e0000-0000-4000-a000-000000000002', 'Rascunho da Fernanda');

ALTER TABLE public.imoveis_locais DISABLE TRIGGER tg_valida_publicacao_imovel;
INSERT INTO public.imoveis_locais (tenant_id, codigo_imovel, finalidade, status_aprovacao, criado_por, titulo, fotos)
VALUES ('0e5e0000-0000-4000-a000-00000000000a', 'T-LEGADO', 'venda', 'aprovado',
        '0e5e0000-0000-4000-a000-000000000001', 'Publicado antes da regra', '[]');
ALTER TABLE public.imoveis_locais ENABLE TRIGGER tg_valida_publicacao_imovel;

-- ----------------------------------------------------------------------------
-- Flávia — corretora captadora (CA-01, CA-02)
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000002', 'flavia@teste-imovel.dev');

SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Casa editada pela Flávia' WHERE codigo_imovel = 'T-CAP'$$) = 1,
  'captadora edita o imóvel que captou (criado por outro)');
SELECT pg_temp.checa((SELECT proprietario_nome = 'José da Silva' AND proprietario_telefone = '(11) 99999-9999'
                        FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', 'T-CAP')),
  'captadora recebe os dados do proprietário');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET proprietario_telefone = '(11) 90000-0000' WHERE codigo_imovel = 'T-CAP'$$) = 1,
  'captadora altera os dados do proprietário');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET titulo = 'x' WHERE codigo_imovel = 'T-LOC'$$, '42501',
  'corretora não edita imóvel de outra captadora');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', 'T-LOC')),
  'corretora não recebe proprietário de imóvel alheio');
SELECT pg_temp.checa(
  (SELECT imoveis_editaveis('0e5e0000-0000-4000-a000-00000000000a')) @> ARRAY['T-CAP', 'T-RASC']
  AND NOT (SELECT imoveis_editaveis('0e5e0000-0000-4000-a000-00000000000a')) && ARRAY['T-LOC', 'T-LEGADO'],
  'imoveis_editaveis da captadora');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET criado_por = '0e5e0000-0000-4000-a000-000000000002' WHERE codigo_imovel = 'T-CAP'$$, '42501',
  'corretora não troca quem cadastrou');

-- Payload: nenhuma leitura direta devolve o proprietário (CA-04, CA-12).
SELECT pg_temp.falha($$SELECT proprietario_nome FROM imoveis_locais$$, '42501', 'select direto de proprietario_nome');
SELECT pg_temp.falha($$SELECT * FROM imoveis_locais$$, '42501', 'select * inclui proprietário e é negado');
SELECT pg_temp.falha($$SELECT codigo_imovel FROM imoveis_locais WHERE proprietario_nome ILIKE 'jos%'$$, '42501',
  'filtro por proprietario_nome também é negado');
SELECT pg_temp.falha(
  $$INSERT INTO imoveis_locais (tenant_id, codigo_imovel, status_aprovacao, proprietario_nome)
    VALUES ('0e5e0000-0000-4000-a000-00000000000a', 'T-CAP', 'rascunho', 'x')
    ON CONFLICT (tenant_id, codigo_imovel) DO UPDATE SET proprietario_nome = EXCLUDED.proprietario_nome$$,
  '42501', 'upsert com proprietário exige SELECT na coluna (por isso o formulário usa insert/update)');
SELECT pg_temp.checa((SELECT count(*) FROM imoveis_locais WHERE tenant_id = '0e5e0000-0000-4000-a000-00000000000a') = 4,
  'catálogo (colunas sem proprietário) continua legível para o corretor');

-- As formas que o PostgREST gera para o formulário (copiadas de pg_stat_statements):
-- PATCH e POST com proprietario_* no corpo e select=updated_at. Sem SELECT nas
-- colunas do proprietário as duas precisam passar — é por isso que o form trocou o upsert.
SELECT pg_temp.checa(pg_temp.afetadas($$
  WITH pgrst_source AS (
    UPDATE "public"."imoveis_locais" SET "proprietario_email" = "pgrst_body"."proprietario_email"
      FROM (SELECT '{"proprietario_email":"novo@x.com"}'::json AS json_data) pgrst_payload,
           LATERAL (SELECT "proprietario_email" FROM json_to_record(pgrst_payload.json_data) AS _("proprietario_email" text)) pgrst_body
     WHERE "public"."imoveis_locais"."tenant_id" = '0e5e0000-0000-4000-a000-00000000000a'
       AND "public"."imoveis_locais"."codigo_imovel" = 'T-CAP'
    RETURNING "public"."imoveis_locais"."id", "public"."imoveis_locais"."updated_at")
  SELECT * FROM pgrst_source$$) = 1,
  'PATCH do PostgREST com proprietário e select=updated_at');
SELECT pg_temp.checa(pg_temp.afetadas($$
  WITH pgrst_source AS (
    INSERT INTO "public"."imoveis_locais"("tenant_id", "codigo_imovel", "status_aprovacao", "criado_por", "proprietario_nome")
    SELECT "pgrst_body"."tenant_id", "pgrst_body"."codigo_imovel", "pgrst_body"."status_aprovacao", "pgrst_body"."criado_por", "pgrst_body"."proprietario_nome"
      FROM (SELECT '[{"tenant_id":"0e5e0000-0000-4000-a000-00000000000a","codigo_imovel":"T-FLAVIA","status_aprovacao":"rascunho","criado_por":"0e5e0000-0000-4000-a000-000000000002","proprietario_nome":"Novo Dono"}]'::json AS json_data) pgrst_payload,
           LATERAL (SELECT * FROM json_to_recordset(pgrst_payload.json_data)
                      AS _("tenant_id" uuid, "codigo_imovel" text, "status_aprovacao" text, "criado_por" uuid, "proprietario_nome" text)) pgrst_body
    RETURNING "public"."imoveis_locais"."id", "public"."imoveis_locais"."updated_at")
  SELECT * FROM pgrst_source$$) = 1,
  'POST do PostgREST (rascunho novo com proprietário) e select=updated_at');

-- ----------------------------------------------------------------------------
-- Fernanda — outra corretora (CA-03, CA-04), autora do rascunho (CA-07..10)
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000003', 'fernanda@teste-imovel.dev');

SELECT pg_temp.falha($$UPDATE imoveis_locais SET titulo = 'x' WHERE codigo_imovel = 'T-CAP'$$, '42501',
  'outra corretora não edita', 'Sem permissão para editar');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET proprietario_nome = 'x' WHERE codigo_imovel = 'T-CAP'$$, '42501',
  'outra corretora não altera o proprietário');
SELECT pg_temp.falha($$DELETE FROM imoveis_locais WHERE codigo_imovel = 'T-CAP'$$, '42501',
  'outra corretora não exclui');
SELECT pg_temp.checa(
  (SELECT array_agg(codigo_imovel ORDER BY codigo_imovel) FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a'))
    = ARRAY['T-LOC', 'T-RASC'],
  'outra corretora só recebe proprietário do que captou e do próprio rascunho');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', NULL, 'josé')),
  'busca por nome não acha proprietário de imóvel alheio');

-- Duplicidade: nome sozinho não revela o imóvel; nome + endereço acusa, sem dado pessoal.
SELECT pg_temp.checa(NOT EXISTS (
  SELECT 1 FROM imoveis_duplicados_proprietario('0e5e0000-0000-4000-a000-00000000000a', 'José da Silva')),
  'duplicidade só com o nome não devolve nada');
SELECT pg_temp.checa((
  SELECT count(*) = 1 AND bool_and(motivo = 'mesmo_endereco')
    FROM imoveis_duplicados_proprietario('0e5e0000-0000-4000-a000-00000000000a', ' josé da silva ',
         p_logradouro => 'rua a', p_numero => '10', p_cep => '13201000')),
  'duplicidade por nome + endereço');
SELECT pg_temp.checa(NOT EXISTS (
  SELECT 1 FROM imoveis_duplicados_proprietario('0e5e0000-0000-4000-a000-00000000000a', 'José da Silva',
         p_bairro => 'Centro', p_cidade => 'Jundiaí')),
  'características incompletas não acusam duplicidade');

-- Rascunho incompleto salva (CA-09), inclusive o proprietário pela autora.
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Rascunho editado', proprietario_nome = 'Pedro Dono'
                                          WHERE codigo_imovel = 'T-RASC' AND status_aprovacao = 'rascunho'$$) = 1,
  'autora salva rascunho incompleto, com proprietário');
SELECT pg_temp.checa(pg_temp.afetadas($$INSERT INTO imoveis_locais (tenant_id, codigo_imovel, status_aprovacao, criado_por, titulo)
                                          VALUES ('0e5e0000-0000-4000-a000-00000000000a', 'T-NOVO', 'rascunho', auth.uid(), 'Só o título')$$) = 1,
  'rascunho novo sem proprietário nem endereço');

-- Publicação bloqueada lista o que falta e não mexe no rascunho (CA-07, CA-08, CA-10).
SELECT pg_temp.falha($$UPDATE imoveis_locais SET status_aprovacao = 'aguardando' WHERE codigo_imovel = 'T-NOVO'$$, '23514',
  'publicar sem proprietário', 'Nome do proprietário');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET status_aprovacao = 'aguardando' WHERE codigo_imovel = 'T-RASC'$$, '23514',
  'publicar sem contato do proprietário', 'Telefone ou e-mail do proprietário');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET status_aprovacao = 'aguardando' WHERE codigo_imovel = 'T-RASC'$$, '23514',
  'publicar sem endereço', 'CEP (8 dígitos), Logradouro, Número, Bairro, Cidade');
SELECT pg_temp.falha(
  $$INSERT INTO imoveis_locais (tenant_id, codigo_imovel, status_aprovacao, criado_por, proprietario_nome, proprietario_email)
    VALUES ('0e5e0000-0000-4000-a000-00000000000a', 'T-DIRETO', 'aguardando', auth.uid(), 'Maria', 'maria@x.com')$$,
  '23514', 'cadastro novo publicado direto sem endereço', 'Logradouro');
SELECT pg_temp.checa((SELECT status_aprovacao = 'rascunho' AND titulo = 'Rascunho editado'
                        FROM imoveis_locais WHERE codigo_imovel = 'T-RASC'),
  'tentativa inválida preserva o rascunho');
SELECT pg_temp.checa((SELECT proprietario_nome = 'Pedro Dono'
                        FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', 'T-RASC')),
  'tentativa inválida preserva o proprietário do rascunho');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais
    SET proprietario_telefone = '(11) 95555-5555', cep = '13201-003', logradouro = 'Rua D', numero = 's/n',
        bairro = 'Centro', cidade = 'Jundiaí', estado = 'SP', status_aprovacao = 'aguardando'
  WHERE codigo_imovel = 'T-RASC' AND status_aprovacao = 'rascunho'$$) = 1,
  'rascunho completo publica');

-- ----------------------------------------------------------------------------
-- Mari — gestora de terceiros, atuação prontos (CA-05, CA-06)
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000004', 'mari@teste-imovel.dev');

SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Casa editada pela Mari' WHERE codigo_imovel = 'T-CAP'$$) = 1,
  'gestora de terceiros edita imóvel de venda do tenant');
SELECT pg_temp.checa(EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', 'T-CAP')),
  'gestora de terceiros vê o proprietário do imóvel de venda');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET titulo = 'x' WHERE codigo_imovel = 'T-LOC'$$, '42501',
  'gestora de terceiros (prontos) não edita locação');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a', 'T-LOC')),
  'gestora de terceiros (prontos) não vê proprietário de locação');

-- ----------------------------------------------------------------------------
-- Líder da Flávia sem atuação marcada: edita (fail-open), não vê proprietário
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000005', 'lider@teste-imovel.dev');

SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Editado pelo líder' WHERE codigo_imovel = 'T-CAP'$$) = 1,
  'team_leader edita imóvel do liderado');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a')),
  'team_leader sem atuação explícita não recebe proprietário');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET proprietario_nome = 'x' WHERE codigo_imovel = 'T-CAP'$$, '42501',
  'team_leader que edita não altera o proprietário', 'dados do proprietário');

-- ----------------------------------------------------------------------------
-- Gestor de lançamentos: fora do escopo, mas aprova
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000006', 'lancamentos@teste-imovel.dev');

SELECT pg_temp.falha($$UPDATE imoveis_locais SET titulo = 'x' WHERE codigo_imovel = 'T-LOC'$$, '42501',
  'gestor de lançamentos não edita imóvel de terceiros de fora da equipe');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais
    SET status_aprovacao = 'nao_aprovado', aprovado_por = auth.uid(), aprovado_em = now(), motivo_aprovacao = 'fotos ruins'
  WHERE codigo_imovel = 'T-LOC'$$) = 1,
  'gestor continua aprovando/reprovando');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET status_aprovacao = 'aprovado', titulo = 'x' WHERE codigo_imovel = 'T-LOC'$$, '42501',
  'aprovação não serve de brecha para editar outros campos');

-- ----------------------------------------------------------------------------
-- Admin do tenant A: acesso atual preservado
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000001', 'admin-a@teste-imovel.dev');

SELECT pg_temp.checa((SELECT count(*) FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a')) = 6,
  'admin recebe todos os proprietários do tenant');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET proprietario_nome = 'José Souza' WHERE codigo_imovel = 'T-CAP'$$) = 1,
  'admin altera proprietário');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Legado editado' WHERE codigo_imovel = 'T-LEGADO'$$) = 1,
  'publicado antes da regra continua editável nos outros campos');
SELECT pg_temp.falha($$UPDATE imoveis_locais SET cep = NULL WHERE codigo_imovel = 'T-CAP'$$, '23514',
  'apagar o endereço de imóvel publicado é bloqueado', 'Não foi possível salvar');
SELECT pg_temp.checa(
  (SELECT bool_and(alteracoes -> 'proprietario_nome' = '{"de":"oculto","para":"oculto"}'::jsonb)
     FROM imoveis_locais_log
    WHERE tenant_id = '0e5e0000-0000-4000-a000-00000000000a' AND codigo_imovel = 'T-CAP' AND alteracoes ? 'proprietario_nome'),
  'histórico registra a troca do proprietário sem o nome');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_locais_log
                                  WHERE tenant_id = '0e5e0000-0000-4000-a000-00000000000a'
                                    AND alteracoes::text ~ '(José|Pedro|99999|jose@)'),
  'nenhum nome de proprietário no histórico');
SELECT pg_temp.checa(pg_temp.afetadas($$DELETE FROM imoveis_locais WHERE codigo_imovel = 'T-NOVO'$$) = 1,
  'admin exclui');

-- ----------------------------------------------------------------------------
-- Fronteira de tenant (CA-11)
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'x' WHERE codigo_imovel = 'T-B'$$) = 0,
  'admin do tenant A não altera imóvel do B');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000b')),
  'admin do tenant A não recebe proprietário do B');
SELECT pg_temp.checa(cardinality((SELECT imoveis_editaveis('0e5e0000-0000-4000-a000-00000000000b'))) = 0,
  'admin do tenant A não tem editáveis no B');
SELECT pg_temp.checa(NOT imovel_autoriza('ver_proprietario', '0e5e0000-0000-4000-a000-00000000000b', 'venda', 'aprovado', NULL, NULL,
                                         '0e5e0000-0000-4000-a000-000000000001'),
  'papel de admin não atravessa tenant nem com o próprio id como autor');

SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000007', 'admin-b@teste-imovel.dev');
SELECT pg_temp.checa(NOT EXISTS (SELECT 1 FROM imoveis_duplicados_proprietario('0e5e0000-0000-4000-a000-00000000000a', 'José Souza',
                                     p_logradouro => 'Rua A', p_numero => '10')),
  'duplicidade não responde para outro tenant');
SELECT pg_temp.checa((SELECT count(*) FROM imoveis_locais WHERE tenant_id = '0e5e0000-0000-4000-a000-00000000000a') = 0,
  'outro tenant não lê nem as colunas públicas');

-- ----------------------------------------------------------------------------
-- Owner da plataforma: acesso atual preservado
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('0e5e0000-0000-4000-a000-000000000008', 'plataforma@teste-imovel.dev');
SELECT pg_temp.checa(EXISTS (SELECT 1 FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000b', 'T-B')),
  'owner da plataforma vê proprietário de qualquer tenant');
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET titulo = 'Pelo owner' WHERE codigo_imovel = 'T-B'$$) = 1,
  'owner da plataforma edita');

-- ----------------------------------------------------------------------------
-- anon e service_role
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.falha($$SELECT proprietario_nome FROM imoveis_locais$$, '42501', 'anon não lê proprietário');
SELECT pg_temp.falha($$SELECT * FROM imoveis_proprietarios('0e5e0000-0000-4000-a000-00000000000a')$$, '42501', 'anon não executa a RPC');

RESET ROLE;
SELECT pg_temp.como_servidor();
SELECT pg_temp.checa(pg_temp.afetadas($$UPDATE imoveis_locais SET fotos = '[{"url":"https://cdn/x.jpg"}]' WHERE codigo_imovel = 'T-LEGADO'$$) = 1,
  'service_role (marca d''água) grava foto em publicado legado');

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'imoveis_permissoes_proprietario: todos os casos passaram'; END $$;

ROLLBACK;

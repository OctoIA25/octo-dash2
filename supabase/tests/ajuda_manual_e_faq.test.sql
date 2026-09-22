-- ============================================================
-- Ajuda: manual + FAQ (P4.9).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/ajuda_manual_e_faq.test.sql
--
-- O CRITÉRIO DE PRONTO DO PLANO é uma frase só, e está no caso 4:
-- "uma dúvida respondida vira FAQ pesquisável".
--
-- O caso 5 protege o que é fácil de quebrar sem perceber: corrigir a resposta
-- depois de publicada. Se o FAQ não acompanhar, a versão errada fica sendo a
-- que todo mundo lê — e ninguém descobre, porque quem corrigiu viu a correção.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fffaaaa-0000-4000-a000-000000000001';
  t2 uuid := '2fffaaaa-0000-4000-a000-000000000002';
  chefe uuid := '2fffaaab-0000-4000-a000-000000000001';
  ana uuid := '2fffaaab-0000-4000-a000-000000000002';
  fora uuid := '2fffaaab-0000-4000-a000-000000000009';
  duvida uuid;
  artigo uuid;
  r jsonb;
  d public.ajuda_duvidas%ROWTYPE;
  a public.ajuda_artigos%ROWTYPE;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe, 'chefe@teste-ajuda.dev'), (ana, 'ana@teste-ajuda.dev'), (fora, 'fora@teste-ajuda.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-ajuda', 'Teste Ajuda'), (t2, 'teste-ajuda-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, chefe, 'admin'), (t, ana, 'corretor'), (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. O MANUAL JÁ NASCE ESCRITO, E VALE PARA TODAS AS CASAS
  --
  -- Uma tela de ajuda vazia no primeiro dia não ajuda ninguém.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', ana, 'role', 'authenticated', 'email', 'ana@teste-ajuda.dev')::text, true);

  r := ajuda_buscar(t);
  IF jsonb_array_length(r) < 5 THEN
    RAISE EXCEPTION 'FALHOU: o manual da plataforma não apareceu — % artigo(s)', jsonb_array_length(r);
  END IF;
  IF NOT (r->0->>'da_plataforma')::boolean THEN
    RAISE EXCEPTION 'FALHOU: o artigo da plataforma não está marcado como tal';
  END IF;
  RAISE NOTICE 'OK 1: o manual da plataforma aparece para a imobiliária';

  -- ----------------------------------------------------------
  -- 2. A BUSCA ACHA POR PALAVRA, E AGUENTA O QUE A PESSOA DIGITA
  --
  -- `to_tsquery` explode com um espaço. Quem procura escreve frase, não
  -- expressão booleana.
  -- ----------------------------------------------------------
  r := ajuda_buscar(t, 'competência');
  IF jsonb_array_length(r) < 1 THEN RAISE EXCEPTION 'FALHOU: não achou por "competência"'; END IF;

  -- Acento e caixa não atrapalham; o dicionário português cuida disso.
  IF jsonb_array_length(ajuda_buscar(t, 'COMPETENCIA')) < 1 THEN
    RAISE EXCEPTION 'FALHOU: a busca não aguenta sem acento';
  END IF;
  -- Frase com espaço, aspas e palavra solta: nenhuma pode derrubar a busca.
  PERFORM ajuda_buscar(t, 'dias parado no lead');
  PERFORM ajuda_buscar(t, '"sem dados"');
  PERFORM ajuda_buscar(t, 'a e o de');
  IF ajuda_buscar(t, 'jabuticaba voadora') IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: achou algo que não existe';
  END IF;

  -- E o (?) de cada tela filtra pelo módulo.
  r := ajuda_buscar(t, NULL, 'metricas');
  IF jsonb_array_length(r) <> 2 THEN
    RAISE EXCEPTION 'FALHOU: o módulo metricas devia ter 2 artigos, tem %', jsonb_array_length(r);
  END IF;
  RAISE NOTICE 'OK 2: a busca acha por palavra, sem acento, e filtra por tela';

  -- ----------------------------------------------------------
  -- 3. QUALQUER MEMBRO PERGUNTA, E A PERGUNTA LEVA A TELA JUNTO
  --
  -- "Não entendi este número" só quer dizer alguma coisa com a tela junto.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM ajuda_perguntar(t, 'eh?');
    RAISE EXCEPTION 'FALHOU: aceitou dúvida de três letras';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  r := ajuda_perguntar(t, 'Por que o bolsão mostra leads que já atendi?', 'leads', '/bolsao');
  duvida := (r->>'duvida_id')::uuid;
  SELECT * INTO d FROM ajuda_duvidas WHERE id = duvida;
  IF d.status IS DISTINCT FROM 'aberta' OR d.tela IS DISTINCT FROM '/bolsao'
     OR d.perguntou_email IS DISTINCT FROM 'ana@teste-ajuda.dev' THEN
    RAISE EXCEPTION 'FALHOU: a dúvida não guardou contexto — status=% tela=% email=%',
      d.status, d.tela, d.perguntou_email;
  END IF;

  -- Quem perguntou vê a própria dúvida.
  IF jsonb_array_length(ajuda_minhas_duvidas(t)) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: quem perguntou não vê a própria dúvida';
  END IF;
  -- Mas não vê a fila de todo mundo: é a caixa de trabalho de quem administra.
  IF ajuda_duvidas_lista(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora viu a fila de dúvidas da casa inteira';
  END IF;
  RAISE NOTICE 'OK 3: qualquer membro pergunta, com a tela junto';

  -- ----------------------------------------------------------
  -- 4. CRITÉRIO DE PRONTO: RESPONDIDA, VIRA FAQ PESQUISÁVEL
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-ajuda.dev')::text, true);

  -- Publicar sem responder é publicar o vazio.
  BEGIN
    PERFORM ajuda_publicar_no_faq(duvida);
    RAISE EXCEPTION 'FALHOU: publicou no FAQ uma dúvida sem resposta';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM ajuda_responder(duvida,
    'O bolsão mostra o lead até alguém registrar atendimento: mensagem enviada ou atividade agendada. Abrir a ficha não conta.');
  r := ajuda_publicar_no_faq(duvida);
  artigo := (r->>'artigo_id')::uuid;
  IF artigo IS NULL THEN RAISE EXCEPTION 'FALHOU: não publicou no FAQ'; END IF;

  -- E agora é achável por quem NUNCA perguntou.
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', ana, 'role', 'authenticated', 'email', 'ana@teste-ajuda.dev')::text, true);
  r := ajuda_buscar(t, 'bolsão atendimento');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE (x->>'id')::uuid = artigo) THEN
    RAISE EXCEPTION 'FALHOU: o FAQ publicado não é encontrado na busca';
  END IF;
  SELECT * INTO a FROM ajuda_artigos WHERE id = artigo;
  IF a.tipo IS DISTINCT FROM 'faq' OR a.modulo IS DISTINCT FROM 'leads'
     OR a.duvida_id IS DISTINCT FROM duvida THEN
    RAISE EXCEPTION 'FALHOU: o FAQ perdeu o tipo, o módulo ou a dúvida de origem';
  END IF;
  -- Sem título dado, a própria pergunta vira o título — é o que se procura.
  IF a.titulo NOT LIKE 'Por que o bolsão%' THEN
    RAISE EXCEPTION 'FALHOU: o título do FAQ não veio da pergunta — %', a.titulo;
  END IF;
  RAISE NOTICE 'OK 4: dúvida respondida virou FAQ pesquisável (critério de pronto)';

  -- ----------------------------------------------------------
  -- 5. CORRIGIR A RESPOSTA CORRIGE O FAQ
  --
  -- Se não acompanhasse, a versão errada ficaria sendo a que todo mundo lê — e
  -- ninguém descobriria, porque quem corrigiu viu a correção.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-ajuda.dev')::text, true);
  PERFORM ajuda_responder(duvida, 'Resposta corrigida: também conta ligação registrada.');
  SELECT * INTO a FROM ajuda_artigos WHERE id = artigo;
  IF a.texto NOT LIKE 'Resposta corrigida%' THEN
    RAISE EXCEPTION 'FALHOU: o FAQ ficou com a resposta velha — %', left(a.texto, 40);
  END IF;
  SELECT * INTO d FROM ajuda_duvidas WHERE id = duvida;
  IF d.status IS DISTINCT FROM 'publicada' THEN
    RAISE EXCEPTION 'FALHOU: corrigir a resposta despublicou o FAQ (status=%)', d.status;
  END IF;

  -- E publicar duas vezes não cria dois FAQ para a mesma pergunta.
  r := ajuda_publicar_no_faq(duvida);
  IF (r->>'ja_publicada')::boolean IS DISTINCT FROM true
     OR (r->>'artigo_id')::uuid IS DISTINCT FROM artigo THEN
    RAISE EXCEPTION 'FALHOU: publicou a mesma dúvida duas vezes — %', r;
  END IF;
  RAISE NOTICE 'OK 5: corrigir a resposta corrige o FAQ, e não duplica';

  -- ----------------------------------------------------------
  -- 6. O MANUAL DA PLATAFORMA NÃO É REESCRITO POR UMA CASA SÓ
  --
  -- Ele vale para todas; deixar uma imobiliária editá-lo mudaria o manual das
  -- outras sem que ninguém pedisse.
  -- ----------------------------------------------------------
  SELECT id INTO artigo FROM ajuda_artigos WHERE tenant_id IS NULL LIMIT 1;
  BEGIN
    PERFORM ajuda_artigo_salvar(t, 'Manual sequestrado', 'texto novo', 'geral', 'manual', artigo);
    RAISE EXCEPTION 'FALHOU: uma imobiliária editou o manual da plataforma';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Mas a casa escreve o artigo dela normalmente.
  r := ajuda_artigo_salvar(t, 'Como a Lotus faz o plantão', 'Texto da casa.', 'leads');
  IF (r->>'artigo_id') IS NULL THEN RAISE EXCEPTION 'FALHOU: a casa não conseguiu criar artigo'; END IF;
  RAISE NOTICE 'OK 6: o manual da plataforma é só do dono dela';

  -- ----------------------------------------------------------
  -- 7. A VIZINHA NÃO LÊ O QUE É DESTA CASA
  --
  -- O artigo da plataforma é de todos; o da casa, não.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', fora, 'role', 'authenticated', 'email', 'fora@teste-ajuda.dev')::text, true);
  r := ajuda_buscar(t2, 'plantão');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'titulo' LIKE '%Lotus%') THEN
    RAISE EXCEPTION 'FALHOU: a vizinha leu o artigo da casa ao lado';
  END IF;
  IF ajuda_buscar(t) IS NOT NULL OR ajuda_duvidas_lista(t) IS NOT NULL
     OR ajuda_responder(duvida, 'resposta alheia') IS NOT NULL
     OR ajuda_problemas_reportados(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha alcançou a ajuda da outra imobiliária';
  END IF;
  RAISE NOTICE 'OK 7: a vizinha não alcança';

  -- ----------------------------------------------------------
  -- 8. OS PROBLEMAS REPORTADOS PASSAM A TER PARA ONDE IR
  --
  -- O botão "Reportar um problema" gravava em `bug_reports` e o repositório
  -- inteiro tinha UMA referência à tabela: o INSERT. Ninguém lia.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO bug_reports (tenant_id, user_id, title, description, type, priority, category, status, url)
  VALUES (t::text, ana, 'A tela de metas não abre', 'Fica girando', 'bug', 'high', 'general', 'open', '/metas');

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-ajuda.dev')::text, true);
  r := ajuda_problemas_reportados(t);
  IF jsonb_array_length(r) <> 1 OR r->0->>'titulo' IS DISTINCT FROM 'A tela de metas não abre' THEN
    RAISE EXCEPTION 'FALHOU: o problema reportado não chegou a quem administra — %', r;
  END IF;
  -- O endereço de onde foi reportado é o que localiza o problema.
  IF r->0->>'url' IS DISTINCT FROM '/metas' THEN
    RAISE EXCEPTION 'FALHOU: perdeu a tela de onde o problema foi reportado';
  END IF;
  -- E QUEM reportou. Antes de 22/09 o botão gravava o id de quem reportou no
  -- campo do id do reporte, e `user_id` ficava vazio — então nem abrindo a
  -- tabela dava para saber de quem era a queixa.
  IF r->0->>'quem' IS DISTINCT FROM 'ana@teste-ajuda.dev' THEN
    RAISE EXCEPTION 'FALHOU: não dá para saber quem reportou — %', r->0->>'quem';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', ana, 'role', 'authenticated', 'email', 'ana@teste-ajuda.dev')::text, true);
  IF ajuda_problemas_reportados(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora leu os problemas reportados por todo mundo';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 8: o que é reportado agora tem para onde ir, e com autor';

  -- ----------------------------------------------------------
  -- 9. `bug_reports` GANHOU CHAVE PRIMÁRIA
  --
  -- Ela nunca teve. Por isso os quatro reportes de produção puderam ficar com
  -- o MESMO identificador sem nada reclamar.
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bug_reports'::regclass AND contype = 'p') THEN
    RAISE EXCEPTION 'FALHOU: bug_reports continua sem chave primária';
  END IF;
  RAISE NOTICE 'OK 9: bug_reports tem chave primária';
END $$;

-- ----------------------------------------------------------
-- 10. O ANÔNIMO NÃO ALCANÇA
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM ajuda_artigos $$, 'o anônimo leu os artigos');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM ajuda_duvidas $$, 'o anônimo leu as dúvidas');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 10: anônimo barrado'; END $$;

ROLLBACK;

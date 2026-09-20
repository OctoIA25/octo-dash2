-- ============================================================
-- Base de conhecimento por empreendimento (P2.3).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/base_de_conhecimento.test.sql
--
-- O plano define o item como pronto quando: subir um memorial e perguntar
-- "tem varanda gourmet?" traz o trecho certo, e documento vencido ou inativo
-- NÃO é usado. São os casos 1, 3 e 4.
--
-- O terceiro é o que protege o cliente: um memorial vencido responderia com
-- condição que não existe mais, e a LIA repetiria isso como se fosse de hoje.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t     uuid := 'ddddddd1-1111-4111-a111-111111111111';
  lanc  uuid;
  outro uuid;
  d_ok    uuid;
  d_venc  uuid;
  d_off   uuid;
  n int;
  r record;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-kb', 'Teste KB') ON CONFLICT DO NOTHING;
  INSERT INTO lancamentos (tenant_id, nome) VALUES (t, 'Residencial KB')  RETURNING id INTO lanc;
  INSERT INTO lancamentos (tenant_id, nome) VALUES (t, 'Outro Residencial') RETURNING id INTO outro;

  INSERT INTO kb_documentos (tenant_id, lancamento_id, titulo, tipo, conteudo, status_indexacao)
  VALUES (t, lanc, 'Memorial descritivo', 'memorial', 'texto completo', 'indexado')
  RETURNING id INTO d_ok;

  INSERT INTO kb_trechos (tenant_id, documento_id, lancamento_id, ordem, texto) VALUES
    (t, d_ok, lanc, 0, 'As unidades contam com varanda gourmet equipada com churrasqueira a carvão.'),
    (t, d_ok, lanc, 1, 'O condomínio tem piscina aquecida, salão de festas e brinquedoteca.'),
    (t, d_ok, lanc, 2, 'A entrega está prevista para o segundo semestre de 2027.');

  -- ----------------------------------------------------------
  -- 1. "TEM VARANDA GOURMET?" TRAZ O TRECHO CERTO.
  --
  -- É o critério de pronto que o plano escreve. Note o "tem" na pergunta:
  -- uma busca que exigisse TODAS as palavras não acharia nada.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM buscar_kb(lanc, 'tem varanda gourmet?') LIMIT 1;
  IF r.texto IS NULL OR r.texto NOT LIKE '%varanda gourmet%' THEN
    RAISE EXCEPTION 'FALHOU: a pergunta nao trouxe o trecho da varanda (veio "%")', left(coalesce(r.texto,'(nada)'), 40);
  END IF;
  IF r.modo <> 'palavra' THEN
    RAISE EXCEPTION 'FALHOU: sem embedding deveria buscar por palavra, veio "%"', r.modo;
  END IF;
  IF r.documento_titulo <> 'Memorial descritivo' THEN
    RAISE EXCEPTION 'FALHOU: nao disse de qual documento veio o trecho';
  END IF;

  -- Acento e caixa não atrapalham: quem digita "PISCINA AQUECIDA" acha.
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'PISCINA AQUECIDA');
  IF n = 0 THEN RAISE EXCEPTION 'FALHOU: busca sensivel a caixa'; END IF;

  -- Radical: "entregas" acha "entrega".
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'entregas');
  IF n = 0 THEN RAISE EXCEPTION 'FALHOU: busca nao reduz ao radical'; END IF;

  -- ----------------------------------------------------------
  -- 2. PERGUNTA SEM RESPOSTA DEVOLVE VAZIO — e não o trecho mais próximo.
  --
  -- É o que faz a LIA cair no plantão em vez de inventar: sem trecho
  -- relevante, ela não tem com o que responder.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'aceita animal de estimação?');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: pergunta sem resposta devolveu % trecho(s)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 3. DOCUMENTO VENCIDO NÃO É USADO.
  --
  -- Tabela de preço e condição envelhecem, e a LIA cita isso para cliente.
  -- ----------------------------------------------------------
  INSERT INTO kb_documentos (tenant_id, lancamento_id, titulo, tipo, conteudo, valido_ate, status_indexacao)
  VALUES (t, lanc, 'Tabela antiga', 'outro', 'x', current_date - 1, 'indexado')
  RETURNING id INTO d_venc;
  INSERT INTO kb_trechos (tenant_id, documento_id, lancamento_id, ordem, texto)
  VALUES (t, d_venc, lanc, 0, 'A varanda gourmet custava dez mil reais a mais em 2024.');

  SELECT count(*) INTO n FROM buscar_kb(lanc, 'varanda gourmet') WHERE documento_id = d_venc;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: documento VENCIDO apareceu na busca';
  END IF;

  -- Vence HOJE ainda vale: o dia da validade é o último dia válido, não o
  -- primeiro inválido.
  UPDATE kb_documentos SET valido_ate = current_date WHERE id = d_venc;
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'varanda gourmet') WHERE documento_id = d_venc;
  IF n = 0 THEN
    RAISE EXCEPTION 'FALHOU: documento que vence hoje foi descartado cedo demais';
  END IF;

  -- ----------------------------------------------------------
  -- 4. DOCUMENTO INATIVO NÃO É USADO.
  -- ----------------------------------------------------------
  INSERT INTO kb_documentos (tenant_id, lancamento_id, titulo, tipo, conteudo, ativo, status_indexacao)
  VALUES (t, lanc, 'Rascunho', 'outro', 'x', false, 'indexado')
  RETURNING id INTO d_off;
  INSERT INTO kb_trechos (tenant_id, documento_id, lancamento_id, ordem, texto)
  VALUES (t, d_off, lanc, 0, 'Piscina aquecida com raia de 25 metros, versão não aprovada.');

  SELECT count(*) INTO n FROM buscar_kb(lanc, 'piscina') WHERE documento_id = d_off;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: documento INATIVO apareceu na busca';
  END IF;

  -- ----------------------------------------------------------
  -- 5. A BUSCA É DO EMPREENDIMENTO PEDIDO, e não da imobiliária toda.
  --
  -- Responder sobre outro empreendimento é pior que não responder: o cliente
  -- recebe a informação de um prédio que não é o que ele perguntou.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM buscar_kb(outro, 'varanda gourmet');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: trecho de um empreendimento apareceu na busca de outro';
  END IF;

  -- ----------------------------------------------------------
  -- 6. DOCUMENTO SEM ARQUIVO E SEM TEXTO NÃO ENTRA.
  --
  -- Ficaria eternamente "pendente", enchendo a fila do gestor com algo que
  -- ninguém consegue resolver.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO kb_documentos (tenant_id, lancamento_id, titulo, tipo) VALUES (t, lanc, 'Vazio', 'outro');
    RAISE EXCEPTION 'FALHOU: aceitou documento sem arquivo e sem texto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 7. A CHAVE DO NAVEGADOR NÃO LÊ NADA DISTO.
  --
  -- Memorial e regulamento trazem cláusula e condição que não são para o
  -- site público.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name IN ('kb_documentos', 'kb_trechos') AND grantee = 'anon';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: anon tem % privilegio(s) na base de conhecimento', n;
  END IF;

  -- E o usuário logado NÃO escreve trecho: quem indexa é a LIA, com a chave
  -- de serviço. Trecho que o usuário escreve deixa de ser o que o documento
  -- diz e passa a ser o que alguém digitou.
  SELECT count(*) INTO n FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'kb_trechos'
    AND grantee = 'authenticated' AND privilege_type <> 'SELECT';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: usuario logado pode escrever trecho (% privilegio(s))', n;
  END IF;

  -- ----------------------------------------------------------
  -- 8. APAGAR O DOCUMENTO LEVA OS TRECHOS JUNTO.
  -- ----------------------------------------------------------
  DELETE FROM kb_documentos WHERE id = d_ok;
  SELECT count(*) INTO n FROM kb_trechos WHERE documento_id = d_ok;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: % trecho(s) orfaos apos apagar o documento', n;
  END IF;

  RAISE NOTICE 'base_de_conhecimento: 8 casos OK';
END $$;

ROLLBACK;

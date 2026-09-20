-- ============================================================
-- Plantão com fila e aprendizado (P2.4).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/plantao_da_lia.test.sql
--
-- O caso 6 é o que o plano chama de "pronto": depois de salva na base, a mesma
-- pergunta tem que ser achada pela busca — sem plantão, e sem esperar a LIA
-- indexar. Se ele falhar, o ciclo não fecha, por mais que a tela funcione.
--
-- O caso 1 existe porque `lia_perguntas_corretor` carrega telefone de cliente e
-- foi fechada para `authenticated` em 18/09. A tela lê por SECURITY DEFINER, que
-- passa por cima da RLS: a pertinência é conferida à mão dentro da função, e é
-- isso que este caso prova.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t     uuid := 'bbbbbbb1-1111-4111-a111-111111111111';  -- a imobiliária do teste
  t2    uuid := 'bbbbbbb9-9999-4111-a111-111111111111';  -- a vizinha
  u     uuid := 'bbbbbbb2-2222-4111-a111-111111111111';  -- admin de t
  u_fora uuid := 'bbbbbbb3-3333-4111-a111-111111111111'; -- logado, mas de fora
  lanc  uuid;
  lanc2 uuid;
  lead  uuid;
  doc   uuid;
  fila  jsonb;
  regua jsonb;
  res   jsonb;
  n     int;
  b     boolean;
BEGIN
  -- `user_profiles` é VIEW sobre auth.users: o nome mora em raw_user_meta_data.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (u, 'plantao@teste.dev', jsonb_build_object('name', 'Corretora do Plantão')),
         (u_fora, 'fora@teste.dev', '{}'::jsonb)
  ON CONFLICT DO NOTHING;

  INSERT INTO tenants (id, code, name)
  VALUES (t, 'teste-plantao', 'Teste Plantão'), (t2, 'teste-plantao-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO lancamentos (tenant_id, nome) VALUES (t, 'Residencial Teste') RETURNING id INTO lanc;
  INSERT INTO lancamentos (tenant_id, nome) VALUES (t2, 'Prédio da Vizinha') RETURNING id INTO lanc2;
  INSERT INTO leads (tenant_id, name) VALUES (t, 'Cliente Teste') RETURNING id INTO lead;

  -- Quatro perguntas: uma esperando, uma estourada, uma respondida de verdade e
  -- uma "resolvida fora do canal".
  INSERT INTO lia_perguntas_corretor
    (id, tenant_id, lead_id, pergunta, status, criado_em, respondida_em, resposta_corretor, corretor_id)
  VALUES
    ('p-esperando', t, lead, 'O prédio tem elevador?', 'pendente',
     now() - interval '10 minutes', NULL, NULL, u::text),
    ('p-estourada', t, lead, 'Aceita pet de grande porte?', 'expirada',
     now() - interval '3 days', NULL, NULL, u::text),
    ('p-respondida', t, lead, 'Qual o horário de visita aos sábados?', 'respondida',
     now() - interval '2 hours', now() - interval '1 hour',
     'As visitas de sábado são das 9h às 13h, com agendamento na véspera.', u::text),
    ('p-fora', t, lead, 'Pode mandar a planta?', 'respondida',
     now() - interval '5 hours', now() - interval '4 hours',
     '[resolvida fora do canal] Corretora mandou direto pro cliente', u::text);

  -- Como o admin de t, daqui para a frente.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. A FILA É DE QUEM PERTENCE À IMOBILIÁRIA.
  --
  -- SECURITY DEFINER ignora a RLS. Sem a checagem de membership dentro da
  -- função, qualquer usuário logado leria o plantão — com telefone de cliente —
  -- de todas as imobiliárias.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF plantao_fila(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu a fila do plantão';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 2. "AGUARDANDO" INCLUI A QUE ESTOUROU O PRAZO.
  --
  -- Uma pergunta expirada continua sem resposta. Tirá-la da aba faria a fila
  -- parecer limpa exatamente quando o cliente ficou sem retorno.
  -- ----------------------------------------------------------
  fila := plantao_fila(t, 'aguardando');
  SELECT jsonb_array_length(fila->'linhas') INTO n;
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: aba Aguardando trouxe % linhas (esperava 2: a pendente e a expirada)', n;
  END IF;
  IF (fila->'contadores'->>'aguardando')::int <> 1
     OR (fila->'contadores'->>'expiradas')::int <> 1
     OR (fila->'contadores'->>'respondidas')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: contadores errados — %', fila->'contadores';
  END IF;

  -- A régua padrão é a do plano, mesmo sem ninguém ter configurado nada.
  IF (fila->>'espera_maxima_minutos')::int <> 30 OR (fila->>'configurado')::boolean THEN
    RAISE EXCEPTION 'FALHOU: padrão da espera máxima deveria ser 30 min e não-configurado, veio % / %',
      fila->>'espera_maxima_minutos', fila->>'configurado';
  END IF;

  -- ----------------------------------------------------------
  -- 3. "RESOLVIDA FORA DO CANAL" VEM MARCADA.
  --
  -- São 331 das 1.540 respostas reais. Salvar uma dessas na base ensinaria a
  -- LIA a responder "resolvida fora do canal" ao próximo cliente.
  -- ----------------------------------------------------------
  fila := plantao_fila(t, 'respondidas');
  SELECT count(*) INTO n
    FROM jsonb_array_elements(fila->'linhas') l
   WHERE (l->>'fora_do_canal')::boolean;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: marcou % respostas como fora do canal (esperava 1)', n;
  END IF;

  -- O nome do corretor sai resolvido, não o UUID.
  SELECT count(*) INTO n
    FROM jsonb_array_elements(fila->'linhas') l
   WHERE l->>'corretor_nome' = 'Corretora do Plantão';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: resolveu o nome do corretor em % linhas (esperava 2)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 4. SALVAR NA BASE GRAVA DOCUMENTO, TRECHO E MARCAÇÃO — OU NADA.
  -- ----------------------------------------------------------
  res := plantao_salvar_na_base('p-respondida', 'Horário de visita aos sábados',
                                'As visitas de sábado são das 9h às 13h, com agendamento na véspera.');
  IF NOT (res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FALHOU: salvar na base recusou — %', res->>'motivo';
  END IF;
  IF NOT (res->>'geral')::boolean THEN
    RAISE EXCEPTION 'FALHOU: pergunta sem empreendimento deveria virar documento GERAL';
  END IF;
  doc := (res->>'documento_id')::uuid;

  SELECT count(*) INTO n FROM kb_trechos WHERE documento_id = doc;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: gravou % trechos (esperava 1 — a resposta já buscável)', n;
  END IF;

  SELECT aprovada_para_base, aprovada_por = u
    INTO b, b
    FROM lia_perguntas_corretor WHERE id = 'p-respondida';
  IF NOT b THEN
    RAISE EXCEPTION 'FALHOU: a pergunta não ficou marcada como aprovada por quem salvou';
  END IF;

  -- ----------------------------------------------------------
  -- 5. DOIS CLIQUES NÃO VIRAM DUAS RESPOSTAS NA BASE.
  -- ----------------------------------------------------------
  res := plantao_salvar_na_base('p-respondida', 'Horário de visita aos sábados', 'texto qualquer');
  IF NOT (res->>'ja_existia')::boolean OR (res->>'documento_id')::uuid <> doc THEN
    RAISE EXCEPTION 'FALHOU: o segundo clique criou um segundo documento — %', res;
  END IF;
  SELECT count(*) INTO n FROM kb_documentos WHERE tenant_id = t AND tipo = 'resposta_plantao';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: % documentos de plantão na base (esperava 1)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 6. O CICLO DO PLANO: A MESMA PERGUNTA JÁ É RESPONDIDA PELA BASE.
  --
  -- Critério textual do plano. A resposta foi salva SEM empreendimento, e mesmo
  -- assim tem que aparecer quando se pergunta sobre um empreendimento — é
  -- conhecimento da imobiliária, vale para todos.
  --
  -- E tem que valer AGORA: se dependesse da LIA indexar, o gestor salvaria, a
  -- próxima pergunta igual abriria plantão de novo, e ninguém entenderia por quê.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'horário de visita no sábado');
  IF n < 1 THEN
    RAISE EXCEPTION 'FALHOU: a resposta salva na base não é achada pela busca — o ciclo não fecha';
  END IF;

  -- Buscar sem lançamento nenhum também acha (pergunta geral).
  SELECT count(*) INTO n
    FROM buscar_kb(NULL, 'horário de visita no sábado', 5, NULL, t);
  IF n < 1 THEN
    RAISE EXCEPTION 'FALHOU: busca geral (sem empreendimento) não achou a resposta';
  END IF;

  -- ----------------------------------------------------------
  -- 6b. O CLIENTE NÃO PERGUNTA COM AS PALAVRAS DO DOCUMENTO.
  --
  -- Este caso nasceu de um defeito encontrado no navegador: a resposta estava
  -- salva e indexada, e "posso visitar no sabado?" não achava nada. Duas
  -- causas — a busca exigia TODAS as palavras, e o acento decidia.
  --
  -- O caso 6 não pegava porque perguntava com as palavras exatas do texto, que
  -- é o único jeito de perguntar que ninguém usa de verdade.
  -- ----------------------------------------------------------
  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'horário de visita no sábado',
      'visita sábado',
      'visita sabado',            -- sem acento
      'posso visitar no sábado?', -- palavra a mais, que não está no texto
      'posso visitar no sabado?', -- as duas coisas juntas
      'que horas abre no sábado',
      'tem visita no fim de semana?'
    ]) q
    WHERE NOT EXISTS (SELECT 1 FROM buscar_kb(lanc, q))
  LOOP
    RAISE EXCEPTION 'FALHOU: alguma forma natural de perguntar não acha a resposta salva';
  END LOOP;

  -- E não virou vale-tudo: afrouxar só vale quando o preciso não acha nada.
  SELECT count(*) INTO n FROM buscar_kb(lanc, 'qual a cor da fachada?');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: pergunta sem relação trouxe % trechos', n;
  END IF;

  -- ----------------------------------------------------------
  -- 7. O CONHECIMENTO GERAL NÃO ATRAVESSA A PAREDE DA IMOBILIÁRIA.
  --
  -- O trecho geral não tem lançamento para filtrar por tenant; se o filtro por
  -- tenant falhar, o horário de visita desta imobiliária responde ao cliente da
  -- vizinha.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  SELECT count(*) INTO n FROM buscar_kb(lanc2, 'horário de visita no sábado');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: a vizinha achou % trechos do conhecimento geral alheio', n;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 8. APAGAR O DOCUMENTO DEVOLVE A PERGUNTA À FILA DE APRENDIZADO.
  --
  -- `aprovada_para_base` é derivada de `kb_documento_id` justamente para não
  -- sobrar uma pergunta marcada como aprendida apontando para nada.
  -- ----------------------------------------------------------
  DELETE FROM kb_documentos WHERE id = doc;
  SELECT aprovada_para_base INTO b FROM lia_perguntas_corretor WHERE id = 'p-respondida';
  IF b THEN
    RAISE EXCEPTION 'FALHOU: documento apagado e a pergunta continua marcada como aprovada';
  END IF;

  -- ----------------------------------------------------------
  -- 9. A RÉGUA DIZ O QUE FARIA — E DIZ QUANDO NÃO SABE.
  --
  -- Sem plantão respondido no período, `pct_dentro` tem que ser NULO, não zero:
  -- zero por cento leria como "nenhuma cumpriu", quando a verdade é "não houve
  -- nada para medir". Foi esse tipo de zero que fez a visit_date enganar todo
  -- mundo por meses.
  -- ----------------------------------------------------------
  regua := plantao_regua(t, 30);
  -- Duas respondidas, ambas em 1h: nenhuma cabe em 30 min.
  IF (regua->>'respondidas')::int <> 2 OR (regua->>'dentro_do_prazo')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: régua de 30 min contou errado — %', regua;
  END IF;
  IF (regua->>'pct_dentro')::numeric <> 0.0 THEN
    RAISE EXCEPTION 'FALHOU: com amostra e nenhuma dentro, pct_dentro deveria ser 0 — %', regua;
  END IF;

  regua := plantao_regua(t, 120);
  IF (regua->>'dentro_do_prazo')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: régua de 2h deveria abraçar as duas respostas de 1h — %', regua;
  END IF;

  regua := plantao_regua(t2, 30);
  IF regua->>'pct_dentro' IS NOT NULL OR (regua->>'respondidas')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: sem amostra, pct_dentro tem que ser nulo — %', regua;
  END IF;

  -- ----------------------------------------------------------
  -- 10. NÃO SE SALVA RESPOSTA VAZIA NA BASE.
  -- ----------------------------------------------------------
  res := plantao_salvar_na_base('p-esperando', 'Elevador', '   ');
  IF (res->>'ok')::boolean OR res->>'motivo' <> 'conteudo_vazio' THEN
    RAISE EXCEPTION 'FALHOU: aceitou salvar resposta vazia na base — %', res;
  END IF;

  RAISE NOTICE 'OK: plantão da LIA — 12 casos';
END $$;

ROLLBACK;

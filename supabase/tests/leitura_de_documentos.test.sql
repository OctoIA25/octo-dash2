-- ============================================================
-- Leitura de documentos (P4.7).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/leitura_de_documentos.test.sql
--
-- OS TRÊS CRITÉRIOS DE PRONTO DO PLANO, nos casos 4, 5 e 9:
--   · Nenhum dado de documento entra no cadastro sem confirmação humana.
--   · CPF inválido e holerite velho são sinalizados.
--   · Um layout repetido passa a ser lido por regra.
--
-- O caso 4 é o que protege a Regra 1, que é a que sustenta todas as outras: se
-- a leitura automática conseguir marcar um documento como conferido, o resto
-- do arquivo vira decoração.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fff8888-0000-4000-a000-000000000001';
  t2 uuid := '2fff8888-0000-4000-a000-000000000002';
  gestor uuid := '2fff8889-0000-4000-a000-000000000001';
  dono uuid := '2fff8889-0000-4000-a000-000000000002';
  outro uuid := '2fff8889-0000-4000-a000-000000000003';
  fora uuid := '2fff8889-0000-4000-a000-000000000009';
  lead1 uuid;
  doc uuid;
  doc2 uuid;
  r jsonb;
  d public.documentos_cliente%ROWTYPE;
  c public.documento_campos%ROWTYPE;
  pad public.documento_padroes%ROWTYPE;
  i integer;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-doc.dev'), (dono, 'dono@teste-doc.dev'),
    (outro, 'outro@teste-doc.dev'), (fora, 'fora@teste-doc.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-doc', 'Teste Documentos'), (t2, 'teste-doc-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, gestor, 'admin'), (t, dono, 'corretor'), (t, outro, 'corretor'), (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO leads (tenant_id, name, phone, status, assigned_agent_id, created_at)
  VALUES (t, 'Cliente com pasta', '11955554444', 'Proposta Criada', dono::text, '2026-09-01')
  RETURNING id INTO lead1;

  -- ----------------------------------------------------------
  -- 1. O DÍGITO DO CPF
  --
  -- Não existia validação de CPF em lugar nenhum do repositório — só máscara.
  -- O teste da máscara usa '12345678901', que é inválido, e passa.
  -- ----------------------------------------------------------
  -- ATENÇÃO À FORMA DA AFIRMAÇÃO. A primeira versão deste teste usava
  -- `IF NOT cnpj_valido(x) THEN falhar` e passava com a função QUEBRADA: o
  -- vetor de pesos tinha doze posições e o índice treze vinha NULL, então a
  -- soma virava NULL e a função devolvia NULL. `NOT NULL` é NULL, `IF NULL`
  -- não dispara, e o teste ficava verde enquanto a validação inteira passava
  -- batido — o defeito só apareceu no navegador, confirmando um CNPJ inválido.
  -- Por isso cada caso afirma o valor EXATO com IS DISTINCT FROM: é a única
  -- forma que enxerga NULL.
  IF cpf_valido('529.982.247-25') IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: recusou um CPF válido'; END IF;
  IF cpf_valido('52998224725') IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: recusou o mesmo CPF sem máscara'; END IF;
  IF cpf_valido('123.456.789-01') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: o CPF do teste da máscara não foi recusado'; END IF;
  IF cpf_valido('111.111.111-11') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: 111.111.111-11 não foi recusado — passa na conta e não é CPF'; END IF;
  IF cpf_valido('000.000.000-00') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: zeros não foram recusados'; END IF;
  IF cpf_valido('5299822472') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: tamanho errado não foi recusado'; END IF;
  IF cpf_valido('') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: vazio não foi recusado'; END IF;
  IF cpf_valido(NULL) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: nulo não foi recusado'; END IF;
  -- Um dígito trocado no fim: é o erro de digitação mais comum.
  IF cpf_valido('529.982.247-26') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CPF com o último dígito trocado não foi recusado'; END IF;
  RAISE NOTICE 'OK 1: o dígito do CPF é conferido';

  IF cnpj_valido('11.222.333/0001-81') IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: recusou um CNPJ válido'; END IF;
  IF cnpj_valido('11.444.777/0001-61') IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: recusou o segundo CNPJ válido'; END IF;
  IF cnpj_valido('11.222.333/0001-82') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CNPJ com dígito errado não foi recusado'; END IF;
  -- Este é o que passou em produção de mentira: o segundo dígito trocado.
  IF cnpj_valido('11.222.333/0001-99') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CNPJ terminado em 99 não foi recusado'; END IF;
  IF cnpj_valido('11.111.111/1111-11') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CNPJ repetido não foi recusado'; END IF;
  IF cnpj_valido('123') IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CNPJ curto não foi recusado'; END IF;
  IF cnpj_valido(NULL) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FALHOU: CNPJ nulo não foi recusado'; END IF;
  RAISE NOTICE 'OK 1b: e o do CNPJ também — com afirmação que enxerga NULL';

  -- ----------------------------------------------------------
  -- 2. O ARQUIVO SOBE E OS CAMPOS ESPERADOS NASCEM EM BRANCO
  --
  -- É o que faz a tela funcionar HOJE, com a LIA ainda não lendo nada: a
  -- pessoa abre e digita. A leitura automática só poupa trabalho.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gestor, 'role', 'authenticated', 'email', 'gestor@teste-doc.dev')::text, true);

  r := documento_registrar(t, lead1, 'holerite',
         format('%s/%s/holerite-set.pdf', t, lead1), 'holerite-set.pdf');
  doc := (r->>'documento_id')::uuid;
  IF doc IS NULL THEN RAISE EXCEPTION 'FALHOU: o documento não foi registrado'; END IF;

  SELECT count(*) INTO n FROM documento_campos WHERE documento_id = doc;
  IF n IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FALHOU: o holerite devia abrir com os 7 campos do catálogo, abriu %', n;
  END IF;
  SELECT * INTO d FROM documentos_cliente WHERE id = doc;
  IF d.status IS DISTINCT FROM 'enviado' OR d.lido_por IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: documento recém-enviado devia estar em "enviado" e sem leitor';
  END IF;
  RAISE NOTICE 'OK 2: o arquivo entrou e os 7 campos do holerite nasceram em branco';

  -- ----------------------------------------------------------
  -- 3. O ESQUEMA É O CONTRATO (Regra 4)
  --
  -- A LIA só pode responder nos campos declarados. Campo inventado é
  -- DESCARTADO e dito na resposta — gravar devolveria a conferência ao texto
  -- livre, que é justamente o que a regra 4 existe para impedir.
  -- ----------------------------------------------------------
  r := documento_esquema('holerite');
  IF jsonb_array_length(r->'campos') IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FALHOU: o esquema do holerite devia ter 7 campos';
  END IF;

  r := documento_leitura_recebida(doc, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva','confianca',0.97,'ancora','linha 3'),
    jsonb_build_object('campo','empregador','valor','Construtora X','confianca',0.95,'ancora','topo'),
    jsonb_build_object('campo','competencia','valor','2026-09-01','confianca',0.93,'ancora','cabeçalho'),
    jsonb_build_object('campo','bruto','valor','5000','confianca',0.99,'ancora','total proventos'),
    jsonb_build_object('campo','descontos','valor','1000','confianca',0.99,'ancora','total descontos'),
    jsonb_build_object('campo','liquido','valor','4000','confianca',0.99,'ancora','líquido'),
    jsonb_build_object('campo','signo_do_empregador','valor','Áries','confianca',1.0)
  ));
  IF (r->>'gravados')::int IS DISTINCT FROM 6
     OR (r->>'fora_do_esquema')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: o campo fora do esquema devia ser descartado e dito — %', r;
  END IF;
  RAISE NOTICE 'OK 3: campo fora do esquema é descartado e a resposta avisa';

  -- ----------------------------------------------------------
  -- 4. A LEITURA NÃO MARCA COMO CONFERIDO — CRITÉRIO DE PRONTO Nº 1
  --
  -- "Nenhum dado de documento entra no cadastro sem confirmação humana."
  -- Esta é a Regra 1, e é a que sustenta o resto: se a leitura automática
  -- conseguisse conferir, todas as outras regras viravam decoração.
  -- ----------------------------------------------------------
  SELECT * INTO d FROM documentos_cliente WHERE id = doc;
  IF d.status IS DISTINCT FROM 'lido' OR d.lido_por IS DISTINCT FROM 'ia' THEN
    RAISE EXCEPTION 'FALHOU: depois da leitura o documento devia ficar "lido" por "ia", ficou % por %',
      d.status, d.lido_por;
  END IF;
  IF d.conferido_por IS NOT NULL OR d.conferido_em IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a leitura automática assinou a conferência';
  END IF;
  SELECT count(*) INTO n FROM documento_campos
   WHERE documento_id = doc AND valor_final IS NOT NULL;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: a leitura gravou % valor(es) final(is) — a Regra 1 caiu', n;
  END IF;

  -- E o servidor não consegue confirmar em nome de ninguém.
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM documento_confirmar(doc, jsonb_build_array(
      jsonb_build_object('campo','nome','valor','José da Silva')));
    RAISE EXCEPTION 'FALHOU: confirmou sem pessoa logada';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK 4: a leitura não confere nada, e sem pessoa ninguém confirma';

  -- ----------------------------------------------------------
  -- 5. CPF INVÁLIDO E HOLERITE VELHO — CRITÉRIO DE PRONTO Nº 2
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gestor, 'role', 'authenticated', 'email', 'gestor@teste-doc.dev')::text, true);

  r := documento_registrar(t, lead1, 'cpf', format('%s/%s/cpf.jpg', t, lead1), 'cpf.jpg');
  doc2 := (r->>'documento_id')::uuid;
  PERFORM documento_leitura_recebida(doc2, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva','confianca',0.99),
    jsonb_build_object('campo','cpf','valor','123.456.789-01','confianca',0.99)
  ));
  SELECT * INTO c FROM documento_campos WHERE documento_id = doc2 AND campo = 'cpf';
  IF c.validacao IS DISTINCT FROM 'erro' OR c.mensagem NOT LIKE '%dígito%' THEN
    RAISE EXCEPTION 'FALHOU: CPF inválido não foi sinalizado — validacao=% mensagem=%',
      c.validacao, c.mensagem;
  END IF;

  -- E confirmar com ele em erro é recusado, inteiro.
  r := documento_confirmar(doc2, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva'),
    jsonb_build_object('campo','cpf','valor','123.456.789-01')));
  IF (r->>'confirmado')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: confirmou um CPF com dígito errado';
  END IF;
  SELECT * INTO d FROM documentos_cliente WHERE id = doc2;
  IF d.status IS DISTINCT FROM 'lido' THEN
    RAISE EXCEPTION 'FALHOU: o documento recusado mudou de status assim mesmo (%)', d.status;
  END IF;

  -- Corrigido, passa.
  r := documento_confirmar(doc2, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva'),
    jsonb_build_object('campo','cpf','valor','529.982.247-25')));
  IF (r->>'confirmado')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: não confirmou com o CPF certo — %', r;
  END IF;
  RAISE NOTICE 'OK 5: CPF inválido barra a confirmação; corrigido, passa';

  -- O holerite de competência velha: 90 dias é o prazo que o plano nomeia.
  UPDATE documento_campos SET valor_sugerido = '2020-01-01'
   WHERE documento_id = doc AND campo = 'competencia';
  PERFORM documento_validar(doc);
  SELECT * INTO c FROM documento_campos WHERE documento_id = doc AND campo = 'competencia';
  IF c.validacao IS DISTINCT FROM 'erro' OR c.mensagem NOT LIKE '%prazo é de 90 dias%' THEN
    RAISE EXCEPTION 'FALHOU: holerite velho não foi sinalizado — %', c.mensagem;
  END IF;
  RAISE NOTICE 'OK 5b: holerite fora do prazo de 90 dias é sinalizado';

  -- ----------------------------------------------------------
  -- 6. CONFIANÇA BAIXA PINTA DE AMARELO, E NÃO DE VERMELHO (Regra 2)
  --
  -- Alerta não é erro: não impede a confirmação, só manda olhar. Tratar os
  -- dois igual faria a pessoa aprender a ignorar os dois.
  -- ----------------------------------------------------------
  UPDATE documento_campos SET valor_sugerido = '2026-09-01', confianca = 0.42
   WHERE documento_id = doc AND campo = 'competencia';
  PERFORM documento_validar(doc);
  SELECT * INTO c FROM documento_campos WHERE documento_id = doc AND campo = 'competencia';
  IF c.validacao IS DISTINCT FROM 'alerta' OR c.mensagem NOT LIKE '%42%' THEN
    RAISE EXCEPTION 'FALHOU: confiança de 0,42 devia virar alerta com o número — % / %',
      c.validacao, c.mensagem;
  END IF;

  -- E o erro de verdade tem precedência: um CPF errado com confiança alta
  -- continua sendo erro, não alerta.
  r := documento_confirmar(doc, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva'),
    jsonb_build_object('campo','empregador','valor','Construtora X'),
    jsonb_build_object('campo','competencia','valor','2026-09-01'),
    jsonb_build_object('campo','bruto','valor','5000'),
    jsonb_build_object('campo','descontos','valor','1000'),
    jsonb_build_object('campo','liquido','valor','4000')));
  IF (r->>'confirmado')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: o alerta impediu a confirmação, e não devia — %', r;
  END IF;
  RAISE NOTICE 'OK 6: confiança baixa avisa sem travar';

  -- ----------------------------------------------------------
  -- 7. O NOME TEM DE BATER ENTRE OS DOCUMENTOS DO MESMO CLIENTE
  --
  -- É a validação que pega a troca de arquivo — o holerite do cônjuge subindo
  -- como se fosse o do proponente.
  -- ----------------------------------------------------------
  r := documento_registrar(t, lead1, 'residencia',
         format('%s/%s/conta-luz.pdf', t, lead1), 'conta-luz.pdf');
  PERFORM documento_leitura_recebida((r->>'documento_id')::uuid, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','Maria de Souza','confianca',0.99),
    jsonb_build_object('campo','endereco','valor','Rua A, 100','confianca',0.99),
    jsonb_build_object('campo','emissao','valor','2026-09-15','confianca',0.99)
  ));
  SELECT * INTO c FROM documento_campos
   WHERE documento_id = (r->>'documento_id')::uuid AND campo = 'nome';
  IF c.validacao IS DISTINCT FROM 'erro' OR c.mensagem NOT LIKE '%não bate%' THEN
    RAISE EXCEPTION 'FALHOU: nome diferente dos outros documentos não foi sinalizado — %', c.mensagem;
  END IF;

  -- Mas acento não é nome diferente: "JOSE" e "José" são a mesma pessoa.
  UPDATE documento_campos SET valor_sugerido = 'JOSE DA SILVA'
   WHERE documento_id = (r->>'documento_id')::uuid AND campo = 'nome';
  PERFORM documento_validar((r->>'documento_id')::uuid);
  SELECT * INTO c FROM documento_campos
   WHERE documento_id = (r->>'documento_id')::uuid AND campo = 'nome';
  IF c.validacao = 'erro' THEN
    RAISE EXCEPTION 'FALHOU: acusou diferença entre "JOSE DA SILVA" e "José da Silva"';
  END IF;
  RAISE NOTICE 'OK 7: nome trocado acusa, acento e caixa não';

  -- ----------------------------------------------------------
  -- 8. RECUSAR EXIGE MOTIVO
  --
  -- Quem enviou precisa saber o que refazer. "Recusado" sem motivo devolve a
  -- pessoa ao começo sem dizer o quê.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM documento_recusar((r->>'documento_id')::uuid, '   ');
    RAISE EXCEPTION 'FALHOU: recusou sem motivo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 8: recusar sem motivo é barrado';

  -- ----------------------------------------------------------
  -- 9. DEZ ACERTOS SEGUIDOS VIRAM REGRA — CRITÉRIO DE PRONTO Nº 3
  --
  -- "Com 10 acertos seguidos, a regra vira ativa e o documento daquele layout
  -- é lido sem IA. Errou → volta a candidata."
  -- ----------------------------------------------------------
  FOR i IN 1..10 LOOP
    r := documento_registrar(t, lead1, 'cpf',
           format('%s/%s/cpf-%s.jpg', t, lead1, i), format('cpf-%s.jpg', i));
    doc2 := (r->>'documento_id')::uuid;
    PERFORM documento_leitura_recebida(doc2, jsonb_build_array(
      jsonb_build_object('campo','nome','valor','José da Silva','confianca',0.99,'ancora','linha 1 do RG'),
      jsonb_build_object('campo','cpf','valor','529.982.247-25','confianca',0.99,'ancora','abaixo do nome')
    ));
    -- A pessoa confirma sem mudar nada: é isso que conta como acerto.
    PERFORM documento_confirmar(doc2, jsonb_build_array(
      jsonb_build_object('campo','nome','valor','José da Silva'),
      jsonb_build_object('campo','cpf','valor','529.982.247-25')));
  END LOOP;

  SELECT * INTO pad FROM documento_padroes
   WHERE tenant_id = t AND tipo = 'cpf' AND campo = 'cpf' AND ancora = 'abaixo do nome';
  IF pad.acertos < 10 OR pad.estado IS DISTINCT FROM 'ativa' THEN
    RAISE EXCEPTION 'FALHOU: dez acertos seguidos deviam ativar o padrão — acertos=% estado=%',
      pad.acertos, pad.estado;
  END IF;
  RAISE NOTICE 'OK 9: dez acertos seguidos ativaram o padrão';

  -- E um erro zera a conta: layout que às vezes acerta não vira regra.
  r := documento_registrar(t, lead1, 'cpf', format('%s/%s/cpf-x.jpg', t, lead1), 'cpf-x.jpg');
  doc2 := (r->>'documento_id')::uuid;
  PERFORM documento_leitura_recebida(doc2, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva','confianca',0.99,'ancora','linha 1 do RG'),
    jsonb_build_object('campo','cpf','valor','111.444.777-35','confianca',0.99,'ancora','abaixo do nome')
  ));
  -- A pessoa corrige: a correção é a prova de que a âncora errou.
  PERFORM documento_confirmar(doc2, jsonb_build_array(
    jsonb_build_object('campo','nome','valor','José da Silva'),
    jsonb_build_object('campo','cpf','valor','529.982.247-25')));

  SELECT * INTO pad FROM documento_padroes
   WHERE tenant_id = t AND tipo = 'cpf' AND campo = 'cpf' AND ancora = 'abaixo do nome';
  IF pad.acertos <> 0 OR pad.estado IS DISTINCT FROM 'candidata' THEN
    RAISE EXCEPTION 'FALHOU: um erro devia zerar a conta e voltar a candidata — acertos=% estado=%',
      pad.acertos, pad.estado;
  END IF;
  RAISE NOTICE 'OK 9b: um erro zerou a conta e o padrão voltou a candidata';

  -- ----------------------------------------------------------
  -- 10. A PASTA CONTA O QUE FALTA
  -- ----------------------------------------------------------
  r := documento_pasta(t, lead1);
  IF (r->>'total_tipos')::int IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FALHOU: a pasta devia listar os 7 tipos, listou %', r->>'total_tipos';
  END IF;
  IF (r->>'faltam')::int < 1 THEN
    RAISE EXCEPTION 'FALHOU: ainda faltam tipos e a pasta disse que não';
  END IF;
  RAISE NOTICE 'OK 10: a pasta conta o que falta (% de 7)', r->>'faltam';

  -- ----------------------------------------------------------
  -- 11. DOCUMENTO PESSOAL NÃO É DE TODA A EQUIPE
  --
  -- Vê quem administra a casa ou o corretor DONO do lead. O colega de equipe
  -- não — é mais apertado que o resto do sistema de propósito.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', dono, 'role', 'authenticated', 'email', 'dono@teste-doc.dev')::text, true);
  IF documento_pasta(t, lead1) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o corretor dono do lead não vê a pasta do próprio cliente';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated', 'email', 'outro@teste-doc.dev')::text, true);
  IF documento_pasta(t, lead1) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: um corretor viu os documentos do cliente de outro';
  END IF;
  IF documento_abrir(doc) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: um corretor abriu o documento do cliente de outro';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', fora, 'role', 'authenticated', 'email', 'fora@teste-doc.dev')::text, true);
  IF documento_pasta(t, lead1) IS NOT NULL OR documento_abrir(doc) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a imobiliária vizinha alcançou a pasta';
  END IF;
  IF documento_confirmar(doc, '[]'::jsonb) IS NOT NULL
     OR documento_recusar(doc, 'qualquer') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha mexeu no documento alheio';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 11: só o dono do lead e quem administra a casa';

  -- ----------------------------------------------------------
  -- 11b. O ARQUIVO SEGUE A MESMA REGRA DA TELA (Regra 5)
  --
  -- As políticas de 20260824 recortavam o bucket por TENANT: qualquer membro
  -- listava a pasta de qualquer cliente. Provado no banco local em 22/09, um
  -- corretor alheio listou o CPF do cliente de um colega. Proteger a tela e
  -- deixar o armazenamento largo é trancar a vitrine e abrir os fundos.
  -- ----------------------------------------------------------
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('lead-documentos', format('%s/%s/cpf.jpg', t, lead1), NULL)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', dono, 'role', 'authenticated', 'email', 'dono@teste-doc.dev')::text, true);
  IF NOT documento_arquivo_e_meu(ARRAY[t::text, lead1::text]) THEN
    RAISE EXCEPTION 'FALHOU: o corretor dono do lead não alcança o arquivo do próprio cliente';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated', 'email', 'outro@teste-doc.dev')::text, true);
  IF documento_arquivo_e_meu(ARRAY[t::text, lead1::text]) THEN
    RAISE EXCEPTION 'FALHOU: um corretor alcança o arquivo do cliente de outro';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gestor, 'role', 'authenticated', 'email', 'gestor@teste-doc.dev')::text, true);
  IF NOT documento_arquivo_e_meu(ARRAY[t::text, lead1::text]) THEN
    RAISE EXCEPTION 'FALHOU: o admin não alcança o arquivo';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', fora, 'role', 'authenticated', 'email', 'fora@teste-doc.dev')::text, true);
  IF documento_arquivo_e_meu(ARRAY[t::text, lead1::text]) THEN
    RAISE EXCEPTION 'FALHOU: a imobiliária vizinha alcança o arquivo';
  END IF;

  -- Caminho fora do formato vira "não é seu", e não erro de conversão: um
  -- arquivo solto na raiz não pode derrubar a listagem inteira.
  IF documento_arquivo_e_meu(ARRAY['solto.jpg'])
     OR documento_arquivo_e_meu(ARRAY['nao-e-uuid','tambem-nao'])
     OR documento_arquivo_e_meu(NULL) THEN
    RAISE EXCEPTION 'FALHOU: caminho malformado passou';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 11b: o arquivo no bucket segue a mesma regra da tela';

  -- ----------------------------------------------------------
  -- 12. LEITURA NÃO SOBRESCREVE O QUE UMA PESSOA JÁ CONFERIU
  --
  -- A LIA relendo um documento conferido apagaria a decisão de alguém.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM documento_leitura_recebida(doc, jsonb_build_array(
      jsonb_build_object('campo','nome','valor','Outro Nome','confianca',0.99)));
    RAISE EXCEPTION 'FALHOU: a leitura sobrescreveu um documento já conferido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 12: documento conferido não é sobrescrito pela leitura';
END $$;

-- ----------------------------------------------------------
-- 13. O NAVEGADOR NÃO ESCREVE SUGESTÃO
--
-- Se o front pudesse chamar `documento_leitura_recebida`, a Regra 1 cairia por
-- fora: bastaria mandar a sugestão e confirmar em seguida. E o `pg_default_acl`
-- desta base dá tudo ao anônimo em toda relação nova.
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.deve_barrar(
  $$ SELECT documento_leitura_recebida('00000000-0000-4000-a000-000000000001'::uuid, '[]'::jsonb) $$,
  'o navegador gravou leitura automática');
SELECT pg_temp.deve_barrar(
  $$ SELECT documento_aprender('00000000-0000-4000-a000-000000000001'::uuid) $$,
  'o navegador mexeu nos padrões aprendidos');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM documento_campos $$,
  'o autenticado leu a tabela de campos direto');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM documentos_cliente $$,
  'o anônimo leu os documentos dos clientes');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM documento_campos $$,
  'o anônimo leu os campos lidos dos documentos');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 13: navegador e anônimo barrados'; END $$;

ROLLBACK;

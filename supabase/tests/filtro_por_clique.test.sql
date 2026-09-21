-- ============================================================
-- Filtro clicando na linha (P3.2).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/filtro_por_clique.test.sql
--
-- O caso 3 é o que só apareceu no navegador: a tabela da dimensão filtrada não
-- pode filtrar a si mesma, senão o SHIFT + clique — que o plano pede para somar
-- um segundo item — fica sem nada para clicar.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t   uuid := 'bbbbbcc1-1111-4111-a111-111111111111';
  u   uuid := 'bbbbbcc2-2222-4111-a111-111111111111';
  mes date := date_trunc('month', now())::date;
  r   jsonb;
  n   int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'filtro@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-filtro', 'Teste Filtro') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, u, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO commercial_sales (tenant_id, empreendimento, corretor_nome, origem, cliente_nome, valor_vgv, valor_vgc, data_assinatura, is_active, nome_arquivo, row_number) VALUES
    (t, 'ALFA', 'Ana',   'Santa', 'Cliente 1', 600000, 30000, mes + 1, true, 'teste', 1),
    (t, 'ALFA', 'Bruno', 'SANTA', 'Cliente 2', 400000, 20000, mes + 2, true, 'teste', 2),
    (t, 'BETA', 'Ana',   'Dejoy', 'Cliente 3', 200000, 10000, mes + 3, true, 'teste', 3);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O FILTRO VALE PARA OS CONTADORES E PARA AS TABELAS.
  --
  -- "Clicar em um corretor filtra todos os contadores" é o critério do plano.
  -- ----------------------------------------------------------
  IF (painel_comercial(t, mes, mes + 27, 'todos', '{"corretor":["Ana"]}'::jsonb)->'atual'->>'vendas')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: o contador não obedeceu ao filtro por corretor';
  END IF;
  IF (painel_comercial(t, mes, mes + 27, 'todos', '{}'::jsonb)->'atual'->>'vendas')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU: sem filtro deveria contar as 3';
  END IF;

  -- ----------------------------------------------------------
  -- 2. A ORIGEM É NORMALIZADA.
  --
  -- A planilha traz "Santa" e "SANTA". Sem juntar, o ranking mostraria as duas
  -- e filtrar por uma perderia metade das vendas.
  -- ----------------------------------------------------------
  r := painel_comercial_rankings(t, mes, mes + 27, 'todos', '{}'::jsonb);
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'origem') o WHERE o->>'valor' = 'SANTA';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: as duas grafias de origem não viraram uma — %', r->'origem';
  END IF;
  SELECT (o->>'vendas')::int INTO n FROM jsonb_array_elements(r->'origem') o WHERE o->>'valor' = 'SANTA';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: "SANTA" deveria somar as 2 vendas, somou %', n;
  END IF;

  -- ----------------------------------------------------------
  -- 3. A TABELA DA DIMENSÃO FILTRADA NÃO FILTRA A SI MESMA.
  --
  -- Encontrado no navegador. Sem isto, ao escolher ALFA a tabela de
  -- empreendimentos passa a mostrar só ALFA — e o SHIFT + clique, que o plano
  -- pede para somar BETA, fica sem nada para clicar.
  -- ----------------------------------------------------------
  r := painel_comercial_rankings(t, mes, mes + 27, 'todos', '{"empreendimento":["ALFA"]}'::jsonb);
  IF jsonb_array_length(r->'empreendimento') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: com ALFA escolhido, a tabela de empreendimentos deveria continuar com os 2 — veio %',
      jsonb_array_length(r->'empreendimento');
  END IF;

  -- As OUTRAS dimensões acompanham o recorte: só quem vendeu ALFA aparece.
  IF jsonb_array_length(r->'corretor') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: a tabela de corretores deveria seguir o recorte de ALFA — veio %',
      jsonb_array_length(r->'corretor');
  END IF;

  -- ----------------------------------------------------------
  -- 4. DOIS ITENS NA MESMA DIMENSÃO SOMAM (o SHIFT + clique).
  -- ----------------------------------------------------------
  IF (painel_comercial(t, mes, mes + 27, 'todos', '{"empreendimento":["ALFA","BETA"]}'::jsonb)->'atual'->>'vendas')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU: dois empreendimentos escolhidos deveriam somar as 3 vendas';
  END IF;

  -- Dimensões diferentes se cruzam (E, não OU): Ana em BETA é 1 venda.
  IF (painel_comercial(t, mes, mes + 27, 'todos', '{"corretor":["Ana"],"empreendimento":["BETA"]}'::jsonb)->'atual'->>'vendas')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: dimensões diferentes deveriam se cruzar, não somar';
  END IF;

  -- ----------------------------------------------------------
  -- 5. A PARTICIPAÇÃO SOMA 100% DENTRO DA DIMENSÃO.
  --
  -- É a coluna que substituiu "conversão" — esta base não liga venda a lead.
  -- ----------------------------------------------------------
  r := painel_comercial_rankings(t, mes, mes + 27, 'todos', '{}'::jsonb);
  SELECT round(sum((e->>'participacao')::numeric)) INTO n
    FROM jsonb_array_elements(r->'empreendimento') e;
  IF n <> 100 THEN
    RAISE EXCEPTION 'FALHOU: a participação somou %%% (esperava 100)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 6. LINHA SEM VALOR NÃO VIRA LINHA DE RANKING.
  --
  -- `team_leader_nome` está vazio nas três; a tabela de equipe fica vazia, e o
  -- contador diz quantas vendas ficaram de fora.
  -- ----------------------------------------------------------
  IF jsonb_array_length(r->'equipe') <> 0 THEN
    RAISE EXCEPTION 'FALHOU: equipe sem valor virou linha de ranking';
  END IF;
  IF (r->>'equipe_sem_valor')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU: não contou as 3 vendas sem equipe — %', r->>'equipe_sem_valor';
  END IF;

  RAISE NOTICE 'OK: filtro por clique — 6 casos';
END $$;

ROLLBACK;

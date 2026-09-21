-- ============================================================
-- Gráfico de evolução (P3.3).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/grafico_de_evolucao.test.sql
--
-- O caso 2 é o que o plano cobra por escrito ("30 dias mostra dias; 6 meses
-- mostra meses"). O caso 3 é o que faria a comparação tracejada comparar dia 1
-- com dia 2 sem ninguém perceber: os dois períodos têm de render o MESMO
-- número de baldes.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t   uuid := 'bbbbbdd1-1111-4111-a111-111111111111';
  u   uuid := 'bbbbbdd2-2222-4111-a111-111111111111';
  l   uuid := 'bbbbbdd3-3333-4111-a111-111111111111';
  -- Datas fixas: o teste não pode mudar de resultado conforme o dia em que roda.
  de  date := '2026-09-01';
  ate date := '2026-09-30';
  r   jsonb;
  n   int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'evolucao@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-evolucao', 'Teste Evolução') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, u, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO lancamentos (id, tenant_id, nome, construtora, cidade, bairro)
    VALUES (l, t, 'Serrah', 'Santa Ângela', 'Jundiaí', 'Eloy Chaves') ON CONFLICT DO NOTHING;
  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo, lancamento_id)
    VALUES (t, 'SERRAH', 'SERRAH', 'lancamento', l) ON CONFLICT DO NOTHING;

  -- Duas vendas no dia 05, uma no dia 10, e NADA no resto do mês. Uma delas
  -- sem VGV, como as 8 de 37 reais da Lotus.
  INSERT INTO commercial_sales (tenant_id, empreendimento, corretor_nome, origem, cliente_nome, valor_vgv, valor_vgc, data_assinatura, is_active, nome_arquivo, row_number) VALUES
    (t, 'SERRAH', 'Ana',   'Meta', 'Cliente 1', 600000, 30000, '2026-09-05', true, 'teste', 1),
    (t, 'SERRAH', 'Bruno', 'Meta', 'Cliente 2', 400000, 20000, '2026-09-05', true, 'teste', 2),
    (t, 'SERRAH', 'Ana',   'Meta', 'Cliente 3',      0,  9000, '2026-09-10', true, 'teste', 3);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. DIA SEM VENDA VALE ZERO, E NÃO SOME.
  --
  -- É o que sustenta a média móvel: se o dia sumisse, "média dos últimos 7
  -- dias" viraria "média dos últimos 7 dias COM venda", outro número com o
  -- mesmo nome. Setembro tem 30 dias, então a série tem 30 baldes.
  -- ----------------------------------------------------------
  r := painel_evolucao(t, de, ate);
  IF jsonb_array_length(r->'serie') <> 30 THEN
    RAISE EXCEPTION 'FALHOU: setembro deveria ter 30 baldes, teve %', jsonb_array_length(r->'serie');
  END IF;

  SELECT (b->>'vendas')::int INTO n FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-05';
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: dia 05 deveria ter 2 vendas, teve %', n; END IF;

  SELECT (b->>'vendas')::int INTO n FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-20';
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: dia sem venda deveria valer 0, veio %', COALESCE(n::text, 'ausente');
  END IF;

  -- Ticket de dia SEM venda é ausente, não zero — e é essa diferença que
  -- impede a média móvel de inventar uma queda.
  IF (SELECT b->>'ticket' FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-20') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: dia sem venda não pode ter ticket';
  END IF;

  -- E o ticket do dia 10 conta SÓ a venda com VGV — lá a única venda tem VGV
  -- zero, então também não há ticket. Contá-la daria ticket 0, 100% errado.
  IF (SELECT b->>'ticket' FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-10') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: venda sem VGV não pode gerar ticket zero';
  END IF;
  SELECT (b->>'vendas')::int INTO n FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-10';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: a venda sem VGV ainda conta como venda'; END IF;

  -- ----------------------------------------------------------
  -- 2. A RÉGUA VIRA DE DIAS PARA MESES.
  --
  -- O critério do plano, por escrito: "Período de 30 dias mostra dias; de 6
  -- meses mostra meses."
  -- ----------------------------------------------------------
  IF r->>'granularidade' <> 'dia' THEN
    RAISE EXCEPTION 'FALHOU: 30 dias deveria ser por dia, veio %', r->>'granularidade';
  END IF;

  r := painel_evolucao(t, '2026-04-01', '2026-09-30');
  IF r->>'granularidade' <> 'mes' THEN
    RAISE EXCEPTION 'FALHOU: 6 meses deveria ser por mês, veio %', r->>'granularidade';
  END IF;
  IF jsonb_array_length(r->'serie') <> 6 THEN
    RAISE EXCEPTION 'FALHOU: 6 meses deveriam dar 6 baldes, deu %', jsonb_array_length(r->'serie');
  END IF;
  SELECT (b->>'vendas')::int INTO n FROM jsonb_array_elements(r->'serie') b WHERE b->>'em' = '2026-09-01';
  IF n <> 3 THEN RAISE EXCEPTION 'FALHOU: o balde de setembro deveria somar as 3, somou %', n; END IF;

  -- A borda: 62 dias ainda é "dia", 63 já é "mês". Sem isso a régua vira num
  -- lugar que ninguém consegue prever.
  IF painel_evolucao(t, '2026-07-01', '2026-08-31')->>'granularidade' <> 'dia' THEN
    RAISE EXCEPTION 'FALHOU: julho+agosto (62 dias) ainda é por dia';
  END IF;
  IF painel_evolucao(t, '2026-07-01', '2026-09-01')->>'granularidade' <> 'mes' THEN
    RAISE EXCEPTION 'FALHOU: acima de 62 dias já é por mês';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O PERÍODO ANTERIOR TEM DE ALINHAR.
  --
  -- A tracejada é sobreposta POR POSIÇÃO. Se os dois períodos tiverem
  -- quantidades diferentes de baldes, o ponto 1 de setembro passa a se comparar
  -- ao ponto 2 de agosto e o gráfico mente sem dar sinal.
  -- ----------------------------------------------------------
  r := painel_evolucao(t, de, ate);
  IF jsonb_array_length(r->'anterior'->'serie') <> jsonb_array_length(r->'serie') THEN
    RAISE EXCEPTION 'FALHOU: anterior com % baldes contra % do atual',
      jsonb_array_length(r->'anterior'->'serie'), jsonb_array_length(r->'serie');
  END IF;

  -- Em meses o deslocamento é por MÊS, não por dias: descontar 180 dias daria
  -- 6 ou 7 baldes conforme o calendário.
  r := painel_evolucao(t, '2026-04-01', '2026-09-30');
  IF jsonb_array_length(r->'anterior'->'serie') <> 6 THEN
    RAISE EXCEPTION 'FALHOU: o semestre anterior deveria ter 6 baldes, teve %',
      jsonb_array_length(r->'anterior'->'serie');
  END IF;

  -- ----------------------------------------------------------
  -- 4. "VAZIO" É UM ESTADO DECLARADO, NÃO UM ZERO SILENCIOSO.
  --
  -- Agosto não tem venda nenhuma nesta base. É o que faz a tela escrever o
  -- motivo em vez de deixar o gestor achar que a leitura quebrou.
  -- ----------------------------------------------------------
  r := painel_evolucao(t, de, ate);
  IF (r->'anterior'->>'vazio')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: o período anterior está vazio e não foi declarado';
  END IF;

  -- E quando houver venda antes, o mesmo campo tem de virar false — senão o
  -- aviso ficaria na tela para sempre.
  IF (painel_evolucao(t, '2026-10-01', '2026-10-31')->'anterior'->>'vazio')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: outubro tem setembro atrás e não deveria ser vazio';
  END IF;

  -- ----------------------------------------------------------
  -- 5. O GRÁFICO OBEDECE AO FILTRO DO P3.2.
  --
  -- Mesma fonte dos contadores e dos oito rankings. Se divergisse, o gráfico
  -- contaria uma história e o contador em cima dele, outra.
  -- ----------------------------------------------------------
  r := painel_evolucao(t, de, ate, 'todos', '{"corretor":["Ana"]}'::jsonb);
  SELECT sum((b->>'vendas')::int) INTO n FROM jsonb_array_elements(r->'serie') b;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: o filtro por corretor não chegou ao gráfico (% vendas)', n; END IF;

  r := painel_evolucao(t, de, ate, 'todos', '{"construtora":["Santa Ângela"]}'::jsonb);
  SELECT sum((b->>'vendas')::int) INTO n FROM jsonb_array_elements(r->'serie') b;
  IF n <> 3 THEN RAISE EXCEPTION 'FALHOU: o corte pelo lançamento não chegou ao gráfico'; END IF;

  -- ----------------------------------------------------------
  -- 6. AS BANDEIRINHAS.
  -- ----------------------------------------------------------
  INSERT INTO eventos_comerciais (tenant_id, em, titulo) VALUES (t, '2026-09-08', 'Feirão da cidade');
  INSERT INTO eventos_comerciais (tenant_id, em, titulo, lancamento_id) VALUES (t, '2026-09-12', 'Campanha Serrah', l);
  -- Fora do período: não pode aparecer.
  INSERT INTO eventos_comerciais (tenant_id, em, titulo) VALUES (t, '2026-11-02', 'Feirão de novembro');

  r := painel_evolucao(t, de, ate);
  IF jsonb_array_length(r->'eventos') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: deveriam vir 2 eventos do período, vieram %', jsonb_array_length(r->'eventos');
  END IF;

  -- O nome canônico do empreendimento é o que o front compara com o filtro do
  -- P3.2. Vindo em outra grafia, a bandeirinha nunca casaria com o recorte.
  IF (SELECT e->>'empreendimento' FROM jsonb_array_elements(r->'eventos') e
       WHERE e->>'titulo' = 'Campanha Serrah') <> 'SERRAH' THEN
    RAISE EXCEPTION 'FALHOU: o evento deveria trazer o empreendimento canônico';
  END IF;
  IF (SELECT e->>'empreendimento' FROM jsonb_array_elements(r->'eventos') e
       WHERE e->>'titulo' = 'Feirão da cidade') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: evento da casa não tem empreendimento';
  END IF;

  -- Em meses, a bandeirinha migra para o balde do mês — senão ela cairia num
  -- ponto do eixo que não existe e sumiria do gráfico.
  r := painel_evolucao(t, '2026-04-01', '2026-09-30');
  IF (SELECT e->>'em' FROM jsonb_array_elements(r->'eventos') e
       WHERE e->>'titulo' = 'Campanha Serrah') <> '2026-09-01' THEN
    RAISE EXCEPTION 'FALHOU: em meses o evento deveria cair no primeiro dia do mês';
  END IF;

  -- ----------------------------------------------------------
  -- 7. META VAZIA VEM NULA, NÃO ZERO.
  --
  -- A tabela de metas está vazia na plataforma inteira. Zero desenharia uma
  -- linha rasteira que qualquer venda "supera".
  -- ----------------------------------------------------------
  IF (painel_evolucao(t, de, ate)->'metas'->>'vendas') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: sem meta cadastrada, o alvo tem de vir nulo';
  END IF;

  -- ----------------------------------------------------------
  -- 8. QUEM NÃO É DO TENANT NÃO LÊ.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'bbbbbdd9-9999-4111-a111-111111111111')::text, true);
  IF painel_evolucao(t, de, ate) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu a evolução';
  END IF;

  RAISE NOTICE 'OK: gráfico de evolução — 8 casos';
END
$$;

ROLLBACK;

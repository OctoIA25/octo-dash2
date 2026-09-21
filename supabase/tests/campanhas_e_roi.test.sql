-- ============================================================
-- Aba Campanhas + ROI (P3.5).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/campanhas_e_roi.test.sql
--
-- Os números do fixture são os da conta real da Lotus em setembro/2026, lidos
-- no Gerenciador de Anúncios: R$ 3.333,64 em quatro campanhas, 203 leads.
--
-- O caso 2 é a armadilha do item: somar CPCs diários dá a média das médias, que
-- NÃO é o custo por clique do período. Com os números reais a diferença passa
-- de dez centavos por clique — o bastante para o gestor comparar campanhas
-- erradas e desligar a boa.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

DO $$
DECLARE
  t uuid := '0ccc1111-0000-4000-a000-000000000001';
  u uuid := '0ccc0000-0000-4000-a000-000000000001';
  r jsonb;
  c jsonb;
  n numeric;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'gestor@teste-campanha.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-campanha', 'Teste Campanha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, u, 'admin') ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- Fixture: dois dias por campanha, porque é a soma de dias que revela se o
  -- CPC do período foi recalculado ou tirado na média.
  -- ----------------------------------------------------------
  INSERT INTO meta_insights_diarios
    (tenant_id, data, campaign_id, campaign_nome, ad_id, objetivo, resultado_indicador,
     resultados, gasto, impressoes, cliques, ctr, cpc, cpm, leads_meta) VALUES
    -- Reserva Castanheira: campanha DE FORMULÁRIO (actions:lead).
    -- Dia 1: caro e pouco clique. Dia 2: barato e muito clique.
    (t, '2026-09-01', 'c_castanheira', '[RESERVA CASTANHEIRA] Reserva Castanheira', 'a_cast_1',
     'OUTCOME_LEADS', 'actions:lead', 24, 1000.00, 40000, 500, 1.25, 2.00, 25.00, 24),
    (t, '2026-09-02', 'c_castanheira', '[RESERVA CASTANHEIRA] Reserva Castanheira', 'a_cast_1',
     'OUTCOME_LEADS', 'actions:lead', 100, 959.79, 48997, 1717, 3.50, 0.56, 19.59, 100),
    -- Entrada e Médio: clique-para-WhatsApp. NÃO é atribuível lead a lead.
    (t, '2026-09-01', 'c_entrada', '[LEAD] Entrada e Médio', 'a_ent_1',
     'OUTCOME_LEADS', 'actions:onsite_conversion.messaging_conversation_started_7d',
     67, 847.40, 35356, 541, 1.53, 1.57, 23.97, 60),
    -- Recrutamento: gasta e não entrega lead nenhum.
    (t, '2026-09-01', 'c_recrut', '[RECRUTAMENTO] Corretores', 'a_rec_1',
     'OUTCOME_LEADS', 'actions:onsite_conversion.messaging_conversation_started_7d',
     18, 120.58, 3519, 98, 2.78, 1.23, 34.27, 0);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  r := campanhas_resultado(t, '2026-09-01', '2026-09-30');

  -- ----------------------------------------------------------
  -- 1. O GASTO SOMA, E O TOTAL BATE COM O GERENCIADOR.
  --
  -- É o critério de pronto do plano, por escrito: "gasto do mês na Dash bate
  -- com o Gerenciador de Anúncios".
  -- ----------------------------------------------------------
  IF (r->'totais'->>'gasto')::numeric IS DISTINCT FROM 2927.77 THEN
    RAISE EXCEPTION 'FALHOU: o total do período deu % e deveria dar 2927.77', r->'totais'->>'gasto';
  END IF;

  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x
   WHERE x->>'campaign_id' = 'c_castanheira';
  IF (c->>'gasto')::numeric IS DISTINCT FROM 1959.79 THEN
    RAISE EXCEPTION 'FALHOU: a Castanheira somou % e deveria somar 1959.79', c->>'gasto';
  END IF;

  -- ----------------------------------------------------------
  -- 2. CPC, CTR E CPM SÃO RECALCULADOS, NÃO A MÉDIA DOS DIÁRIOS.
  --
  -- A Castanheira gastou R$ 1.959,79 em 2.217 cliques: CPC do período = 0,88.
  -- A média dos dois CPCs diários (2,00 e 0,56) daria 1,28 — 45% a mais, e a
  -- campanha pareceria muito pior do que é.
  -- ----------------------------------------------------------
  IF (c->>'cpc')::numeric IS DISTINCT FROM 0.88 THEN
    RAISE EXCEPTION 'FALHOU: CPC do período deu % e deveria dar 0.88 (média dos diários daria 1.28)', c->>'cpc';
  END IF;

  -- 2.217 cliques em 88.997 impressões = 2,49%. A média dos diários (1,25 e
  -- 3,50) daria 2,38.
  IF (c->>'ctr')::numeric IS DISTINCT FROM 2.49 THEN
    RAISE EXCEPTION 'FALHOU: CTR do período deu % e deveria dar 2.49', c->>'ctr';
  END IF;

  -- R$ 1.959,79 por 88.997 impressões × 1000 = 22,02.
  IF (c->>'cpm')::numeric IS DISTINCT FROM 22.02 THEN
    RAISE EXCEPTION 'FALHOU: CPM do período deu % e deveria dar 22.02', c->>'cpm';
  END IF;

  -- E o custo por lead, com os 124 leads que a Meta contou.
  IF (c->>'leads_meta')::int IS DISTINCT FROM 124 THEN
    RAISE EXCEPTION 'FALHOU: a Castanheira deveria somar 124 leads, somou %', c->>'leads_meta';
  END IF;
  IF (c->>'custo_por_lead_meta')::numeric IS DISTINCT FROM 15.80 THEN
    RAISE EXCEPTION 'FALHOU: custo por lead deu % e deveria dar 15.80', c->>'custo_por_lead_meta';
  END IF;

  -- ----------------------------------------------------------
  -- 3. A CAMPANHA SEM FORMULÁRIO VEM MARCADA, E O GASTO DELA É DECLARADO.
  --
  -- Clique-para-WhatsApp não tem formulário: o lead chega pela conversa, sem
  -- nada que o ligue ao anúncio. Esconder essas campanhas faria o total da
  -- tela não bater com o Gerenciador; mostrá-las sem marcar faria o gestor
  -- esperar por uma atribuição que nunca vem.
  -- ----------------------------------------------------------
  IF (c->>'atribuivel')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: campanha de formulário deveria ser atribuível';
  END IF;

  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x WHERE x->>'campaign_id' = 'c_entrada';
  IF (c->>'atribuivel')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: campanha de clique-para-WhatsApp não pode ser marcada como atribuível';
  END IF;

  -- 847,40 + 120,58 = 967,98 de gasto que não dá para amarrar a lead nenhum.
  IF (r->'totais'->>'gasto_sem_atribuicao')::numeric IS DISTINCT FROM 967.98 THEN
    RAISE EXCEPTION 'FALHOU: o gasto sem atribuição deu % e deveria dar 967.98',
      r->'totais'->>'gasto_sem_atribuicao';
  END IF;

  -- ----------------------------------------------------------
  -- 4. OS LEADS DA DASH CASAM PELA CAMPANHA.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, status, meta_campaign_id, created_at) VALUES
    (t, 'Lead Novo',     '11900000001', 'Novos Leads',     'c_castanheira', '2026-09-03'),
    (t, 'Lead Em Visita','11900000002', 'Visita Agendada', 'c_castanheira', '2026-09-04'),
    -- Já passou de Visita agendada: o status guarda onde ele ESTÁ, e contar só
    -- quem parou em "Visita Agendada" chamaria de não qualificado justamente
    -- quem foi mais longe.
    (t, 'Lead Proposta', '11900000003', 'Proposta Enviada','c_castanheira', '2026-09-05'),
    -- Fora do período: não pode entrar.
    (t, 'Lead Outubro',  '11900000004', 'Novos Leads',     'c_castanheira', '2026-10-02');

  r := campanhas_resultado(t, '2026-09-01', '2026-09-30');
  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x WHERE x->>'campaign_id' = 'c_castanheira';

  IF (c->>'leads_dash')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: deveriam casar 3 leads do período, casaram %', c->>'leads_dash';
  END IF;

  -- ----------------------------------------------------------
  -- 5. "CHEGOU EM VISITA AGENDADA" CONTA QUEM PASSOU POR LÁ.
  -- ----------------------------------------------------------
  IF (c->>'chegou_visita')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: deveriam contar 2 (Visita Agendada e Proposta Enviada), contou %',
      c->>'chegou_visita';
  END IF;

  -- E os ids vão junto, para o front somar o score com a MESMA conta da lista
  -- de leads — em vez de refazer a fórmula aqui e criar uma segunda fonte.
  IF jsonb_array_length(c->'lead_ids') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: deveriam vir 3 ids de lead, vieram %', jsonb_array_length(c->'lead_ids');
  END IF;

  -- O custo por lead da Dash é OUTRO número: 1959.79 / 3 leads amarrados.
  -- A Meta contou 124; a Dash amarrou 3. A distância entre os dois é o
  -- assunto do item, e por isso os dois aparecem.
  IF (c->>'custo_por_lead_dash')::numeric IS DISTINCT FROM 653.26 THEN
    RAISE EXCEPTION 'FALHOU: custo por lead da Dash deu %, esperado 653.26', c->>'custo_por_lead_dash';
  END IF;

  -- ----------------------------------------------------------
  -- 6. RODAR A SINCRONIZAÇÃO DE NOVO NÃO DOBRA O GASTO.
  --
  -- A Meta REGRAVA números dos últimos dias, então a sincronização repete os
  -- mesmos dias de propósito. Sem a chave única, o mês dobrava a cada rodada.
  -- ----------------------------------------------------------
  INSERT INTO meta_insights_diarios
    (tenant_id, data, campaign_id, campaign_nome, ad_id, objetivo, resultado_indicador,
     resultados, gasto, impressoes, cliques, leads_meta)
  VALUES (t, '2026-09-01', 'c_castanheira', '[RESERVA CASTANHEIRA] Reserva Castanheira', 'a_cast_1',
          'OUTCOME_LEADS', 'actions:lead', 26, 1010.00, 41000, 510, 26)
  ON CONFLICT (tenant_id, data, ad_id) DO UPDATE SET
    gasto = EXCLUDED.gasto, impressoes = EXCLUDED.impressoes,
    cliques = EXCLUDED.cliques, leads_meta = EXCLUDED.leads_meta,
    sincronizado_em = now();

  SELECT count(*) INTO n FROM meta_insights_diarios
   WHERE tenant_id = t AND data = '2026-09-01' AND ad_id = 'a_cast_1';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a regravação criou linha nova em vez de atualizar (% linhas)', n;
  END IF;

  r := campanhas_resultado(t, '2026-09-01', '2026-09-30');
  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x WHERE x->>'campaign_id' = 'c_castanheira';
  -- 1010.00 (corrigido) + 959.79 = 1969.79, e não 2969.79.
  IF (c->>'gasto')::numeric IS DISTINCT FROM 1969.79 THEN
    RAISE EXCEPTION 'FALHOU: depois da regravação o gasto deu % e deveria dar 1969.79', c->>'gasto';
  END IF;

  -- ----------------------------------------------------------
  -- 7. O ROI SE DECLARA INDISPONÍVEL, COM O MOTIVO.
  --
  -- `commercial_sales` não guarda de qual lead veio a venda (P4.4). A tela
  -- mostra o motivo no lugar de um campo vazio.
  -- ----------------------------------------------------------
  IF (r->>'roi_disponivel')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: o ROI não pode se declarar disponível sem vínculo de venda';
  END IF;
  IF COALESCE(r->>'roi_falta', '') = '' THEN
    RAISE EXCEPTION 'FALHOU: indisponível sem motivo escrito é campo vazio sem explicação';
  END IF;

  -- ----------------------------------------------------------
  -- 8. PERÍODO VAZIO NÃO É ERRO.
  -- ----------------------------------------------------------
  r := campanhas_resultado(t, '2026-01-01', '2026-01-31');
  IF jsonb_array_length(r->'campanhas') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: janeiro não teve campanha e veio com %', jsonb_array_length(r->'campanhas');
  END IF;
  IF (r->'totais'->>'gasto')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: mês sem gasto deveria somar 0';
  END IF;

  -- ----------------------------------------------------------
  -- 9. QUEM NÃO É DO TENANT NÃO LÊ.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0ccc0000-0000-4000-a000-000000000009')::text, true);
  IF campanhas_resultado(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu o gasto de anúncios';
  END IF;

  -- ----------------------------------------------------------
  -- 10. ABRIR A CAMPANHA MOSTRA CONJUNTO E ANÚNCIO.
  --
  -- O grão guardado já é por anúncio; isto só agrupa de dois jeitos. As mesmas
  -- regras valem: CTR e CPC recalculados dos totais.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  INSERT INTO meta_insights_diarios
    (tenant_id, data, campaign_id, campaign_nome, adset_id, adset_nome, ad_id, ad_nome,
     objetivo, resultado_indicador, resultados, gasto, impressoes, cliques, leads_meta) VALUES
    (t, '2026-09-03', 'c_castanheira', '[RESERVA CASTANHEIRA] Reserva Castanheira',
     's1', 'Conjunto Jundiaí', 'a_cast_2', 'Anúncio vídeo',
     'OUTCOME_LEADS', 'actions:lead', 10, 300.00, 10000, 300, 10);

  r := campanha_detalhe(t, 'c_castanheira', '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'anuncios') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a campanha tem 2 anúncios, o detalhe trouxe %', jsonb_array_length(r->'anuncios');
  END IF;

  SELECT x INTO c FROM jsonb_array_elements(r->'anuncios') x WHERE x->>'ad_id' = 'a_cast_2';
  IF (c->>'cpc')::numeric IS DISTINCT FROM 1.00 THEN
    RAISE EXCEPTION 'FALHOU: CPC do anúncio deu % e deveria dar 1.00', c->>'cpc';
  END IF;
  IF (c->>'custo_por_lead')::numeric IS DISTINCT FROM 30.00 THEN
    RAISE EXCEPTION 'FALHOU: custo por lead do anúncio deu %, esperado 30.00', c->>'custo_por_lead';
  END IF;

  -- Campanha inexistente devolve listas vazias, e não erro.
  r := campanha_detalhe(t, 'c_que_nao_existe', '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'anuncios') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: campanha inexistente deveria vir vazia';
  END IF;

  -- E o detalhe respeita o tenant, como a lista.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0ccc0000-0000-4000-a000-000000000009')::text, true);
  IF campanha_detalhe(t, 'c_castanheira', '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant abriu o detalhe da campanha';
  END IF;

  -- ----------------------------------------------------------
  -- 11. O ROI DEIXA DE SER VAZIO QUANDO A VENDA CHEGA (P4.4).
  --
  -- Duas vendas vindas dos leads da Castanheira, com R$ 30.000 de comissão
  -- líquida. CAC e ROAS são conferidos contra o GASTO QUE O PRÓPRIO PAYLOAD
  -- devolve, e não contra um número fixo: casos mais abaixo acrescentam
  -- anúncio à campanha, e um valor cravado aqui passaria a acusar o teste
  -- errado. O que importa é que o CAC divida por VENDAS (e não por leads) e
  -- que o ROAS seja comissão ÷ gasto, nesta ordem.
  -- ----------------------------------------------------------
  -- O caso anterior deixou o JWT de quem não é do tenant. Sem repor o gestor
  -- aqui, `campanhas_resultado` recusa e devolve NULL — e o teste mediria a
  -- recusa achando que mede o ROI.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  INSERT INTO vendas (tenant_id, lead_id, data_venda, empreendimento, vgv,
                      comissao_pct, comissao_bruta, comissao_liquida, corretor_nome)
  SELECT t, l.id, '2026-09-20', 'Reserva Castanheira', 500000, 5, 25000, 20000, 'Ana'
    FROM leads l WHERE l.tenant_id = t AND l.name = 'Lead Proposta';
  INSERT INTO vendas (tenant_id, lead_id, data_venda, empreendimento, vgv,
                      comissao_pct, comissao_bruta, comissao_liquida, corretor_nome)
  SELECT t, l.id, '2026-09-22', 'Reserva Castanheira', 250000, 5, 12500, 10000, 'Ana'
    FROM leads l WHERE l.tenant_id = t AND l.name = 'Lead Em Visita';

  r := campanhas_resultado(t, '2026-09-01', '2026-09-30');
  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x
   WHERE x->>'campaign_id' = 'c_castanheira';

  IF (c->>'vendas')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a Castanheira deveria ter 2 vendas, tem %', c->>'vendas';
  END IF;
  n := (c->>'gasto')::numeric;
  IF (c->>'cac')::numeric IS DISTINCT FROM round(n / 2, 2) THEN
    RAISE EXCEPTION 'FALHOU: CAC deveria ser % ÷ 2 vendas = %, deu %',
      n, round(n / 2, 2), c->>'cac';
  END IF;
  IF (c->>'roas')::numeric IS DISTINCT FROM round(30000 / n, 2) THEN
    RAISE EXCEPTION 'FALHOU: ROAS deveria ser 30000 ÷ % = %, deu %',
      n, round(30000 / n, 2), c->>'roas';
  END IF;
  -- E o ROAS não é o inverso: gasto ÷ comissão daria menos de 1 aqui.
  IF (c->>'roas')::numeric <= 1 THEN
    RAISE EXCEPTION 'FALHOU: ROAS veio invertido (gasto ÷ comissão) — %', c->>'roas';
  END IF;
  IF (r->>'roi_disponivel')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: com venda atribuída, o ROI tem que estar disponível';
  END IF;

  -- A campanha de WhatsApp não ganha venda emprestada da vizinha.
  SELECT x INTO c FROM jsonb_array_elements(r->'campanhas') x
   WHERE x->>'campaign_id' = 'c_entrada';
  IF (c->>'vendas')::int IS DISTINCT FROM 0 OR c->>'cac' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: campanha sem venda ficou com CAC — %', c;
  END IF;

  -- ----------------------------------------------------------
  -- 12. O QUE NÃO DÁ PARA ATRIBUIR APARECE CONTADO.
  --
  -- Medido em produção: 30 das 61 propostas assinadas com valor não têm lead
  -- nenhum. Um ROAS sem este número ao lado seria lido como campanha ruim.
  -- ----------------------------------------------------------
  INSERT INTO vendas (tenant_id, data_venda, empreendimento, vgv, comissao_liquida, corretor_nome)
  VALUES (t, '2026-09-25', 'Venda de balcão', 300000, 9000, 'Bruno');
  INSERT INTO leads (tenant_id, name, phone, status, created_at)
  VALUES (t, 'Lead Sem Campanha', '11900000005', 'Novos Leads', '2026-09-06');
  INSERT INTO vendas (tenant_id, lead_id, data_venda, empreendimento, vgv, comissao_liquida, corretor_nome)
  SELECT t, l.id, '2026-09-26', 'Indicação', 400000, 12000, 'Bruno'
    FROM leads l WHERE l.tenant_id = t AND l.name = 'Lead Sem Campanha';

  r := campanhas_resultado(t, '2026-09-01', '2026-09-30');
  IF (r->'vendas'->>'vendas')::int IS DISTINCT FROM 4
     OR (r->'vendas'->>'atribuidas')::int IS DISTINCT FROM 2
     OR (r->'vendas'->>'sem_lead')::int IS DISTINCT FROM 1
     OR (r->'vendas'->>'sem_campanha')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a contagem de atribuição não fecha — %', r->'vendas';
  END IF;
  -- A comissão do ROI conta SÓ a atribuída: 20.000 + 10.000.
  IF (r->'vendas'->>'comissao_liquida')::numeric IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: o ROI somou comissão de venda não atribuída — %', r->'vendas';
  END IF;

  RAISE NOTICE 'OK: campanhas e ROI — 12 casos';
END
$$;

-- ----------------------------------------------------------
-- 10. O ANÔNIMO NÃO ENCOSTA NA TABELA DE GASTO.
--
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE da migration, quanto a imobiliária gasta em anúncio sairia pela API
-- pública do site.
-- ----------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM meta_insights_diarios $$,
  'o anônimo leu quanto a imobiliária gasta em anúncios');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: anônimo barrado'; END $$;

ROLLBACK;

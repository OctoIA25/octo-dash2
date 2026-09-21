-- ============================================================
-- Relatório de anúncios interligado (P3.6).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/relatorio_de_anuncios.test.sql
--
-- O CASO 2 É O QUE CARREGA O ARQUIVO: "atendido em 1h" tem de medir o
-- CORRETOR, não a LIA. A LIA responde em segundos; medi-la daria ~100% de
-- atendimento para todo corretor — um número lisonjeiro e falso sobre gente.
--
-- O caso 6 é o outro: a CPA por construtora cruza por EMPREENDIMENTO, e é por
-- isso que ela existe mesmo sem vínculo entre venda e lead.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t   uuid := '0ddd1111-0000-4000-a000-000000000001';
  gestor uuid := '0ddd0000-0000-4000-a000-000000000001';
  ana uuid := '0ddd0000-0000-4000-a000-000000000002';
  bruno uuid := '0ddd0000-0000-4000-a000-000000000003';
  eq_a uuid := '0ddd2222-0000-4000-a000-000000000001';
  eq_vazia uuid := '0ddd2222-0000-4000-a000-000000000002';
  lanc uuid := '0ddd3333-0000-4000-a000-000000000001';
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  conv uuid;
  r jsonb;
  x jsonb;
  n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-anuncio.dev'), (ana, 'ana@teste-anuncio.dev'), (bruno, 'bruno@teste-anuncio.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-anuncio', 'Teste Anúncio') ON CONFLICT DO NOTHING;
  INSERT INTO teams (id, tenant_id, name) VALUES
    (eq_a, t, 'Lançamentos'), (eq_vazia, t, 'Equipe sem ninguém') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id) VALUES
    (t, gestor, 'admin', NULL), (t, ana, 'corretor', eq_a), (t, bruno, 'corretor', eq_a)
  ON CONFLICT DO NOTHING;

  INSERT INTO lancamentos (id, tenant_id, nome, construtora, cidade)
    VALUES (lanc, t, 'Reserva Castanheira', 'Santa Ângela', 'Jundiaí') ON CONFLICT DO NOTHING;
  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo, lancamento_id)
    VALUES (t, 'RESERVA CASTANHEIRA', 'RESERVA CASTANHEIRA', 'lancamento', lanc) ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- Leads: dois da Ana, um do Bruno, um SEM corretor.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, source, status, assigned_agent_id, assigned_agent_name, created_at)
  VALUES (t, 'Cliente Um', '11987654321', 'Instagram', 'Visita Agendada', ana::text, 'Ana', '2026-09-02 09:00-03')
  RETURNING id INTO l1;

  INSERT INTO leads (tenant_id, name, phone, source, status, assigned_agent_id, assigned_agent_name, created_at)
  VALUES (t, 'Cliente Dois', '11912345678', 'Facebook', 'Proposta Assinada', ana::text, 'Ana', '2026-09-03 09:00-03')
  RETURNING id INTO l2;

  INSERT INTO leads (tenant_id, name, phone, source, status, assigned_agent_id, assigned_agent_name, created_at)
  VALUES (t, 'Cliente Tres', '11955554444', 'Instagram', 'Novos Leads', bruno::text, 'Bruno', '2026-09-04 09:00-03')
  RETURNING id INTO l3;

  -- Sem corretor: é a maioria em produção (3.560 leads parados em Novos Leads).
  INSERT INTO leads (tenant_id, name, phone, source, status, created_at)
  VALUES (t, 'Cliente Sem Dono', '11933332222', 'Instagram', 'Novos Leads', '2026-09-05 09:00-03')
  RETURNING id INTO l4;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. A MATRIZ AGRUPA POR CORRETOR.
  -- ----------------------------------------------------------
  r := matriz_de_eficiencia(t, '2026-09-01', '2026-09-30', 'corretor');
  IF jsonb_array_length(r->'linhas') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: deveriam vir 2 corretores, vieram %', jsonb_array_length(r->'linhas');
  END IF;

  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'quem' = 'Ana';
  IF (x->>'recebidos')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: a Ana recebeu 2 leads, a matriz diz %', x->>'recebidos';
  END IF;

  -- ----------------------------------------------------------
  -- 2. "ATENDIDO EM 1H" MEDE O CORRETOR, E NÃO A LIA.
  --
  -- Cenário: a LIA responde o lead da Ana em 2 MINUTOS; a Ana só fala com ele
  -- 5 HORAS depois. Se a matriz lesse a view da LIA, a Ana apareceria com 100%
  -- de atendimento em 1h — elogiando-a pelo trabalho da máquina.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, lead_id)
    VALUES (t, '11987654321', l1) RETURNING id INTO conv;

  -- A LIA: outbound SEM usuário, 2 minutos depois da criação.
  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, sent_by_user_id, wa_timestamp)
    VALUES (conv, t, 'outbound', NULL, '2026-09-02 09:02-03');

  -- A Ana: outbound COM usuário, 5 horas depois.
  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, sent_by_user_id, wa_timestamp)
    VALUES (conv, t, 'outbound', ana, '2026-09-02 14:00-03');

  r := matriz_de_eficiencia(t, '2026-09-01', '2026-09-30', 'corretor');
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'quem' = 'Ana';

  IF (x->>'atendidos_1h')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: a Ana levou 5h e a matriz creditou % atendimento(s) em 1h — está lendo a LIA',
      x->>'atendidos_1h';
  END IF;
  IF (x->>'minutos_medio')::int <> 300 THEN
    RAISE EXCEPTION 'FALHOU: o tempo médio deveria ser 300 min (o da Ana), veio % — se deu 2, é a LIA',
      x->>'minutos_medio';
  END IF;

  -- E quando o corretor É rápido, conta.
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, lead_id)
    VALUES (t, '11912345678', l2) RETURNING id INTO conv;
  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, sent_by_user_id, wa_timestamp)
    VALUES (conv, t, 'outbound', ana, '2026-09-03 09:30-03');

  r := matriz_de_eficiencia(t, '2026-09-01', '2026-09-30', 'corretor');
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'quem' = 'Ana';
  IF (x->>'atendidos_1h')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: a Ana atendeu 1 lead em 30 min e a matriz conta %', x->>'atendidos_1h';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O TOTAL INCLUI QUEM NÃO TEM CORRETOR.
  --
  -- Em produção são 3.560 leads parados em "Novos Leads" sem ninguém. Tirá-los
  -- do denominador faria toda taxa parecer muito melhor do que é.
  -- ----------------------------------------------------------
  IF (r->'totais'->>'leads')::int <> 4 THEN
    RAISE EXCEPTION 'FALHOU: o total deveria contar os 4 leads, contou %', r->'totais'->>'leads';
  END IF;
  IF (r->'totais'->>'sem_responsavel')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 lead está sem corretor e o total diz %', r->'totais'->>'sem_responsavel';
  END IF;

  -- ----------------------------------------------------------
  -- 4. "VENDA" É A ETAPA DO FUNIL, E A PLANILHA VAI DECLARADA.
  --
  -- São duas contagens da mesma coisa que não se falam (em produção: 4 no
  -- funil contra 37 na planilha). A tela mostra as duas.
  -- ----------------------------------------------------------
  IF (r->'totais'->>'venda')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 lead em Proposta Assinada, o funil diz %', r->'totais'->>'venda';
  END IF;

  INSERT INTO commercial_sales (tenant_id, empreendimento, corretor_nome, valor_vgv, valor_vgc,
                                data_assinatura, is_active, nome_arquivo, row_number)
  VALUES (t, 'RESERVA CASTANHEIRA', 'Ana', 600000, 30000, '2026-09-10', true, 'teste', 1),
         (t, 'RESERVA CASTANHEIRA', 'Bruno', 400000, 20000, '2026-09-12', true, 'teste', 2);

  r := matriz_de_eficiencia(t, '2026-09-01', '2026-09-30', 'corretor');
  IF (r->>'vendas_na_planilha')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: a planilha tem 2 vendas e a matriz declara %', r->>'vendas_na_planilha';
  END IF;
  -- O funil continua com 1: o desencontro é o assunto, e não um erro a esconder.
  IF (r->'totais'->>'venda')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: a planilha não pode mudar a contagem do funil';
  END IF;

  -- ----------------------------------------------------------
  -- 5. POR EQUIPE, E A EQUIPE VAZIA É DECLARADA.
  -- ----------------------------------------------------------
  r := matriz_de_eficiencia(t, '2026-09-01', '2026-09-30', 'equipe');
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: só "Lançamentos" tem membro, vieram % linhas', jsonb_array_length(r->'linhas');
  END IF;
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'quem' = 'Lançamentos';
  IF (x->>'recebidos')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU: a equipe soma os 3 leads da Ana e do Bruno, somou %', x->>'recebidos';
  END IF;
  IF (r->>'equipes_sem_membro')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 equipe está sem membro e a matriz diz %', r->>'equipes_sem_membro';
  END IF;

  -- ----------------------------------------------------------
  -- 6. CPA POR CONSTRUTORA: CRUZA POR EMPREENDIMENTO.
  --
  -- É a peça que funciona SEM vínculo entre venda e lead. O gasto vem da
  -- campanha cujo colchete casa com o lançamento; as vendas vêm da planilha,
  -- que chega à construtora pelo mesmo caminho.
  -- ----------------------------------------------------------
  INSERT INTO meta_insights_diarios
    (tenant_id, data, campaign_id, campaign_nome, ad_id, objetivo, resultado_indicador,
     resultados, gasto, impressoes, cliques, leads_meta)
  VALUES (t, '2026-09-10', 'c1', '[RESERVA CASTANHEIRA] Reserva Castanheira', 'a1',
          'OUTCOME_LEADS', 'actions:lead', 50, 2000.00, 50000, 1000, 50);

  r := cpa_por_construtora(t, '2026-09-01', '2026-09-30');
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'construtora' = 'Santa Ângela';
  IF x IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a campanha não chegou à construtora — %', r->'linhas';
  END IF;
  IF (x->>'gasto')::numeric <> 2000.00 THEN
    RAISE EXCEPTION 'FALHOU: o gasto da construtora deu %, esperado 2000.00', x->>'gasto';
  END IF;
  IF (x->>'vendas')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: 2 vendas da construtora, veio %', x->>'vendas';
  END IF;
  -- CPA = 2000 / 2 vendas.
  IF (x->>'cpa')::numeric <> 1000.00 THEN
    RAISE EXCEPTION 'FALHOU: CPA deu %, esperado 1000.00', x->>'cpa';
  END IF;
  -- ROAS sobre COMISSÃO: 50.000 de VGC / 2.000 de gasto = 25.
  IF (x->>'roas_vgc')::numeric <> 25.00 THEN
    RAISE EXCEPTION 'FALHOU: ROAS sobre VGC deu %, esperado 25.00', x->>'roas_vgc';
  END IF;

  -- ----------------------------------------------------------
  -- 7. GASTO QUE NÃO CASA COM LANÇAMENTO NENHUM É DECLARADO.
  --
  -- Sem este número o gestor soma as linhas da CPA e não chega ao que pagou.
  -- ----------------------------------------------------------
  INSERT INTO meta_insights_diarios
    (tenant_id, data, campaign_id, campaign_nome, ad_id, objetivo, resultado_indicador,
     resultados, gasto, impressoes, cliques, leads_meta)
  VALUES (t, '2026-09-11', 'c2', '[RECRUTAMENTO] Corretores', 'a2',
          'OUTCOME_LEADS', 'actions:onsite_conversion.messaging_conversation_started_7d',
          18, 120.58, 3519, 98, 0);

  r := cpa_por_construtora(t, '2026-09-01', '2026-09-30');
  IF (r->>'gasto_sem_construtora')::numeric <> 120.58 THEN
    RAISE EXCEPTION 'FALHOU: o gasto sem construtora deu %, esperado 120.58', r->>'gasto_sem_construtora';
  END IF;

  -- ----------------------------------------------------------
  -- 8. PRIMEIRO E ÚLTIMO TOQUE, PELOS 8 ÚLTIMOS DÍGITOS.
  --
  -- O mesmo cliente volta com o nono dígito escrito de outro jeito. Em
  -- produção são 725 clientes que voltaram, 594 deles por outra origem.
  -- ----------------------------------------------------------
  -- Mesmo telefone do Cliente Um (11987654321), agora sem o nono dígito e por
  -- outra origem: é a mesma pessoa voltando.
  INSERT INTO leads (tenant_id, name, phone, source, status, created_at)
  VALUES (t, 'Cliente Um de novo', '1187654321', 'ZAP Imóveis', 'Novos Leads', '2026-09-20 09:00-03');

  r := toques_por_origem(t, '2026-09-01', '2026-09-30');
  IF (r->'resumo'->>'clientes_repetidos')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 cliente voltou e o resumo diz % — o nono dígito não foi resolvido',
      r->'resumo'->>'clientes_repetidos';
  END IF;
  IF (r->'resumo'->>'trocaram_de_origem')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o cliente voltou por outra origem e o resumo diz %',
      r->'resumo'->>'trocaram_de_origem';
  END IF;

  -- O Instagram trouxe (primeiro toque) e o ZAP reencontrou (último toque).
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'origem' = 'Instagram';
  IF (x->>'primeiro_toque')::int <> 3 OR (x->>'ultimo_toque')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: Instagram deveria ter 3 primeiros e 2 últimos, teve % e %',
      x->>'primeiro_toque', x->>'ultimo_toque';
  END IF;
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'origem' = 'ZAP Imóveis';
  IF (x->>'primeiro_toque')::int <> 0 OR (x->>'ultimo_toque')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o ZAP só reencontrou — deveria ter 0 primeiros e 1 último, teve % e %',
      x->>'primeiro_toque', x->>'ultimo_toque';
  END IF;
  -- O saldo negativo é o sinal: esta origem é a segunda porta, e o crédito por
  -- último toque a favorece indevidamente.
  IF (x->>'saldo')::int <> -1 THEN
    RAISE EXCEPTION 'FALHOU: o saldo do ZAP deveria ser -1, foi %', x->>'saldo';
  END IF;

  -- ----------------------------------------------------------
  -- 9. LEAD SEM TELEFONE É GRUPO DE SI MESMO.
  --
  -- Não dá para saber que é a mesma pessoa. Juntar todos os sem-telefone num
  -- "cliente" só faria um cliente gigante com dezenas de toques falsos.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, source, status, created_at) VALUES
    (t, 'Sem telefone A', NULL, 'Site', 'Novos Leads', '2026-09-21 09:00-03'),
    (t, 'Sem telefone B', '',   'Site', 'Novos Leads', '2026-09-21 10:00-03');

  r := toques_por_origem(t, '2026-09-01', '2026-09-30');
  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'origem' = 'Site';
  IF (x->>'primeiro_toque')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: os 2 sem telefone são clientes distintos, viraram %', x->>'primeiro_toque';
  END IF;

  -- ----------------------------------------------------------
  -- 10. QUEM NÃO É DO TENANT NÃO LÊ NADA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0ddd0000-0000-4000-a000-000000000099')::text, true);
  IF matriz_de_eficiencia(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu a matriz de eficiência';
  END IF;
  IF cpa_por_construtora(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu a CPA';
  END IF;
  IF toques_por_origem(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu os toques';
  END IF;

  -- ----------------------------------------------------------
  -- 11. CLICAR NUMA CAMPANHA MOSTRA QUEM RECEBEU.
  --
  -- É o critério de pronto do item, por escrito no plano. E as definições são
  -- as MESMAS da matriz: "atendido em 1h" é o corretor, não a LIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  UPDATE leads SET meta_campaign_id = 'c1' WHERE id IN (l1, l2, l4);

  r := corretores_da_campanha(t, 'c1', '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: só a Ana recebeu leads da c1, vieram % linhas', jsonb_array_length(r->'linhas');
  END IF;

  SELECT e INTO x FROM jsonb_array_elements(r->'linhas') e WHERE e->>'quem' = 'Ana';
  IF (x->>'recebidos')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: a Ana recebeu 2 leads da campanha, veio %', x->>'recebidos';
  END IF;
  -- Mesma definição da matriz: a Ana atendeu 1 em 30 min e outro em 5h.
  IF (x->>'atendidos_1h')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: atendimento em 1h na campanha deu %, esperado 1', x->>'atendidos_1h';
  END IF;

  -- O lead pago que não chegou a ninguém: o número mais caro da tela.
  IF (r->>'sem_corretor')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 lead da campanha está sem corretor, a função diz %', r->>'sem_corretor';
  END IF;

  -- Campanha sem lead nenhum não é erro.
  r := corretores_da_campanha(t, 'campanha_vazia', '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'linhas') <> 0 OR (r->>'sem_corretor')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: campanha sem lead deveria vir vazia';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0ddd0000-0000-4000-a000-000000000099')::text, true);
  IF corretores_da_campanha(t, 'c1', '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant viu quem recebeu a campanha';
  END IF;

  RAISE NOTICE 'OK: relatório de anúncios — 11 casos';
END
$$;

-- ----------------------------------------------------------
-- 11. AS REGRAS DA VERBA PLANEJADA.
-- ----------------------------------------------------------
DO $$
DECLARE t uuid := '0ddd1111-0000-4000-a000-000000000001';
BEGIN
  -- Mês tem de ser o primeiro dia: "2026-10-15" viraria um mês que não existe
  -- e nunca casaria com o gasto agrupado por mês.
  BEGIN
    INSERT INTO verba_planejada (tenant_id, mes, empreendimento, valor)
      VALUES (t, '2026-10-15', 'RESERVA CASTANHEIRA', 5000);
    RAISE EXCEPTION 'FALHOU: aceitou verba num dia que não é o primeiro do mês';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Verba sem alvo não compara com gasto nenhum.
  BEGIN
    INSERT INTO verba_planejada (tenant_id, mes, valor) VALUES (t, '2026-10-01', 5000);
    RAISE EXCEPTION 'FALHOU: aceitou verba sem empreendimento nem campanha';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO verba_planejada (tenant_id, mes, empreendimento, valor)
    VALUES (t, '2026-10-01', 'RESERVA CASTANHEIRA', 5000);

  -- A mesma verba duas vezes viraria o dobro do planejado.
  BEGIN
    INSERT INTO verba_planejada (tenant_id, mes, empreendimento, valor)
      VALUES (t, '2026-10-01', 'RESERVA CASTANHEIRA', 3000);
    RAISE EXCEPTION 'FALHOU: aceitou duas verbas para o mesmo mês e alvo';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- E o semáforo não aceita limite abaixo do alvo, que inverteria as cores.
  BEGIN
    INSERT INTO tenant_anuncios_config (tenant_id, custo_alvo_qualificado, custo_limite_qualificado)
      VALUES (t, 100, 50);
    RAISE EXCEPTION 'FALHOU: aceitou limite abaixo do alvo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'OK: verba e semáforo — 5 regras';
END
$$;

ROLLBACK;

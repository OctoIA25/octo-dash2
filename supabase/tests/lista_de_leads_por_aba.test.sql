-- ============================================================
-- `leads_lista_por_aba` — a lista com abas de ação (P1.8).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/lista_de_leads_por_aba.test.sql
--
-- O plano define o item como pronto quando "OS CONTADORES DAS ABAS BATEM COM
-- A LISTA". É o caso 1, e é o que estes testes existem para garantir: um
-- contador que promete 312 e uma aba que mostra 280 destrói a confiança na
-- tela inteira, e a divergência só aparece quando alguém conta na mão.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t  uuid := '88888888-8888-4888-a888-888888888888';
  u  uuid := '99999999-9999-4999-a999-999999999999';
  ln uuid := 'dddddddd-1111-4111-a111-111111111111';  -- novo, sem corretor
  la uuid := 'dddddddd-2222-4111-a111-111111111111';  -- em atendimento, com atividade
  lp uuid := 'dddddddd-3333-4111-a111-111111111111';  -- parado há 20 dias
  ls uuid := 'dddddddd-4444-4111-a111-111111111111';  -- sem histórico
  r jsonb;
  c jsonb;
  aba text;
  n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'lista@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-lista', 'Teste Lista') ON CONFLICT DO NOTHING;
  -- O vínculo é OBRIGATÓRIO: `tg_leads_assignee_must_be_member` anula o
  -- corretor de quem não é membro da imobiliária — id E nome. Sem esta linha
  -- os quatro leads nasciam sem corretor e a aba "Sem corretor" mostrava 4.
  -- A trava está certa; a fixture é que estava errada.
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'corretor') ON CONFLICT DO NOTHING;

  INSERT INTO leads (id, tenant_id, name, phone, status, assigned_agent_id, assigned_agent_name, source, property_code) VALUES
    (ln, t, 'Novo Sem Corretor', '5511999990001', 'Novos Leads', NULL, 'Não atribuído', 'Meta', 'AP0001'),
    (la, t, 'Com Atividade',     '5511999990002', 'Interação',   u::text, 'Ana',          'Zap',  'AP0002'),
    (lp, t, 'Parado',            '5511999990003', 'Interação',   u::text, 'Ana',          'Meta', 'AP0003'),
    (ls, t, 'Sem Historico',     '5511999990004', 'Interação',   u::text, 'Ana',          'Zap',  'AP0004');

  -- movimento recente para `la`, antigo para `lp`, nenhum para `ls`
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at) VALUES
    (t, la::text, 'leads', 'lead.stage_changed', 'usuario', 'mexeu', now() - interval '1 day'),
    (t, lp::text, 'leads', 'lead.stage_changed', 'usuario', 'mexeu', now() - interval '20 days');

  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, lead_uuid)
  VALUES (t, 'ana@teste.dev', 'Visita', current_date + 2, '10:00', 'visita_agendada', la);

  -- ----------------------------------------------------------
  -- 1. O CONTADOR DE CADA ABA BATE COM O TOTAL DAQUELA ABA.
  --
  -- É o critério de pronto que o plano escreve. Com duas consultas separadas,
  -- cada uma com sua cópia do filtro, elas divergem no primeiro ajuste.
  -- ----------------------------------------------------------
  FOREACH aba IN ARRAY ARRAY['todos','novos','atendimento','atividade','parados','sem-corretor'] LOOP
    r := leads_lista_por_aba(t, aba, NULL, NULL, NULL, NULL, NULL, 200, 0);
    IF (r->'contadores'->>aba)::int IS DISTINCT FROM (r->>'total_na_aba')::int THEN
      RAISE EXCEPTION 'FALHOU: aba "%" tem contador % e total %',
        aba, r->'contadores'->>aba, r->>'total_na_aba';
    END IF;
    -- E o número de linhas devolvidas bate também, quando cabe na página.
    IF jsonb_array_length(r->'linhas') <> (r->>'total_na_aba')::int THEN
      RAISE EXCEPTION 'FALHOU: aba "%" promete % e devolveu % linhas',
        aba, r->>'total_na_aba', jsonb_array_length(r->'linhas');
    END IF;
  END LOOP;

  -- ----------------------------------------------------------
  -- 2. AS ABAS CLASSIFICAM CERTO.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'todos', NULL, NULL, NULL, NULL, NULL, 200, 0);
  c := r->'contadores';
  IF (c->>'todos')::int <> 4 THEN RAISE EXCEPTION 'FALHOU: todos deu %', c->>'todos'; END IF;
  IF (c->>'novos')::int <> 1 THEN RAISE EXCEPTION 'FALHOU: novos deu %', c->>'novos'; END IF;
  IF (c->>'atendimento')::int <> 3 THEN RAISE EXCEPTION 'FALHOU: atendimento deu %', c->>'atendimento'; END IF;
  IF (c->>'atividade')::int <> 1 THEN RAISE EXCEPTION 'FALHOU: atividade deu %', c->>'atividade'; END IF;
  IF (c->>'sem-corretor')::int <> 1 THEN RAISE EXCEPTION 'FALHOU: sem-corretor deu %', c->>'sem-corretor'; END IF;

  -- Novos + Em atendimento = Todos. Se não somar, algum lead está fora das
  -- duas ou nas duas, e o gestor nunca o encontra.
  IF (c->>'novos')::int + (c->>'atendimento')::int <> (c->>'todos')::int THEN
    RAISE EXCEPTION 'FALHOU: novos + atendimento nao soma todos';
  END IF;

  -- ----------------------------------------------------------
  -- 3. LEAD SEM HISTÓRICO NÃO É LEAD PARADO.
  --
  -- Decisão do chefe em 20/09/2026. São 1.249 dos 1.684 da Lotus, porque o
  -- registro de eventos só existe desde 10/09. Misturar "sei que parou" com
  -- "não sei nada" tiraria da aba o poder de apontar.
  -- ----------------------------------------------------------
  IF (c->>'parados')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: parados deu % (esperava so o lp)', c->>'parados';
  END IF;
  IF (r->>'sem_historico')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: sem_historico deu % (esperava ln e ls)', r->>'sem_historico';
  END IF;

  r := leads_lista_por_aba(t, 'parados', NULL, NULL, NULL, NULL, NULL, 200, 0);
  IF (r->'linhas'->0->>'nome') <> 'Parado' THEN
    RAISE EXCEPTION 'FALHOU: a aba Parados trouxe "%"', r->'linhas'->0->>'nome';
  END IF;

  -- ----------------------------------------------------------
  -- 4. "NÃO ATRIBUÍDO" NÃO É CORRETOR.
  --
  -- O campo nunca chega vazio nesta base. Testar só por preenchimento
  -- responde "sim" para todo mundo — foi assim que o card "Encaminhados"
  -- anunciou 2.553 leads numa imobiliária sem nenhum corretor.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'sem-corretor', NULL, NULL, NULL, NULL, NULL, 200, 0);
  IF (r->'linhas'->0->>'nome') <> 'Novo Sem Corretor' THEN
    RAISE EXCEPTION 'FALHOU: sem-corretor trouxe "%"', r->'linhas'->0->>'nome';
  END IF;
  -- E a linha não devolve o texto "Não atribuído" como se fosse gente.
  IF r->'linhas'->0->>'corretor' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: devolveu "%" como corretor', r->'linhas'->0->>'corretor';
  END IF;

  -- ----------------------------------------------------------
  -- 5. O FILTRO VALE PARA OS CONTADORES TAMBÉM.
  --
  -- Aplicá-lo só na lista faria o contador prometer linhas que a busca não
  -- mostra — e o gestor clicaria numa aba que diz 12 e abre vazia.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'todos', NULL, NULL, 'Meta', NULL, NULL, 200, 0);
  IF (r->'contadores'->>'todos')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: filtro de origem nao chegou no contador (deu %)', r->'contadores'->>'todos';
  END IF;
  -- Mas o total DA BASE ignora o filtro: é o terceiro número do rodapé.
  IF (r->>'total_na_base')::int <> 4 THEN
    RAISE EXCEPTION 'FALHOU: total_na_base virou % com filtro', r->>'total_na_base';
  END IF;

  -- ----------------------------------------------------------
  -- 6. BUSCA POR TELEFONE IGNORA A FORMATAÇÃO.
  --
  -- A coluna guarda "5511999990001"; quem digita "(11) 99999-0001" tem de
  -- achar. Comparar texto cru acharia nada, e o corretor concluiria que o
  -- lead sumiu.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'todos', '(11) 99999-0001', NULL, NULL, NULL, NULL, 200, 0);
  IF (r->>'total_na_aba')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: busca por telefone formatado achou % leads', r->>'total_na_aba';
  END IF;

  r := leads_lista_por_aba(t, 'todos', 'parad', NULL, NULL, NULL, NULL, 200, 0);
  IF (r->>'total_na_aba')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: busca por nome achou %', r->>'total_na_aba';
  END IF;

  r := leads_lista_por_aba(t, 'todos', 'AP0003', NULL, NULL, NULL, NULL, 200, 0);
  IF (r->>'total_na_aba')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: busca por codigo de imovel achou %', r->>'total_na_aba';
  END IF;

  -- ----------------------------------------------------------
  -- 7. PAGINAÇÃO: a página encolhe, o total NÃO.
  --
  -- É o rodapé "50 na tela · 312 nesta aba · 1.599 na base". Se o total
  -- seguisse a página, os três números viravam o mesmo e o rodapé não diria
  -- nada.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'todos', NULL, NULL, NULL, NULL, NULL, 2, 0);
  IF jsonb_array_length(r->'linhas') <> 2 OR (r->>'total_na_aba')::int <> 4 THEN
    RAISE EXCEPTION 'FALHOU: paginacao — % linhas de um total de %',
      jsonb_array_length(r->'linhas'), r->>'total_na_aba';
  END IF;

  -- Offset além do fim devolve lista vazia, e não erro nem a primeira página.
  r := leads_lista_por_aba(t, 'todos', NULL, NULL, NULL, NULL, NULL, 2, 999);
  IF jsonb_array_length(r->'linhas') <> 0 THEN
    RAISE EXCEPTION 'FALHOU: offset alem do fim devolveu % linhas', jsonb_array_length(r->'linhas');
  END IF;

  -- Limite absurdo é cortado, não obedecido: 100 mil linhas num JSON derruba
  -- a aba do navegador.
  r := leads_lista_por_aba(t, 'todos', NULL, NULL, NULL, NULL, NULL, 999999, 0);
  IF jsonb_array_length(r->'linhas') > 200 THEN
    RAISE EXCEPTION 'FALHOU: limite nao foi cortado';
  END IF;

  -- ----------------------------------------------------------
  -- 8. ABA DESCONHECIDA CAI EM "TODOS", e não em lista vazia.
  --
  -- A aba vem da URL, e um link velho não pode mostrar uma tela vazia que
  -- parece "você não tem lead nenhum".
  -- ----------------------------------------------------------
  r := leads_lista_por_aba(t, 'aba-que-nao-existe', NULL, NULL, NULL, NULL, NULL, 200, 0);
  IF (r->>'total_na_aba')::int <> 4 THEN
    RAISE EXCEPTION 'FALHOU: aba desconhecida deu %', r->>'total_na_aba';
  END IF;

  -- ----------------------------------------------------------
  -- 9. ESCOPO DE IMOBILIÁRIA.
  -- ----------------------------------------------------------
  r := leads_lista_por_aba('00000000-0000-4000-a000-000000000000'::uuid, 'todos', NULL, NULL, NULL, NULL, NULL, 200, 0);
  IF (r->>'total_na_aba')::int <> 0 OR jsonb_array_length(r->'linhas') <> 0 THEN
    RAISE EXCEPTION 'FALHOU: lista vazou para outra imobiliaria';
  END IF;

  RAISE NOTICE 'lista_de_leads_por_aba: 9 casos OK';
END $$;

ROLLBACK;

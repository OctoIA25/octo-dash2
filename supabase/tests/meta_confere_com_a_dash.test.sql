-- ============================================================
-- A conferência Meta ↔ Dash na tela de Formulários (item 6).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/meta_confere_com_a_dash.test.sql
--
-- O caso 3 é o que sustenta o arquivo: evento parado na fila é a Meta ter
-- avisado e o lead não existir. É a única divergência sem explicação inocente
-- — e é o que o chefe pediu que fosse alertado.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2fff9999-0000-4000-a000-000000000001';
  r jsonb;
  linha jsonb;
  c jsonb;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-meta-conf', 'Casa')
  ON CONFLICT DO NOTHING;

  INSERT INTO meta_formularios (tenant_id, form_id, page_id, nome)
  VALUES (casa, 'form-A', 'pag-1', 'Reserva Castanheira'),
         (casa, 'form-B', 'pag-1', 'Alto Padrão');

  -- Três leads do form-A na Dash.
  INSERT INTO leads (tenant_id, name, source, meta_form_id, meta_campaign_id)
  VALUES (casa, 'Lead 1', 'Facebook', 'form-A', 'camp-1'),
         (casa, 'Lead 2', 'Facebook', 'form-A', 'camp-1'),
         (casa, 'Lead 3', 'Instagram', 'form-A', NULL);

  -- ----------------------------------------------------------
  -- 1. SEM TER PERGUNTADO À META, A DIFERENÇA É NULA — E NÃO ZERO
  --
  -- Zero diria "conferi e está igual". Nulo diz "não perguntei". A tela
  -- precisa dos dois separados, senão um formulário nunca sincronizado
  -- aparece como conferido.
  -- ----------------------------------------------------------
  r := public.meta_formularios_painel(casa);
  SELECT x INTO linha FROM jsonb_array_elements(r->'linhas') x WHERE x->>'form_id' = 'form-A';
  IF linha->>'leads_na_meta' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 1: leads_na_meta veio % sem ninguém ter perguntado', linha->>'leads_na_meta';
  END IF;
  IF linha->>'diferenca' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 1: diferenca veio % (esperava nulo)', linha->>'diferenca';
  END IF;
  IF ((r->'contadores')->>'formularios_conferidos')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU 1: contou formulário conferido sem conferência';
  END IF;
  RAISE NOTICE 'OK 1: sem sincronizar, a diferença é nula e nada aparece conferido';

  -- ----------------------------------------------------------
  -- 2. COM O NÚMERO DA META, A DIFERENÇA SAI NOS DOIS SENTIDOS
  --
  -- A Meta diz 10 e temos 3 → faltam 7. A Meta diz 1 e temos 3 → sobra 2,
  -- e isso TAMBÉM tem que aparecer: é sintoma de duplicata ou importação
  -- manual. A conferência antiga usava max(0, …) e escondia metade dos casos.
  -- ----------------------------------------------------------
  UPDATE meta_formularios SET leads_na_meta = 10, leads_na_meta_em = now()
   WHERE tenant_id = casa AND form_id = 'form-A';

  r := public.meta_formularios_painel(casa);
  SELECT x INTO linha FROM jsonb_array_elements(r->'linhas') x WHERE x->>'form_id' = 'form-A';
  IF (linha->>'diferenca')::int IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FALHOU 2: diferenca veio % (esperava 7)', linha->>'diferenca';
  END IF;

  UPDATE meta_formularios SET leads_na_meta = 1 WHERE tenant_id = casa AND form_id = 'form-A';
  r := public.meta_formularios_painel(casa);
  SELECT x INTO linha FROM jsonb_array_elements(r->'linhas') x WHERE x->>'form_id' = 'form-A';
  IF (linha->>'diferenca')::int IS DISTINCT FROM -2 THEN
    RAISE EXCEPTION 'FALHOU 2: o sentido inverso foi escondido (veio %)', linha->>'diferenca';
  END IF;
  RAISE NOTICE 'OK 2: a diferença aparece nos dois sentidos, sem max(0, …)';

  -- ----------------------------------------------------------
  -- 3. O EVENTO PARADO NA FILA É O ALERTA
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO. Um `failed`, ou um `pending` de
  -- horas atrás, é a Meta tendo avisado e o lead não existindo. Não depende
  -- de quando a integração começou, não tem leitura inocente, e é exatamente
  -- "o lead não migrou para a Dash".
  -- ----------------------------------------------------------
  INSERT INTO meta_leadgen_events (leadgen_id, tenant_id, page_id, form_id, raw, status, last_error, created_at)
  VALUES ('lg-1', casa, 'pag-1', 'form-A', '{}'::jsonb, 'failed', 'token expirado', now()),
         ('lg-2', casa, 'pag-1', 'form-A', '{}'::jsonb, 'failed', 'token expirado', now()),
         -- pending recente NÃO conta: é a fila andando, não um problema.
         ('lg-3', casa, 'pag-1', 'form-A', '{}'::jsonb, 'pending', NULL, now()),
         -- pending de ontem conta: parou.
         ('lg-4', casa, 'pag-1', 'form-A', '{}'::jsonb, 'pending', NULL, now() - interval '1 day');

  r := public.meta_formularios_painel(casa);
  SELECT x INTO linha FROM jsonb_array_elements(r->'linhas') x WHERE x->>'form_id' = 'form-A';
  IF (linha->>'eventos_travados')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 3: eventos_travados veio %', linha->>'eventos_travados';
  END IF;
  IF (linha->>'eventos_parados')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 3: eventos_parados veio % (o pending recente não podia contar)', linha->>'eventos_parados';
  END IF;
  IF linha->>'ultimo_erro' IS DISTINCT FROM 'token expirado' THEN
    RAISE EXCEPTION 'FALHOU 3: o motivo do erro não chegou na tela';
  END IF;
  RAISE NOTICE 'OK 3: a fila travada aparece, com o motivo, e o pending recente não vira alarme';

  -- ----------------------------------------------------------
  -- 4. O FORMULÁRIO COM FILA TRAVADA VEM PRIMEIRO
  --
  -- Ordenar por volume deixaria o problema na terceira página numa casa com
  -- muitos formulários — e um alerta que exige rolagem não é um alerta.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, source, meta_form_id)
  SELECT casa, 'Lead B '||g, 'Facebook', 'form-B' FROM generate_series(1, 50) g;

  r := public.meta_formularios_painel(casa);
  IF (r->'linhas'->0)->>'form_id' IS DISTINCT FROM 'form-A' THEN
    RAISE EXCEPTION 'FALHOU 4: o formulário com fila travada não veio primeiro (veio %)',
      (r->'linhas'->0)->>'form_id';
  END IF;
  RAISE NOTICE 'OK 4: quem precisa de gente vem primeiro, não quem tem mais volume';

  -- ----------------------------------------------------------
  -- 5. O TOTAL DA META FALA SÓ DO QUE FOI PERGUNTADO
  --
  -- O form-B nunca foi sincronizado, e os 50 leads dele estão na Dash. Se o
  -- total da Meta o incluísse de alguma forma, a conferência inverteria de
  -- sinal e a tela acusaria perda onde não há.
  --
  -- HONESTIDADE SOBRE ESTE CASO: ele não distingue as duas escritas possíveis
  -- do total, porque `sum` do SQL já ignora nulo — foi uma sabotagem que
  -- passou cega que mostrou isso, e o FILTER decorativo saiu da migração por
  -- causa dela. O que o caso ainda segura é o par de números: o total ao lado
  -- de `formularios_conferidos`, que é o que diz sobre quantos ele fala.
  -- ----------------------------------------------------------
  c := r->'contadores';
  IF (c->>'leads_na_meta')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 5: leads_na_meta somou % (só o form-A foi conferido)', c->>'leads_na_meta';
  END IF;
  IF (c->>'formularios_conferidos')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 5: formularios_conferidos veio %', c->>'formularios_conferidos';
  END IF;
  IF (c->>'eventos_travados')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 5: o total de travados veio %', c->>'eventos_travados';
  END IF;
  RAISE NOTICE 'OK 5: o total da Meta só soma o que foi perguntado';

  -- ----------------------------------------------------------
  -- 6. A TELA SABE O QUE ELA NÃO ENXERGA
  --
  -- Campanha de clique-para-WhatsApp não tem formulário e não aparece aqui.
  -- Medido na Lotus em 23/09: são 46% do gasto. Uma conferência que só olha
  -- formulário diria "está tudo certo" e estaria cega para a metade mais cara.
  -- ----------------------------------------------------------
  INSERT INTO meta_insights_diarios (tenant_id, data, campaign_id, campaign_nome, ad_id,
                                     resultado_indicador, resultados, gasto)
  VALUES (casa, CURRENT_DATE, 'camp-wpp-1', 'LEAD Entrada e Médio', 'ad-1',
          'actions:onsite_conversion.messaging_conversation_started_7d', 81, 1098),
         (casa, CURRENT_DATE, 'camp-wpp-2', 'LEAD Alto Padrão', 'ad-2',
          'actions:onsite_conversion.messaging_conversation_started_7d', 42, 590),
         -- Esta gera formulário: NÃO pode entrar na conta.
         (casa, CURRENT_DATE, 'camp-form', 'Reserva Castanheira', 'ad-3',
          'actions:lead', 146, 2246);

  r := public.meta_formularios_painel(casa);
  IF ((r->'contadores')->>'campanhas_sem_formulario')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 6: campanhas_sem_formulario veio %',
      (r->'contadores')->>'campanhas_sem_formulario';
  END IF;
  RAISE NOTICE 'OK 6: a tela conta as campanhas que ela não enxerga';

  -- ----------------------------------------------------------
  -- 7. A VIZINHA NÃO VÊ NADA DISSO
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', '9f999999-0000-4000-a000-999999999999', 'role', 'authenticated')::text, true);
  r := public.meta_formularios_painel(casa);
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 7: um logado de fora leu o painel desta casa';
  END IF;
  RAISE NOTICE 'OK 7: quem não é da casa recebe nulo';
END $$;

ROLLBACK;

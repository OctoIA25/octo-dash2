-- ============================================================
-- Conferência de vendas (P4.4).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/conferencia_de_vendas.test.sql
--
-- OS TRÊS CRITÉRIOS DE PRONTO DO PLANO, nos casos 1, 3 e 6:
--   1. Assinar um negócio cria a venda com a comissão calculada.
--   3. Mudar o nível do corretor depois NÃO altera a venda já registrada.
--   6. Totais do rodapé batem com a soma das linhas.
--
-- O caso 4 é o que protege dinheiro de gente: o percentual de comissão é
-- travado, e mudá-lo exige owner E justificativa.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '1aaa1111-0000-4000-a000-000000000001';
  gestor uuid := '1aaa0000-0000-4000-a000-000000000001';
  ana uuid := '1aaa0000-0000-4000-a000-000000000002';
  constr uuid := '1aaa2222-0000-4000-a000-000000000001';
  lanc uuid := '1aaa3333-0000-4000-a000-000000000001';
  lead1 uuid;
  prop uuid;
  prop2 uuid;
  v record;
  r jsonb;
  n numeric;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-venda.dev'), (ana, 'ana@teste-venda.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-venda', 'Teste Venda') ON CONFLICT DO NOTHING;
  -- O owner da plataforma precisa existir: `is_platform_owner()` confere o
  -- e-mail do token contra esta tabela, e ela está vazia no banco local.
  INSERT INTO platform_owners (email) VALUES ('owner@teste-venda.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, nivel) VALUES
    (t, gestor, 'admin', NULL),
    -- A Ana é JÚNIOR no dia da venda. Vai ser promovida depois, no caso 3.
    (t, ana, 'corretor', 'junior')
  ON CONFLICT DO NOTHING;

  INSERT INTO construtoras (id, tenant_id, codigo, nome, comissao_padrao_pct)
    VALUES (constr, t, 'santa_angela', 'Santa Ângela', 5) ON CONFLICT DO NOTHING;
  INSERT INTO lancamentos (id, tenant_id, nome, construtora)
    VALUES (lanc, t, 'Reserva Castanheira', 'Santa Ângela') ON CONFLICT DO NOTHING;

  -- 6% de imposto sobre a comissão bruta.
  INSERT INTO tenant_fiscal_config (tenant_id, regime_tributario, imposto_pct)
    VALUES (t, 'simples', 6) ON CONFLICT (tenant_id) DO UPDATE SET imposto_pct = 6;

  -- O lead nasce em "Novos Leads" de propósito: um lead já em "Proposta
  -- Assinada" dispara `tr_leads_mirror_to_proposals`, que cria a proposta
  -- sozinho — e o fixture criaria uma segunda, batendo na chave única
  -- (tenant, lead). Vale registrar: a corrente lead → proposta → venda
  -- funciona inteira por esse caminho.
  INSERT INTO leads (tenant_id, name, phone, status, created_at)
  VALUES (t, 'Cliente da Venda', '11999998888', 'Novos Leads', '2026-09-01')
  RETURNING id INTO lead1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. ASSINAR CRIA A VENDA, COM A COMISSÃO CALCULADA.
  --
  -- Primeiro critério de pronto do plano.
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, lead_id, stage_id, value, agent_user_id, agent_name,
                         forecast_empreendimento, signed_at)
  VALUES (t, lead1, 'proposta-criada', 600000, ana, 'Ana', 'Reserva Castanheira', '2026-09-10')
  RETURNING id INTO prop;

  -- Ainda não é venda: a proposta não foi assinada.
  IF EXISTS (SELECT 1 FROM vendas WHERE proposta_id = prop) THEN
    RAISE EXCEPTION 'FALHOU: proposta não assinada virou venda';
  END IF;

  UPDATE proposals SET stage_id = 'proposta-assinada' WHERE id = prop;

  SELECT * INTO v FROM vendas WHERE proposta_id = prop;
  IF v IS NULL THEN
    RAISE EXCEPTION 'FALHOU: assinar a proposta não criou a venda';
  END IF;

  -- 600.000 × 5% = 30.000 de bruta.
  IF v.comissao_bruta IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: a comissão bruta deu % e deveria dar 30000', v.comissao_bruta;
  END IF;
  -- 30.000 × 6% = 1.800 de imposto; líquida 28.200.
  IF v.imposto_valor IS DISTINCT FROM 1800 OR v.comissao_liquida IS DISTINCT FROM 28200 THEN
    RAISE EXCEPTION 'FALHOU: imposto % e líquida % — esperado 1800 e 28200',
      v.imposto_valor, v.comissao_liquida;
  END IF;

  -- O VÍNCULO COM O LEAD, que é o que destrava o ROI do P3.5.
  IF v.lead_id IS DISTINCT FROM lead1 THEN
    RAISE EXCEPTION 'FALHOU: a venda nasceu sem o lead — o ROI continuaria vazio';
  END IF;

  -- E o tipo veio do lançamento casado.
  IF v.tipo IS DISTINCT FROM 'lancamento' OR v.lancamento_id IS DISTINCT FROM lanc THEN
    RAISE EXCEPTION 'FALHOU: a venda não casou com o lançamento';
  END IF;
  IF v.construtora_id IS DISTINCT FROM constr THEN
    RAISE EXCEPTION 'FALHOU: a venda não chegou à construtora';
  END IF;

  -- ----------------------------------------------------------
  -- 2. A MESMA PROPOSTA NÃO VIRA DUAS VENDAS.
  --
  -- Seriam duas comissões pagas pelo mesmo negócio.
  -- ----------------------------------------------------------
  UPDATE proposals SET stage_id = 'negociacao' WHERE id = prop;
  UPDATE proposals SET stage_id = 'proposta-assinada' WHERE id = prop;

  SELECT count(*) INTO n FROM vendas WHERE proposta_id = prop;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: assinar de novo criou % vendas da mesma proposta', n;
  END IF;

  -- ----------------------------------------------------------
  -- 3. PROMOVER O CORRETOR NÃO MEXE NA VENDA JÁ REGISTRADA.
  --
  -- Segundo critério de pronto do plano. A Ana era júnior quando vendeu.
  -- ----------------------------------------------------------
  SELECT * INTO v FROM vendas WHERE proposta_id = prop;
  IF v.nivel_corretor IS DISTINCT FROM 'junior' THEN
    RAISE EXCEPTION 'FALHOU: a venda deveria ter congelado o nível junior, congelou %', v.nivel_corretor;
  END IF;

  -- A Ana é promovida a sênior em dezembro.
  UPDATE tenant_memberships SET nivel = 'senior' WHERE tenant_id = t AND user_id = ana;

  SELECT * INTO v FROM vendas WHERE proposta_id = prop;
  IF v.nivel_corretor IS DISTINCT FROM 'junior' THEN
    RAISE EXCEPTION 'FALHOU: promover a Ana mudou o nível da venda de setembro para %', v.nivel_corretor;
  END IF;

  -- ----------------------------------------------------------
  -- 4. O PERCENTUAL DE COMISSÃO É TRAVADO.
  --
  -- É o que vira dinheiro de gente. Mudar exige owner E justificativa.
  -- ----------------------------------------------------------
  BEGIN
    UPDATE vendas SET comissao_pct = 8 WHERE id = v.id;
    RAISE EXCEPTION 'FALHOU: um admin comum mudou o percentual de comissão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Owner da plataforma, mas SEM justificativa: também não passa.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gestor::text, 'email', 'owner@teste-venda.dev')::text, true);
  BEGIN
    UPDATE vendas SET comissao_pct = 8 WHERE id = v.id;
    RAISE EXCEPTION 'FALHOU: o owner mudou o percentual sem justificativa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Com as duas coisas, passa — e fica no histórico.
  PERFORM set_config('app.justificativa_comissao', 'contrato renegociado com a construtora', true);
  UPDATE vendas SET comissao_pct = 8 WHERE id = v.id;

  SELECT count(*) INTO n FROM venda_historico WHERE venda_id = v.id AND campo = 'comissao_pct';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a mudança de percentual não foi para o histórico';
  END IF;
  IF (SELECT justificativa FROM venda_historico WHERE venda_id = v.id LIMIT 1)
     IS DISTINCT FROM 'contrato renegociado com a construtora' THEN
    RAISE EXCEPTION 'FALHOU: o histórico não guardou a justificativa';
  END IF;

  PERFORM set_config('app.justificativa_comissao', '', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 5. DIVERGÊNCIA É CONCLUÍDA, E NÃO MARCADA À MÃO.
  --
  -- Deixar alguém marcar faria a divergência depender de reparar nela.
  --
  -- O previsto é a comissão BRUTA (30.000), porque é ela que a construtora
  -- deposita — o imposto é pago depois, pela casa. Comparar contra a líquida
  -- acusava divergência justamente no recebimento certo.
  -- ----------------------------------------------------------
  UPDATE vendas SET recebido_em = '2026-10-10', valor_recebido = 30000 WHERE id = v.id;
  SELECT * INTO v FROM vendas WHERE id = v.id;
  IF v.status IS DISTINCT FROM 'recebido' THEN
    RAISE EXCEPTION 'FALHOU: recebeu a bruta e o status deu %', v.status;
  END IF;

  -- E receber a LÍQUIDA é divergência: faltou o imposto no depósito.
  UPDATE vendas SET valor_recebido = 28200 WHERE id = v.id;
  SELECT * INTO v FROM vendas WHERE id = v.id;
  IF v.status IS DISTINCT FROM 'divergente' THEN
    RAISE EXCEPTION 'FALHOU: recebeu a líquida contra a bruta e o status deu %', v.status;
  END IF;
  IF v.diferenca IS DISTINCT FROM -1800 THEN
    RAISE EXCEPTION 'FALHOU: a diferença deveria ser -1800 (o imposto), deu %', v.diferenca;
  END IF;

  UPDATE vendas SET valor_recebido = 25000 WHERE id = v.id;
  SELECT * INTO v FROM vendas WHERE id = v.id;
  IF v.diferenca IS DISTINCT FROM -5000 THEN
    RAISE EXCEPTION 'FALHOU: a diferença deveria ser -5000, deu %', v.diferenca;
  END IF;

  -- Um centavo é arredondamento de banco, e não divergência.
  UPDATE vendas SET valor_recebido = 30000.01 WHERE id = v.id;
  IF (SELECT status FROM vendas WHERE id = v.id) IS DISTINCT FROM 'recebido' THEN
    RAISE EXCEPTION 'FALHOU: um centavo de diferença virou divergência';
  END IF;

  UPDATE vendas SET valor_recebido = 30000 WHERE id = v.id;

  -- ----------------------------------------------------------
  -- 6. OS TOTAIS BATEM COM A SOMA DAS LINHAS.
  --
  -- Terceiro critério de pronto do plano.
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, stage_id, value, agent_user_id, agent_name,
                         forecast_empreendimento, signed_at)
  VALUES (t, 'proposta-assinada', 400000, ana, 'Ana', 'Reserva Castanheira', '2026-09-15')
  RETURNING id INTO prop2;

  -- Antes de qualquer recebimento a diferença é NULA, e não a comissão inteira
  -- negativa: "não recebi ainda" não é "recebi a menos". Esta venda acabou de
  -- nascer e não tem recebimento — é o caso exato.
  IF (SELECT diferenca FROM vendas WHERE proposta_id = prop2) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: venda sem recebimento ficou com diferença %',
      (SELECT diferenca FROM vendas WHERE proposta_id = prop2);
  END IF;

  r := vendas_conferencia(t, '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'linhas') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: deveriam vir 2 vendas, vieram %', jsonb_array_length(r->'linhas');
  END IF;

  SELECT sum((l->>'vgv')::numeric) INTO n FROM jsonb_array_elements(r->'linhas') l;
  IF n IS DISTINCT FROM (r->'totais'->>'vgv')::numeric THEN
    RAISE EXCEPTION 'FALHOU: a soma dos VGV das linhas deu % e o rodapé diz %',
      n, r->'totais'->>'vgv';
  END IF;

  SELECT sum((l->>'comissao_liquida')::numeric) INTO n FROM jsonb_array_elements(r->'linhas') l;
  IF n IS DISTINCT FROM (r->'totais'->>'comissao_liquida')::numeric THEN
    RAISE EXCEPTION 'FALHOU: a soma das líquidas deu % e o rodapé diz %',
      n, r->'totais'->>'comissao_liquida';
  END IF;

  -- E o filtro não quebra o fechamento: com o filtro, linhas e rodapé mudam
  -- JUNTOS. É por isso que os dois saem da mesma consulta.
  r := vendas_conferencia(t, '2026-09-01', '2026-09-30', 'a_faturar');
  SELECT sum((l->>'vgv')::numeric) INTO n FROM jsonb_array_elements(r->'linhas') l;
  IF n IS DISTINCT FROM (r->'totais'->>'vgv')::numeric THEN
    RAISE EXCEPTION 'FALHOU: com filtro, a soma deu % e o rodapé %', n, r->'totais'->>'vgv';
  END IF;

  -- ----------------------------------------------------------
  -- 7. PROPOSTA SEM VALOR NÃO VIRA VENDA.
  --
  -- Sem VGV não há comissão a calcular, e uma venda de R$ 0 atrapalha a
  -- conferência. São 9 das 70 em produção.
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, stage_id, value, signed_at, forecast_empreendimento)
  VALUES (t, 'proposta-assinada', 0, '2026-09-20', 'Reserva Castanheira');

  SELECT count(*) INTO n FROM vendas WHERE tenant_id = t;
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: proposta sem valor virou venda (total %)', n;
  END IF;

  -- A carga inicial lista o que ficou de fora, com o motivo.
  r := vendas_importar_assinadas(t);
  IF jsonb_array_length(r->'de_fora') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a proposta sem valor deveria aparecer na lista de fora — %', r;
  END IF;
  IF (r->'de_fora'->0->>'motivo') NOT LIKE '%sem valor%' THEN
    RAISE EXCEPTION 'FALHOU: a lista de fora não diz o motivo';
  END IF;
  -- E não duplica o que já existe.
  IF (r->>'criadas')::int IS DISTINCT FROM 0 OR (r->>'ja_existiam')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a carga inicial duplicou ou perdeu vendas — %', r;
  END IF;

  -- A CARGA CRIA DE VERDADE. Sem este caso, o anterior passava com a
  -- importação completamente quebrada: ela redispara o gatilho com um UPDATE
  -- que repõe o mesmo estágio, e uma guarda de "não mudou" o descartava em
  -- silêncio — contava as vendas e não criava nenhuma. Apagar e reimportar é
  -- o único jeito de o teste tocar esse caminho.
  DELETE FROM vendas WHERE tenant_id = t AND proposta_id = prop;
  r := vendas_importar_assinadas(t);
  IF (r->>'criadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a carga inicial não recriou a venda apagada — %', r;
  END IF;
  SELECT * INTO v FROM vendas WHERE proposta_id = prop;
  IF v.comissao_bruta IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: a venda recriada pela carga veio com comissão %', v.comissao_bruta;
  END IF;
  -- E o nível volta congelado, mesmo com a Ana já promovida a sênior no caso 3.
  IF v.nivel_corretor IS DISTINCT FROM 'senior' THEN
    RAISE EXCEPTION 'FALHOU: a venda recriada deveria congelar o nível ATUAL (senior), veio %', v.nivel_corretor;
  END IF;

  -- ----------------------------------------------------------
  -- 8. SEM CONSTRUTORA CASADA, O PERCENTUAL NASCE ZERO — E APARECE.
  --
  -- Chutar um percentual produziria comissão errada com cara de certa.
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, stage_id, value, signed_at, forecast_empreendimento)
  VALUES (t, 'proposta-assinada', 300000, '2026-09-22', 'Empreendimento Desconhecido');

  r := vendas_conferencia(t, '2026-09-01', '2026-09-30');
  IF (r->'totais'->>'sem_percentual')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a venda sem construtora deveria contar em sem_percentual, deu %',
      r->'totais'->>'sem_percentual';
  END IF;

  -- ----------------------------------------------------------
  -- 9. CORRETOR VÊ A PRÓPRIA VENDA, MAS NÃO A CONFERÊNCIA INTEIRA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF vendas_conferencia(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: um corretor abriu a conferência de vendas da casa';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '1aaa0000-0000-4000-a000-000000000099')::text, true);
  IF vendas_conferencia(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu a conferência';
  END IF;

  -- ----------------------------------------------------------
  -- 10. A CONFERÊNCIA ESCREVE PELA FUNÇÃO, E O STATUS SEGUE O FATO.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  SELECT * INTO v FROM vendas WHERE proposta_id = prop;

  PERFORM venda_atualizar(v.id, 'NF-1234', '2026-09-20', NULL, '2026-10-05', NULL, NULL, '');
  IF (SELECT status FROM vendas WHERE id = v.id) IS DISTINCT FROM 'faturado' THEN
    RAISE EXCEPTION 'FALHOU: com NF a venda deveria ficar faturada, ficou %',
      (SELECT status FROM vendas WHERE id = v.id);
  END IF;

  -- Recebido sem valor é engano de digitação, não recebimento de zero.
  BEGIN
    PERFORM venda_atualizar(v.id, 'NF-1234', '2026-09-20', NULL, '2026-10-05', '2026-10-05', NULL, '');
    RAISE EXCEPTION 'FALHOU: marcou como recebida sem valor';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Limpar o número da NF tem que limpar de verdade: o formulário vai inteiro.
  PERFORM venda_atualizar(v.id, '', NULL, NULL, '2026-10-05', NULL, NULL, '');
  IF (SELECT nf_numero FROM vendas WHERE id = v.id) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: apagar o número da NF não apagou';
  END IF;

  -- E ficou histórico das três passadas.
  IF (SELECT count(*) FROM venda_historico WHERE venda_id = v.id AND campo = 'nf_numero') < 2 THEN
    RAISE EXCEPTION 'FALHOU: a conferência não deixou histórico';
  END IF;

  -- ----------------------------------------------------------
  -- 11. A FOLHA DE REPASSE TEM QUE FECHAR A COMISSÃO BRUTA.
  --
  -- O motor do front já confere, mas quem chama a API não é obrigado a ser a
  -- tela. Uma folha que não fecha é dinheiro sumindo ou sobrando. Medido na
  -- planilha da Lotus: corretor + líder dão 60% do BRUTO, e a casa fica com 40%.
  -- ----------------------------------------------------------
  SELECT * INTO v FROM vendas WHERE id = v.id;
  BEGIN
    PERFORM venda_gravar_repasses(v.id, jsonb_build_array(
      jsonb_build_object('papel', 'corretor', 'parte', 'Ana', 'nivel', 'junior',
                         'percentual', 40, 'valor', 1)));
    RAISE EXCEPTION 'FALHOU: gravou folha de repasse que não fecha';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM venda_gravar_repasses(v.id, jsonb_build_array(
    jsonb_build_object('papel', 'corretor', 'parte', 'Ana', 'nivel', 'junior',
                       'percentual', 40, 'valor', round(v.comissao_bruta * 0.4, 2)),
    jsonb_build_object('papel', 'lotus', 'parte', 'Lotus', 'nivel', NULL,
                       'percentual', 60, 'valor', v.comissao_bruta - round(v.comissao_bruta * 0.4, 2))));
  IF (SELECT count(*) FROM venda_repasses WHERE venda_id = v.id) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: deveriam ter ficado 2 repasses';
  END IF;

  -- O nível do repasse também é congelado: a promoção da Ana já aconteceu no
  -- caso 3, e a linha grava 'junior' porque foi isso que a tela calculou.
  IF (SELECT nivel FROM venda_repasses WHERE venda_id = v.id AND papel = 'corretor')
     IS DISTINCT FROM 'junior' THEN
    RAISE EXCEPTION 'FALHOU: o repasse não congelou o nível';
  END IF;

  -- ----------------------------------------------------------
  -- 12. RECALCULAR NÃO REESCREVE O QUE JÁ FOI PAGO.
  -- ----------------------------------------------------------
  PERFORM venda_repasse_pago(
    (SELECT id FROM venda_repasses WHERE venda_id = v.id AND papel = 'corretor'), true);
  BEGIN
    PERFORM venda_gravar_repasses(v.id, jsonb_build_array(
      jsonb_build_object('papel', 'lotus', 'parte', 'Lotus', 'nivel', NULL,
                         'percentual', 100, 'valor', v.comissao_bruta)));
    RAISE EXCEPTION 'FALHOU: recalculou por cima de repasse já pago';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 13. O CORRETOR NÃO ESCREVE NA CONFERÊNCIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF venda_atualizar(v.id, 'NF-DA-ANA', NULL, NULL, NULL, NULL, NULL, '') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora escreveu na conferência de vendas';
  END IF;
  IF venda_detalhe(v.id) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora abriu o detalhe da venda';
  END IF;
  IF (SELECT nf_numero FROM vendas WHERE id = v.id) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a recusa não impediu a escrita';
  END IF;

  -- ----------------------------------------------------------
  -- 14. O PERCENTUAL VEM DO VÍNCULO POR ID, NÃO DO NOME DIGITADO.
  --
  -- `lancamentos.construtora` é texto livre. Visto no banco local em 21/09: o
  -- cadastro dizia "Santa Ângela Incorporadora" e o lançamento dizia "Santa
  -- Ângela" — a venda nasceu com comissão zero e nada na tela explicava.
  -- Aqui o nome é deliberadamente diferente do cadastro: só o `construtora_id`
  -- pode fazer o percentual chegar.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  INSERT INTO lancamentos (id, tenant_id, nome, construtora, construtora_id)
  VALUES ('1aaa3333-0000-4000-a000-000000000002', t, 'Torre Sul',
          'Nome Que Nao Casa Com Cadastro Nenhum', constr);

  INSERT INTO leads (tenant_id, name, phone, status, created_at)
  VALUES (t, 'Cliente da Torre', '11955554444', 'Novos Leads', '2026-09-02')
  RETURNING id INTO lead1;

  INSERT INTO proposals (tenant_id, lead_id, stage_id, value, agent_user_id, agent_name,
                         forecast_empreendimento, signed_at)
  VALUES (t, lead1, 'proposta-assinada', 200000, ana, 'Ana', 'Torre Sul', '2026-09-10')
  RETURNING id INTO prop2;

  SELECT * INTO v FROM vendas WHERE proposta_id = prop2;
  IF v.comissao_pct IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FALHOU: o percentual deveria vir do construtora_id (5), veio %', v.comissao_pct;
  END IF;
  IF v.construtora_id IS DISTINCT FROM constr THEN
    RAISE EXCEPTION 'FALHOU: a venda não guardou a construtora do vínculo';
  END IF;

  -- ----------------------------------------------------------
  -- 15. A NOTA FISCAL É DE ADMIN. O corretor não sobe nem lê.
  -- ----------------------------------------------------------
  -- Documento financeiro da casa: o bucket é privado e o recorte vem do
  -- caminho `tenant/venda/arquivo`. Testado aqui porque é fronteira de
  -- segurança — e porque a política de storage não aparece em nenhuma tela.
  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('vendas-nf', t::text || '/qualquer/nota.pdf', ana);
    RAISE EXCEPTION 'FALHOU: a corretora subiu nota fiscal da casa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('vendas-nf', t::text || '/venda/nota.pdf', gestor);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'vendas-nf') THEN
    RAISE EXCEPTION 'FALHOU: a corretora leu a nota fiscal da casa';
  END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'OK: conferência de vendas — 15 casos';
END
$$;

ROLLBACK;

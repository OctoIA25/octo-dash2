-- ============================================================
-- Formulários da Meta um a um (P2.7).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/formularios_da_meta.test.sql
--
-- O caso 2 é o que faz o item inteiro funcionar: o gatilho que promove o
-- `raw_data.meta` do lead para coluna. Sem ele, cada escritor de lead da Meta
-- — webhook, "Baixar leads", e amanhã a LIA — teria que lembrar de preencher
-- seis colunas, e o primeiro que esquecesse sumiria do painel em silêncio.
--
-- O caso 3 protege o "Baixar leads": completar a campanha de um lead antigo não
-- pode ser desfeito pela próxima escrita.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t      uuid := 'eeeeeee1-1111-4111-a111-111111111111';
  t2     uuid := 'eeeeeee9-9999-4111-a111-111111111111';
  u      uuid := 'eeeeeee2-2222-4111-a111-111111111111';
  u_fora uuid := 'eeeeeee3-3333-4111-a111-111111111111';
  lead_a uuid;
  p      jsonb;
  r      record;
  n      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'meta@teste.dev'), (u_fora, 'fora.meta@teste.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-meta', 'Teste Meta'), (t2, 'teste-meta-2', 'Vizinha Meta')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  -- O de-para que já existe e que o painel lê. Um formulário amarrado, outro não.
  INSERT INTO lancamento_anuncios (tenant_id, origin_listing_id, codigo)
  VALUES (t, 'form-com-empreendimento', 'RESERVA CASTANHEIRA')
  ON CONFLICT DO NOTHING;

  INSERT INTO meta_formularios (tenant_id, form_id, nome)
  VALUES (t, 'form-com-empreendimento', 'Reserva Castanheira'),
         (t, 'form-solto', 'Campanha sem empreendimento');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O PAINEL É DE QUEM PERTENCE À IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF meta_formularios_painel(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu o painel da Meta';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 2. O GATILHO PROMOVE O JSONB A COLUNA.
  --
  -- Quem escreve o lead manda tudo dentro de `raw_data.meta` — é o formato que
  -- o normalizer já produz há meses. O banco é que promove, para não haver
  -- seis colunas a lembrar em cada escritor.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, custom_fields)
  VALUES (t, 'Lead da Meta', jsonb_build_object(
    'raw_data', jsonb_build_object('meta', jsonb_build_object(
      'form_id', 'form-com-empreendimento',
      'ad_id', 'anuncio-1',
      'adset_id', 'conjunto-1',
      'campaign_id', 'campanha-1',
      'captacao_ativa', true,
      'lia_atende', false
    ))))
  RETURNING id INTO lead_a;

  SELECT meta_form_id, meta_ad_id, meta_adset_id, meta_campaign_id, meta_captado, meta_lia_atende
    INTO r FROM leads WHERE id = lead_a;
  IF r.meta_form_id IS DISTINCT FROM 'form-com-empreendimento' OR r.meta_campaign_id IS DISTINCT FROM 'campanha-1'
     OR r.meta_adset_id IS DISTINCT FROM 'conjunto-1' OR r.meta_ad_id IS DISTINCT FROM 'anuncio-1' THEN
    RAISE EXCEPTION 'FALHOU: o gatilho não promoveu os ids — %', to_jsonb(r);
  END IF;
  IF r.meta_captado IS NOT TRUE OR r.meta_lia_atende IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: o gatilho não promoveu a configuração do formulário — %', to_jsonb(r);
  END IF;

  -- Lead que não é da Meta passa intacto.
  INSERT INTO leads (tenant_id, name, custom_fields) VALUES (t, 'Lead comum', '{"source":"manual"}'::jsonb);
  SELECT count(*) INTO n FROM leads WHERE tenant_id = t AND name = 'Lead comum' AND meta_form_id IS NOT NULL;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: carimbou lead que não é da Meta';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O QUE FOI COMPLETADO À MÃO NÃO É DESFEITO.
  --
  -- É o "Baixar leads" recuperando a campanha dos 56 leads que entraram antes
  -- de 12/09. Se a próxima escrita no lead sobrescrevesse com o jsonb antigo
  -- (que não tem campanha), o trabalho se perderia na primeira edição.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, custom_fields)
  VALUES (t, 'Lead antigo', jsonb_build_object(
    'raw_data', jsonb_build_object('meta', jsonb_build_object('form_id', 'form-solto'))));

  UPDATE leads SET meta_campaign_id = 'recuperada' WHERE tenant_id = t AND name = 'Lead antigo';
  -- Agora uma escrita qualquer em custom_fields, como a tela faria.
  UPDATE leads SET custom_fields = custom_fields || '{"obs":"editado"}'::jsonb
   WHERE tenant_id = t AND name = 'Lead antigo';

  SELECT meta_campaign_id INTO r FROM leads WHERE tenant_id = t AND name = 'Lead antigo';
  -- `IS DISTINCT FROM`, e não `<>`: quando o gatilho apaga o valor, a coluna
  -- fica NULA, e `NULL <> 'recuperada'` é NULO — o IF não dispara e o caso
  -- passa calado. Descoberto sabotando o gatilho: a falha foi acusada só três
  -- casos adiante, por outro motivo.
  IF r.meta_campaign_id IS DISTINCT FROM 'recuperada' THEN
    RAISE EXCEPTION 'FALHOU: a campanha recuperada foi desfeita pela escrita seguinte (veio "%")', r.meta_campaign_id;
  END IF;

  -- ----------------------------------------------------------
  -- 4. O DESTINO SAI DO DE-PARA QUE JÁ EXISTE.
  --
  -- Formulário sem empreendimento cai no pega-tudo — é o contador "Sem
  -- direcionamento" do plano, e o motivo de ele existir.
  -- ----------------------------------------------------------
  p := meta_formularios_painel(t);
  SELECT count(*) INTO n
    FROM jsonb_array_elements(p->'linhas') l
   WHERE l->>'form_id' = 'form-com-empreendimento'
     AND l->>'destino' = 'lancamento'
     AND l->>'empreendimento_codigo' = 'RESERVA CASTANHEIRA';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o formulário amarrado não saiu como lançamento — %', p->'linhas';
  END IF;

  IF (p->'contadores'->>'sem_direcionamento')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: "sem direcionamento" contou % (esperava 1)', p->'contadores'->>'sem_direcionamento';
  END IF;

  -- ----------------------------------------------------------
  -- 5. OS CONTADORES SÃO CONTADOS, NÃO COPIADOS.
  --
  -- `leads_na_base` e `sem_campanha` não viram coluna de propósito: contagem
  -- copiada para coluna envelhece sem ninguém perceber.
  -- ----------------------------------------------------------
  IF (p->'contadores'->>'leads_na_base')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: leads_na_base contou % (esperava 2)', p->'contadores'->>'leads_na_base';
  END IF;

  -- "Lead antigo" teve a campanha recuperada; sobra zero sem campanha.
  IF (p->'contadores'->>'sem_campanha')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: sem_campanha contou % (esperava 0)', p->'contadores'->>'sem_campanha';
  END IF;

  -- Todo formulário nasce captando e com a LIA atendendo.
  IF (p->'contadores'->>'captando')::int IS DISTINCT FROM 2 OR (p->'contadores'->>'lia_atende')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: os padrões de captação/LIA não são "ligado" — %', p->'contadores';
  END IF;

  -- ----------------------------------------------------------
  -- 6. O PAINEL DA VIZINHA NÃO VÊ NADA DAQUI.
  -- ----------------------------------------------------------
  -- A função RECUSA: quem não é membro do tenant recebe NULL, e não um painel
  -- zerado. Afirmar "zerado" aqui passava por acidente — `NULL <> 0` é NULO, e
  -- o IF nunca disparava, de modo que uma volta ao painel aberto passaria batida.
  p := meta_formularios_painel(t2);
  IF p IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha recebeu painel do tenant alheio em vez de recusa — %', p;
  END IF;

  RAISE NOTICE 'OK: formulários da Meta — 6 casos';
END $$;

ROLLBACK;

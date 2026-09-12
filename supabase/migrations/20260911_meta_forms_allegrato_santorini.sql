-- =============================================================================
-- Os outros formulários da Meta entram no de-para.
--
-- POR QUE
-- A 20260910 mapeou UM formulário ('[CAST] Formulário Reserva Castanheira') e
-- deixou implícito que campanha nova = mais um INSERT. Só que a conta da Lótus
-- tem SEIS formulários ativos, e os outros cinco nunca foram inseridos: todo
-- lead deles entrou com `property_code` nulo e classificação `indefinido` — o
-- lead de 11/set que é ALLEGRATO, não Castanheira.
--
-- Nomes lidos do Graph em 11/set/2026 (form_id -> name):
--   2512857375884799  [ALLEGRATO] Formulário Allegrato leads
--   4372380773076714  Allegrato
--   2251444742376036  [Santorini] Formulário Santorini
--   937566338787518   [CAST] Reserva Castanheira
--   27244074165242059 Reserva Castanheira
--
-- O código é o NOME do empreendimento em maiúsculas, como a 20260910 já fez —
-- é assim que a rota POST /api/v1/leads normaliza e que `eh_codigo_lancamento`
-- compara. Os três nomes existem em `lancamentos` (Allegrato, Santorini,
-- Reserva Castanheira), então o link do card resolve.
--
-- O QUE IMPEDE A REPETIÇÃO não é esta migration e sim a tela de pendência
-- passando a enxergar anúncio do Meta (server/zap/anunciosPendentes.js): esta
-- aqui só limpa o que já passou.
-- =============================================================================

INSERT INTO public.lancamento_anuncios (tenant_id, origin_listing_id, codigo) VALUES
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2512857375884799',  'ALLEGRATO'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '4372380773076714',  'ALLEGRATO'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2251444742376036',  'SANTORINI'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '937566338787518',   'RESERVA CASTANHEIRA'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '27244074165242059', 'RESERVA CASTANHEIRA')
ON CONFLICT (tenant_id, origin_listing_id) DO NOTHING;

-- ---------- Reprocessamento dos leads que já entraram sem código ----------
-- Genérico por form_id, não por lista de ids: vale para estes cinco e para
-- qualquer linha que a tela de pendência gravar depois.
-- `classification` só é reescrita em lead 'automatic' — decisão de corretor ou
-- da Lia é intocável (precedência da 20260815). O código vai em todos: é fato
-- sobre o anúncio, não opinião sobre o lead. Mesma regra do amarrarAnuncio().
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE tmp_meta_backfill ON COMMIT DROP AS
SELECT l.id,
       a.codigo,
       l.classification_source = 'automatic' AS recalcula,
       public.classificar_lead_com_lancamento(l.tenant_id, a.codigo, l.source, NULL, NULL) AS nova
  FROM public.leads l
  JOIN public.lancamento_anuncios a
    ON a.tenant_id = l.tenant_id
   AND a.origin_listing_id = l.custom_fields->'raw_data'->'meta'->>'form_id'
 WHERE l.property_code IS DISTINCT FROM a.codigo;

UPDATE public.leads l
   SET property_code = t.codigo,
       classification = CASE WHEN t.recalcula THEN t.nova ELSE l.classification END
  FROM tmp_meta_backfill t
 WHERE l.id = t.id;

-- O guard carimba 'dashboard' em quem não é service_role, e migration roda como
-- postgres (mesma razão da 20260911_de_para_nao_presume_lancamento.sql).
UPDATE public.leads l SET classification_source = 'automatic'
  FROM tmp_meta_backfill t
 WHERE l.id = t.id AND t.recalcula AND l.classification_source IS DISTINCT FROM 'automatic';

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM tmp_meta_backfill;
  RAISE NOTICE 'leads do Meta corrigidos: % (esperado 5 em 11/set)', v_n;
END $$;
COMMIT;

-- =============================================================================
-- ROLLBACK
--   DELETE FROM public.lancamento_anuncios
--    WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid
--      AND origin_listing_id IN ('2512857375884799','4372380773076714',
--          '2251444742376036','937566338787518','27244074165242059');
--   Os leads corrigidos NÃO voltam sozinhos — property_code teria que ser
--   zerado à mão, e não há razão para isso: o código está certo.
-- =============================================================================

-- =============================================================================
-- Lead de Meta Lead Ads: de-para formulário -> lançamento.
--
-- O formulário da Meta não diz qual é o imóvel. A amarração existe só no NOME
-- do formulário ("[CAST] Reserva Castanheira"), que não chega no webhook nem no
-- lead do Graph — por isso todo lead pago de Facebook/Instagram entrava com
-- `property_code` nulo e classificação `indefinido`.
--
-- A chave que CHEGA é o `form_id`. Ele entra aqui na mesma coluna do
-- `originListingId` do ZAP: a pergunta é a mesma ("que anúncio é este?"), a
-- resposta é a mesma (o código do lançamento) e o trigger de classificação
-- (20260903_classificacao_lancamento_e_revive.sql) já reconhece qualquer código
-- desta tabela como lançamento. Uma segunda tabela só duplicaria a regra.
--
-- Campanha nova = mais um INSERT aqui, sem deploy.
-- =============================================================================

COMMENT ON COLUMN public.lancamento_anuncios.origin_listing_id IS
  'Id do anúncio na origem: originListingId do ZAP/Grupo OLX, ou form_id do Meta Lead Ads.';

-- Formulário "[CAST] Reserva Castanheira" (tenant Lotus Brokers, set/2026).
-- O código é o NOME do empreendimento, como o Santa Ângela já grava em
-- property_code. MAIÚSCULO porque é assim que a rota POST /api/v1/leads
-- normaliza o código antes de gravar, e é assim que eh_codigo_lancamento compara.
INSERT INTO public.lancamento_anuncios (tenant_id, origin_listing_id, codigo) VALUES
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '1050767041092494', 'RESERVA CASTANHEIRA')
ON CONFLICT (tenant_id, origin_listing_id) DO NOTHING;

-- =============================================================================
-- ROLLBACK
--   DELETE FROM public.lancamento_anuncios
--    WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid
--      AND origin_listing_id = '1050767041092494';
-- =============================================================================

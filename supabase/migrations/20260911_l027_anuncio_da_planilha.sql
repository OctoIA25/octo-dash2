-- =============================================================================
-- L027 (Auten Jundiaí): o anúncio da planilha "relacao lancamentos".
--
-- O de-para tinha `2888227911` para L027 (cadastrado em 03/set); a planilha
-- online traz `2893497001` para o mesmo empreendimento — anúncio refeito no
-- portal, provavelmente. Nenhum dos dois recebeu lead até 11/set, então não há
-- código errado gravado em lead nenhum.
--
-- OS DOIS FICAM. A chave é (tenant_id, origin_listing_id): um empreendimento
-- pode ter mais de um anúncio, e manter o antigo garante que um lead atrasado
-- do anúncio velho ainda resolva para L027. Remover seria trocar um risco real
-- (lead sem código) por nada.
--
-- Já aplicado em produção via API em 11/set/2026 17:06 UTC; este arquivo existe
-- para os demais ambientes e é idempotente.
-- =============================================================================

INSERT INTO public.lancamento_anuncios (tenant_id, origin_listing_id, codigo) VALUES
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893497001', 'L027')
ON CONFLICT (tenant_id, origin_listing_id) DO NOTHING;

-- =============================================================================
-- ROLLBACK
--   DELETE FROM public.lancamento_anuncios
--    WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid
--      AND origin_listing_id = '2893497001';
-- =============================================================================

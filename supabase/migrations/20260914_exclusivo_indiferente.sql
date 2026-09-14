-- Migration: exclusividade do imóvel aceita "Indiferente"
-- Data: 2026-09-14
--
-- O cadastro de imóveis só tinha Exclusivo / Não exclusivo. "Indiferente" é
-- gravado como NULL em imoveis_locais.exclusivo e imoveis_corretores.exclusivo.
-- O default continua false: quem não informa a coluna (sync, inserts antigos)
-- segue gravando "não exclusivo".
--
-- Quem lê a coluna e como trata NULL:
--   - server/leadAssignment.js e api-server.js: só aceitam boolean → NULL cai
--     no fallback e o lead sai não exclusivo;
--   - KPI de captação (server/kpis) e relatório Exclusivo/Ficha: NULL conta
--     como sem exclusividade (filtro `exclusivo IS NOT TRUE`);
--   - portal_imoveis já expõe a coluna como nullable.
-- Sem função, trigger, policy ou CHECK no banco dependendo da coluna (conferido
-- em 14/set).
--
-- Reverter:
--   UPDATE public.imoveis_locais     SET exclusivo = false WHERE exclusivo IS NULL;
--   UPDATE public.imoveis_corretores SET exclusivo = false WHERE exclusivo IS NULL;
--   ALTER TABLE public.imoveis_locais     ALTER COLUMN exclusivo SET NOT NULL;
--   ALTER TABLE public.imoveis_corretores ALTER COLUMN exclusivo SET NOT NULL;

ALTER TABLE public.imoveis_locais     ALTER COLUMN exclusivo DROP NOT NULL;
ALTER TABLE public.imoveis_corretores ALTER COLUMN exclusivo DROP NOT NULL;

COMMENT ON COLUMN public.imoveis_locais.exclusivo IS
  'true = exclusivo, false = não exclusivo, NULL = indiferente.';
COMMENT ON COLUMN public.imoveis_corretores.exclusivo IS
  'true = exclusivo, false = não exclusivo, NULL = indiferente.';

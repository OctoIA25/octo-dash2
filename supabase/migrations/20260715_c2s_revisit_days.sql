-- =============================================================================
-- Janela de REVISITA por tenant para o sync LIVE do Contact2Sale.
--
-- Problema: a API C2S só filtra por created_lt (created_gte/updated_gte são
-- ignorados pelo feed real). O LIVE desce por created_at DESC até o piso
-- last_sync_at − overlap e para, então NUNCA revisita um lead antigo. Se o C2S
-- preencher um campo depois da criação (ex.: prop_ref/interest_reference), a
-- mudança nunca é capturada.
--
-- revisit_days recua o piso do LIVE até `agora − revisit_days`, fazendo o sync
-- re-varrer os leads criados nos últimos N dias a cada ciclo e pegar esses
-- updates. O fingerprint (kenlo_fingerprint) dedupa: re-ler lead inalterado não
-- gera escrita — o custo é só ler mais páginas da API.
--
--   NULL  → usa o default global (env C2S_REVISIT_DAYS, hoje 7).
--   0     → desliga a revisita (volta ao comportamento antigo: só o topo novo).
--   N > 0 → re-varre os últimos N dias por ciclo.
--
-- Sem backfill de dados: null já cai no default no provider (resolveWindow).
-- =============================================================================

ALTER TABLE public.tenant_contact2sale_config
  ADD COLUMN IF NOT EXISTS revisit_days integer;

COMMENT ON COLUMN public.tenant_contact2sale_config.revisit_days IS
  'Janela de revisita do LIVE (dias). NULL=default global (C2S_REVISIT_DAYS); 0=desliga; N=re-varre últimos N dias por ciclo para capturar updates de campos.';

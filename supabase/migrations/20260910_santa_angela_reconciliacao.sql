-- Reconciliação periódica da Santa Ângela: carimbo do último ciclo COMPLETO
-- (todas as páginas do grid), espelhando kenlo_integrations.last_full_sync_at e
-- tenant_contact2sale_config.last_full_sync_at.
--
-- POR QUÊ: o polling de 60s lê só a página 1 do grid — os 100 mais recentes por
-- DATA DE CADASTRO. Um lead que entra no grid com cadastro antigo (reativado na
-- origem, ou movido para uma carteira coberta pelo filtro) nunca aparece nessa
-- página, e a varredura completa só rodava UMA vez na vida do tenant (quando
-- last_sync_at era null). Resultado medido em 10/09/2026 no tenant Lotus
-- Brokers: 11 leads reais fora da dash, com cadastro de 2019 a 2026 e interação
-- na origem nos últimos dias. Com esta coluna, o serviço volta a varrer o grid
-- inteiro a cada SANTA_ANGELA_FULL_SYNC_TTL_MS (default 1h).
--
-- NULL = nunca reconciliou → o primeiro ciclo após esta migration já roda
-- completo e recupera o que ficou para trás. Nada a fazer manualmente.
ALTER TABLE public.tenant_santa_angela_config
  ADD COLUMN IF NOT EXISTS last_full_sync_at timestamptz;

COMMENT ON COLUMN public.tenant_santa_angela_config.last_full_sync_at IS
  'Último ciclo que varreu TODAS as páginas do grid. NULL = nunca; o serviço reconcilia quando vence o TTL.';

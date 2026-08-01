-- ============================================================
-- Câmbio USD→BRL para a Telemetria de Agentes (D7).
--
-- Taxa MANUAL com histórico (effective_from): custo de LLM é nativo em USD
-- (pricing.js) e convertido na LEITURA por server/agent-telemetry/pricing/exchange.js.
-- Sem API externa nesta fase; trocar a fonte depois é plugável (só muda quem
-- popula esta tabela).
--
-- GLOBAL (não tenant-scoped): a cotação do dólar não depende de imobiliária.
-- Leitura liberada a authenticated (é dado público de câmbio, sem PII).
-- Escrita SÓ service_role (owner via endpoint); histórico é append-only por
-- convenção — nunca UPDATE numa linha antiga, sempre nova effective_from.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair           text NOT NULL DEFAULT 'USD/BRL',
  rate           numeric NOT NULL CHECK (rate > 0),
  effective_from timestamptz NOT NULL,
  created_by     text,                         -- email do owner que registrou (audit)
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pair, effective_from)                -- uma taxa por par por instante de vigência
);

-- Hot-path da leitura: "taxa vigente do par nesta data" = maior effective_from <= data.
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_eff
  ON public.exchange_rates (pair, effective_from DESC);

-- ------------------------------------------------------------
-- RLS: leitura por qualquer usuário autenticado (câmbio é público, sem PII);
-- escrita SÓ service_role (endpoint valida owner). Mesmo REVOKE das tabelas de
-- telemetria: front/owner escrevem via API, nunca PostgREST direto.
-- ------------------------------------------------------------
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.exchange_rates FROM anon, authenticated;

DROP POLICY IF EXISTS "exchange_rates_select" ON public.exchange_rates;
CREATE POLICY "exchange_rates_select"
  ON public.exchange_rates FOR SELECT
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.exchange_rates
  IS 'Câmbio manual com histórico (effective_from) para converter custo de LLM USD→BRL na leitura da telemetria. Global (não tenant-scoped). Escrita só service_role; append-only por convenção.';
COMMENT ON COLUMN public.exchange_rates.effective_from
  IS 'A partir de quando esta taxa vale. A leitura escolhe a maior effective_from <= data do custo (pricing/exchange.js pickRate).';

-- ============================================================
-- SEMENTE — PLACEHOLDER. Ajustar a taxa para a cotação real antes de confiar no
-- custo em R$. Idempotente via UNIQUE (pair, effective_from).
-- ============================================================
INSERT INTO public.exchange_rates (pair, rate, effective_from, created_by)
VALUES ('USD/BRL', 5.40, '2026-01-01T00:00:00Z', 'seed:placeholder-ajustar')
ON CONFLICT (pair, effective_from) DO NOTHING;

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.exchange_rates;

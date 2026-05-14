CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.commercial_sales_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_arquivo TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  spreadsheet_id TEXT,
  sheet_gid TEXT,
  source_url TEXT,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  linhas_importadas INTEGER NOT NULL DEFAULT 0,
  linhas_atualizadas INTEGER NOT NULL DEFAULT 0,
  linhas_ignoradas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  erro TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commercial_sales_import_batches
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nome_arquivo TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS spreadsheet_id TEXT,
  ADD COLUMN IF NOT EXISTS sheet_gid TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS total_linhas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linhas_importadas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linhas_atualizadas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linhas_ignoradas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS erro TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.commercial_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES public.commercial_sales_import_batches(id) ON DELETE SET NULL,
  nome_arquivo TEXT,
  spreadsheet_id TEXT,
  sheet_gid TEXT,
  source_row_number INTEGER NOT NULL,
  source_row_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  empreendimento TEXT,
  quadra TEXT,
  unidade TEXT,
  origem TEXT,
  area_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_unidade NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_vgv NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_vgc NUMERIC(14,2) NOT NULL DEFAULT 0,
  cliente_nome TEXT,
  corretor_nome TEXT,
  corretor_email TEXT,
  tipo TEXT,
  repasse_20 NUMERIC(14,2) NOT NULL DEFAULT 0,
  repasse_40 NUMERIC(14,2) NOT NULL DEFAULT 0,
  repasse_45 NUMERIC(14,2) NOT NULL DEFAULT 0,
  repasse_50 NUMERIC(14,2) NOT NULL DEFAULT 0,
  team_leader_nome TEXT,
  team_leader_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  indicacao TEXT,
  valor_imovel NUMERIC(14,2) NOT NULL DEFAULT 0,
  comissao_total_venda NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_conta_japi NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_assinatura DATE,
  data_recebimento DATE,
  mes_referencia INTEGER CHECK (mes_referencia IS NULL OR mes_referencia BETWEEN 1 AND 12),
  ano_referencia INTEGER NOT NULL,
  observacoes TEXT,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commercial_sales
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.commercial_sales_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nome_arquivo TEXT,
  ADD COLUMN IF NOT EXISTS spreadsheet_id TEXT,
  ADD COLUMN IF NOT EXISTS sheet_gid TEXT,
  ADD COLUMN IF NOT EXISTS source_row_number INTEGER,
  ADD COLUMN IF NOT EXISTS source_row_key TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS empreendimento TEXT,
  ADD COLUMN IF NOT EXISTS quadra TEXT,
  ADD COLUMN IF NOT EXISTS unidade TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT,
  ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_unidade NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_vgv NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_vgc NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliente_nome TEXT,
  ADD COLUMN IF NOT EXISTS corretor_nome TEXT,
  ADD COLUMN IF NOT EXISTS corretor_email TEXT,
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS repasse_20 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repasse_40 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repasse_45 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repasse_50 NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_leader_nome TEXT,
  ADD COLUMN IF NOT EXISTS team_leader_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indicacao TEXT,
  ADD COLUMN IF NOT EXISTS valor_imovel NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_total_venda NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_conta_japi NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_assinatura DATE,
  ADD COLUMN IF NOT EXISTS data_recebimento DATE,
  ADD COLUMN IF NOT EXISTS mes_referencia INTEGER,
  ADD COLUMN IF NOT EXISTS ano_referencia INTEGER,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS commercial_sales_source_row_uidx
  ON public.commercial_sales (tenant_id, spreadsheet_id, sheet_gid, source_row_number);

CREATE INDEX IF NOT EXISTS commercial_sales_tenant_period_idx
  ON public.commercial_sales (tenant_id, ano_referencia, mes_referencia)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS commercial_sales_corretor_idx
  ON public.commercial_sales (tenant_id, corretor_nome)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS commercial_sales_team_leader_idx
  ON public.commercial_sales (tenant_id, team_leader_nome)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS commercial_sales_batch_idx
  ON public.commercial_sales (import_batch_id);

CREATE INDEX IF NOT EXISTS commercial_sales_import_batches_tenant_idx
  ON public.commercial_sales_import_batches (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_commercial_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_commercial_sales_updated_at ON public.commercial_sales;
CREATE TRIGGER trigger_update_commercial_sales_updated_at
  BEFORE UPDATE ON public.commercial_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_commercial_sales_updated_at();

ALTER TABLE public.commercial_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_sales_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view commercial sales" ON public.commercial_sales;
CREATE POLICY "Members can view commercial sales" ON public.commercial_sales
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can write commercial sales" ON public.commercial_sales;
CREATE POLICY "Managers can write commercial sales" ON public.commercial_sales
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  );

DROP POLICY IF EXISTS "Members can view commercial sales import batches" ON public.commercial_sales_import_batches;
CREATE POLICY "Members can view commercial sales import batches" ON public.commercial_sales_import_batches
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can write commercial sales import batches" ON public.commercial_sales_import_batches;
CREATE POLICY "Managers can write commercial sales import batches" ON public.commercial_sales_import_batches
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  );

DROP VIEW IF EXISTS public.commercial_sales_broker_summary;
DROP VIEW IF EXISTS public.commercial_sales_monthly_summary;

CREATE OR REPLACE VIEW public.commercial_sales_monthly_summary
WITH (security_invoker = TRUE) AS
SELECT
  tenant_id,
  ano_referencia,
  mes_referencia,
  COUNT(*)::INTEGER AS total_vendas,
  SUM(valor_vgv)::NUMERIC(14,2) AS total_vgv,
  SUM(valor_vgc)::NUMERIC(14,2) AS total_vgc,
  SUM(team_leader_valor)::NUMERIC(14,2) AS total_team_leader,
  SUM(valor_conta_japi)::NUMERIC(14,2) AS total_conta_japi,
  SUM(comissao_total_venda)::NUMERIC(14,2) AS total_comissao_venda,
  MAX(last_seen_at) AS atualizado_em
FROM public.commercial_sales
WHERE is_active = TRUE
GROUP BY tenant_id, ano_referencia, mes_referencia;

CREATE OR REPLACE VIEW public.commercial_sales_broker_summary
WITH (security_invoker = TRUE) AS
SELECT
  tenant_id,
  ano_referencia,
  mes_referencia,
  corretor_nome,
  COUNT(*)::INTEGER AS total_vendas,
  SUM(valor_vgv)::NUMERIC(14,2) AS total_vgv,
  SUM(valor_vgc)::NUMERIC(14,2) AS total_vgc,
  SUM(team_leader_valor)::NUMERIC(14,2) AS total_team_leader,
  SUM(valor_conta_japi)::NUMERIC(14,2) AS total_conta_japi,
  MAX(last_seen_at) AS atualizado_em
FROM public.commercial_sales
WHERE is_active = TRUE
  AND corretor_nome IS NOT NULL
GROUP BY tenant_id, ano_referencia, mes_referencia, corretor_nome;

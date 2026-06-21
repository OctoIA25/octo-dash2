-- ============================================================
-- MIGRATION: KPIs configuráveis do Dashboard
-- Espelha o padrão de `goals`: multi-tenant + RLS + trigger updated_at.
-- `dashboard_kpis` = definição + exibição. `kpi_targets`/`kpi_values` =
-- meta/realizado POR PERÍODO (linhas, não colunas por mês → suporta períodos
-- novos sem migração). `kpi_import_batches` = versão/auditoria de importação.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- dashboard_kpis ----------
CREATE TABLE IF NOT EXISTS public.dashboard_kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category_id   TEXT NOT NULL DEFAULT 'geral',
  unit          TEXT NOT NULL DEFAULT 'count' CHECK (unit IN ('count','currency','percent')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('crm','manual','planilha')),
  metric_key    TEXT,  -- só p/ source='crm': aponta p/ catálogo de server/kpis
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_visible    BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Integridade da origem: crm exige metric_key; manual/planilha não usam.
  CONSTRAINT dashboard_kpis_metric_key_ck CHECK (
    (source = 'crm' AND metric_key IS NOT NULL)
    OR (source <> 'crm' AND metric_key IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpis_tenant_order  ON public.dashboard_kpis(tenant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpis_tenant_status ON public.dashboard_kpis(tenant_id, status);

-- ---------- kpi_import_batches (referenciada por targets/values) ----------
CREATE TABLE IF NOT EXISTS public.kpi_import_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_arquivo    TEXT,
  sheet_name      TEXT,
  mapping         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Interpretação gerada no Preview (auditabilidade): colunas detectadas,
  -- tipos inferidos, períodos reconhecidos e avisos — o "porquê" do que foi
  -- importado, congelado no momento da importação.
  preview         JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_created    INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_ignored    INTEGER NOT NULL DEFAULT 0,
  imported_by      UUID,
  imported_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_import_batches_tenant ON public.kpi_import_batches(tenant_id, created_at DESC);

-- ---------- kpi_targets (meta por período) ----------
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id       UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_type  TEXT NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_start DATE NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  batch_id     UUID REFERENCES public.kpi_import_batches(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_id, period_type, period_start)
);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_lookup ON public.kpi_targets(tenant_id, kpi_id, period_type, period_start);

-- ---------- kpi_values (realizado por período: manual/planilha) ----------
CREATE TABLE IF NOT EXISTS public.kpi_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id       UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_type  TEXT NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_start DATE NOT NULL,
  value        NUMERIC NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  batch_id     UUID REFERENCES public.kpi_import_batches(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_id, period_type, period_start)
);
CREATE INDEX IF NOT EXISTS idx_kpi_values_lookup ON public.kpi_values(tenant_id, kpi_id, period_type, period_start);

-- ---------- dashboard_kpi_history (auditoria leve, igual goal_history) ----------
CREATE TABLE IF NOT EXISTS public.dashboard_kpi_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id          UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by_name TEXT NOT NULL DEFAULT '',
  change_type     TEXT NOT NULL,
  summary         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpi_history_kpi ON public.dashboard_kpi_history(kpi_id, created_at DESC);

-- ============================================================ RLS
-- Helper inline: membro do tenant; escrita exige role de gestão.
-- ============================================================
ALTER TABLE public.dashboard_kpis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_targets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_values            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_import_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_kpi_history ENABLE ROW LEVEL SECURITY;

-- dashboard_kpis: SELECT membro; INSERT/UPDATE/DELETE gestão.
-- DROP ... IF EXISTS antes de cada CREATE torna a migration RE-EXECUTÁVEL
-- (CREATE POLICY não tem "IF NOT EXISTS"; sem o drop, re-rodar dá erro 42710).
DROP POLICY IF EXISTS "dk_select" ON public.dashboard_kpis;
CREATE POLICY "dk_select" ON public.dashboard_kpis FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_insert" ON public.dashboard_kpis;
CREATE POLICY "dk_insert" ON public.dashboard_kpis FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_update" ON public.dashboard_kpis;
CREATE POLICY "dk_update" ON public.dashboard_kpis FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com')
WITH CHECK (
  -- Sem WITH CHECK, um UPDATE poderia mover a linha para outro tenant. Aqui o NOVO
  -- tenant_id também é validado, impedindo "vazamento" cross-tenant via UPDATE.
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_delete" ON public.dashboard_kpis;
CREATE POLICY "dk_delete" ON public.dashboard_kpis FOR DELETE USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');

-- Macro pelas demais tabelas (mesmo critério): aplica via DO block.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpi_targets','kpi_values','kpi_import_batches','dashboard_kpi_history'] LOOP
    -- DROP antes de CREATE: torna re-executável (idem às policies de dashboard_kpis acima).
    EXECUTE format($f$
      DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s;
      CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
      DROP POLICY IF EXISTS "%1$s_write" ON public.%1$s;
      CREATE POLICY "%1$s_write" ON public.%1$s FOR ALL USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com')
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
    $f$, t);
  END LOOP;
END $$;

-- ---------- trigger updated_at (reusa função se já existir) ----------
CREATE OR REPLACE FUNCTION public.update_dashboard_kpis_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_dashboard_kpis_updated_at ON public.dashboard_kpis;
CREATE TRIGGER trg_dashboard_kpis_updated_at BEFORE UPDATE ON public.dashboard_kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();
DROP TRIGGER IF EXISTS trg_kpi_targets_updated_at ON public.kpi_targets;
CREATE TRIGGER trg_kpi_targets_updated_at BEFORE UPDATE ON public.kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();
DROP TRIGGER IF EXISTS trg_kpi_values_updated_at ON public.kpi_values;
CREATE TRIGGER trg_kpi_values_updated_at BEFORE UPDATE ON public.kpi_values
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();

-- ============================================================ SEED nativos
-- Insere os 6 KPIs nativos por tenant (idempotente via NOT EXISTS por metric_key).
-- source='crm' + is_system=true (não excluíveis). display_order preserva a ordem atual.
-- ============================================================
INSERT INTO public.dashboard_kpis (tenant_id, name, description, category_id, unit, source, metric_key, is_system, display_order)
SELECT te.id, v.name, '', 'comercial', v.unit, 'crm', v.metric_key, true, v.ord
FROM public.tenants te
CROSS JOIN (VALUES
  ('Total de Leads',            'count',    'totalLeads',         0),
  ('Vendas',                    'count',    'vendas',             1),
  ('Valor em Vendas',           'currency', 'valorVendas',        2),
  ('Imóveis Ativos',            'count',    'imoveisAtivos',      3),
  ('Tempo Médio de Resposta',   'count',    'tempoMedioResposta', 4),
  ('Taxa de Atendimento',       'percent',  'taxaAtendimento',    5)
) AS v(name, unit, metric_key, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk
  WHERE dk.tenant_id = te.id AND dk.metric_key = v.metric_key
);

COMMENT ON TABLE public.dashboard_kpis IS 'KPIs configuráveis do Dashboard por tenant. source crm|manual|planilha; metric_key aponta p/ catálogo de server/kpis quando crm.';
COMMENT ON TABLE public.kpi_targets IS 'Meta por período (month|quarter|year). UNIQUE(kpi_id,period_type,period_start) → upsert idempotente do import.';
COMMENT ON TABLE public.kpi_import_batches IS 'Versão/auditoria de importação: quem/quando/arquivo/mapeamento. Reverter = deletar o batch.';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.excel_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  nome_arquivo TEXT,
  ano_referencia INTEGER NOT NULL,
  corretor_nome TEXT NOT NULL,
  corretor_nivel TEXT,
  equipe TEXT,
  janeiro NUMERIC NOT NULL DEFAULT 0,
  fevereiro NUMERIC NOT NULL DEFAULT 0,
  marco NUMERIC NOT NULL DEFAULT 0,
  abril NUMERIC NOT NULL DEFAULT 0,
  maio NUMERIC NOT NULL DEFAULT 0,
  junho NUMERIC NOT NULL DEFAULT 0,
  julho NUMERIC NOT NULL DEFAULT 0,
  agosto NUMERIC NOT NULL DEFAULT 0,
  setembro NUMERIC NOT NULL DEFAULT 0,
  outubro NUMERIC NOT NULL DEFAULT 0,
  novembro NUMERIC NOT NULL DEFAULT 0,
  dezembro NUMERIC NOT NULL DEFAULT 0,
  total_mensal NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS excel_imports_tenant_year_idx
  ON public.excel_imports (tenant_id, ano_referencia);

CREATE INDEX IF NOT EXISTS excel_imports_corretor_idx
  ON public.excel_imports (corretor_nome);

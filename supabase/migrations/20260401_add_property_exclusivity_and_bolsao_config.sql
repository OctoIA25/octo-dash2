-- Migration: adicionar exclusividade de imóvel/lead e configuração do bolsão por tenant
-- Data: 2026-04-01

ALTER TABLE public.imoveis_locais
ADD COLUMN IF NOT EXISTS exclusivo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.imoveis_locais.exclusivo IS 'Indica se o imóvel é exclusivo. Default: false';

ALTER TABLE public.imoveis_corretores
ADD COLUMN IF NOT EXISTS exclusivo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.imoveis_corretores.exclusivo IS 'Indica se o imóvel é exclusivo. Default: false';

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.is_exclusive IS 'Indica se o lead está vinculado a imóvel exclusivo. Default: false';

ALTER TABLE public.kenlo_leads
ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kenlo_leads.is_exclusive IS 'Indica se o lead está vinculado a imóvel exclusivo. Default: false';

CREATE INDEX IF NOT EXISTS idx_imoveis_locais_tenant_exclusivo
ON public.imoveis_locais(tenant_id, exclusivo);

CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_tenant_exclusivo
ON public.imoveis_corretores(tenant_id, exclusivo);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_is_exclusive
ON public.leads(tenant_id, is_exclusive);

CREATE INDEX IF NOT EXISTS idx_kenlo_leads_tenant_is_exclusive
ON public.kenlo_leads(tenant_id, is_exclusive);

CREATE TABLE IF NOT EXISTS public.tenant_bolsao_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tempo_expiracao_exclusivo INTEGER NOT NULL DEFAULT 60,
  tempo_expiracao_nao_exclusivo INTEGER NOT NULL DEFAULT 60,
  intervalo_verificacao INTEGER NOT NULL DEFAULT 60,
  notificar_expiracao BOOLEAN NOT NULL DEFAULT true,
  auto_refresh BOOLEAN NOT NULL DEFAULT true,
  intervalo_auto_refresh INTEGER NOT NULL DEFAULT 30,
  disponibilidade_lead TEXT NOT NULL DEFAULT 'todos' CHECK (disponibilidade_lead IN ('todos', 'equipe')),
  horario_funcionamento JSONB NOT NULL DEFAULT '{"segunda":{"ativo":true,"inicio":"09:00","termino":"18:00"},"terca":{"ativo":true,"inicio":"09:00","termino":"18:00"},"quarta":{"ativo":true,"inicio":"09:00","termino":"18:00"},"quinta":{"ativo":true,"inicio":"09:00","termino":"18:00"},"sexta":{"ativo":true,"inicio":"09:00","termino":"18:00"},"sabado":{"ativo":true,"inicio":"09:00","termino":"13:00"},"domingo":{"ativo":false,"inicio":"09:00","termino":"18:00"}}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

COMMENT ON TABLE public.tenant_bolsao_config IS 'Configuração do bolsão de leads por tenant';
COMMENT ON COLUMN public.tenant_bolsao_config.tempo_expiracao_exclusivo IS 'Tempo em minutos para mover leads de imóveis exclusivos ao bolsão';
COMMENT ON COLUMN public.tenant_bolsao_config.tempo_expiracao_nao_exclusivo IS 'Tempo em minutos para mover leads de imóveis não exclusivos ao bolsão';

CREATE INDEX IF NOT EXISTS idx_tenant_bolsao_config_tenant
ON public.tenant_bolsao_config(tenant_id);

ALTER TABLE public.tenant_bolsao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver config do bolsao do tenant" ON public.tenant_bolsao_config
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Admins podem inserir config do bolsao do tenant" ON public.tenant_bolsao_config
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'team_leader')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Admins podem atualizar config do bolsao do tenant" ON public.tenant_bolsao_config
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'team_leader')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

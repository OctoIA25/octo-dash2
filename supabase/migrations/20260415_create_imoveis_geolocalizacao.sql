-- Migration: Criar tabela de geocodificação por imóvel e por tenant
-- Data: 2026-04-15
-- Descrição: Persiste coordenadas resolvidas por (tenant_id, referencia) para
--            carregamento instantâneo no Mapa de Imóveis. Imóveis sem lat/lng
--            ficam como 'pending' para resolução futura via outros parâmetros do XML.

CREATE TABLE IF NOT EXISTS public.imoveis_geolocalizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referencia TEXT NOT NULL,

  -- Coordenadas resolvidas (NULL = ainda não geocodificado)
  latitude  DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Status da geocodificação
  geo_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (geo_status IN ('resolved', 'pending', 'failed')),
  source TEXT
    CHECK (source IN ('xml', 'viacep', 'nominatim', 'cache', 'manual')),
  confidence TEXT DEFAULT 'low'
    CHECK (confidence IN ('high', 'medium', 'low')),

  -- Metadados do XML para tentativas futuras de resolução
  cep              TEXT,
  endereco         TEXT,
  numero           TEXT,
  bairro           TEXT,
  cidade           TEXT,
  estado           TEXT,
  nome_condominio  TEXT,

  -- Controle de tentativas
  tentativas       INTEGER NOT NULL DEFAULT 0,
  ultima_tentativa TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, referencia)
);

-- Índices para performance nas queries mais comuns
CREATE INDEX IF NOT EXISTS idx_imoveis_geo_tenant_status
  ON public.imoveis_geolocalizacao (tenant_id, geo_status);

CREATE INDEX IF NOT EXISTS idx_imoveis_geo_tenant_ref
  ON public.imoveis_geolocalizacao (tenant_id, referencia);

CREATE INDEX IF NOT EXISTS idx_imoveis_geo_pending
  ON public.imoveis_geolocalizacao (tenant_id, tentativas)
  WHERE geo_status = 'pending';

-- RLS
ALTER TABLE public.imoveis_geolocalizacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver geocoding do tenant"
  ON public.imoveis_geolocalizacao FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Membros podem inserir geocoding do tenant"
  ON public.imoveis_geolocalizacao FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "Membros podem atualizar geocoding do tenant"
  ON public.imoveis_geolocalizacao FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_imoveis_geo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_imoveis_geo_updated_at ON public.imoveis_geolocalizacao;
CREATE TRIGGER trg_imoveis_geo_updated_at
  BEFORE UPDATE ON public.imoveis_geolocalizacao
  FOR EACH ROW EXECUTE FUNCTION update_imoveis_geo_updated_at();

COMMENT ON TABLE public.imoveis_geolocalizacao IS
  'Cache de geocodificação por imóvel e por tenant. resolved = tem lat/lng. pending = ainda não geocodificado (salva metadados do XML para resolução futura). failed = não foi possível resolver.';

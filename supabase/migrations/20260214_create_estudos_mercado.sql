-- ============================================================================
-- MIGRATION: Criar tabelas para Estudos de Mercado
-- Aplicar manualmente via Supabase Dashboard > SQL Editor
-- ============================================================================

-- Tabela principal: estudos de mercado
CREATE TABLE IF NOT EXISTS public.estudos_mercado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  corretor_id UUID NOT NULL,
  corretor_nome TEXT NOT NULL,
  corretor_email TEXT,
  corretor_telefone TEXT,
  corretor_foto TEXT,
  corretor_equipe TEXT,
  corretor_role TEXT,
  corretor_creci TEXT,
  nome_cliente TEXT,
  email_cliente TEXT,
  endereco_imovel TEXT,
  observacoes TEXT,
  metragem_imovel NUMERIC DEFAULT 0,
  correcao_mercado NUMERIC DEFAULT 0,
  margem_exclusividade NUMERIC DEFAULT 0,
  media_por_m2 NUMERIC DEFAULT 0,
  valor_base NUMERIC DEFAULT 0,
  valor_mercado NUMERIC DEFAULT 0,
  valor_exclusividade NUMERIC DEFAULT 0,
  valor_final NUMERIC DEFAULT 0,
  relatorio_html TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'finalizado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de amostras de cada estudo
CREATE TABLE IF NOT EXISTS public.estudos_mercado_amostras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudo_id UUID NOT NULL REFERENCES public.estudos_mercado(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  ordem INTEGER NOT NULL DEFAULT 0,
  link TEXT,
  valor_total NUMERIC DEFAULT 0,
  metragem NUMERIC DEFAULT 0,
  estado TEXT,
  cidade TEXT,
  bairro TEXT,
  condominio TEXT,
  rua TEXT,
  tipo TEXT,
  diferenciais TEXT,
  imagem_url TEXT,
  imagem_zap_imoveis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_estudos_mercado_tenant ON public.estudos_mercado(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estudos_mercado_corretor ON public.estudos_mercado(corretor_id);
CREATE INDEX IF NOT EXISTS idx_estudos_mercado_amostras_estudo ON public.estudos_mercado_amostras(estudo_id);
CREATE INDEX IF NOT EXISTS idx_estudos_mercado_amostras_tenant ON public.estudos_mercado_amostras(tenant_id);

-- RLS
ALTER TABLE public.estudos_mercado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estudos_mercado_amostras ENABLE ROW LEVEL SECURITY;

-- Policies para estudos_mercado
CREATE POLICY "Tenant members can view own tenant estudos"
  ON public.estudos_mercado FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert estudos"
  ON public.estudos_mercado FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update own tenant estudos"
  ON public.estudos_mercado FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can delete own tenant estudos"
  ON public.estudos_mercado FOR DELETE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

-- Policies para estudos_mercado_amostras
CREATE POLICY "Tenant members can view own tenant amostras"
  ON public.estudos_mercado_amostras FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert amostras"
  ON public.estudos_mercado_amostras FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update own tenant amostras"
  ON public.estudos_mercado_amostras FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can delete own tenant amostras"
  ON public.estudos_mercado_amostras FOR DELETE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

-- Bucket de Storage para fotos dos estudos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('estudos-fotos', 'estudos-fotos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policy de storage: qualquer autenticado pode fazer upload
CREATE POLICY "Authenticated users can upload estudos fotos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'estudos-fotos' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view estudos fotos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'estudos-fotos');

CREATE POLICY "Authenticated users can delete estudos fotos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'estudos-fotos' AND auth.role() = 'authenticated');

-- Tabela para armazenar chaves de API por tenant (OpenAI, etc.)
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'gemini')),
  api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- Habilitar RLS
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: membros do tenant podem ler
CREATE POLICY "tenant_api_keys_select" ON public.tenant_api_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = tenant_api_keys.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: membros do tenant podem inserir
CREATE POLICY "tenant_api_keys_insert" ON public.tenant_api_keys
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = tenant_api_keys.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: membros do tenant podem atualizar
CREATE POLICY "tenant_api_keys_update" ON public.tenant_api_keys
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = tenant_api_keys.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: membros do tenant podem deletar
CREATE POLICY "tenant_api_keys_delete" ON public.tenant_api_keys
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = tenant_api_keys.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant_provider 
  ON public.tenant_api_keys(tenant_id, provider);
